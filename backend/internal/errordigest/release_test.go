package errordigest

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func TestRelease_GivesTheWeekBackSoTheNextClaimTakesItAtOnce(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	week := uniqueWeek(t, pool)
	first, err := repo.Claim(context.Background(), week, LeaseDuration)
	require.NoError(t, err)
	require.Equal(t, Claimed, first)
	busy, err := repo.Claim(context.Background(), week, LeaseDuration)
	require.NoError(t, err)
	require.Equal(t, Busy, busy, "a live lease is respected")

	require.NoError(t, repo.Release(context.Background(), week))
	again, err := repo.Claim(context.Background(), week, LeaseDuration)

	require.NoError(t, err)
	require.Equal(t, Claimed, again, "no waiting for the 30-minute lease")
	require.Equal(t, 2, readRun(t, pool, week).attempts)
}

func TestRelease_NeverTouchesAFinishedWeek(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	week := uniqueWeek(t, pool)
	_, err := repo.Claim(context.Background(), week, LeaseDuration)
	require.NoError(t, err)
	require.NoError(t, repo.MarkSent(context.Background(), week))

	require.NoError(t, repo.Release(context.Background(), week))

	again, err := repo.Claim(context.Background(), week, LeaseDuration)
	require.NoError(t, err)
	require.Equal(t, Done, again)
	require.Equal(t, "sent", readRun(t, pool, week).status)
}

func TestRelease_ConnectionError(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL is not set")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	pool.Close()

	require.Error(t, NewRepository(pool).Release(context.Background(), "5999-W01"))
}
