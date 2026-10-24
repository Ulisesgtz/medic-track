package childdevice_test

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/childdevice"
)

func count(t *testing.T, pool *pgxpool.Pool, childID uuid.UUID, where string) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM child_device_links WHERE child_id = $1 AND `+where, childID).Scan(&n))
	return n
}

func TestCreate_MakesAPendingLinkThatStoresOnlyTheHash(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	now := time.Now().UTC().Truncate(time.Second)

	link, token, err := repo.Create(context.Background(), f.childID, f.accountID, "  Teléfono   de\nMateo ", now)
	require.NoError(t, err)
	require.Equal(t, "Teléfono de Mateo", link.Name, "spaces collapsed, no line breaks")
	require.Equal(t, childdevice.StatusPending, link.Status)
	require.WithinDuration(t, now.Add(childdevice.LinkLifetime), link.ExpiresAt, time.Second)

	var hash []byte
	var status string
	var credential []byte
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT token_hash, status, credential_hash FROM child_device_links WHERE id = $1`, link.ID).Scan(&hash, &status, &credential))
	require.Equal(t, childdevice.Hash(token), hash)
	require.Equal(t, "pending", status)
	require.Nil(t, credential)
}

func TestCreate_NeedsThePaidPlanDecidedOnTheOwnerAccount(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	free := newFamily(t, pool, account.PlanFree)

	_, _, err := repo.Create(context.Background(), free.childID, free.accountID, "Teléfono", time.Now())
	require.ErrorAs(t, err, new(childdevice.ErrPlanRequired))
	require.Equal(t, 0, count(t, pool, free.childID, "TRUE"), "nothing was made")

	_, err = pool.Exec(context.Background(), `UPDATE accounts SET plan = 'paid' WHERE id = $1`, free.accountID)
	require.NoError(t, err)
	_, _, err = repo.Create(context.Background(), free.childID, free.accountID, "Teléfono", time.Now())
	require.NoError(t, err)
}

func TestCreate_RefusesABadNameAndAMissingChild(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	for _, name := range []string{"", "   ", "\n\t", strings.Repeat("a", childdevice.MaxNameRunes+1)} {
		_, _, err := repo.Create(ctx, f.childID, f.accountID, name, time.Now())
		require.ErrorIs(t, err, childdevice.ErrInvalidName, "%q", name)
	}
	_, _, err := repo.Create(ctx, f.childID, f.accountID, strings.Repeat("ñ", childdevice.MaxNameRunes), time.Now())
	require.NoError(t, err, "40 characters, counted as characters and not bytes")
	_, _, err = repo.Create(ctx, uuid.New(), f.accountID, "Teléfono", time.Now())
	require.ErrorIs(t, err, childdevice.ErrChildNotFound)
}

func TestCreate_AChildKeepsAtMostThreePhonesAndPendingLinks(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)

	activeDevice(t, pool, f, "uno", now.Add(-time.Hour))
	_, _, err := repo.Create(ctx, f.childID, f.accountID, "dos", now)
	require.NoError(t, err)
	_, _, err = repo.Create(ctx, f.childID, f.accountID, "tres", now)
	require.NoError(t, err)
	_, _, err = repo.Create(ctx, f.childID, f.accountID, "cuatro", now)
	var limit childdevice.ErrLimit
	require.ErrorAs(t, err, &limit)
	require.Equal(t, childdevice.MaxLinksPerChild, limit.Limit)
	require.Equal(t, 3, count(t, pool, f.childID, "status <> 'revoked'"), "the refused one left nothing behind")

	// An expired pending link no longer counts.
	_, _, err = repo.Create(ctx, f.childID, f.accountID, "cuatro", now.Add(childdevice.LinkLifetime+time.Hour))
	require.NoError(t, err)
}

func TestCreate_ANewLinkForTheSamePhoneReplacesThePendingOne(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)

	_, first, err := repo.Create(ctx, f.childID, f.accountID, "Teléfono", now)
	require.NoError(t, err)
	_, second, err := repo.Create(ctx, f.childID, f.accountID, "Teléfono", now)
	require.NoError(t, err)
	require.Equal(t, 1, count(t, pool, f.childID, "status = 'pending'"))
	require.Equal(t, 1, count(t, pool, f.childID, "status = 'revoked'"))

	_, err = repo.Redeem(ctx, first, now)
	require.ErrorIs(t, err, childdevice.ErrNotFound, "the old link no longer works")
	_, err = repo.Redeem(ctx, second, now)
	require.NoError(t, err)
}

