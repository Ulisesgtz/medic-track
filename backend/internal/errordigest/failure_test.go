package errordigest

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// specs/039 Historia 3: what happens when the provider, the database or the shutdown get in the way. None of these touch the real
// database: the record of weeks is an in-memory fake, and the waits between tries are replaced by a recorder.

type memClaimer struct {
	mu          sync.Mutex
	status      map[string]string
	releases    int
	claimErr    error
	markSentErr error
}

func newMemClaimer() *memClaimer { return &memClaimer{status: map[string]string{}} }

func (m *memClaimer) Claim(_ context.Context, week string, _ time.Duration) (ClaimResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.claimErr != nil {
		return Busy, m.claimErr
	}
	switch m.status[week] {
	case "sent", "failed":
		return Done, nil
	case "sending":
		return Busy, nil
	}
	m.status[week] = "sending"
	return Claimed, nil
}

func (m *memClaimer) MarkSent(_ context.Context, week string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.markSentErr != nil {
		return m.markSentErr
	}
	m.status[week] = "sent"
	return nil
}

func (m *memClaimer) MarkFailed(_ context.Context, week string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.status[week] = "failed"
	return nil
}

func (m *memClaimer) Release(_ context.Context, week string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.releases++
	if m.status[week] == "sending" {
		m.status[week] = "released"
	}
	return nil
}

func (m *memClaimer) get(week string) string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.status[week]
}

type report struct{ kind, message string }

type fakeReporter struct {
	mu        sync.Mutex
	reports   []report
	recovered []string
}

func (f *fakeReporter) Report(kind, message string, _ *uuid.UUID) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.reports = append(f.reports, report{kind, message})
}

func (f *fakeReporter) Recovered(kind string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.recovered = append(f.recovered, kind)
}

type funcSender func(ctx context.Context, m Message) error

func (f funcSender) Send(ctx context.Context, m Message) error { return f(ctx, m) }

var retryable = &SendError{Retryable: true, Status: 503}

// failureRig is a service wired with fakes, due at `due`.
type failureRig struct {
	svc      *Service
	sender   *fakeSender
	claims   *memClaimer
	reporter *fakeReporter
	src      *fakeSource
	waits    []time.Duration
	week     string
	due      time.Time
}

func newRig(results ...error) *failureRig {
	r := &failureRig{
		sender:   &fakeSender{results: results},
		claims:   newMemClaimer(),
		reporter: &fakeReporter{},
		src:      newFake(),
		due:      Scheduled(now, 1, 8),
	}
	r.week = WeekKey(r.due)
	r.svc = NewService(r.src, r.sender, r.claims, testConfig, 90)
	r.svc.SetReporter(r.reporter)
	r.svc.sleep = func(_ context.Context, d time.Duration) error {
		r.waits = append(r.waits, d)
		return nil
	}
	return r
}

func TestTick_AFailureThatPassesIsRetriedAndTheEmailGoesOut(t *testing.T) {
	r := newRig(retryable, retryable) // two failures, then it succeeds

	err := r.svc.Tick(context.Background(), r.due)

	require.NoError(t, err)
	require.Equal(t, 3, r.sender.attempts)
	require.Len(t, r.sender.messages(), 1)
	require.Equal(t, []time.Duration{30 * time.Second, 2 * time.Minute}, r.waits, "growing waits between the tries")
	require.Equal(t, "sent", r.claims.get(r.week))
	require.Empty(t, r.reporter.reports, "a send that finally went out is not a failure")
	require.Contains(t, r.reporter.recovered, "send")
}

func TestTick_ThreeFailuresGiveUpTheWeekAndReportOnce(t *testing.T) {
	r := newRig(retryable, retryable, retryable)

	err := r.svc.Tick(context.Background(), r.due)

	require.Error(t, err)
	require.Equal(t, 3, r.sender.attempts, "exactly three tries")
	require.Empty(t, r.sender.messages())
	require.Equal(t, "failed", r.claims.get(r.week))
	require.Equal(t, []report{{"send", "error digest failed: could not send the weekly e-mail"}}, r.reporter.reports)

	// A given-up week is not tried again: the next minute does nothing, here or after a restart.
	require.NoError(t, r.svc.Tick(context.Background(), r.due.Add(time.Minute)))
	require.Equal(t, 3, r.sender.attempts)
	require.NoError(t, NewService(r.src, r.sender, r.claims, testConfig, 90).Tick(context.Background(), r.due.Add(2*time.Minute)))
	require.Equal(t, 3, r.sender.attempts)
}

func TestTick_APermanentRefusalIsNotRetried(t *testing.T) {
	r := newRig(&SendError{Retryable: false, Status: 401})

	err := r.svc.Tick(context.Background(), r.due)

	require.Error(t, err)
	require.Equal(t, 1, r.sender.attempts)
	require.Empty(t, r.waits)
	require.Equal(t, "failed", r.claims.get(r.week))
	require.Len(t, r.reporter.reports, 1)
}

func TestTick_TheReportsNeverCarryTheKeyTheAddressesOrTheProvidersText(t *testing.T) {
	r := newRig(&SendError{Retryable: false, Status: 422})
	r.svc.sender = funcSender(func(context.Context, Message) error {
		return errors.New("provider says: address soporte@pedi-track.com invalid for key re_key")
	})

	err := r.svc.Tick(context.Background(), r.due)

	require.Error(t, err)
	require.Len(t, r.reporter.reports, 1)
	for _, rep := range r.reporter.reports {
		for _, secret := range []string{testConfig.APIKey, testConfig.To, testConfig.From, "invalid", "provider says"} {
			require.False(t, strings.Contains(rep.message, secret), "%q in %q", secret, rep.message)
		}
	}
}

