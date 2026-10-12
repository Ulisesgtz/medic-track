package errordigest

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	// Interval is how often the process checks whether the digest is due. The check costs nothing until the scheduled time of the
	// week arrives (it is a comparison of clocks), and then one claim.
	Interval = time.Minute
	// maxAttempts is how many times a send is tried in one run before the week is given up on.
	maxAttempts = 3
	// attemptTimeout bounds one try: a provider that never answers must not hold the digest, or the shutdown, for long.
	attemptTimeout = 15 * time.Second
	// releaseTimeout bounds the write that gives a week back when the service is shutting down.
	releaseTimeout = 2 * time.Second
)

// retryWaits are the waits between the tries of one send: after the first failure and after the second.
var retryWaits = [maxAttempts - 1]time.Duration{30 * time.Second, 2 * time.Minute}

// The kinds of failure the digest reports (specs/018): each is grouped apart in error_logs as job:error-digest.
const (
	failureSend   = "send"
	failureBuild  = "build"
	failureClaim  = "claim"
	failureRecord = "record"
)

// The messages are fixed sentences: never an address, the key, the provider's answer or a database's error text (FR-013).
var failureMessages = map[string]string{
	failureSend:   "error digest failed: could not send the weekly e-mail",
	failureBuild:  "error digest failed: could not build the summary",
	failureClaim:  "error digest failed: could not claim the week",
	failureRecord: "error digest failed: could not record the sent week",
}

// Claimer is the durable record of which weeks were already sent (satisfied by *Repository, specs/039 research R2).
type Claimer interface {
	// Claim takes the week for this process: Claimed (send it), Busy (someone else is sending it) or Done (already finished).
	Claim(ctx context.Context, weekKey string, lease time.Duration) (ClaimResult, error)
	MarkSent(ctx context.Context, weekKey string) error
	MarkFailed(ctx context.Context, weekKey string) error
	// Release gives the week back without finishing it, so the next claim — here or in another copy — can take it at once.
	Release(ctx context.Context, weekKey string) error
}

// FailureReporter records a failure of the digest in error_logs (satisfied by *jobreport.Reporter, specs/018): the same contract
// the retention job and the reminders use.
type FailureReporter interface {
	Report(kind, message string, accountID *uuid.UUID)
	Recovered(kind string)
}

// Service builds the weekly digest and sends it.
type Service struct {
	src           Source
	sender        Sender
	claims        Claimer
	cfg           Config
	retentionDays int
	reporter      FailureReporter // optional
	// sleep waits between the tries of a send; it returns early with the context's error. A field so tests don't wait.
	sleep func(ctx context.Context, d time.Duration) error

	mu sync.Mutex
	// doneWeek is the last week this process knows to be finished, so it stops asking the database about it every minute.
	doneWeek string
}

// NewService creates the digest service. `retentionDays` is how long error_logs keeps its entries (it decides whether the
// comparison with the previous week can be offered).
func NewService(src Source, sender Sender, claims Claimer, cfg Config, retentionDays int) *Service {
	return &Service{src: src, sender: sender, claims: claims, cfg: cfg, retentionDays: retentionDays, sleep: sleepContext}
}

// SetReporter makes the digest's failures also go to error_logs (as job:error-digest). Without one they only reach the console.
func (s *Service) SetReporter(r FailureReporter) { s.reporter = r }

