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

// What a notice of the provider does. The provider's real state is read every time, so repeating or reordering notices gives the
// same result (SC-002).

// contract starts a subscription for a new free account and returns the account and the provider's id.
func (w *world) contract(t *testing.T) (uuid.UUID, string) {
	t.Helper()
	id := newAccount(t, w.pool, "Ana", account.PlanFree)
	_, err := w.svc.Subscribe(context.Background(), id)
	require.NoError(t, err)
	var pid string
	require.NoError(t, w.pool.QueryRow(context.Background(), `SELECT provider_subscription_id FROM subscriptions WHERE account_id = $1 AND status <> 'ended'`, id).Scan(&pid))
	return id, pid
}

func (w *world) events(t *testing.T, providerID string) int {
	t.Helper()
	var n int
	require.NoError(t, w.pool.QueryRow(context.Background(), `
		SELECT count(*) FROM payment_events e JOIN subscriptions s ON s.id = e.subscription_id WHERE s.provider_subscription_id = $1`, providerID).Scan(&n))
	return n
}

func (w *world) subRow(t *testing.T, accountID uuid.UUID) (status string, paidThrough, graceUntil *time.Time) {
	t.Helper()
	require.NoError(t, w.pool.QueryRow(context.Background(), `
		SELECT status, paid_through, grace_until FROM subscriptions WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1`, accountID).Scan(&status, &paidThrough, &graceUntil))
	return status, paidThrough, graceUntil
}

func TestProcess_AnApprovedPaymentActivatesTheSubscriptionAndGivesThePlan(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	id, pid := w.contract(t)
	next := fixedNow.AddDate(1, 0, 0)
	_, err := w.fake.Approve(pid, next)
	require.NoError(t, err)

	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicSubscription, pid))

	status, through, _ := w.subRow(t, id)
	require.Equal(t, "active", status)
	require.True(t, through.Equal(next))
	plan, source := planOf(t, w.pool, id)
	require.Equal(t, "paid", plan)
	require.Equal(t, "subscription", source)
	require.Equal(t, 1, w.events(t, pid))
}

func TestProcess_TheSameNoticeTwiceChangesNothingTheSecondTime(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	id, pid := w.contract(t)
	_, err := w.fake.Approve(pid, fixedNow.AddDate(1, 0, 0))
	require.NoError(t, err)

	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicSubscription, pid))
	// Someone edits the row between the two: a repeat must not overwrite it.
	_, err = w.pool.Exec(ctx, `UPDATE subscriptions SET paid_through = $2 WHERE account_id = $1`, id, fixedNow.Add(24*time.Hour))
	require.NoError(t, err)
	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicSubscription, pid))

	require.Equal(t, 1, w.events(t, pid))
	_, through, _ := w.subRow(t, id)
	require.True(t, through.Equal(fixedNow.Add(24*time.Hour)), "the repeated notice did nothing")
}

func TestProcess_ARejectionOfASubscriptionThatNeverPaidIsNotAGracePeriod(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	id, pid := w.contract(t)
	rejected, err := w.fake.Reject(pid)
	require.NoError(t, err)
	_ = pid

	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicAuthorizedPayment, rejected))

	status, _, _ := w.subRow(t, id)
	require.Equal(t, "pending", status, "no plan was given, so there is nothing to keep during a grace period")
	plan, _ := planOf(t, w.pool, id)
	require.Equal(t, "free", plan)
}

func TestProcess_NoticesOfTheSubscriptionAreOrderIndependent(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	id, pid := w.contract(t)
	_, err := w.fake.Approve(pid, fixedNow.AddDate(1, 0, 0))
	require.NoError(t, err)

	// The provider is read each time: however many notices and in whatever order, the state is the provider's.
	for i := 0; i < 3; i++ {
		require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicSubscription, pid))
	}

	status, _, _ := w.subRow(t, id)
	require.Equal(t, "active", status)
	require.Equal(t, 1, w.events(t, pid))
}

func TestProcess_ARejectedRenewalStartsTheGracePeriodAndAnApprovedOneEndsIt(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	id, pid := w.contract(t)
	_, err := w.fake.Approve(pid, fixedNow.AddDate(1, 0, 0))
	require.NoError(t, err)
	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicSubscription, pid))

	rejected, err := w.fake.Reject(pid)
	require.NoError(t, err)
	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicAuthorizedPayment, rejected))

	status, _, grace := w.subRow(t, id)
	require.Equal(t, "grace", status)
	require.True(t, grace.Equal(fixedNow.AddDate(0, 0, 7)))
	plan, _ := planOf(t, w.pool, id)
	require.Equal(t, "paid", plan, "the plan stays during the grace period")

	// A notice about the subscription alone does not end the grace period.
	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicSubscription, pid))
	status, _, _ = w.subRow(t, id)
	require.Equal(t, "grace", status)

	// An approved charge does, and moves the end of the paid period.
	renewed, err := w.fake.Renew(pid, fixedNow.AddDate(2, 0, 0))
	require.NoError(t, err)
	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicAuthorizedPayment, renewed))
	status, through, grace := w.subRow(t, id)
	require.Equal(t, "active", status)
	require.Nil(t, grace)
	require.True(t, through.Equal(fixedNow.AddDate(2, 0, 0)))
}

