package jobreport_test

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/jobreport"
)

type fakeRecorder struct {
	mu      sync.Mutex
	entries []errorlog.Entry
	fail    bool
	block   chan struct{}
}

func (f *fakeRecorder) Create(_ context.Context, e *errorlog.Entry) error {
	if f.block != nil {
		<-f.block
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.fail {
		return errors.New("database down")
	}
	f.entries = append(f.entries, *e)
	return nil
}

func (f *fakeRecorder) written() []errorlog.Entry {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]errorlog.Entry(nil), f.entries...)
}

// newReporter returns a reporter that writes inline and a clock the test moves.
func newReporter(rec *fakeRecorder) (*jobreport.Reporter, *time.Time) {
	r := jobreport.New(rec, "reminders")
	jobreport.RunInline(r)
	clock := time.Date(2026, 9, 30, 10, 0, 0, 0, time.UTC)
	jobreport.SetClock(r, func() time.Time { return clock })
	return r, &clock
}

func TestReporter_FirstFailureIsWrittenAsAJobEntry(t *testing.T) {
	rec := &fakeRecorder{}
	r, _ := newReporter(rec)
	account := uuid.New()

	r.Report("deliver", "1 of 3 reminders could not be delivered", &account)

	got := rec.written()
	require.Len(t, got, 1)
	require.Equal(t, "job:reminders", got[0].Endpoint)
	require.Nil(t, got[0].HTTPStatus)
	require.Equal(t, "1 of 3 reminders could not be delivered", got[0].Message)
	require.Equal(t, &account, got[0].AccountID)
	require.True(t, strings.HasSuffix(got[0].File, "reporter_test.go"), "the caller's file, got %s", got[0].File)
	require.Positive(t, got[0].Line)
}

func TestReporter_TheSameFailureInsideTheWindowIsOnlyCounted(t *testing.T) {
	rec := &fakeRecorder{}
	r, clock := newReporter(rec)

	r.Report("tick", "tick failed", nil)
	for i := 0; i < 5; i++ {
		*clock = clock.Add(30 * time.Second)
		r.Report("tick", "tick failed", nil)
	}
	require.Len(t, rec.written(), 1)

	*clock = clock.Add(jobreport.GroupWindow)
	r.Report("tick", "tick failed", nil)

	got := rec.written()
	require.Len(t, got, 2)
	require.Equal(t, "tick failed (repeated 5 more times since the last entry)", got[1].Message)
}

func TestReporter_FailureKindsAreGroupedApart(t *testing.T) {
	rec := &fakeRecorder{}
	r, _ := newReporter(rec)

	r.Report("tick", "tick failed", nil)
	r.Report("deliver", "1 of 1 reminders could not be delivered", nil)
	r.Report("tick", "tick failed", nil)

	require.Len(t, rec.written(), 2)
}

func TestReporter_AfterARecoveryTheNextFailureIsWrittenAtOnceWithTheCount(t *testing.T) {
	rec := &fakeRecorder{}
	r, clock := newReporter(rec)

	r.Report("tick", "tick failed", nil)
	*clock = clock.Add(30 * time.Second)
	r.Report("tick", "tick failed", nil)
	*clock = clock.Add(30 * time.Second)
	r.Recovered("tick")
	*clock = clock.Add(30 * time.Second)
	r.Report("tick", "tick failed", nil)

	got := rec.written()
	require.Len(t, got, 2)
	require.Equal(t, "tick failed (repeated 1 more times since the last entry)", got[1].Message)

	// And it groups again from there.
	r.Report("tick", "tick failed", nil)
	require.Len(t, rec.written(), 2)
}

func TestReporter_RecoveredForAKindNeverSeenDoesNothing(t *testing.T) {
	rec := &fakeRecorder{}
	r, _ := newReporter(rec)

	r.Recovered("tick")
	r.Report("tick", "tick failed", nil)

	require.Len(t, rec.written(), 1)
}

func TestReporter_AFailedWriteDoesNotBreakAndTheNextFailureTriesAgain(t *testing.T) {
	rec := &fakeRecorder{fail: true}
	r, clock := newReporter(rec)

	require.NotPanics(t, func() { r.Report("tick", "tick failed", nil) })
	require.Empty(t, rec.written())

	// The window did not start: the next failure is written as soon as the database answers.
	rec.mu.Lock()
	rec.fail = false
	rec.mu.Unlock()
	*clock = clock.Add(30 * time.Second)
	r.Report("tick", "tick failed", nil)

	require.Len(t, rec.written(), 1)
}

func TestReporter_AFailedWriteKeepsTheCountOfTheLeftOutFailures(t *testing.T) {
	rec := &fakeRecorder{}
	r, clock := newReporter(rec)
	r.Report("tick", "tick failed", nil)
	*clock = clock.Add(time.Minute)
	r.Report("tick", "tick failed", nil) // left out: 1

	rec.mu.Lock()
	rec.fail = true
	rec.mu.Unlock()
	*clock = clock.Add(jobreport.GroupWindow)
	r.Report("tick", "tick failed", nil) // its write fails

	rec.mu.Lock()
	rec.fail = false
	rec.mu.Unlock()
	*clock = clock.Add(time.Minute)
	r.Report("tick", "tick failed", nil)

	got := rec.written()
	require.Len(t, got, 2)
	require.Equal(t, "tick failed (repeated 1 more times since the last entry)", got[1].Message)
}

func TestReporter_ReturnsBeforeTheWriteEnds(t *testing.T) {
	rec := &fakeRecorder{block: make(chan struct{})}
	r := jobreport.New(rec, "reminders") // the real background write

	done := make(chan struct{})
	go func() {
		r.Report("tick", "tick failed", nil)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Report waited for the slow write")
	}
	close(rec.block)
	require.Eventually(t, func() bool { return len(rec.written()) == 1 }, time.Second, 5*time.Millisecond)
}
