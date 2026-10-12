package errordigest

import (
	"context"
	"fmt"
	"math/rand/v2"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// These tests talk to the real database (the unique week per run is the whole point). Every test uses weeks in the far future
// that nothing else writes to, and removes its rows.

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL is not set")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

// uniqueWeek is a week key (valid for the table's CHECK) that no other test or real run uses; its row is removed afterwards.
func uniqueWeek(t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()
	key := fmt.Sprintf("%04d-W%02d", 5000+rand.IntN(4000), 1+rand.IntN(52))
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM error_digest_runs WHERE week_key = $1`, key)
	})
	return key
}

type runRow struct {
	status                string
	attempts              int
	sentAt, failedAt      *time.Time
	leaseUntil, claimedAt time.Time
}

func readRun(t *testing.T, pool *pgxpool.Pool, key string) runRow {
	t.Helper()
	var r runRow
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT status, attempts, sent_at, failed_at, lease_until, claimed_at FROM error_digest_runs WHERE week_key = $1`, key).
		Scan(&r.status, &r.attempts, &r.sentAt, &r.failedAt, &r.leaseUntil, &r.claimedAt))
	return r
}

func TestClaim_TheFirstOneWinsAndTheSecondFindsItBusy(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	week := uniqueWeek(t, pool)

	first, err := repo.Claim(context.Background(), week, LeaseDuration)
	require.NoError(t, err)
	second, err := repo.Claim(context.Background(), week, LeaseDuration)
	require.NoError(t, err)

	require.Equal(t, Claimed, first)
	require.Equal(t, Busy, second)
	row := readRun(t, pool, week)
	require.Equal(t, "sending", row.status)
	require.Equal(t, 1, row.attempts)
	require.True(t, row.leaseUntil.After(time.Now().Add(25*time.Minute)), "a lease of about 30 minutes")
}

func TestClaim_TwoProcessesAtOnceGetExactlyOneWinner(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	week := uniqueWeek(t, pool)

	const contenders = 8
	results := make([]ClaimResult, contenders)
	var ready, done sync.WaitGroup
	start := make(chan struct{})
	ready.Add(contenders)
	done.Add(contenders)
	for i := 0; i < contenders; i++ {
		go func() {
			defer done.Done()
			ready.Done()
			<-start
			r, err := repo.Claim(context.Background(), week, LeaseDuration)
			if err != nil {
				t.Errorf("claim: %v", err)
			}
			results[i] = r
		}()
	}
	ready.Wait()
	close(start)
	done.Wait()

	winners := 0
	for _, r := range results {
		if r == Claimed {
			winners++
		} else {
			require.Equal(t, Busy, r)
		}
	}
	require.Equal(t, 1, winners)
}

func TestClaim_AWeekWhoseLeaseRanOutIsTakenOver(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	week := uniqueWeek(t, pool)
	first, err := repo.Claim(context.Background(), week, 50*time.Millisecond)
	require.NoError(t, err)
	require.Equal(t, Claimed, first)

	time.Sleep(150 * time.Millisecond) // the process that took it died: its lease runs out
	second, err := repo.Claim(context.Background(), week, LeaseDuration)

	require.NoError(t, err)
	require.Equal(t, Claimed, second)
	row := readRun(t, pool, week)
	require.Equal(t, "sending", row.status)
	require.Equal(t, 2, row.attempts)
}

func TestClaim_ASentOrFailedWeekIsNeverClaimedAgainEvenWithAnOldLease(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	for _, finish := range []struct {
		name string
		mark func(context.Context, string) error
		want string
	}{{"sent", repo.MarkSent, "sent"}, {"failed", repo.MarkFailed, "failed"}} {
		week := uniqueWeek(t, pool)
		_, err := repo.Claim(context.Background(), week, LeaseDuration)
		require.NoError(t, err)
		require.NoError(t, finish.mark(context.Background(), week))
		_, err = pool.Exec(context.Background(), `UPDATE error_digest_runs SET lease_until = now() - interval '1 day' WHERE week_key = $1`, week)
		require.NoError(t, err)

		again, err := repo.Claim(context.Background(), week, LeaseDuration)

		require.NoError(t, err, finish.name)
		require.Equal(t, Done, again, finish.name)
		require.Equal(t, finish.want, readRun(t, pool, week).status, finish.name)
		require.Equal(t, 1, readRun(t, pool, week).attempts, finish.name)
	}
}

func TestMarkSentAndMarkFailed_SetTheirTimestampAndOnlyChangeASendingWeek(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)

	sent := uniqueWeek(t, pool)
	_, err := repo.Claim(context.Background(), sent, LeaseDuration)
	require.NoError(t, err)
	require.NoError(t, repo.MarkSent(context.Background(), sent))
	row := readRun(t, pool, sent)
	require.Equal(t, "sent", row.status)
	require.NotNil(t, row.sentAt)
	require.Nil(t, row.failedAt)
	// A finished week never goes back or to the other end.
	require.NoError(t, repo.MarkFailed(context.Background(), sent))
	require.Equal(t, "sent", readRun(t, pool, sent).status)

	failed := uniqueWeek(t, pool)
	_, err = repo.Claim(context.Background(), failed, LeaseDuration)
	require.NoError(t, err)
	require.NoError(t, repo.MarkFailed(context.Background(), failed))
	row = readRun(t, pool, failed)
	require.Equal(t, "failed", row.status)
	require.NotNil(t, row.failedAt)
	require.Nil(t, row.sentAt)
	require.NoError(t, repo.MarkSent(context.Background(), failed))
	require.Equal(t, "failed", readRun(t, pool, failed).status)
}

func TestTheTableRejectsAStateThatContradictsItsTimestamp(t *testing.T) {
	pool := testPool(t)
	week := uniqueWeek(t, pool)

	_, err := pool.Exec(context.Background(), `
		INSERT INTO error_digest_runs (week_key, status, claimed_at, lease_until) VALUES ($1, 'sent', now(), now())`, week)
	require.Error(t, err, "'sent' without sent_at")

	_, err = pool.Exec(context.Background(), `
		INSERT INTO error_digest_runs (week_key, status, claimed_at, lease_until) VALUES ('not-a-week', 'sending', now(), now())`)
	require.Error(t, err, "a week key that is not an ISO week")

	_, err = pool.Exec(context.Background(), `
		INSERT INTO error_digest_runs (week_key, status, claimed_at, lease_until) VALUES ($1, 'paused', now(), now())`, week)
	require.Error(t, err, "an unknown state")
}

func TestClaimAndMarks_ConnectionError(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL is not set")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	pool.Close()
	repo := NewRepository(pool)

	_, err = repo.Claim(context.Background(), "5999-W01", LeaseDuration)
	require.Error(t, err)
	require.Error(t, repo.MarkSent(context.Background(), "5999-W01"))
	require.Error(t, repo.MarkFailed(context.Background(), "5999-W01"))
}
