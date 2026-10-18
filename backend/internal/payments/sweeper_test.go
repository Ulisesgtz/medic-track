package payments_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/payments"
)

// Everything that depends only on the clock (the sweeper) and the healing of lost notices (the reconciliation).

func (w *world) statusOf(t *testing.T, id uuid.UUID) string {
	t.Helper()
	var status string
	require.NoError(t, w.pool.QueryRow(context.Background(), `SELECT status FROM subscriptions WHERE id = $1`, id).Scan(&status))
	return status
}

// owned is an account whose plan a subscription decides (plan_source = 'subscription'), paid.
func (w *world) owned(t *testing.T, plan account.Plan) uuid.UUID {
	t.Helper()
	id := newAccount(t, w.pool, "Ana", plan)
	_, err := w.pool.Exec(context.Background(), `UPDATE accounts SET plan_source = 'subscription' WHERE id = $1`, id)
	require.NoError(t, err)
	return id
}

func TestSweep_AGraceThatEndedAndAPaidPeriodThatEndedBecomeEndedAndTheAccountGoesBackToFree(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	graceOver := w.owned(t, account.PlanPaid)
	g := insertSub(t, w.pool, graceOver, subOpts{status: payments.StatusGrace, graceUntil: at(fixedNow.Add(-time.Minute))})
	periodOver := w.owned(t, account.PlanPaid)
	c := insertSub(t, w.pool, periodOver, subOpts{status: payments.StatusCanceled, paidThrough: at(fixedNow.Add(-time.Minute))})

	changed, err := w.svc.Sweep(ctx)

	require.NoError(t, err)
	require.GreaterOrEqual(t, changed, 2)
	require.Equal(t, "ended", w.statusOf(t, g))
	require.Equal(t, "ended", w.statusOf(t, c))
	for _, id := range []uuid.UUID{graceOver, periodOver} {
		plan, _ := planOf(t, w.pool, id)
		require.Equal(t, "free", plan)
	}
}

func TestSweep_WhatStillHasTimeIsNotTouched(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	inGrace := w.owned(t, account.PlanPaid)
	g := insertSub(t, w.pool, inGrace, subOpts{status: payments.StatusGrace, graceUntil: at(fixedNow.Add(time.Hour))})
	canceled := w.owned(t, account.PlanPaid)
	c := insertSub(t, w.pool, canceled, subOpts{status: payments.StatusCanceled, paidThrough: at(fixedNow.Add(time.Hour))})
	active := w.owned(t, account.PlanPaid)
	a := insertSub(t, w.pool, active, subOpts{status: payments.StatusActive, paidThrough: at(fixedNow.Add(time.Hour))})
	pending := newAccount(t, w.pool, "Pendiente", account.PlanFree)
	p := insertSub(t, w.pool, pending, subOpts{status: payments.StatusPending, createdAt: at(fixedNow.Add(-time.Hour))})

	_, err := w.svc.Sweep(ctx)

	require.NoError(t, err)
	require.Equal(t, "grace", w.statusOf(t, g))
	require.Equal(t, "canceled", w.statusOf(t, c))
	require.Equal(t, "active", w.statusOf(t, a))
	require.Equal(t, "pending", w.statusOf(t, p))
	plan, _ := planOf(t, w.pool, inGrace)
	require.Equal(t, "paid", plan)
}

func TestSweep_AnExpiredPendingOneEndsOrKeepsTheDaysItCarried(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	plain := newAccount(t, w.pool, "Sola", account.PlanFree)
	p := insertSub(t, w.pool, plain, subOpts{status: payments.StatusPending, createdAt: at(fixedNow.Add(-25 * time.Hour))})
	carrying := w.owned(t, account.PlanPaid)
	c := insertSub(t, w.pool, carrying, subOpts{status: payments.StatusPending, createdAt: at(fixedNow.Add(-25 * time.Hour)), paidThrough: at(fixedNow.Add(20 * 24 * time.Hour))})

	_, err := w.svc.Sweep(ctx)

	require.NoError(t, err)
	require.Equal(t, "ended", w.statusOf(t, p))
	require.Equal(t, "canceled", w.statusOf(t, c), "the days of the earlier subscription are not lost")
	plan, _ := planOf(t, w.pool, carrying)
	require.Equal(t, "paid", plan)
}

