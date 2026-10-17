package payments_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/payments"
)

// capture is a Reporter that keeps what is reported.
type capture struct {
	mu    sync.Mutex
	items []string
}

func (c *capture) Report(kind, message string, _ *uuid.UUID) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items = append(c.items, kind+": "+message)
}

func (c *capture) all() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]string(nil), c.items...)
}

// world is a service over the real database with the fake provider and the fixed clock.
type world struct {
	pool *pgxpool.Pool
	repo *payments.Repository
	fake *payments.Fake
	svc  *payments.Service
	rep  *capture
}

var fakeConfig = payments.Config{Driver: payments.DriverFake, FrontendOrigin: "http://localhost:5173", GraceDays: 7, PriceMXN: 499}

func newWorld(t *testing.T) *world {
	t.Helper()
	pool := testPool(t)
	repo := newRepo(t, pool)
	fake := payments.NewFake(fakeConfig.FrontendOrigin)
	return build(t, pool, repo, fake, fakeConfig)
}

func build(t *testing.T, pool *pgxpool.Pool, repo *payments.Repository, provider payments.Provider, cfg payments.Config) *world {
	t.Helper()
	svc := payments.NewService(repo, provider, cfg)
	payments.SetServiceNow(svc, func() time.Time { return fixedNow })
	rep := &capture{}
	svc.SetReporter(rep)
	fake, _ := provider.(*payments.Fake)
	return &world{pool: pool, repo: repo, fake: fake, svc: svc, rep: rep}
}

func (w *world) subOf(t *testing.T, accountID uuid.UUID) (status string, count int) {
	t.Helper()
	rows, err := w.pool.Query(context.Background(), `SELECT status FROM subscriptions WHERE account_id = $1 AND status <> 'ended'`, accountID)
	require.NoError(t, err)
	defer rows.Close()
	for rows.Next() {
		require.NoError(t, rows.Scan(&status))
		count++
	}
	return status, count
}

// failingProvider is a provider whose creation or cancellation fails.
type failingProvider struct {
	payments.Provider
	create, cancel, read error
}

func (f failingProvider) CreateSubscription(ctx context.Context, req payments.CreateRequest) (payments.Created, error) {
	if f.create != nil {
		return payments.Created{}, f.create
	}
	return f.Provider.CreateSubscription(ctx, req)
}

func (f failingProvider) CancelSubscription(ctx context.Context, id string) error {
	if f.cancel != nil {
		return f.cancel
	}
	return f.Provider.CancelSubscription(ctx, id)
}

func (f failingProvider) GetSubscription(ctx context.Context, id string) (payments.Remote, error) {
	if f.read != nil {
		return payments.Remote{}, f.read
	}
	return f.Provider.GetSubscription(ctx, id)
}

func TestSubscribe_StartsAPendingSubscriptionOnTheProvidersPage(t *testing.T) {
	w := newWorld(t)
	id := newAccount(t, w.pool, "Ana", account.PlanFree)

	res, err := w.svc.Subscribe(context.Background(), id)

	require.NoError(t, err)
	require.False(t, res.Reused)
	require.Contains(t, res.CheckoutURL, "/planes/pago-de-prueba?sub=fake_")
	status, count := w.subOf(t, id)
	require.Equal(t, "pending", status)
	require.Equal(t, 1, count)
	require.Equal(t, 1, w.fake.Count())
	plan, source := planOf(t, w.pool, id)
	require.Equal(t, "free", plan, "a pending subscription gives no plan")
	require.Equal(t, "manual", source)
	for _, line := range w.rep.all() {
		t.Fatalf("nothing should have been reported: %s", line)
	}
}

func TestSubscribe_AnotherCallReusesThePendingOneAndTheProviderIsCalledOnce(t *testing.T) {
	w := newWorld(t)
	id := newAccount(t, w.pool, "Ana", account.PlanFree)
	first, err := w.svc.Subscribe(context.Background(), id)
	require.NoError(t, err)

	second, err := w.svc.Subscribe(context.Background(), id)

	require.NoError(t, err)
	require.True(t, second.Reused)
	require.Equal(t, first.CheckoutURL, second.CheckoutURL)
	require.Equal(t, 1, w.fake.Count())
}

