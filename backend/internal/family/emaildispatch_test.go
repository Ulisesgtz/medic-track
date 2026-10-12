package family_test

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/family"
	"github.com/Ulisesgtz/medic-track/backend/internal/mailer"
)

// specs/040: the dispatcher against the real tables, with a fake provider and a fake quota.

type fakeProvider struct {
	mu      sync.Mutex
	sent    []mailer.Message
	results []error // answers to the first calls, in order; after them it succeeds
	calls   int
	// block makes Send wait for the context (a provider that never answers).
	block bool
}

func (p *fakeProvider) Send(ctx context.Context, m mailer.Message) error {
	p.mu.Lock()
	i := p.calls
	p.calls++
	block := p.block
	var err error
	if i < len(p.results) {
		err = p.results[i]
	}
	if err == nil && !block {
		p.sent = append(p.sent, m)
	}
	p.mu.Unlock()
	if block {
		<-ctx.Done()
		return ctx.Err()
	}
	return err
}

func (p *fakeProvider) sentCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.sent)
}

func (p *fakeProvider) callCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.calls
}

type fakeQuota struct {
	mu        sync.Mutex
	reserved  int
	refunded  int
	exhausted bool
	err       error
}

func (q *fakeQuota) Reserve(context.Context, mailer.Class) (mailer.Ticket, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.err != nil {
		return mailer.Ticket{}, q.err
	}
	if q.exhausted {
		return mailer.Ticket{}, mailer.ErrQuotaExceeded
	}
	q.reserved++
	return mailer.Ticket{Day: time.Now()}, nil
}

func (q *fakeQuota) Refund(context.Context, mailer.Ticket) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.refunded++
}

type reports struct {
	mu   sync.Mutex
	list []string
	ok   int
}

func (r *reports) Report(kind, message string, _ *uuid.UUID) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.list = append(r.list, kind+": "+message)
}
func (r *reports) Recovered(string) { r.mu.Lock(); r.ok++; r.mu.Unlock() }
func (r *reports) all() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.list...)
}

type dispatchRig struct {
	*env
	owners   map[uuid.UUID]person
	provider *fakeProvider
	quota    *fakeQuota
	reports  *reports
	d        *family.EmailDispatcher
}

func newDispatchRig(t *testing.T) *dispatchRig {
	t.Helper()
	e := newEnv(t)
	r := &dispatchRig{env: e, owners: map[uuid.UUID]person{}, provider: &fakeProvider{}, quota: &fakeQuota{}, reports: &reports{}}
	r.d = family.NewEmailDispatcher(e.repo, r.provider, r.quota, r.reports)
	r.d.Fast(time.Hour)
	return r
}

func (r *dispatchRig) ownerOf(job family.EmailJob) person { return r.owners[job.InvitationID] }

// job creates an invitation of a family of its own (a family holds 4 people at most), leaves its e-mail 'sending' as the
// service does, and returns the job for it.
func (r *dispatchRig) job(t *testing.T) family.EmailJob {
	t.Helper()
	owner := r.newPerson(t, account.PlanPaid, true)
	id, hash := r.invited(t, owner)
	r.owners[id] = owner
	_, err := r.pool.Exec(context.Background(), `UPDATE family_invitations SET email_status = 'sending', email_status_at = now() WHERE id = $1`, id)
	require.NoError(t, err)
	return family.EmailJob{InvitationID: id, TokenHash: hash, Message: mailer.Message{To: "x@example.com", Subject: "s", Text: "t", IdempotencyKey: "k"}}
}

func (r *dispatchRig) state(t *testing.T, job family.EmailJob) string {
	status, _ := r.emailState(t, job.InvitationID)
	return status
}

func TestDeliverSendsOnceAndMarksItSent(t *testing.T) {
	r := newDispatchRig(t)
	job := r.job(t)
	r.d.Deliver(context.Background(), job)
	require.Equal(t, 1, r.provider.sentCount())
	require.Equal(t, "sent", r.state(t, job))
	require.Equal(t, 1, r.quota.reserved)
	require.Zero(t, r.quota.refunded)
	require.Empty(t, r.reports.all())
}

