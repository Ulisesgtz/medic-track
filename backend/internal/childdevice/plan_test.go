package childdevice_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/childdevice"
)

// specs/047, US5: the plan decides only who MAKES a new access. Whatever was already given keeps working when the owner stops paying,
// and nothing on the phone's own path (Authenticate, Redeem, rotate, list, revoke) reads the plan.
func TestLapsedPlan_KeepsWhatWasAlreadyGivenAndOnlyRefusesNewLinks(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	now := time.Now().UTC().Truncate(time.Second)

	credential, activeID := activeDevice(t, pool, f, "Teléfono de Mateo", now)
	pending, token, err := repo.Create(ctx, f.childID, f.accountID, "Tablet", now)
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `UPDATE accounts SET plan = 'free' WHERE id = $1`, f.accountID)
	require.NoError(t, err)

	// A new link is the only thing refused.
	_, _, err = repo.Create(ctx, f.childID, f.accountID, "Otro", now)
	require.ErrorAs(t, err, new(childdevice.ErrPlanRequired))

	// The phone that was already active still authenticates and rotates.
	principal, err := repo.Authenticate(ctx, hashOf(t, credential), now.Add(time.Minute))
	require.NoError(t, err)
	require.Equal(t, f.childID, principal.ChildID)
	rotated, _, err := repo.Rotate(ctx, activeID, now.Add(2*time.Minute))
	require.NoError(t, err)
	_, err = repo.Authenticate(ctx, hashOf(t, rotated), now.Add(3*time.Minute))
	require.NoError(t, err)

	// A link made while paying can still be opened.
	redeemed, err := repo.Redeem(ctx, token, now.Add(4*time.Minute))
	require.NoError(t, err)
	require.NotEmpty(t, redeemed.Credential)
	_, err = repo.Authenticate(ctx, hashOf(t, redeemed.Credential), now.Add(5*time.Minute))
	require.NoError(t, err)

	// The list and the removal never needed the plan.
	links, err := repo.List(ctx, f.childID, now.Add(6*time.Minute))
	require.NoError(t, err)
	require.Len(t, links, 2)
	require.NoError(t, repo.Revoke(ctx, f.childID, pending.ID, f.accountID, now.Add(7*time.Minute)))
	_, err = repo.Authenticate(ctx, hashOf(t, redeemed.Credential), now.Add(8*time.Minute))
	require.Error(t, err, "a removed phone stops at once, plan or not")

	// Paying again lets new links be made, and the phone that stayed is untouched.
	_, err = pool.Exec(ctx, `UPDATE accounts SET plan = 'paid' WHERE id = $1`, f.accountID)
	require.NoError(t, err)
	_, _, err = repo.Create(ctx, f.childID, f.accountID, "Otro", now.Add(9*time.Minute))
	require.NoError(t, err)
	_, err = repo.Authenticate(ctx, hashOf(t, rotated), now.Add(10*time.Minute))
	require.NoError(t, err)
}

// A phone idle for longer than its credential lasts can't get in any more, so it must not hold one of the child's three places: the
// parent would have no way to free it (the list calls it «Vencido»).
func TestCreate_AnIdlePhoneDoesNotTakeAPlace(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	now := time.Now().UTC().Truncate(time.Second)

	long := now.Add(-childdevice.CredentialIdle - 24*time.Hour)
	for _, name := range []string{"Uno", "Dos", "Tres"} {
		activeDevice(t, pool, f, name, long)
	}
	_, _, err := repo.Create(ctx, f.childID, f.accountID, "Nuevo", now)
	require.NoError(t, err, "the three idle phones leave room")

	// One that is still in use does count.
	activeDevice(t, pool, f, "En uso", now.Add(-time.Hour))
	activeDevice(t, pool, f, "En uso 2", now.Add(-time.Hour))
	_, _, err = repo.Create(ctx, f.childID, f.accountID, "Otro", now)
	require.ErrorAs(t, err, new(childdevice.ErrLimit))
}