func TestSubscribe_AnExpiredPendingOneIsReplaced(t *testing.T) {
	w := newWorld(t)
	id := newAccount(t, w.pool, "Ana", account.PlanFree)
	old := insertSub(t, w.pool, id, subOpts{status: payments.StatusPending, createdAt: at(fixedNow.Add(-30 * time.Hour))})

	res, err := w.svc.Subscribe(context.Background(), id)

	require.NoError(t, err)
	require.False(t, res.Reused)
	var status string
	require.NoError(t, w.pool.QueryRow(context.Background(), `SELECT status FROM subscriptions WHERE id = $1`, old).Scan(&status))
	require.Equal(t, "ended", status)
	_, count := w.subOf(t, id)
	require.Equal(t, 1, count)
}

func TestSubscribe_WhoCannotIsToldWhy(t *testing.T) {
	w := newWorld(t)
	paid := newAccount(t, w.pool, "Pagada", account.PlanPaid)
	_, err := w.svc.Subscribe(context.Background(), paid)
	var na *payments.NotAllowedError
	require.ErrorAs(t, err, &na)
	require.Equal(t, payments.ReasonAlreadyPaid, na.Reason)

	owner := newAccount(t, w.pool, "Ana", account.PlanPaid)
	guest := newAccount(t, w.pool, "Invitada", account.PlanFree)
	join(t, w.pool, owner, guest, "tutor")
	_, err = w.svc.Subscribe(context.Background(), guest)
	require.ErrorAs(t, err, &na)
	require.Equal(t, payments.ReasonCoveredByFamily, na.Reason)
	require.Equal(t, "Ana", na.CoveredBy)
	require.Zero(t, w.fake.Count(), "the provider was never called")
	_, count := w.subOf(t, guest)
	require.Zero(t, count)
}

func TestSubscribe_ACanceledOneIsClosedAndItsDaysCarriedWithNoGapInThePlan(t *testing.T) {
	w := newWorld(t)
	id := newAccount(t, w.pool, "Ana", account.PlanPaid)
	_, err := w.pool.Exec(context.Background(), `UPDATE accounts SET plan_source = 'subscription' WHERE id = $1`, id)
	require.NoError(t, err)
	through := fixedNow.Add(40 * 24 * time.Hour)
	old := insertSub(t, w.pool, id, subOpts{status: payments.StatusCanceled, paidThrough: at(through)})

	res, err := w.svc.Subscribe(context.Background(), id)

	require.NoError(t, err)
	require.False(t, res.Reused)
	var oldStatus string
	require.NoError(t, w.pool.QueryRow(context.Background(), `SELECT status FROM subscriptions WHERE id = $1`, old).Scan(&oldStatus))
	require.Equal(t, "ended", oldStatus)
	var carried *time.Time
	require.NoError(t, w.pool.QueryRow(context.Background(), `SELECT paid_through FROM subscriptions WHERE account_id = $1 AND status = 'pending'`, id).Scan(&carried))
	require.NotNil(t, carried)
	require.True(t, carried.Equal(through))
	plan, _ := planOf(t, w.pool, id)
	require.Equal(t, "paid", plan, "she keeps the plan while the new payment is pending")
}