func TestDeliverDropsTheEmailOfAResentInvitation(t *testing.T) {
	r := newDispatchRig(t)
	job := r.job(t)
	code, out := r.do(t, r.ownerOf(job).clerkID, http.MethodPost, "/family/invitations/"+job.InvitationID.String()+"/resend", "")
	require.Equal(t, http.StatusOK, code, out)
	before, _ := r.emailState(t, job.InvitationID)

	r.d.Deliver(context.Background(), job) // the job carries the OLD token

	require.Zero(t, r.provider.sentCount(), "a link that no longer works is never e-mailed")
	after, _ := r.emailState(t, job.InvitationID)
	require.Equal(t, before, after, "the state belongs to the resend")
	require.Equal(t, r.quota.reserved, r.quota.refunded, "the place is given back")
	require.Empty(t, r.reports.all(), "it is not a failure")
}

func TestDeliverDropsTheEmailOfACanceledOrExpiredInvitation(t *testing.T) {
	r := newDispatchRig(t)
	canceled := r.job(t)
	code, _ := r.do(t, r.ownerOf(canceled).clerkID, http.MethodPost, "/family/invitations/"+canceled.InvitationID.String()+"/cancel", "")
	require.Equal(t, http.StatusNoContent, code)
	expired := r.job(t)
	_, err := r.pool.Exec(context.Background(), `UPDATE family_invitations SET expires_at = now() - interval '1 minute' WHERE id = $1`, expired.InvitationID)
	require.NoError(t, err)

	r.d.Deliver(context.Background(), canceled)
	r.d.Deliver(context.Background(), expired)
	require.Zero(t, r.provider.sentCount())
}

func TestDeliverWithNoPlaceInTheDayFailsWithoutCallingTheProvider(t *testing.T) {
	r := newDispatchRig(t)
	r.quota.exhausted = true
	job := r.job(t)
	r.d.Deliver(context.Background(), job)
	require.Zero(t, r.provider.callCount())
	require.Equal(t, "failed", r.state(t, job))
	require.Empty(t, r.reports.all(), "the quota reports its own warning; running out is not a failure of a send")
}

func TestDeliverWhenTheCounterFailsAlsoFailsTheEmailOnly(t *testing.T) {
	r := newDispatchRig(t)
	r.quota.err = errors.New("db down for ana@example.com")
	job := r.job(t)
	r.d.Deliver(context.Background(), job)
	require.Zero(t, r.provider.callCount())
	require.Equal(t, "failed", r.state(t, job))
}

func TestDeliverRetriesAndTheThirdTrySends(t *testing.T) {
	r := newDispatchRig(t)
	r.provider.results = []error{&mailer.SendError{Retryable: true, Status: 503}, &mailer.SendError{Retryable: true, Status: 429}}
	job := r.job(t)
	r.d.Deliver(context.Background(), job)
	require.Equal(t, 3, r.provider.callCount())
	require.Equal(t, 1, r.provider.sentCount())
	require.Equal(t, "sent", r.state(t, job))
	require.Equal(t, 1, r.quota.reserved, "one place for the whole send, not one per try")
	require.Zero(t, r.quota.refunded)
	require.Empty(t, r.reports.all())
}

func TestDeliverThatNeverSucceedsFailsOnceReportsOnceAndGivesTheplaceBack(t *testing.T) {
	r := newDispatchRig(t)
	boom := &mailer.SendError{Retryable: true, Status: 500}
	r.provider.results = []error{boom, boom, boom, boom}
	job := r.job(t)
	r.d.Deliver(context.Background(), job)
	require.Equal(t, 3, r.provider.callCount())
	require.Equal(t, "failed", r.state(t, job))
	require.Equal(t, 1, r.quota.refunded)
	require.Equal(t, []string{"send: invitation e-mail failed: could not send"}, r.reports.all())
}

func TestDeliverAPermanentRefusalIsOneTry(t *testing.T) {
	r := newDispatchRig(t)
	r.provider.results = []error{&mailer.SendError{Retryable: false, Status: 422}}
	job := r.job(t)
	r.d.Deliver(context.Background(), job)
	require.Equal(t, 1, r.provider.callCount())
	require.Equal(t, "failed", r.state(t, job))
	require.Len(t, r.reports.all(), 1)
}

