package payments

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const (
	// SweepInterval is how often the time-driven transitions run (a grace period that ends, a paid period that ends, a pending
	// subscription that expired). A plan that ends is therefore at most a minute late.
	SweepInterval = time.Minute
	// ReconcileEvery is how often the real state of the open subscriptions is asked of the provider (heals a lost notice).
	ReconcileEvery = 30 * time.Minute
	// ReconcileBatch is the most subscriptions asked about in one round.
	ReconcileBatch = 50

	sweepBatch = 200
)

type due struct {
	id        uuid.UUID
	accountID uuid.UUID
}

// Sweep applies what depends only on the clock: a grace period past its end, a canceled subscription past what was paid and a
// pending one past 24 hours become `ended` (a pending one that carried days of an earlier subscription becomes `canceled`, so those
// days are not lost); the account's plan is recomputed in the same transaction. It changes nothing but subscriptions and the plan:
// what a family registered is never touched. It returns how many subscriptions changed.
func (s *Service) Sweep(ctx context.Context) (int, error) {
	now := s.now()
	rows, err := s.repo.pool.Query(ctx, `
		SELECT id, account_id FROM subscriptions
		WHERE (status = 'grace' AND grace_until <= $1)
		   OR (status = 'canceled' AND paid_through <= $1)
		   OR (status = 'pending' AND created_at <= $2)
		ORDER BY updated_at LIMIT $3`, now, now.Add(-PendingMaxAge), sweepBatch)
	if err != nil {
		return 0, fmt.Errorf("looking for expired subscriptions: %w", err)
	}
	var list []due
	for rows.Next() {
		var d due
		if err := rows.Scan(&d.id, &d.accountID); err != nil {
			rows.Close()
			return 0, fmt.Errorf("scanning an expired subscription: %w", err)
		}
		list = append(list, d)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("looking for expired subscriptions: %w", err)
	}

	changed := 0
	var firstErr error
	for _, d := range list {
		ok, err := s.expire(ctx, d, now)
		if err != nil && firstErr == nil {
			firstErr = err
		}
		if ok {
			changed++
		}
	}
	return changed, firstErr
}

// expire ends one subscription if it is still expired once its account is locked.
func (s *Service) expire(ctx context.Context, d due, now time.Time) (bool, error) {
	tx, err := s.repo.pool.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := lockAccount(ctx, tx, d.accountID); err != nil {
		return false, err
	}
	sub, err := scanSubscription(tx.QueryRow(ctx, `SELECT `+subscriptionColumns+` FROM subscriptions WHERE id = $1 FOR UPDATE`, d.id))
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("reading the subscription: %w", err)
	}
	switch {
	case sub.Status == StatusGrace && sub.GraceUntil != nil && !sub.GraceUntil.After(now):
		sub.Status = StatusEnded
	case sub.Status == StatusCanceled && sub.PaidThrough != nil && !sub.PaidThrough.After(now):
		sub.Status = StatusEnded
	case sub.Status == StatusPending && !sub.CreatedAt.After(now.Add(-PendingMaxAge)):
		if sub.PaidThrough != nil && sub.PaidThrough.After(now) {
			sub.Status = StatusCanceled // it carried days of an earlier subscription: they are kept
		} else {
			sub.Status = StatusEnded
		}
	default:
		return false, nil // someone changed it meanwhile
	}
	sub.NextRenewalAt, sub.GraceUntil, sub.CheckoutURL = nil, nil, ""
	if err := update(ctx, tx, sub, now); err != nil {
		return false, err
	}
	if err := s.repo.Recompute(ctx, tx, d.accountID); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("committing the expiry: %w", err)
	}
	return true, nil
}

// Reconcile asks the provider for the real state of the open subscriptions that were not checked for ReconcileEvery (at most
// ReconcileBatch) and applies it, like a notice would: it heals the loss of one. A failure on one subscription is reported and the
// others go on. It returns how many were checked.
func (s *Service) Reconcile(ctx context.Context) (int, error) {
	now := s.now()
	rows, err := s.repo.pool.Query(ctx, `
		SELECT provider_subscription_id FROM subscriptions
		WHERE provider = $1 AND status <> 'ended' AND (last_checked_at IS NULL OR last_checked_at <= $2)
		ORDER BY last_checked_at NULLS FIRST LIMIT $3`, s.provider.Name(), now.Add(-ReconcileEvery), ReconcileBatch)
	if err != nil {
		return 0, fmt.Errorf("looking for subscriptions to reconcile: %w", err)
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, fmt.Errorf("scanning a subscription: %w", err)
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("looking for subscriptions to reconcile: %w", err)
	}

	checked, failed := 0, 0
	for _, id := range ids {
		if ctx.Err() != nil {
			break
		}
		remote, err := s.provider.GetSubscription(ctx, id)
		switch {
		case errors.Is(err, ErrRemoteNotFound):
			failed++
		case err != nil:
			failed++
			continue
		default:
			if err := s.apply(ctx, "reconcile", id, remote, nil); err != nil {
				failed++
				continue
			}
		}
		if _, err := s.repo.pool.Exec(ctx, `UPDATE subscriptions SET last_checked_at = $3 WHERE provider = $1 AND provider_subscription_id = $2`, s.provider.Name(), id, now); err != nil {
			failed++
			continue
		}
		checked++
	}
	if failed > 0 {
		s.report("reconcile", "Some subscriptions could not be checked with the payment provider")
	}
	return checked, nil
}

// RunSweeper runs Sweep every SweepInterval and Reconcile every ReconcileEvery in the API's process until ctx is done. What fails is
// reported as job:payments (fixed messages, kinds `sweep` and `reconcile`); a shutdown is not a failure.
func RunSweeper(ctx context.Context, svc *Service, interval time.Duration) {
	if interval <= 0 {
		interval = SweepInterval
	}
	tick := time.NewTicker(interval)
	defer tick.Stop()
	lastReconcile := time.Time{}
	for {
		if _, err := svc.Sweep(ctx); err != nil && ctx.Err() == nil {
			svc.report("sweep", "Expired subscriptions could not be updated")
		}
		if time.Since(lastReconcile) >= ReconcileEvery {
			lastReconcile = time.Now()
			if _, err := svc.Reconcile(ctx); err != nil && ctx.Err() == nil {
				svc.report("reconcile", "Subscriptions could not be reconciled with the payment provider")
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}
