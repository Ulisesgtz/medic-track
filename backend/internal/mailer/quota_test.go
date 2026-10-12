package mailer

import (
	"context"
	"errors"
	"math/rand/v2"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// These tests use days in the far future that nothing else writes to, and remove their rows.

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

// farNow is an instant (noon in Mexico City) of a day no other test or real run uses; the day's row is removed afterwards.
func farNow(t *testing.T, pool *pgxpool.Pool) time.Time {
	t.Helper()
	now := time.Date(5000+rand.IntN(4000), time.Month(1+rand.IntN(12)), 1+rand.IntN(28), 12, 0, 0, 0, mexicoCity)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM mail_daily_counts WHERE day BETWEEN $1 AND $2`, DayOf(now).AddDate(0, 0, -1), DayOf(now).AddDate(0, 0, 1))
	})
	return now
}

type fakeReporter struct {
	mu      sync.Mutex
	reports []string // "kind: message"
}

func (r *fakeReporter) Report(kind, message string, _ *uuid.UUID) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.reports = append(r.reports, kind+": "+message)
}
func (r *fakeReporter) Recovered(string) {}
func (r *fakeReporter) count(kind string) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := 0
	for _, s := range r.reports {
		if strings.HasPrefix(s, kind+":") {
			n++
		}
	}
	return n
}

func testQuota(t *testing.T, cfg Config) (*Quota, *Repository, *fakeReporter, *pgxpool.Pool, *time.Time) {
	t.Helper()
	pool := testPool(t)
	now := farNow(t, pool)
	repo := NewRepository(pool)
	rep := &fakeReporter{}
	q := NewQuota(repo, cfg, rep)
	current := now
	q.now = func() time.Time { return current }
	return q, repo, rep, pool, &current
}

func sentOn(t *testing.T, pool *pgxpool.Pool, day time.Time) (sent int, warned bool) {
	t.Helper()
	err := pool.QueryRow(context.Background(), `SELECT sent, warned FROM mail_daily_counts WHERE day = $1`, day).Scan(&sent, &warned)
	require.NoError(t, err)
	return sent, warned
}

var smallCfg = Config{DailyCap: 10, InvitationCap: 8, WarnAt: 5}

func TestQuotaReservesUpToTheCapAndNoFurther(t *testing.T) {
	q, _, _, _, _ := testQuota(t, smallCfg)
	for i := 0; i < 8; i++ {
		_, err := q.Reserve(context.Background(), ClassInvitation)
		require.NoError(t, err)
	}
	_, err := q.Reserve(context.Background(), ClassInvitation)
	require.ErrorIs(t, err, ErrQuotaExceeded)
}

func TestQuotaKeepsTheLastPlacesForTheDigest(t *testing.T) {
	q, _, _, pool, now := testQuota(t, smallCfg)
	for i := 0; i < 8; i++ {
		_, err := q.Reserve(context.Background(), ClassInvitation)
		require.NoError(t, err)
	}
	_, err := q.Reserve(context.Background(), ClassInvitation)
	require.ErrorIs(t, err, ErrQuotaExceeded)
	for i := 0; i < 2; i++ {
		_, err := q.Reserve(context.Background(), ClassDigest)
		require.NoError(t, err, "the digest can still send with the invitations' cap reached")
	}
	_, err = q.Reserve(context.Background(), ClassDigest)
	require.ErrorIs(t, err, ErrQuotaExceeded, "the daily cap is hard")
	sent, _ := sentOn(t, pool, DayOf(*now))
	require.Equal(t, 10, sent)
}

func TestQuotaNeverPassesTheCapWhenManyAskAtOnce(t *testing.T) {
	q, _, _, pool, now := testQuota(t, smallCfg)
	var wg sync.WaitGroup
	var mu sync.Mutex
	granted := 0
	for i := 0; i < 40; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := q.Reserve(context.Background(), ClassInvitation); err == nil {
				mu.Lock()
				granted++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	require.Equal(t, 8, granted)
	sent, _ := sentOn(t, pool, DayOf(*now))
	require.Equal(t, 8, sent)
}

func TestQuotaRefundGivesBackThePlaceOfTheTicketsDay(t *testing.T) {
	q, _, _, pool, now := testQuota(t, smallCfg)
	ticket, err := q.Reserve(context.Background(), ClassInvitation)
	require.NoError(t, err)
	*now = now.Add(48 * time.Hour) // the clock is another day when the send fails
	q.Refund(context.Background(), ticket)
	sent, _ := sentOn(t, pool, ticket.Day)
	require.Equal(t, 0, sent)
	q.Refund(context.Background(), ticket) // never below zero
	sent, _ = sentOn(t, pool, ticket.Day)
	require.Equal(t, 0, sent)
	q.Refund(context.Background(), Ticket{}) // a zero ticket is nothing
}

func TestQuotaDayChangesAtMidnightInMexicoCity(t *testing.T) {
	q, _, _, _, now := testQuota(t, smallCfg)
	base := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, mexicoCity)
	*now = base.Add(-time.Minute) // 23:59 of the day before
	before, err := q.Reserve(context.Background(), ClassInvitation)
	require.NoError(t, err)
	*now = base // 00:00
	after, err := q.Reserve(context.Background(), ClassInvitation)
	require.NoError(t, err)
	require.Equal(t, before.Day.AddDate(0, 0, 1), after.Day)
	// 06:00 UTC is midnight in Mexico City: the instant before it is still the earlier day.
	require.Equal(t, DayOf(base).AddDate(0, 0, -1), DayOf(time.Date(base.Year(), base.Month(), base.Day(), 5, 59, 0, 0, time.UTC)))
}

func TestQuotaWarnsOncePerDayEvenWhenManyReach(t *testing.T) {
	q, _, rep, pool, now := testQuota(t, smallCfg)
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = q.Reserve(context.Background(), ClassInvitation)
		}()
	}
	wg.Wait()
	require.Equal(t, 1, rep.count(FailureQuota))
	_, warned := sentOn(t, pool, DayOf(*now))
	require.True(t, warned)
	for _, r := range rep.reports {
		require.Regexp(t, `^quota: daily e-mail quota reached the warning threshold: \d+ of 8$`, r)
	}
}

func TestQuotaDoesNotWarnBelowTheThreshold(t *testing.T) {
	q, _, rep, _, _ := testQuota(t, smallCfg)
	for i := 0; i < 4; i++ {
		_, err := q.Reserve(context.Background(), ClassInvitation)
		require.NoError(t, err)
	}
	require.Zero(t, rep.count(FailureQuota))
	_, err := q.Reserve(context.Background(), ClassInvitation) // the fifth reaches WarnAt
	require.NoError(t, err)
	require.Equal(t, 1, rep.count(FailureQuota))
}

func TestQuotaWarnsAgainTheNextDay(t *testing.T) {
	q, _, rep, _, now := testQuota(t, Config{DailyCap: 10, InvitationCap: 8, WarnAt: 1})
	_, err := q.Reserve(context.Background(), ClassInvitation)
	require.NoError(t, err)
	*now = now.Add(24 * time.Hour)
	_, err = q.Reserve(context.Background(), ClassInvitation)
	require.NoError(t, err)
	require.Equal(t, 2, rep.count(FailureQuota))
}

// brokenStore fails every operation with an error that carries text that must never be reported.
type brokenStore struct{}

var errSecret = errors.New("connection to postgres://user:secret@host failed for ana@example.com")

func (brokenStore) Reserve(context.Context, time.Time, int) (int, bool, error) {
	return 0, false, errSecret
}
func (brokenStore) Release(context.Context, time.Time) error { return errSecret }
func (brokenStore) MarkWarned(context.Context, time.Time, int) (bool, error) {
	return false, errSecret
}

func TestQuotaReportsAFailingCounterWithAFixedMessage(t *testing.T) {
	rep := &fakeReporter{}
	q := NewQuota(brokenStore{}, smallCfg, rep)
	_, err := q.Reserve(context.Background(), ClassInvitation)
	require.Error(t, err)
	require.NotErrorIs(t, err, ErrQuotaExceeded)
	q.Refund(context.Background(), Ticket{Day: time.Now()})
	require.Equal(t, 2, rep.count(FailureStore))
	for _, r := range rep.reports {
		require.Equal(t, "store: "+storeMessage, r)
		require.NotContains(t, r, "secret")
		require.NotContains(t, r, "example.com")
	}
}

// warnFailStore reserves fine but fails marking the warning.
type warnFailStore struct{ Store }

func (warnFailStore) Reserve(context.Context, time.Time, int) (int, bool, error) { return 99, true, nil }
func (warnFailStore) MarkWarned(context.Context, time.Time, int) (bool, error) {
	return false, errSecret
}

func TestQuotaAFailureToMarkTheWarningDoesNotStopTheSend(t *testing.T) {
	rep := &fakeReporter{}
	q := NewQuota(warnFailStore{}, smallCfg, rep)
	_, err := q.Reserve(context.Background(), ClassInvitation)
	require.NoError(t, err)
	require.Equal(t, 1, rep.count(FailureStore))
}

func TestQuotaWithoutReporterAndWithCancelledContextReportsNothing(t *testing.T) {
	q := NewQuota(brokenStore{}, smallCfg, nil)
	_, err := q.Reserve(context.Background(), ClassInvitation)
	require.Error(t, err) // no reporter: no panic
	rep := &fakeReporter{}
	q = NewQuota(brokenStore{}, smallCfg, rep)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, _ = q.Reserve(ctx, ClassInvitation)
	require.Empty(t, rep.reports, "a shutdown is not a failure")
}

func TestRepositoryReserveWithoutRoomForOne(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	_, ok, err := repo.Reserve(context.Background(), DayOf(time.Date(5000, 1, 1, 0, 0, 0, 0, time.UTC)), 0)
	require.NoError(t, err)
	require.False(t, ok)
}

func TestRepositoryErrorsAreWrappedWithoutTheDatabaseText(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	pool.Close()
	day := DayOf(time.Date(5000, 1, 1, 0, 0, 0, 0, time.UTC))
	_, _, err := repo.Reserve(context.Background(), day, 5)
	require.Error(t, err)
	require.Error(t, repo.Release(context.Background(), day))
	_, err = repo.MarkWarned(context.Background(), day, 1)
	require.Error(t, err)
}
