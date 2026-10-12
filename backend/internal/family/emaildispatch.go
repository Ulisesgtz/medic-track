package family

import (
	"context"
	"errors"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/mailer"
)

// The e-mail of an invitation is sent in the background (specs/040 research R4): the answer to who invites never waits for the
// provider, and a failure never touches the invitation — the link can always be copied.
//
// The message holds the invitation's token, which the database only keeps as a hash, so it can't be rebuilt later: it waits in
// memory in a queue. If the process dies the queued e-mails are lost, and the sweep closes their 'sending' state as 'failed' so
// the screen says so and the person copies the link or sends it again.

const (
	emailQueueSize      = 64
	emailWorkers        = 2
	emailAttemptTimeout = 15 * time.Second
	// staleSendingAfter is longer than the worst send: 3 tries of 15 s plus the waits.
	staleSendingAfter = 3 * time.Minute
	sweepInterval     = time.Minute
	statusTimeout     = 2 * time.Second
)

// emailWaits are the waits between the 3 tries of one send (shorter than the digest's: a person is looking at the screen).
var emailWaits = []time.Duration{5 * time.Second, 20 * time.Second}

// The fixed messages reported as job:mailer: counts and sentences only, never the address, the link, the key or the provider's text.
const (
	sendFailureMessage  = "invitation e-mail failed: could not send"
	sweepFailureMessage = "invitation e-mail failed: could not resolve stuck sends"
)

// EmailJob is one e-mail to send. It holds the token inside the text: it lives only in memory and is never logged, printed or
// serialized.
type EmailJob struct {
	InvitationID uuid.UUID
	TokenHash    []byte
	Message      mailer.Message
}

// emailStore is what the dispatcher needs of the repository (satisfied by *Repository).
type emailStore interface {
	StillCurrent(ctx context.Context, invitationID uuid.UUID, tokenHash []byte) (bool, error)
	SetEmailStatus(ctx context.Context, invitationID uuid.UUID, tokenHash []byte, from, to EmailStatus) (bool, error)
	SweepStaleSending(ctx context.Context, olderThan time.Duration) (int64, error)
}

// emailQuota is the shared daily quota (satisfied by *mailer.Quota).
type emailQuota interface {
	Reserve(ctx context.Context, class mailer.Class) (mailer.Ticket, error)
	Refund(ctx context.Context, t mailer.Ticket)
}

// EmailDispatcher sends the invitations' e-mails in the background.
type EmailDispatcher struct {
	store    emailStore
	sender   mailer.Sender
	quota    emailQuota
	reporter mailer.Reporter // optional

	queue chan EmailJob
	// Fields so tests don't wait.
	sleep          func(context.Context, time.Duration) error
	waits          []time.Duration
	attemptTimeout time.Duration
	sweepEvery     time.Duration
}

// NewEmailDispatcher creates a dispatcher. Call Start to run it.
func NewEmailDispatcher(store emailStore, sender mailer.Sender, quota emailQuota, reporter mailer.Reporter) *EmailDispatcher {
	return &EmailDispatcher{
		store: store, sender: sender, quota: quota, reporter: reporter,
		queue:          make(chan EmailJob, emailQueueSize),
		sleep:          mailer.SleepContext,
		waits:          emailWaits,
		attemptTimeout: emailAttemptTimeout,
		sweepEvery:     sweepInterval,
	}
}

// Enqueue hands a job to the workers without waiting. It says false when the queue is full.
func (d *EmailDispatcher) Enqueue(job EmailJob) bool {
	select {
	case d.queue <- job:
		return true
	default:
		return false
	}
}

// Start runs the workers and the sweep until ctx is done, then closes as failed what was left in the queue. It returns when
// everything has stopped.
func (d *EmailDispatcher) Start(ctx context.Context) {
	d.sweep(ctx)
	var wg sync.WaitGroup
	for i := 0; i < emailWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				if ctx.Err() != nil {
					return
				}
				select {
				case <-ctx.Done():
					return
				case job := <-d.queue:
					d.deliverSafely(ctx, job)
				}
			}
		}()
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		ticker := time.NewTicker(d.sweepEvery)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				d.sweep(ctx)
			}
		}
	}()
	wg.Wait()
	d.drain(ctx)
}

