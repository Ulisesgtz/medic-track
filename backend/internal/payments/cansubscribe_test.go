package payments_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/payments"
)

func newUUID() uuid.UUID { return uuid.New() }

// The rule of the invited people (spec 045, FR-003, FR-003b, FR-011).

func decide(t *testing.T, repo *payments.Repository, id uuid.UUID) payments.Decision {
	t.Helper()
	d, err := repo.CanSubscribe(context.Background(), id)
	require.NoError(t, err)
	return d
}

func TestCanSubscribe_AFreeAccountOnItsOwnCan(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	id := newAccount(t, pool, "Ana", account.PlanFree)

	require.True(t, decide(t, repo, id).Allowed())
}

func TestCanSubscribe_AccountWithThePlanAlreadyCannot(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)

	byHand := newAccount(t, pool, "Mano", account.PlanPaid)
	require.Equal(t, payments.ReasonAlreadyPaid, decide(t, repo, byHand).Reason)

	bySub := newAccount(t, pool, "Suscrita", account.PlanPaid)
	insertSub(t, pool, bySub, subOpts{status: payments.StatusActive, paidThrough: at(fixedNow.Add(24 * time.Hour))})
	require.Equal(t, payments.ReasonAlreadyPaid, decide(t, repo, bySub).Reason)

	inGrace := newAccount(t, pool, "Gracia", account.PlanPaid)
	insertSub(t, pool, inGrace, subOpts{status: payments.StatusGrace, graceUntil: at(fixedNow.Add(24 * time.Hour))})
	require.Equal(t, payments.ReasonAlreadyPaid, decide(t, repo, inGrace).Reason)
}

func TestCanSubscribe_ACanceledSubscriptionDoesNotBlockSubscribingAgain(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	id := newAccount(t, pool, "Ana", account.PlanPaid)
	insertSub(t, pool, id, subOpts{status: payments.StatusCanceled, paidThrough: at(fixedNow.Add(10 * 24 * time.Hour))})

	require.True(t, decide(t, repo, id).Allowed(), "history 3, scenario 4: she can subscribe again and keeps her days")
}

func TestCanSubscribe_APendingOneMakesTheNextCallReuseIt(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	id := newAccount(t, pool, "Ana", account.PlanFree)
	insertSub(t, pool, id, subOpts{status: payments.StatusPending, createdAt: at(fixedNow.Add(-time.Hour))})
	require.Equal(t, payments.ReasonPending, decide(t, repo, id).Reason)

	// A pending one older than 24 hours is expired: it no longer blocks.
	old := newAccount(t, pool, "Vieja", account.PlanFree)
	insertSub(t, pool, old, subOpts{status: payments.StatusPending, createdAt: at(fixedNow.Add(-25 * time.Hour))})
	require.True(t, decide(t, repo, old).Allowed())
}

func TestCanSubscribe_AGuestOfAPaidFamilyCannotAndTheOwnersFirstNameSaysWhose(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	owner := newAccount(t, pool, "Ana", account.PlanPaid)
	for _, role := range []string{"tutor", "caregiver"} {
		guest := newAccount(t, pool, "Invitada", account.PlanFree)
		join(t, pool, owner, guest, role)

		d := decide(t, repo, guest)
		require.Equal(t, payments.ReasonCoveredByFamily, d.Reason, role)
		require.Equal(t, "Ana", d.CoveredBy, role)
	}
}

func TestCanSubscribe_ReleasedAsSoonAsTheFamilyHasNoPlan(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	owner := newAccount(t, pool, "Ana", account.PlanPaid)
	guest := newAccount(t, pool, "Invitada", account.PlanFree)
	join(t, pool, owner, guest, "tutor")
	require.Equal(t, payments.ReasonCoveredByFamily, decide(t, repo, guest).Reason)

	// The owner's plan ends (nothing is stored for the guest: the rule reads it on every call).
	_, err := pool.Exec(context.Background(), `UPDATE accounts SET plan = 'free' WHERE id = $1`, owner)
	require.NoError(t, err)

	require.True(t, decide(t, repo, guest).Allowed())
}

func TestCanSubscribe_ACanceledOwnerWithDaysAheadStillCoversTheGuest(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	owner := newAccount(t, pool, "Ana", account.PlanFree)
	_, err := pool.Exec(context.Background(), `UPDATE accounts SET plan_source = 'subscription' WHERE id = $1`, owner)
	require.NoError(t, err)
	insertSub(t, pool, owner, subOpts{status: payments.StatusCanceled, paidThrough: at(fixedNow.Add(10 * 24 * time.Hour))})
	recompute(t, pool, repo, owner) // the plan stays paid while the days last
	guest := newAccount(t, pool, "Invitada", account.PlanFree)
	join(t, pool, owner, guest, "caregiver")

	require.Equal(t, payments.ReasonCoveredByFamily, decide(t, repo, guest).Reason, "a canceled plan with days left still counts")

	// When the days are over the owner's plan goes to free and the guest can subscribe.
	_, err = pool.Exec(context.Background(), `UPDATE subscriptions SET paid_through = $2 WHERE account_id = $1`, owner, fixedNow.Add(-time.Hour))
	require.NoError(t, err)
	recompute(t, pool, repo, owner)
	require.True(t, decide(t, repo, guest).Allowed())
}

func TestCanSubscribe_APersonWhoLeftOrWasRemovedIsNotCovered(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	owner := newAccount(t, pool, "Ana", account.PlanPaid)
	left := newAccount(t, pool, "Se fue", account.PlanFree)
	join(t, pool, owner, left, "tutor")
	_, err := pool.Exec(context.Background(), `UPDATE family_members SET status = 'left', ended_at = now() WHERE account_id = $1`, left)
	require.NoError(t, err)

	require.True(t, decide(t, repo, left).Allowed())
}

func TestCanSubscribe_AGuestOfAFamilyWhoseOwnerIsFreeCan(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	owner := newAccount(t, pool, "Ana", account.PlanFree)
	guest := newAccount(t, pool, "Invitada", account.PlanFree)
	join(t, pool, owner, guest, "caregiver")

	require.True(t, decide(t, repo, guest).Allowed())
}

func TestCanSubscribe_UnknownAccount(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)

	_, err := repo.CanSubscribe(context.Background(), uuid.New())
	require.ErrorIs(t, err, payments.ErrNotFound)
}
