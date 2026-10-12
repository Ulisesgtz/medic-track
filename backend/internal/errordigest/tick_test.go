package errordigest

import (
	"context"
	"math/rand/v2"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// Tick against the real record of weeks (specs/039 Historia 2): one e-mail per week, whatever restarts and copies there are.

// farWeek is the scheduled instant (Monday 08:00, Mexico City) of a week in the far future that no other test or real run uses;
// its row is removed afterwards. Because the digest of a week is keyed by the ISO week of `now`, every tick below uses times
// around this instant.
func farWeek(t *testing.T, pool *pgxpool.Pool) (due time.Time, week string) {
	t.Helper()
	due = Scheduled(cdmx(5000+rand.IntN(4000), time.June, 15, 12, 0), 1, 8)
	week = WeekKey(due)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM error_digest_runs WHERE week_key = $1`, week)
	})
	return due, week
}

func newTickService(pool *pgxpool.Pool, sender Sender) *Service {
	return NewService(newFake(), sender, NewRepository(pool), testConfig, 90)
}

func TestTick_DoesNothingBeforeTheScheduledTime(t *testing.T) {
	pool := testPool(t)
	due, week := farWeek(t, pool)
	sender := &fakeSender{}
	svc := newTickService(pool, sender)

	require.NoError(t, svc.Tick(context.Background(), due.Add(-time.Minute)))

	require.Empty(t, sender.messages())
	var rows int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM error_digest_runs WHERE week_key = $1`, week).Scan(&rows))
	require.Zero(t, rows, "nothing is claimed before it is due")
}

func TestTick_SendsOnceAtTheScheduledTimeAndRecordsIt(t *testing.T) {
	pool := testPool(t)
	due, week := farWeek(t, pool)
	sender := &fakeSender{}
	svc := newTickService(pool, sender)

	require.NoError(t, svc.Tick(context.Background(), due))
	require.NoError(t, svc.Tick(context.Background(), due.Add(time.Minute)), "the next minute")
	require.NoError(t, svc.Tick(context.Background(), due.Add(5*time.Hour)), "hours later")

	got := sender.messages()
	require.Len(t, got, 1)
	require.Equal(t, "error-digest-"+week, got[0].IdempotencyKey)
	row := readRun(t, pool, week)
	require.Equal(t, "sent", row.status)
	require.NotNil(t, row.sentAt)
}

func TestTick_ARestartDoesNotSendTheSameWeekAgain(t *testing.T) {
	pool := testPool(t)
	due, _ := farWeek(t, pool)
	sender := &fakeSender{}
	require.NoError(t, newTickService(pool, sender).Tick(context.Background(), due))

	restarted := newTickService(pool, sender) // a new process: no memory of the week, only the table
	require.NoError(t, restarted.Tick(context.Background(), due.Add(time.Minute)))
	require.NoError(t, restarted.Tick(context.Background(), due.Add(2*time.Minute)))

	require.Len(t, sender.messages(), 1)
}

func TestTick_TwoCopiesAtOnceSendOneEmail(t *testing.T) {
	pool := testPool(t)
	due, _ := farWeek(t, pool)
	sender := &fakeSender{}

	const copies = 6
	var ready, done sync.WaitGroup
	start := make(chan struct{})
	ready.Add(copies)
	done.Add(copies)
	for i := 0; i < copies; i++ {
		svc := newTickService(pool, sender)
		go func() {
			defer done.Done()
			ready.Done()
			<-start
			if err := svc.Tick(context.Background(), due); err != nil {
				t.Errorf("tick: %v", err)
			}
		}()
	}
	ready.Wait()
	close(start)
	done.Wait()

	require.Len(t, sender.messages(), 1)
}