func TestCreate_SixSimultaneousRequestsLeaveExactlyThree(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	now := time.Now().UTC().Truncate(time.Second)

	var wg sync.WaitGroup
	var mu sync.Mutex
	made, refused := 0, 0
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, _, err := repo.Create(context.Background(), f.childID, f.accountID, "Teléfono "+string(rune('A'+i)), now)
			mu.Lock()
			defer mu.Unlock()
			if err == nil {
				made++
			} else if _, ok := err.(childdevice.ErrLimit); ok {
				refused++
			}
		}(i)
	}
	wg.Wait()
	require.Equal(t, 3, made)
	require.Equal(t, 3, refused)
	require.Equal(t, 3, count(t, pool, f.childID, "status = 'pending'"))
}

func TestRedeem_TurnsTheLinkIntoAWorkingCredentialOnce(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)
	link, token, err := repo.Create(ctx, f.childID, f.accountID, "Teléfono de Mateo", now)
	require.NoError(t, err)

	got, err := repo.Redeem(ctx, token, now.Add(time.Minute))
	require.NoError(t, err)
	require.Equal(t, f.childID, got.ChildID)
	require.Equal(t, "Mateo", got.ChildFirstName)
	require.WithinDuration(t, now.Add(time.Minute).Add(childdevice.RotateEvery), got.RotateAfter, time.Second)

	p, err := repo.Authenticate(ctx, hashOf(t, got.Credential), now.Add(2*time.Minute))
	require.NoError(t, err)
	require.Equal(t, link.ID, p.LinkID)

	var tokenHash []byte
	var status string
	require.NoError(t, pool.QueryRow(ctx, `SELECT token_hash, status FROM child_device_links WHERE id = $1`, link.ID).Scan(&tokenHash, &status))
	require.Nil(t, tokenHash, "the link's secret is gone once it is used")
	require.Equal(t, "active", status)

	_, err = repo.Redeem(ctx, token, now.Add(3*time.Minute))
	require.ErrorIs(t, err, childdevice.ErrNotFound, "a link serves once")
}

func TestRedeem_EveryFailureIsTheSameError(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)

	_, expired, err := repo.Create(ctx, f.childID, f.accountID, "vence", now)
	require.NoError(t, err)
	_, canceled, err := repo.Create(ctx, f.childID, f.accountID, "cancelada", now)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE child_device_links SET status = 'revoked', token_hash = NULL, revoked_at = $1 WHERE name = 'cancelada' AND child_id = $2`, now, f.childID)
	require.NoError(t, err)
	unknown, _, err := childdevice.NewToken()
	require.NoError(t, err)

	for name, token := range map[string]string{"expired": expired, "canceled": canceled, "unknown": unknown, "empty": "", "garbage": "no es una ficha"} {
		at := now
		if name == "expired" {
			at = now.Add(childdevice.LinkLifetime + time.Second)
		}
		_, err := repo.Redeem(ctx, token, at)
		require.ErrorIs(t, err, childdevice.ErrNotFound, name)
	}
}

func TestRedeem_TwoPhonesOpeningItAtOnceLeaveOneWinner(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	now := time.Now().UTC().Truncate(time.Second)
	_, token, err := repo.Create(context.Background(), f.childID, f.accountID, "Teléfono", now)
	require.NoError(t, err)

	var wg sync.WaitGroup
	var mu sync.Mutex
	wins := 0
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := repo.Redeem(context.Background(), token, now); err == nil {
				mu.Lock()
				wins++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	require.Equal(t, 1, wins)
	require.Equal(t, 1, count(t, pool, f.childID, "status = 'active'"))
}

func TestCreateAndRedeem_ReportDatabaseFailures(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	token, _, err := childdevice.NewToken()
	require.NoError(t, err)
	pool.Close()
	_, _, err = repo.Create(context.Background(), uuid.New(), uuid.New(), "Teléfono", time.Now())
	require.Error(t, err)
	require.NotErrorIs(t, err, childdevice.ErrChildNotFound)
	_, err = repo.Redeem(context.Background(), token, time.Now())
	require.Error(t, err)
	require.NotErrorIs(t, err, childdevice.ErrNotFound)
}