func sleepContext(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

// message builds the digest of the week that ends at `now` as the e-mail to send. Its idempotency key is the week's, so asking
// the provider twice for the same week sends one e-mail.
func (s *Service) message(ctx context.Context, now time.Time) (Message, error) {
	d, err := Build(ctx, s.src, now, s.retentionDays)
	if err != nil {
		return Message{}, fmt.Errorf("building the digest: %w", err)
	}
	subject, text := Render(d, s.cfg.EnvLabel)
	return Message{
		From:           s.cfg.From,
		To:             s.cfg.To,
		Subject:        subject,
		Text:           text,
		IdempotencyKey: "error-digest-" + WeekKey(now),
	}, nil
}

// SendWeek builds the digest of the week that ends at `now` and hands it to the provider once: no claim, no retries (those are
// Tick's).
func (s *Service) SendWeek(ctx context.Context, now time.Time) error {
	m, err := s.message(ctx, now)
	if err != nil {
		return err
	}
	return s.sender.Send(ctx, m)
}

// Tick does what is due at `now`: nothing before the scheduled time of the week; from then on, claim the week and send it, once.
// A week finished by this process, by another copy or before a restart is never sent again; a week whose scheduled time passed
// while the service was off is sent as soon as it is back, as long as it is still the same week.
//
// What can go wrong, and what each case leaves behind:
//   - the claim or the building of the summary fail (the database): reported; the week is released, so the next minute tries again;
//   - the provider fails: up to 3 tries; a permanent refusal, or the third failure, marks the week 'failed' (not recovered) and reports it;
//   - the service is shutting down: nothing is reported or marked, and the week is given back for the next process.
func (s *Service) Tick(ctx context.Context, now time.Time) error {
	if !Due(now, s.cfg) {
		return nil
	}
	week := WeekKey(now)
	if s.isDone(week) {
		return nil
	}

	result, err := s.claims.Claim(ctx, week, LeaseDuration)
	if err != nil {
		s.report(ctx, failureClaim)
		return fmt.Errorf("claiming the week: %w", err)
	}
	switch result {
	case Done:
		s.markDone(week)
		return nil
	case Busy:
		return nil
	}

	m, err := s.message(ctx, now)
	if err != nil {
		s.release(ctx, week)
		s.report(ctx, failureBuild)
		return err
	}
	if err := s.sendWithRetries(ctx, m); err != nil {
		if ctx.Err() != nil { // shutting down: not a failure of the provider, and the week is not lost
			s.release(ctx, week)
			return ctx.Err()
		}
		if markErr := s.claims.MarkFailed(ctx, week); markErr != nil {
			log.Printf("errordigest: could not record that the week was given up on")
		}
		s.report(ctx, failureSend)
		s.markDone(week) // a given-up week is never claimed again: stop asking about it
		return err
	}
	if err := s.claims.MarkSent(ctx, week); err != nil {
		s.report(ctx, failureRecord)
		return fmt.Errorf("recording the sent week: %w", err)
	}
	s.markDone(week)
	s.recovered()
	return nil
}

// sendWithRetries tries the send up to maxAttempts times with growing waits, and gives up at once on a refusal that asking again
// can't fix (an invalid key, an unverified domain, a rejected address).
func (s *Service) sendWithRetries(ctx context.Context, m Message) error {
	var err error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		attemptCtx, cancel := context.WithTimeout(ctx, attemptTimeout)
		err = s.sender.Send(attemptCtx, m)
		cancel()
		if err == nil {
			return nil
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if !IsRetryable(err) || attempt == maxAttempts {
			return err
		}
		if waitErr := s.sleep(ctx, retryWaits[attempt-1]); waitErr != nil {
			return waitErr
		}
	}
	return err
}

// release gives the week back; with the context already cancelled it uses a fresh one with a short limit.
func (s *Service) release(ctx context.Context, week string) {
	releaseCtx := ctx
	if ctx.Err() != nil {
		var cancel context.CancelFunc
		releaseCtx, cancel = context.WithTimeout(context.WithoutCancel(ctx), releaseTimeout)
		defer cancel()
	}
	if err := s.claims.Release(releaseCtx, week); err != nil {
		log.Printf("errordigest: could not give the week back")
	}
}

// report records a failure of the given kind — unless the cause is the service shutting down, which is not one.
func (s *Service) report(ctx context.Context, kind string) {
	if s.reporter == nil || ctx.Err() != nil {
		return
	}
	s.reporter.Report(kind, failureMessages[kind], nil)
}

// recovered says every kind ran clean this cycle, so a new failure is written at once instead of being grouped with the old one.
func (s *Service) recovered() {
	if s.reporter == nil {
		return
	}
	for _, kind := range []string{failureSend, failureBuild, failureClaim, failureRecord} {
		s.reporter.Recovered(kind)
	}
}

func (s *Service) isDone(week string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.doneWeek == week
}

func (s *Service) markDone(week string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.doneWeek = week
}

// Run checks every minute whether the digest is due, until ctx is done.
func (s *Service) Run(ctx context.Context) { s.RunEvery(ctx, Interval) }

// RunEvery is Run with its own interval (tests).
func (s *Service) RunEvery(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	failing := false // a streak of failures is said once in the console; error_logs already groups them (specs/018)
	for {
		switch err := s.Tick(ctx, time.Now()); {
		case err != nil && ctx.Err() == nil:
			if !failing {
				log.Printf("errordigest: the weekly digest could not be sent; it keeps trying every %s and reports to error_logs", interval)
			}
			failing = true
		case err == nil:
			failing = false
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