func TestTick_AServiceThatWasOffOnMondayRecoversTheSameWeekButNotAPastOne(t *testing.T) {
	pool := testPool(t)
	due, week := farWeek(t, pool)
	sender := &fakeSender{}
	svc := newTickService(pool, sender)

	// Off on Monday; back up on Tuesday morning: the same week, so it sends.
	require.NoError(t, svc.Tick(context.Background(), due.Add(26*time.Hour)))
	require.Len(t, sender.messages(), 1)
	require.Equal(t, "error-digest-"+week, sender.messages()[0].IdempotencyKey)

	// The next Monday is a new week with its own schedule: not due at 07:59, due at 08:00.
	nextDue := due.AddDate(0, 0, 7)
	nextWeek := WeekKey(nextDue)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM error_digest_runs WHERE week_key = $1`, nextWeek)
	})
	require.NotEqual(t, week, nextWeek)
	require.NoError(t, svc.Tick(context.Background(), nextDue.Add(-time.Minute)))
	require.Len(t, sender.messages(), 1)
	require.NoError(t, svc.Tick(context.Background(), nextDue))
	require.Len(t, sender.messages(), 2)
	require.Equal(t, "error-digest-"+nextWeek, sender.messages()[1].IdempotencyKey)
}

func TestTick_AWeekThatWasMissedIsNotRecoveredByALaterWeeksService(t *testing.T) {
	pool := testPool(t)
	due, week := farWeek(t, pool)
	sender := &fakeSender{}

	// The service only starts the Monday after: it sends that week's digest, and the week before has no row at all.
	nextDue := due.AddDate(0, 0, 7)
	nextWeek := WeekKey(nextDue)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM error_digest_runs WHERE week_key = $1`, nextWeek)
	})
	require.NoError(t, newTickService(pool, sender).Tick(context.Background(), nextDue.Add(time.Hour)))

	require.Len(t, sender.messages(), 1)
	require.Equal(t, "error-digest-"+nextWeek, sender.messages()[0].IdempotencyKey)
	var rows int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM error_digest_runs WHERE week_key = $1`, week).Scan(&rows))
	require.Zero(t, rows)
}

func TestTick_AWeekWhoseHolderDiedIsRetakenWithTheSameIdempotencyKey(t *testing.T) {
	pool := testPool(t)
	due, week := farWeek(t, pool)
	repo := NewRepository(pool)
	// A process claimed the week and died before marking it.
	claimed, err := repo.Claim(context.Background(), week, LeaseDuration)
	require.NoError(t, err)
	require.Equal(t, Claimed, claimed)
	sender := &fakeSender{}
	svc := newTickService(pool, sender)

	// While its lease is alive nobody else sends.
	require.NoError(t, svc.Tick(context.Background(), due.Add(time.Minute)))
	require.Empty(t, sender.messages())

	// Once the lease ran out, another process takes the week over and sends with the week's key: if the first one had really
	// sent, the provider recognizes the key and does not send twice.
	_, err = pool.Exec(context.Background(), `UPDATE error_digest_runs SET lease_until = now() - interval '1 minute' WHERE week_key = $1`, week)
	require.NoError(t, err)
	require.NoError(t, svc.Tick(context.Background(), due.Add(2*time.Minute)))

	got := sender.messages()
	require.Len(t, got, 1)
	require.Equal(t, "error-digest-"+week, got[0].IdempotencyKey)
	row := readRun(t, pool, week)
	require.Equal(t, "sent", row.status)
	require.Equal(t, 2, row.attempts)
}

func TestTick_AFinishedWeekOfAnotherCopyIsRememberedAndNotAskedAgain(t *testing.T) {
	pool := testPool(t)
	due, week := farWeek(t, pool)
	repo := NewRepository(pool)
	_, err := repo.Claim(context.Background(), week, LeaseDuration)
	require.NoError(t, err)
	require.NoError(t, repo.MarkSent(context.Background(), week))
	sender := &fakeSender{}
	counting := &countingClaimer{Claimer: repo}
	svc := NewService(newFake(), sender, counting, testConfig, 90)

	require.NoError(t, svc.Tick(context.Background(), due))
	require.NoError(t, svc.Tick(context.Background(), due.Add(time.Minute)))
	require.NoError(t, svc.Tick(context.Background(), due.Add(2*time.Minute)))

	require.Empty(t, sender.messages())
	require.Equal(t, 1, counting.claims, "after learning the week is finished it stops asking")
}

type countingClaimer struct {
	Claimer
	claims int
}

func (c *countingClaimer) Claim(ctx context.Context, week string, lease time.Duration) (ClaimResult, error) {
	c.claims++
	return c.Claimer.Claim(ctx, week, lease)
}

func TestTick_AFailureToClaimIsReturned(t *testing.T) {
	svc := NewService(newFake(), &fakeSender{}, failingClaimer{}, testConfig, 90)

	err := svc.Tick(context.Background(), cdmx(2026, time.October, 12, 8, 0))

	require.Error(t, err)
}

type failingClaimer struct{}

func (failingClaimer) Claim(context.Context, string, time.Duration) (ClaimResult, error) {
	return Busy, context.DeadlineExceeded
}
func (failingClaimer) MarkSent(context.Context, string) error   { return context.DeadlineExceeded }
func (failingClaimer) MarkFailed(context.Context, string) error { return context.DeadlineExceeded }
func (failingClaimer) Release(context.Context, string) error    { return context.DeadlineExceeded }

func TestTick_AFailureToRecordTheSentWeekIsReturned(t *testing.T) {
	svc := NewService(newFake(), &fakeSender{}, markFailingClaimer{}, testConfig, 90)

	err := svc.Tick(context.Background(), cdmx(2026, time.October, 12, 8, 0))

	require.Error(t, err)
}

type markFailingClaimer struct{ failingClaimer }

func (markFailingClaimer) Claim(context.Context, string, time.Duration) (ClaimResult, error) {
	return Claimed, nil
}

// doneClaimer says every week is already finished: it never touches the database, so the real current week's row is safe.
type doneClaimer struct{ failingClaimer }

func (doneClaimer) Claim(context.Context, string, time.Duration) (ClaimResult, error) {
	return Done, nil
}

func TestRunEvery_TicksUntilTheContextIsDone(t *testing.T) {
	// A schedule that is due at any moment of the week (Monday 00:00), so the real clock's first tick already asks.
	cfg := testConfig
	cfg.Weekday, cfg.Hour = 1, 0
	counting := &countingClaimer{Claimer: doneClaimer{}}
	svc := NewService(newFake(), &fakeSender{}, counting, cfg, 90)

	ctx, cancel := context.WithCancel(context.Background())
	finished := make(chan struct{})
	go func() {
		svc.RunEvery(ctx, 20*time.Millisecond)
		close(finished)
	}()
	require.Eventually(t, func() bool { return counting.claims >= 1 }, 3*time.Second, 10*time.Millisecond)
	cancel()

	select {
	case <-finished:
	case <-time.After(3 * time.Second):
		t.Fatal("RunEvery did not stop with its context")
	}
}

func TestRun_StopsAsSoonAsItsContextIsDone(t *testing.T) {
	cfg := testConfig
	cfg.Weekday, cfg.Hour = 1, 0 // due at any moment of the week
	counting := &countingClaimer{Claimer: doneClaimer{}}
	svc := NewService(newFake(), &fakeSender{}, counting, cfg, 90)
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // already cancelled: Run ticks once and returns instead of waiting a minute

	finished := make(chan struct{})
	go func() {
		svc.Run(ctx)
		close(finished)
	}()

	select {
	case <-finished:
	case <-time.After(3 * time.Second):
		t.Fatal("Run did not stop with its context")
	}
	require.Equal(t, 1, counting.claims, "it checked once before stopping")
}