// drain marks as failed the jobs nobody will send now (the service is shutting down).
func (d *EmailDispatcher) drain(ctx context.Context) {
	for {
		select {
		case job := <-d.queue:
			d.setStatus(ctx, job, EmailFailed)
		default:
			return
		}
	}
}

// sweep closes as failed the sends stuck in 'sending' (a process that died, a send that never ended).
func (d *EmailDispatcher) sweep(ctx context.Context) {
	if _, err := d.store.SweepStaleSending(ctx, staleSendingAfter); err != nil && ctx.Err() == nil {
		log.Print("family: could not resolve the stuck invitation e-mails")
		d.report(mailer.FailureSweep, sweepFailureMessage)
	}
}

// obsoleteGuard checks, before every try, that the invitation is still the one the message was made for: a resend gives another
// token, and a canceled, accepted or expired invitation doesn't need its e-mail. An obsolete message is never sent.
type obsoleteGuard struct {
	d        *EmailDispatcher
	job      EmailJob
	obsolete bool
}

func (g *obsoleteGuard) Send(ctx context.Context, m mailer.Message) error {
	current, err := g.d.store.StillCurrent(ctx, g.job.InvitationID, g.job.TokenHash)
	if err != nil {
		return &mailer.SendError{Retryable: true}
	}
	if !current {
		g.obsolete = true
		return &mailer.SendError{Retryable: false}
	}
	return g.d.sender.Send(ctx, m)
}

// deliverSafely is deliver for a worker: whatever goes wrong inside one send (a panic of the provider's client, say) must not take
// the API down with it; that e-mail is closed as failed and the worker goes on.
func (d *EmailDispatcher) deliverSafely(ctx context.Context, job EmailJob) {
	defer func() {
		if recover() != nil {
			log.Print("family: an invitation e-mail send panicked")
			d.setStatus(ctx, job, EmailFailed)
			d.report(mailer.FailureSend, sendFailureMessage)
		}
	}()
	d.deliver(ctx, job)
}

// deliver sends one job: reserve a place of the day, send with bounded tries, and record how it ended — only on the invitation
// that still has this token.
func (d *EmailDispatcher) deliver(ctx context.Context, job EmailJob) {
	ticket, err := d.quota.Reserve(ctx, mailer.ClassInvitation)
	if err != nil {
		// No place today (or the counter failed, which the quota already reported): the invitation stays, its e-mail doesn't go.
		d.setStatus(ctx, job, EmailFailed)
		return
	}
	guard := &obsoleteGuard{d: d, job: job}
	err = mailer.SendWithRetries(ctx, guard, job.Message, d.waits, d.attemptTimeout, d.sleep)
	switch {
	case err == nil:
		d.setStatus(ctx, job, EmailSent)
		d.recovered()
	case guard.obsolete:
		// A resend or a cancellation got ahead of this e-mail: it is not a failure and the new state is not ours to touch.
		d.refund(ctx, ticket)
	case ctx.Err() != nil:
		// Shutting down: not a failure of the provider.
		d.refund(ctx, ticket)
		d.setStatus(ctx, job, EmailFailed)
	default:
		d.refund(ctx, ticket)
		d.setStatus(ctx, job, EmailFailed)
		d.report(mailer.FailureSend, sendFailureMessage)
	}
}

// setStatus records the end of a send, with its own short context so it is written even while the service shuts down.
func (d *EmailDispatcher) setStatus(ctx context.Context, job EmailJob, to EmailStatus) {
	statusCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), statusTimeout)
	defer cancel()
	if _, err := d.store.SetEmailStatus(statusCtx, job.InvitationID, job.TokenHash, EmailSending, to); err != nil && !errors.Is(err, context.Canceled) {
		log.Print("family: could not record the state of an invitation e-mail")
	}
}

// refund gives the place back with its own short context, for the same reason.
func (d *EmailDispatcher) refund(ctx context.Context, ticket mailer.Ticket) {
	refundCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), statusTimeout)
	defer cancel()
	d.quota.Refund(refundCtx, ticket)
}

func (d *EmailDispatcher) report(kind, message string) {
	if d.reporter != nil {
		d.reporter.Report(kind, message, nil)
	}
}

func (d *EmailDispatcher) recovered() {
	if d.reporter != nil {
		d.reporter.Recovered(mailer.FailureSend)
	}
}