func TestSweep_IsIdempotentAndLeavesManualAccountsAlone(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	manual := newAccount(t, w.pool, "Probadora", account.PlanPaid)
	insertSub(t, w.pool, manual, subOpts{status: payments.StatusGrace, graceUntil: at(fixedNow.Add(-time.Hour))})

	_, err := w.svc.Sweep(ctx)
	require.NoError(t, err)
	changed, err := w.svc.Sweep(ctx)
	require.NoError(t, err)

	require.Zero(t, changed, "a second run finds nothing to do")
	plan, source := planOf(t, w.pool, manual)
	require.Equal(t, "paid", plan, "a plan given by hand does not follow a subscription that ends")
	require.Equal(t, "manual", source)
}

// A plan that ends never hides or changes what the family registered, and its guests can still mark doses (FR-007, SC-003).
func TestSweep_EndingThePlanTouchesNothingRegisteredAndGuestsKeepMarking(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	owner := newAccountWithChild(t, w.pool, "Ana", account.PlanPaid)
	_, err := w.pool.Exec(ctx, `UPDATE accounts SET plan_source = 'subscription' WHERE id = $1`, owner.id)
	require.NoError(t, err)
	sub := insertSub(t, w.pool, owner.id, subOpts{status: payments.StatusGrace, graceUntil: at(fixedNow.Add(-time.Minute))})
	guest := newAccount(t, w.pool, "Invitada", account.PlanFree)
	join(t, w.pool, owner.id, guest, "tutor")
	acc := access.NewRepository(w.pool)
	level, err := acc.OfAccountOnChild(ctx, guest, owner.childID)
	require.NoError(t, err)
	require.Equal(t, access.Full, level, "while the plan lasts a Tutor can do everything")
	before := w.registered(t, owner.id)
	require.NotEmpty(t, before)

	_, err = w.svc.Sweep(ctx)
	require.NoError(t, err)

	require.Equal(t, "ended", w.statusOf(t, sub))
	require.Equal(t, before, w.registered(t, owner.id), "not one registered row changed")
	level, err = acc.OfAccountOnChild(ctx, guest, owner.childID)
	require.NoError(t, err)
	require.Equal(t, access.Mark, level, "the guest keeps seeing and marking, and nothing else")
}

type ownerOfChild struct{ id, childID uuid.UUID }

// newAccountWithChild creates an account with one child, a consultation, a medication and a dose: what a family registers.
func newAccountWithChild(t *testing.T, pool *pgxpool.Pool, first string, plan account.Plan) ownerOfChild {
	t.Helper()
	ctx := context.Background()
	acc := &account.Account{
		FirstName: first, LastName: "Prueba", Plan: plan, Email: fmt.Sprintf("pay.child.%d.%s@example.com", time.Now().UnixNano(), uuid.NewString()[:6]),
		Children: []account.Child{{FirstName: "Hijo", LastName: "Prueba", BirthDate: time.Now().AddDate(-5, 0, 0)}},
	}
	require.NoError(t, account.NewRepository(pool).Create(ctx, acc))
	var consultationID, medicationID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO consultations (child_id, doctor_name, consult_date, photo, notes) VALUES ($1, 'Dra. López', '2026-09-28', '\x00', 'Tos') RETURNING id`,
		acc.Children[0].ID).Scan(&consultationID))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO medications (consultation_id, name, frequency_hours, duration_days) VALUES ($1, 'Amoxicilina', 8, 3) RETURNING id`,
		consultationID).Scan(&medicationID))
	_, err := pool.Exec(ctx, `INSERT INTO doses (medication_id, scheduled_at) VALUES ($1, now() + interval '1 hour')`, medicationID)
	require.NoError(t, err)
	return ownerOfChild{id: acc.ID, childID: acc.Children[0].ID}
}

