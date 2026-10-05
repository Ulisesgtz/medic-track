package retention_test

import (
	"context"
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/retention"
)

// fakePurger holds `rows` old entries and deletes them by batch; it can fail.
type fakePurger struct {
	mu      sync.Mutex
	rows    int
	calls   int
	cutoffs []time.Time
	err     error
}

func (f *fakePurger) DeleteOlderThan(_ context.Context, cutoff time.Time, batch int) (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	f.cutoffs = append(f.cutoffs, cutoff)
	if f.err != nil {
		return 0, f.err
	}
	n := min(f.rows, batch)
	f.rows -= n
	return n, nil
}

type fakeReporter struct {
	mu        sync.Mutex
	reports   []string
	recovered int
}

func (f *fakeReporter) Report(kind, message string, _ *uuid.UUID) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.reports = append(f.reports, kind+": "+message)
}

func (f *fakeReporter) Recovered(string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.recovered++
}

func (f *fakeReporter) snapshot() ([]string, int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.reports...), f.recovered
}

func TestConfigFromEnv(t *testing.T) {
	for value, want := range map[string]int{
		"":     90, // not set
		"abc":  90, // not a number
		"0":    90, // not positive
		"-5":   90,
		"3":    7, // under the minimum: the minimum
		"7":    7,
		"30":   30,
		"365":  365,
		"2.5":  90,
		" 30 ": 90, // spaces are not a number: use the default, not a guess
	} {
		t.Setenv("ERROR_LOGS_RETENTION_DAYS", value)
		require.Equal(t, want, retention.ConfigFromEnv().Days, "%q", value)
	}
}

func TestConfig_CutoffIsDaysBefore(t *testing.T) {
	now := time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC)
	require.Equal(t, time.Date(2026, 7, 2, 12, 0, 0, 0, time.UTC), retention.Config{Days: 90}.Cutoff(now))
}

func TestPurge_DeletesInBatchesUntilNothingIsLeft(t *testing.T) {
	p := &fakePurger{rows: 2*retention.BatchSize + 250}

	n, err := retention.Purge(context.Background(), p, time.Now(), retention.Config{Days: 90})

	require.NoError(t, err)
	require.Equal(t, 2*retention.BatchSize+250, n)
	require.Equal(t, 3, p.calls, "two full batches and a smaller one that says it is over")
	require.Zero(t, p.rows)
}

func TestPurge_ExactlyAFullBatchAsksOnceMoreAndStops(t *testing.T) {
	p := &fakePurger{rows: retention.BatchSize}

	n, err := retention.Purge(context.Background(), p, time.Now(), retention.Config{Days: 90})

	require.NoError(t, err)
	require.Equal(t, retention.BatchSize, n)
	require.Equal(t, 2, p.calls)
}

func TestPurge_NothingToDeleteIsOneQuietCall(t *testing.T) {
	p := &fakePurger{}
	n, err := retention.Purge(context.Background(), p, time.Now(), retention.Config{Days: 90})
	require.NoError(t, err)
	require.Zero(t, n)
	require.Equal(t, 1, p.calls)
}

func TestPurge_StopsAtTheFirstErrorKeepingTheCount(t *testing.T) {
	p := &fakePurger{rows: 10 * retention.BatchSize}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	wrapped := &failAfter{Purger: p, after: 2}

	n, err := retention.Purge(ctx, wrapped, time.Now(), retention.Config{Days: 90})

	require.Error(t, err)
	require.Equal(t, 2*retention.BatchSize, n)
}

type failAfter struct {
	retention.Purger
	after, done int
}

func (f *failAfter) DeleteOlderThan(ctx context.Context, cutoff time.Time, batch int) (int, error) {
	if f.done >= f.after {
		return 0, errors.New("database down")
	}
	f.done++
	return f.Purger.DeleteOlderThan(ctx, cutoff, batch)
}

func TestRun_PurgesAtOnceAndThenEveryInterval(t *testing.T) {
	p := &fakePurger{rows: 5}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		retention.RunEvery(ctx, p, nil, retention.Config{Days: 90}, 20*time.Millisecond)
		close(done)
	}()

	require.Eventually(t, func() bool {
		p.mu.Lock()
		defer p.mu.Unlock()
		return p.calls >= 3
	}, time.Second, 5*time.Millisecond, "right away, then again on each tick")
	cancel()
	<-done
}

func TestRun_AFailureIsReportedAndTheNextTurnRecovers(t *testing.T) {
	p := &fakePurger{err: errors.New("database down")}
	reporter := &fakeReporter{}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		retention.RunEvery(ctx, p, reporter, retention.Config{Days: 90}, 20*time.Millisecond)
		close(done)
	}()

	require.Eventually(t, func() bool { r, _ := reporter.snapshot(); return len(r) >= 2 }, time.Second, 5*time.Millisecond)
	reports, _ := reporter.snapshot()
	require.Equal(t, "purge: error log retention failed: could not delete the old entries", reports[0], "a fixed sentence, never the error's text")

	p.mu.Lock()
	p.err = nil
	p.mu.Unlock()
	require.Eventually(t, func() bool { _, recovered := reporter.snapshot(); return recovered >= 1 }, time.Second, 5*time.Millisecond)
	cancel()
	<-done
}

func TestRun_ShuttingDownIsNotAFailure(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	reporter := &fakeReporter{}
	p := &fakePurger{err: context.Canceled}

	retention.RunEvery(ctx, p, reporter, retention.Config{Days: 90}, time.Hour)

	reports, recovered := reporter.snapshot()
	require.Empty(t, reports)
	require.Zero(t, recovered)
}

// ---- against the real table

func TestPurge_RealTable(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	repo := errorlog.NewRepository(pool)
	ep := "test-retention-" + uuid.NewString()[:8]
	// A cutoff so far back that nothing but this test's rows can be older: 100 years.
	now := time.Now().UTC()
	cfg := retention.Config{Days: 36500}
	cutoff := cfg.Cutoff(now)
	for _, age := range []time.Duration{10 * time.Hour, 24 * time.Hour * 365, 24 * time.Hour * 365 * 120, 24 * time.Hour * 365 * 130} {
		_, err := pool.Exec(context.Background(), `
			INSERT INTO error_logs (message, endpoint, file, line, created_at) VALUES ('x', $1, 'f', 1, $2)
		`, ep, now.Add(-age))
		require.NoError(t, err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM error_logs WHERE endpoint = $1`, ep) })

	deleted, err := retention.Purge(context.Background(), repo, now, cfg)

	require.NoError(t, err)
	require.GreaterOrEqual(t, deleted, 2, "the two entries older than 100 years (plus any other that old)")
	var left int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM error_logs WHERE endpoint = $1`, ep).Scan(&left))
	require.Equal(t, 2, left, "what is newer than the cutoff stays: 10 hours and a year old")
	require.True(t, cutoff.Before(now))
}