func TestSubscribe_AFailureOfTheProviderLeavesNothing(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	w := build(t, pool, repo, failingProvider{Provider: payments.NewFake("http://x"), create: payments.ErrTemporary}, fakeConfig)
	id := newAccount(t, pool, "Ana", account.PlanFree)
	cancelled := insertSub(t, pool, id, subOpts{status: payments.StatusCanceled, paidThrough: at(fixedNow.Add(24 * time.Hour))})

	_, err := w.svc.Subscribe(context.Background(), id)

	require.ErrorIs(t, err, payments.ErrUnavailable)
	var status string
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT status FROM subscriptions WHERE id = $1`, cancelled).Scan(&status))
	require.Equal(t, "canceled", status, "the closing of the old one was rolled back")
	require.Equal(t, []string{"create: The payment provider did not create the subscription"}, w.rep.all())
}

func TestSubscribe_NotConfigured(t *testing.T) {
	pool := testPool(t)
	w := build(t, pool, newRepo(t, pool), payments.NewFake("x"), payments.Config{Driver: payments.DriverMercadoPago})
	id := newAccount(t, pool, "Ana", account.PlanFree)

	_, err := w.svc.Subscribe(context.Background(), id)

	require.ErrorIs(t, err, payments.ErrUnavailable)
	require.False(t, w.svc.Available())
}

func TestSubscribe_TwoAtOnceCreateOneSubscription(t *testing.T) {
	w := newWorld(t)
	id := newAccount(t, w.pool, "Ana", account.PlanFree)

	var wg sync.WaitGroup
	results := make([]payments.SubscribeResult, 4)
	errs := make([]error, 4)
	for i := range results {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i], errs[i] = w.svc.Subscribe(context.Background(), id)
		}(i)
	}
	wg.Wait()

	for _, err := range errs {
		require.NoError(t, err)
	}
	_, count := w.subOf(t, id)
	require.Equal(t, 1, count)
	require.Equal(t, 1, w.fake.Count(), "the provider was asked once")
	reused := 0
	for _, r := range results {
		if r.Reused {
			reused++
		}
	}
	require.Equal(t, 3, reused)
}

func TestSubscribe_UnknownAccount(t *testing.T) {
	w := newWorld(t)

	_, err := w.svc.Subscribe(context.Background(), uuid.New())

	require.ErrorIs(t, err, payments.ErrNotFound)
}

func TestState_ForEveryKindOfAccount(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()

	free := newAccount(t, w.pool, "Ana", account.PlanFree)
	st, err := w.svc.State(ctx, free)
	require.NoError(t, err)
	require.True(t, st.Available)
	require.True(t, st.CanSubscribe)
	require.Empty(t, st.BlockedReason)
	require.Equal(t, 499, st.PriceMXN)
	require.Nil(t, st.Subscription)

	// Pending: the payment page is given (and only now).
	res, err := w.svc.Subscribe(ctx, free)
	require.NoError(t, err)
	st, err = w.svc.State(ctx, free)
	require.NoError(t, err)
	require.False(t, st.CanSubscribe)
	require.Equal(t, payments.ReasonPending, st.BlockedReason)
	require.Equal(t, payments.StatusPending, st.Subscription.Status)
	require.Equal(t, res.CheckoutURL, st.Subscription.CheckoutURL)

	// Active: renews, no payment page.
	active := newAccount(t, w.pool, "Activa", account.PlanPaid)
	insertSub(t, w.pool, active, subOpts{status: payments.StatusActive, paidThrough: at(fixedNow.Add(24 * time.Hour))})
	st, _ = w.svc.State(ctx, active)
	require.Equal(t, payments.ReasonAlreadyPaid, st.BlockedReason)
	require.True(t, st.Subscription.Renews)
	require.Empty(t, st.Subscription.CheckoutURL)

	// A guest of a paid family.
	owner := newAccount(t, w.pool, "Ana", account.PlanPaid)
	guest := newAccount(t, w.pool, "Invitada", account.PlanFree)
	join(t, w.pool, owner, guest, "caregiver")
	st, _ = w.svc.State(ctx, guest)
	require.Equal(t, payments.ReasonCoveredByFamily, st.BlockedReason)
	require.Equal(t, "Ana", st.CoveredBy)
	require.False(t, st.CanSubscribe)

	// Ended: it says when, and she can subscribe again.
	ended := newAccount(t, w.pool, "Vencida", account.PlanFree)
	insertSub(t, w.pool, ended, subOpts{status: payments.StatusEnded})
	st, _ = w.svc.State(ctx, ended)
	require.True(t, st.CanSubscribe)
	require.Equal(t, payments.StatusEnded, st.Subscription.Status)
	require.NotNil(t, st.Subscription.EndedAt)
	require.False(t, st.Subscription.Renews)

	_, err = w.svc.State(ctx, uuid.New())
	require.ErrorIs(t, err, payments.ErrNotFound)
}

func TestState_NotConfiguredSaysUnavailable(t *testing.T) {
	pool := testPool(t)
	w := build(t, pool, newRepo(t, pool), payments.NewFake("x"), payments.Config{PriceMXN: 499})
	id := newAccount(t, pool, "Ana", account.PlanFree)

	st, err := w.svc.State(context.Background(), id)

	require.NoError(t, err)
	require.False(t, st.Available)
	require.False(t, st.CanSubscribe)
	require.Equal(t, payments.ReasonUnavailable, st.BlockedReason)
}

func TestCancel_AnActiveOneBecomesCanceledAndTheDaysStay(t *testing.T) {
	w := newWorld(t)
	id := newAccount(t, w.pool, "Ana", account.PlanFree)
	res, err := w.svc.Subscribe(context.Background(), id)
	require.NoError(t, err)
	require.NotEmpty(t, res.CheckoutURL)
	var pid string
	require.NoError(t, w.pool.QueryRow(context.Background(), `SELECT provider_subscription_id FROM subscriptions WHERE account_id = $1`, id).Scan(&pid))
	_, err = w.fake.Approve(pid, fixedNow.AddDate(1, 0, 0))
	require.NoError(t, err)
	require.NoError(t, w.svc.ProcessNotification(context.Background(), payments.TopicSubscription, pid))

	require.NoError(t, w.svc.Cancel(context.Background(), id))

	status, _ := w.subOf(t, id)
	require.Equal(t, "canceled", status)
	plan, _ := planOf(t, w.pool, id)
	require.Equal(t, "paid", plan, "the plan lasts until the end of what was paid")
	remote, err := w.fake.GetSubscription(context.Background(), pid)
	require.NoError(t, err)
	require.Equal(t, "cancelled", remote.Status)
	// Idempotent: a second cancel changes nothing and does not call the provider again.
	require.NoError(t, w.svc.Cancel(context.Background(), id))
}

func TestCancel_APendingOneEnds(t *testing.T) {
	w := newWorld(t)
	id := newAccount(t, w.pool, "Ana", account.PlanFree)
	_, err := w.svc.Subscribe(context.Background(), id)
	require.NoError(t, err)

	require.NoError(t, w.svc.Cancel(context.Background(), id))

	_, count := w.subOf(t, id)
	require.Zero(t, count)
}

func TestCancel_WithNothingToCancelIsFine(t *testing.T) {
	w := newWorld(t)
	id := newAccount(t, w.pool, "Ana", account.PlanFree)

	require.NoError(t, w.svc.Cancel(context.Background(), id))
	require.ErrorIs(t, w.svc.Cancel(context.Background(), uuid.New()), payments.ErrNotFound)
}

func TestCancel_AFailureOfTheProviderChangesNothing(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	w := build(t, pool, repo, failingProvider{Provider: payments.NewFake("http://x"), cancel: errors.New("boom")}, fakeConfig)
	id := newAccount(t, pool, "Ana", account.PlanPaid)
	insertSub(t, pool, id, subOpts{status: payments.StatusActive, paidThrough: at(fixedNow.Add(24 * time.Hour))})

	err := w.svc.Cancel(context.Background(), id)

	require.ErrorIs(t, err, payments.ErrProvider)
	status, _ := w.subOf(t, id)
	require.Equal(t, "active", status)
	require.Equal(t, []string{"cancel: The payment provider did not cancel the subscription"}, w.rep.all())
}

func TestCancel_AProviderThatDoesNotKnowItStillLetsItBeCanceledHere(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	w := build(t, pool, repo, failingProvider{Provider: payments.NewFake("http://x"), cancel: payments.ErrRemoteNotFound}, fakeConfig)
	id := newAccount(t, pool, "Ana", account.PlanPaid)
	insertSub(t, pool, id, subOpts{status: payments.StatusActive, paidThrough: at(fixedNow.Add(24 * time.Hour))})

	require.NoError(t, w.svc.Cancel(context.Background(), id))

	status, _ := w.subOf(t, id)
	require.Equal(t, "canceled", status)
}
