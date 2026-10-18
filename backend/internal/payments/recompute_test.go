package payments_test

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/payments"
)

// The plan rule of data-model.md: an account whose plan a subscription decides is paid while the open subscription grants it.

func TestRecompute_TheSubscriptionDecidesThePlan(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	future, past := fixedNow.Add(48*time.Hour), fixedNow.Add(-48*time.Hour)

	cases := []struct {
		name string
		opts subOpts
		want string
	}{
		{"active", subOpts{status: payments.StatusActive, paidThrough: at(future)}, "paid"},
		{"grace still running", subOpts{status: payments.StatusGrace, graceUntil: at(future)}, "paid"},
		{"grace over", subOpts{status: payments.StatusGrace, graceUntil: at(past)}, "free"},
		{"canceled with days ahead", subOpts{status: payments.StatusCanceled, paidThrough: at(future)}, "paid"},
		{"canceled and over", subOpts{status: payments.StatusCanceled, paidThrough: at(past)}, "free"},
		{"pending with nothing", subOpts{status: payments.StatusPending}, "free"},
		{"pending carrying days", subOpts{status: payments.StatusPending, paidThrough: at(future)}, "paid"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			// A plan of «subscription» origin: it follows the subscription both ways.
			id := newAccount(t, pool, "Ana", account.PlanFree)
			_, err := pool.Exec(context.Background(), `UPDATE accounts SET plan_source = 'subscription' WHERE id = $1`, id)
			require.NoError(t, err)
			insertSub(t, pool, id, c.opts)

			recompute(t, pool, repo, id)

			plan, source := planOf(t, pool, id)
			require.Equal(t, c.want, plan)
			require.Equal(t, "subscription", source)
		})
	}
}

func TestRecompute_AnEndedSubscriptionOrNoneTakesThePlanBackToFree(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	id := newAccount(t, pool, "Ana", account.PlanPaid)
	_, err := pool.Exec(context.Background(), `UPDATE accounts SET plan_source = 'subscription' WHERE id = $1`, id)
	require.NoError(t, err)
	insertSub(t, pool, id, subOpts{status: payments.StatusEnded})

	recompute(t, pool, repo, id)

	plan, _ := planOf(t, pool, id)
	require.Equal(t, "free", plan)
}

func TestRecompute_APlanGivenByHandNeverChanges(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	manualPaid := newAccount(t, pool, "Probadora", account.PlanPaid)
	// Even with an ended or a pending subscription, a hand-given plan stays.
	insertSub(t, pool, manualPaid, subOpts{status: payments.StatusEnded})
	recompute(t, pool, repo, manualPaid)
	plan, source := planOf(t, pool, manualPaid)
	require.Equal(t, "paid", plan)
	require.Equal(t, "manual", source)

	manualFree := newAccount(t, pool, "Libre", account.PlanFree)
	insertSub(t, pool, manualFree, subOpts{status: payments.StatusPending})
	recompute(t, pool, repo, manualFree)
	plan, source = planOf(t, pool, manualFree)
	require.Equal(t, "free", plan)
	require.Equal(t, "manual", source)
}

func TestRecompute_TheFirstSubscriptionThatGrantsThePlanTakesOverAManualAccount(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	id := newAccount(t, pool, "Ana", account.PlanFree)
	insertSub(t, pool, id, subOpts{status: payments.StatusActive, paidThrough: at(fixedNow.Add(24 * time.Hour))})

	recompute(t, pool, repo, id)

	plan, source := planOf(t, pool, id)
	require.Equal(t, "paid", plan)
	require.Equal(t, "subscription", source)
}

func TestRecompute_UnknownAccount(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(ctx) }()
	require.ErrorIs(t, repo.Recompute(ctx, tx, newUUID()), payments.ErrNotFound)
}

// One open subscription per account (FR-011, SC-006).

func TestOneOpenSubscriptionPerAccount(t *testing.T) {
	pool := testPool(t)
	id := newAccount(t, pool, "Ana", account.PlanFree)
	first := insertSub(t, pool, id, subOpts{status: payments.StatusPending})

	second := "another_" + uuid.NewString()[:8]
	_, err := pool.Exec(context.Background(), `
		INSERT INTO subscriptions (account_id, provider, provider_subscription_id, status) VALUES ($1, 'fake', $2, 'pending')`, id, second)
	var pgErr *pgconn.PgError
	require.ErrorAs(t, err, &pgErr)
	require.Equal(t, "23505", pgErr.Code)

	// Once the first one is over, another can be made.
	_, err = pool.Exec(context.Background(), `UPDATE subscriptions SET status = 'ended' WHERE id = $1`, first)
	require.NoError(t, err)
	_, err = pool.Exec(context.Background(), `
		INSERT INTO subscriptions (account_id, provider, provider_subscription_id, status) VALUES ($1, 'fake', $2, 'pending')`, id, second)
	require.NoError(t, err)
}

func TestOneOpenSubscriptionPerAccount_TwoAtOnceLeaveOne(t *testing.T) {
	pool := testPool(t)
	id := newAccount(t, pool, "Ana", account.PlanFree)

	var wg sync.WaitGroup
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			_, err := pool.Exec(context.Background(), `
				INSERT INTO subscriptions (account_id, provider, provider_subscription_id, status) VALUES ($1, 'fake', $2, 'pending')`, id, fmt.Sprintf("race_%d_%s", n, uuid.NewString()[:8]))
			results <- err
		}(i)
	}
	wg.Wait()
	close(results)
	failures := 0
	for err := range results {
		if err != nil {
			failures++
		}
	}
	require.Equal(t, 1, failures, "exactly one of the two intents is refused")
}