func (w *world) registered(t *testing.T, accountID uuid.UUID) string {
	t.Helper()
	var out string
	require.NoError(t, w.pool.QueryRow(context.Background(), `
		SELECT coalesce(string_agg(x, '|' ORDER BY x), '') FROM (
			SELECT 'child:' || ch.id::text || ':' || ch.first_name AS x FROM children ch WHERE ch.account_id = $1
			UNION ALL SELECT 'consultation:' || co.id::text || ':' || co.doctor_name || ':' || co.notes
			         FROM consultations co JOIN children ch ON ch.id = co.child_id WHERE ch.account_id = $1
			UNION ALL SELECT 'medication:' || m.id::text || ':' || m.name
			         FROM medications m JOIN consultations co ON co.id = m.consultation_id JOIN children ch ON ch.id = co.child_id WHERE ch.account_id = $1
			UNION ALL SELECT 'dose:' || d.id::text || ':' || d.taken::text
			         FROM doses d JOIN medications m ON m.id = d.medication_id JOIN consultations co ON co.id = m.consultation_id JOIN children ch ON ch.id = co.child_id WHERE ch.account_id = $1
		) t`, accountID).Scan(&out))
	return out
}

func TestReconcile_HealsALostNotice(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	id, pid := w.contract(t)
	// The provider approved and its notice never arrived.
	_, err := w.fake.Approve(pid, fixedNow.AddDate(1, 0, 0))
	require.NoError(t, err)
	status, _ := w.subOf(t, id)
	require.Equal(t, "pending", status)
	// The test database keeps the subscriptions of earlier runs: mark them as just checked so this one is within the batch.
	_, err = w.pool.Exec(ctx, `UPDATE subscriptions SET last_checked_at = $1 WHERE provider_subscription_id <> $2 AND status <> 'ended'`, fixedNow, pid)
	require.NoError(t, err)

	checked, err := w.svc.Reconcile(ctx)

	require.NoError(t, err)
	require.GreaterOrEqual(t, checked, 1)
	status, _ = w.subOf(t, id)
	require.Equal(t, "active", status)
	plan, _ := planOf(t, w.pool, id)
	require.Equal(t, "paid", plan)

	// What was just checked is not asked again until ReconcileEvery has passed.
	again, err := w.svc.Reconcile(ctx)
	require.NoError(t, err)
	var due int
	require.NoError(t, w.pool.QueryRow(ctx, `SELECT count(*) FROM subscriptions WHERE provider_subscription_id = $1 AND last_checked_at = $2`, pid, fixedNow).Scan(&due))
	require.Equal(t, 1, due)
	_ = again
}

func TestReconcile_AFailureOnOneSubscriptionIsReportedAndTheOthersGoOn(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	fake := payments.NewFake("http://x")
	w := build(t, pool, repo, failingProvider{Provider: fake, read: payments.ErrTemporary}, fakeConfig)
	id := newAccount(t, pool, "Ana", account.PlanFree)
	insertSub(t, pool, id, subOpts{status: payments.StatusPending, providerID: "rec_" + uuid.NewString()[:8]})

	_, err := w.svc.Reconcile(context.Background())

	require.NoError(t, err)
	require.Contains(t, w.rep.all(), "reconcile: Some subscriptions could not be checked with the payment provider")
}

func TestRunSweeper_RunsUntilItsContextIsDone(t *testing.T) {
	w := newWorld(t)
	id := w.owned(t, account.PlanPaid)
	sub := insertSub(t, w.pool, id, subOpts{status: payments.StatusGrace, graceUntil: at(fixedNow.Add(-time.Hour))})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})

	go func() {
		payments.RunSweeper(ctx, w.svc, 10*time.Millisecond)
		close(done)
	}()
	require.Eventually(t, func() bool { return w.statusOf(t, sub) == "ended" }, 5*time.Second, 20*time.Millisecond)
	cancel()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the sweeper did not stop")
	}
}