func TestDeliverAResendDuringTheTriesStopsTheNextTry(t *testing.T) {
	r := newDispatchRig(t)
	job := r.job(t)
	// the first try fails; before the second a resend changes the token
	r.provider.results = []error{&mailer.SendError{Retryable: true, Status: 503}}
	resent := false
	r.d = family.NewEmailDispatcher(r.repo, &hookProvider{inner: r.provider, after: func() {
		if !resent {
			resent = true
			code, _ := r.do(t, r.ownerOf(job).clerkID, http.MethodPost, "/family/invitations/"+job.InvitationID.String()+"/resend", "")
			require.Equal(t, http.StatusOK, code)
		}
	}}, r.quota, r.reports)
	r.d.Fast(time.Hour)
	r.d.Deliver(context.Background(), job)
	require.Equal(t, 1, r.provider.callCount(), "the second try never reached the provider")
	require.Zero(t, r.provider.sentCount())
	require.Empty(t, r.reports.all())
}

// hookProvider runs a function after every Send.
type hookProvider struct {
	inner mailer.Sender
	after func()
}

func (h *hookProvider) Send(ctx context.Context, m mailer.Message) error {
	err := h.inner.Send(ctx, m)
	h.after()
	return err
}

func TestDeliverTreatsTheProvidersIdempotency409AsSent(t *testing.T) {
	r := newDispatchRig(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusConflict)
		_, _ = w.Write([]byte(`{"name":"invalid_idempotent_request","message":"same key, other payload"}`))
	}))
	defer server.Close()
	d := family.NewEmailDispatcher(r.repo, mailer.NewResendSender("key", nil, server.URL), r.quota, r.reports)
	job := r.job(t)
	d.Deliver(context.Background(), job)
	require.Equal(t, "sent", r.state(t, job))
	require.Empty(t, r.reports.all())
}

func TestDeliverWhileShuttingDownIsNotAFailureOfTheProvider(t *testing.T) {
	r := newDispatchRig(t)
	r.provider.block = true
	job := r.job(t)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { r.d.Deliver(ctx, job); close(done) }()
	require.Eventually(t, func() bool { return r.provider.callCount() == 1 }, 3*time.Second, 5*time.Millisecond)
	cancel()
	<-done
	require.Equal(t, "failed", r.state(t, job), "the screen must not wait forever")
	require.Empty(t, r.reports.all())
	require.Equal(t, 1, r.quota.refunded)
}

func TestEnqueueSaysFalseWhenTheQueueIsFull(t *testing.T) {
	r := newDispatchRig(t)
	for i := 0; i < family.QueueSize; i++ {
		require.True(t, r.d.Enqueue(family.EmailJob{}))
	}
	require.False(t, r.d.Enqueue(family.EmailJob{}))
}

func TestStartRunsTheQueueAndStopsClosingWhatWasLeftAsFailed(t *testing.T) {
	r := newDispatchRig(t)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { r.d.Start(ctx); close(done) }()
	first := r.job(t)
	require.True(t, r.d.Enqueue(first))
	require.Eventually(t, func() bool { return r.state(t, first) == "sent" }, 5*time.Second, 10*time.Millisecond)

	// from now on the provider never answers: two jobs are being sent, the rest wait in the queue
	r.provider.block = true
	var left []family.EmailJob
	for i := 0; i < 5; i++ {
		j := r.job(t)
		left = append(left, j)
		require.True(t, r.d.Enqueue(j))
	}
	require.Eventually(t, func() bool { return r.provider.callCount() >= 3 }, 5*time.Second, 10*time.Millisecond)
	cancel()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("Start did not return after the context was done")
	}
	for _, j := range left {
		require.Equal(t, "failed", r.state(t, j), "no e-mail is left 'sending' after the shutdown")
	}
}