func TestProcess_AGraceThatAlreadyStartedIsNotRestarted(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	id, pid := w.contract(t)
	_, err := w.fake.Approve(pid, fixedNow.AddDate(1, 0, 0))
	require.NoError(t, err)
	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicSubscription, pid))
	first, _ := w.fake.Reject(pid)
	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicAuthorizedPayment, first))
	_, err = w.pool.Exec(ctx, `UPDATE subscriptions SET grace_until = $2 WHERE account_id = $1`, id, fixedNow.Add(36*time.Hour))
	require.NoError(t, err)

	second, _ := w.fake.Reject(pid)
	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicAuthorizedPayment, second))

	_, _, grace := w.subRow(t, id)
	require.True(t, grace.Equal(fixedNow.Add(36*time.Hour)), "the second failure does not give more days")
}

func TestProcess_APausedSubscriptionIsAGracePeriod(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	id, pid := w.contract(t)
	_, err := w.fake.Approve(pid, fixedNow.AddDate(1, 0, 0))
	require.NoError(t, err)
	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicSubscription, pid))
	require.NoError(t, w.fake.Pause(pid))

	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicSubscription, pid))

	status, _, _ := w.subRow(t, id)
	require.Equal(t, "grace", status)
}

func TestProcess_ACancellationFromTheProvidersPanel(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	id, pid := w.contract(t)
	_, err := w.fake.Approve(pid, fixedNow.AddDate(1, 0, 0))
	require.NoError(t, err)
	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicSubscription, pid))
	require.NoError(t, w.fake.CancelSubscription(ctx, pid))

	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicSubscription, pid))

	status, through, _ := w.subRow(t, id)
	require.Equal(t, "canceled", status)
	require.NotNil(t, through)
	plan, _ := planOf(t, w.pool, id)
	require.Equal(t, "paid", plan, "what was paid is kept until its end")
}

func TestProcess_ACancellationOfOneThatNeverPaidEnds(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	id, pid := w.contract(t)
	require.NoError(t, w.fake.CancelSubscription(ctx, pid))

	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicSubscription, pid))

	status, _, _ := w.subRow(t, id)
	require.Equal(t, "ended", status)
	plan, _ := planOf(t, w.pool, id)
	require.Equal(t, "free", plan)
}

func TestProcess_APendingSubscriptionStaysPendingUntilThereIsAPayment(t *testing.T) {
	w := newWorld(t)
	id, pid := w.contract(t)

	require.NoError(t, w.svc.ProcessNotification(context.Background(), payments.TopicSubscription, pid))

	status, _, _ := w.subRow(t, id)
	require.Equal(t, "pending", status)
}

func TestProcess_AnAccountWithAPlanGivenByHandIsNotTouchedByUnrelatedNotices(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	manual := newAccount(t, w.pool, "Probadora", account.PlanPaid)
	_, pid := w.contract(t) // someone else's subscription
	_, err := w.fake.Approve(pid, fixedNow.AddDate(1, 0, 0))
	require.NoError(t, err)

	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicSubscription, pid))

	plan, source := planOf(t, w.pool, manual)
	require.Equal(t, "paid", plan)
	require.Equal(t, "manual", source)
}

func TestProcess_UnknownThingsAreIgnoredAndReported(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()

	// A subscription the provider has but PediTrack does not.
	created, err := w.fake.CreateSubscription(ctx, payments.CreateRequest{ExternalReference: "nobody"})
	require.NoError(t, err)
	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicSubscription, created.ID))
	// A resource the provider does not have.
	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicSubscription, "does-not-exist"))
	require.NoError(t, w.svc.ProcessNotification(ctx, payments.TopicAuthorizedPayment, "does-not-exist"))
	// A topic that is not processed.
	require.NoError(t, w.svc.ProcessNotification(ctx, "subscription_preapproval_plan", "x"))
	require.NoError(t, w.svc.ProcessNotification(ctx, "", ""))

	require.Equal(t, []string{
		"webhook: A notice named a subscription PediTrack does not know",
		"webhook: A notice named a resource the provider does not have",
		"webhook: A notice named a resource the provider does not have",
	}, w.rep.all())
}

func TestProcess_APaymentThatDoesNotBelongToASubscriptionIsIgnored(t *testing.T) {
	w := newWorld(t)
	require.NoError(t, w.svc.ProcessNotification(context.Background(), payments.TopicPayment, "no-such-payment"))
	require.Equal(t, []string{"webhook: A notice named a resource the provider does not have"}, w.rep.all())
}

func TestProcess_APaymentNoticeFindsItsSubscription(t *testing.T) {
	w := newWorld(t)
	id, pid := w.contract(t)
	pay, err := w.fake.Approve(pid, fixedNow.AddDate(1, 0, 0))
	require.NoError(t, err)

	require.NoError(t, w.svc.ProcessNotification(context.Background(), payments.TopicPayment, pay))

	status, _, _ := w.subRow(t, id)
	require.Equal(t, "active", status)
}

func TestProcess_ATemporaryFailureOfTheProviderIsReturnedToBeRetried(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	w := build(t, pool, repo, failingProvider{Provider: payments.NewFake("http://x"), read: payments.ErrTemporary}, fakeConfig)

	err := w.svc.ProcessNotification(context.Background(), payments.TopicSubscription, "x")

	require.ErrorIs(t, err, payments.ErrTemporary)
	require.Equal(t, []string{"verify: The payment provider could not be asked about a notice"}, w.rep.all())
}