func TestTick_AFailureToBuildReportsReleasesTheWeekAndTriesAgainAtOnce(t *testing.T) {
	r := newRig()
	r.src.err = errors.New("database is down")

	err := r.svc.Tick(context.Background(), r.due)

	require.Error(t, err)
	require.Zero(t, r.sender.attempts)
	require.Equal(t, []report{{"build", "error digest failed: could not build the summary"}}, r.reporter.reports)
	require.Equal(t, "released", r.claims.get(r.week), "not 'failed': nothing was sent")
	require.Equal(t, 1, r.claims.releases)

	// The database is back: the very next minute sends, without waiting for any lease.
	r.src.err = nil
	require.NoError(t, r.svc.Tick(context.Background(), r.due.Add(time.Minute)))
	require.Len(t, r.sender.messages(), 1)
	require.Equal(t, "sent", r.claims.get(r.week))
}

func TestTick_AFailureToClaimIsReported(t *testing.T) {
	r := newRig()
	r.claims.claimErr = errors.New("database is down")

	err := r.svc.Tick(context.Background(), r.due)

	require.Error(t, err)
	require.Equal(t, []report{{"claim", "error digest failed: could not claim the week"}}, r.reporter.reports)
	require.Zero(t, r.sender.attempts)
}

func TestTick_AFailureToRecordTheSentWeekIsReported(t *testing.T) {
	r := newRig()
	r.claims.markSentErr = errors.New("database is down")

	err := r.svc.Tick(context.Background(), r.due)

	require.Error(t, err)
	require.Len(t, r.sender.messages(), 1, "the e-mail did go out")
	require.Equal(t, []report{{"record", "error digest failed: could not record the sent week"}}, r.reporter.reports)
}

func TestTick_WithoutAReporterAFailureOnlyComesBackAsAnError(t *testing.T) {
	r := newRig(retryable, retryable, retryable)
	r.svc.SetReporter(nil)

	require.Error(t, r.svc.Tick(context.Background(), r.due))
	require.Equal(t, "failed", r.claims.get(r.week))
}

func TestTick_AnAttemptHasItsOwnTimeLimit(t *testing.T) {
	r := newRig()
	var deadline time.Time
	var hasDeadline bool
	r.svc.sender = funcSender(func(ctx context.Context, _ Message) error {
		deadline, hasDeadline = ctx.Deadline()
		return nil
	})

	require.NoError(t, r.svc.Tick(context.Background(), r.due))

	require.True(t, hasDeadline)
	require.WithinDuration(t, time.Now().Add(attemptTimeout), deadline, 5*time.Second)
}

func TestTick_AnAttemptThatTimesOutIsRetried(t *testing.T) {
	r := newRig(context.DeadlineExceeded)

	require.NoError(t, r.svc.Tick(context.Background(), r.due))

	require.Equal(t, 2, r.sender.attempts)
	require.Len(t, r.sender.messages(), 1)
}

func TestTick_ShuttingDownWhileWaitingLeavesTheWeekForTheNextProcess(t *testing.T) {
	r := newRig(retryable)
	ctx, cancel := context.WithCancel(context.Background())
	r.svc.sleep = func(ctx context.Context, _ time.Duration) error {
		cancel() // the service is told to stop during the wait between two tries
		return ctx.Err()
	}

	err := r.svc.Tick(ctx, r.due)

	require.ErrorIs(t, err, context.Canceled)
	require.Equal(t, "released", r.claims.get(r.week), "given back, not 'failed'")
	require.Empty(t, r.reporter.reports, "a shutdown is not a failure")
	require.Equal(t, 1, r.sender.attempts)
}

func TestTick_ShuttingDownDuringASendLeavesTheWeekForTheNextProcess(t *testing.T) {
	r := newRig()
	ctx, cancel := context.WithCancel(context.Background())
	started := make(chan struct{})
	r.svc.sender = funcSender(func(ctx context.Context, _ Message) error {
		close(started)
		<-ctx.Done() // the provider never answers
		return ctx.Err()
	})
	done := make(chan error, 1)
	go func() { done <- r.svc.Tick(ctx, r.due) }()
	<-started

	cancel()

	select {
	case err := <-done:
		require.ErrorIs(t, err, context.Canceled)
	case <-time.After(3 * time.Second):
		t.Fatal("the shutdown waited for the provider")
	}
	require.Equal(t, "released", r.claims.get(r.week))
	require.Empty(t, r.reporter.reports)
}

func TestSleepContext(t *testing.T) {
	require.NoError(t, sleepContext(context.Background(), time.Millisecond))

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	require.ErrorIs(t, sleepContext(ctx, time.Hour), context.Canceled)
}

func TestFailureMessagesAreFixedSentencesWithoutValues(t *testing.T) {
	require.Len(t, failureMessages, 4)
	for kind, msg := range failureMessages {
		require.True(t, strings.HasPrefix(msg, "error digest failed: "), kind)
		require.False(t, strings.ContainsAny(msg, "@%{}"), "%s: %s", kind, msg)
	}
}