func TestStartSweepsStuckSendsAtStartAndPeriodically(t *testing.T) {
	r := newDispatchRig(t)
	stale := r.job(t)
	_, err := r.pool.Exec(context.Background(), `UPDATE family_invitations SET email_status_at = now() - interval '10 minutes' WHERE id = $1`, stale.InvitationID)
	require.NoError(t, err)
	r.d.Fast(20 * time.Millisecond)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { r.d.Start(ctx); close(done) }()
	require.Eventually(t, func() bool { return r.state(t, stale) == "failed" }, 5*time.Second, 10*time.Millisecond)

	// one that gets stuck later is closed by the periodic sweep, but a fresh one is not
	fresh := r.job(t)
	late := r.job(t)
	_, err = r.pool.Exec(context.Background(), `UPDATE family_invitations SET email_status_at = now() - interval '10 minutes' WHERE id = $1`, late.InvitationID)
	require.NoError(t, err)
	require.Eventually(t, func() bool { return r.state(t, late) == "failed" }, 5*time.Second, 10*time.Millisecond)
	require.Equal(t, "sending", r.state(t, fresh))
	cancel()
	<-done
}

// failingStore fails the sweep.
type failingStore struct{ *family.Repository }

func (failingStore) SweepStaleSending(context.Context, time.Duration) (int64, error) {
	return 0, fmt.Errorf("db error mentioning ana@example.com")
}

func TestAFailingSweepIsReportedWithAFixedMessage(t *testing.T) {
	r := newDispatchRig(t)
	d := family.NewEmailDispatcher(failingStore{r.repo}, r.provider, r.quota, r.reports)
	d.Fast(time.Hour)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { d.Start(ctx); close(done) }()
	require.Eventually(t, func() bool { return len(r.reports.all()) == 1 }, 3*time.Second, 5*time.Millisecond)
	cancel()
	<-done
	require.Equal(t, []string{"sweep: invitation e-mail failed: could not resolve stuck sends"}, r.reports.all())
}

func TestADispatcherWithoutReporterDoesNotPanic(t *testing.T) {
	r := newDispatchRig(t)
	r.provider.results = []error{&mailer.SendError{Retryable: false, Status: 401}}
	d := family.NewEmailDispatcher(r.repo, r.provider, r.quota, nil)
	d.Fast(time.Hour)
	job := r.job(t)
	d.Deliver(context.Background(), job)
	require.Equal(t, "failed", r.state(t, job))
	ok := r.job(t)
	d.Deliver(context.Background(), ok)
	require.Equal(t, "sent", r.state(t, ok))
}

// Nothing of the person, the link or the key reaches the reports, the console or error_logs (Principio II, FR-015).
func TestFailuresNeverCarryTheAddressTheLinkOrTheKey(t *testing.T) {
	r := newDispatchRig(t)
	secret := "re_super_secret_key"
	r.provider.results = []error{
		fmt.Errorf("post https://api.resend.com/emails?to=invitada@example.com key %s failed", secret),
		fmt.Errorf("again %s", secret), fmt.Errorf("and again %s", secret),
	}
	job := r.job(t)
	job.Message.Text = "https://dev.pedi-track.com/familia/invitacion#SECRETTOKEN invitada@example.com"
	r.d.Deliver(context.Background(), job)
	for _, line := range r.reports.all() {
		require.NotContains(t, line, secret)
		require.NotContains(t, line, "invitada@example.com")
		require.NotContains(t, line, "SECRETTOKEN")
		require.False(t, strings.Contains(line, "http"))
	}
	require.Eventually(t, func() bool { return len(r.log.all()) >= 0 }, time.Second, time.Millisecond)
	for _, entry := range r.log.all() {
		text := fmt.Sprintf("%+v", entry)
		require.NotContains(t, text, secret)
		require.NotContains(t, text, "SECRETTOKEN")
	}
	var stored string
	require.NoError(t, r.pool.QueryRow(context.Background(), `SELECT row_to_json(i)::text FROM family_invitations i WHERE id = $1`, job.InvitationID).Scan(&stored))
	require.NotContains(t, stored, "SECRETTOKEN")
	require.NotContains(t, stored, secret)
}
