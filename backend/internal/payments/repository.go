package payments

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// FamilyReader is what the plan rule reads of the family (satisfied by *family.Repository): which family a person belongs to
// and who owns it, so the SQL of memberships is never repeated here.
type FamilyReader interface {
	// FamilyOf returns the family's owner account and the person's role in it; a person with no family is their own owner.
	FamilyOf(ctx context.Context, accountID uuid.UUID) (ownerID uuid.UUID, role string, err error)
	// Owner returns the first name and plan of a family's owner account.
	Owner(ctx context.Context, ownerID uuid.UUID) (name, plan string, err error)
}

// Repository runs the subscriptions' SQL.
type Repository struct {
	pool   *pgxpool.Pool
	family FamilyReader
	now    func() time.Time
}

// NewRepository creates a Repository backed by the given pool.
func NewRepository(pool *pgxpool.Pool, family FamilyReader) *Repository {
	return &Repository{pool: pool, family: family, now: time.Now}
}

const subscriptionColumns = `id, account_id, provider, provider_subscription_id, status, paid_through, next_renewal_at, grace_until,
	checkout_url, last_checked_at, created_at, updated_at`

func scanSubscription(row pgx.Row) (Subscription, error) {
	var s Subscription
	var status string
	err := row.Scan(&s.ID, &s.AccountID, &s.Provider, &s.ProviderID, &status, &s.PaidThrough, &s.NextRenewalAt, &s.GraceUntil,
		&s.CheckoutURL, &s.LastCheckedAt, &s.CreatedAt, &s.UpdatedAt)
	s.Status = Status(status)
	return s, err
}

// account is what the plan rule reads of an account, under its lock.
type account struct {
	email  string
	plan   string
	source string
}

// lockAccount locks the account's row (two requests of one account are handled one after the other) and reads what the plan
// rule needs. ErrNotFound if there is no such account.
func lockAccount(ctx context.Context, tx pgx.Tx, accountID uuid.UUID) (account, error) {
	var a account
	err := tx.QueryRow(ctx, `SELECT email, plan::text, plan_source FROM accounts WHERE id = $1 FOR UPDATE`, accountID).Scan(&a.email, &a.plan, &a.source)
	if errors.Is(err, pgx.ErrNoRows) {
		return a, ErrNotFound
	}
	if err != nil {
		return a, fmt.Errorf("locking the account: %w", err)
	}
	return a, nil
}

// openSubscription is the account's subscription that is not ended, or nil.
func openSubscription(ctx context.Context, q pgx.Tx, accountID uuid.UUID) (*Subscription, error) {
	s, err := scanSubscription(q.QueryRow(ctx, `SELECT `+subscriptionColumns+` FROM subscriptions WHERE account_id = $1 AND status <> 'ended'`, accountID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading the subscription: %w", err)
	}
	return &s, nil
}

// Recompute is the one place that writes accounts.plan for an account whose plan a subscription decides: `paid` while the open
// subscription grants it (active; in grace; canceled or pending with days still ahead), `free` otherwise. An account whose plan was
// given by hand (`manual`) is left alone until its first subscription grants the plan, and then it follows the subscription. It
// locks the account's row; call it in the same transaction that changed the subscription.
func (r *Repository) Recompute(ctx context.Context, tx pgx.Tx, accountID uuid.UUID) error {
	acc, err := lockAccount(ctx, tx, accountID)
	if err != nil {
		return err
	}
	sub, err := openSubscription(ctx, tx, accountID)
	if err != nil {
		return err
	}
	grants := sub != nil && sub.grantsPlan(r.now())
	switch {
	case acc.source == sourceManual && !grants:
		return nil
	case grants:
		_, err = tx.Exec(ctx, `UPDATE accounts SET plan = 'paid', plan_source = 'subscription' WHERE id = $1`, accountID)
	default:
		_, err = tx.Exec(ctx, `UPDATE accounts SET plan = 'free' WHERE id = $1`, accountID)
	}
	if err != nil {
		return fmt.Errorf("writing the plan: %w", err)
	}
	return nil
}

// Decide answers whether the account can subscribe now (FR-003, FR-003b, FR-011): `already_paid` (it has the full plan: its own,
// by a subscription that renews, or given by hand), `covered_by_family` (it is an active member of another account's family and
// that account's plan is paid), `pending` (a recent subscription waits for its payment) or nothing. A subscription that was
// canceled (it will not renew) does not block a new one: the person can subscribe again and keeps the days they had.
func (r *Repository) Decide(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, acc account) (Decision, error) {
	sub, err := openSubscription(ctx, tx, accountID)
	if err != nil {
		return Decision{}, err
	}
	if sub != nil && sub.Status == StatusPending && r.now().Sub(sub.CreatedAt) < PendingMaxAge {
		return Decision{Reason: ReasonPending}, nil
	}
	if acc.plan == planPaid && !(sub != nil && sub.Status == StatusCanceled) {
		return Decision{Reason: ReasonAlreadyPaid}, nil
	}
	ownerID, _, err := r.family.FamilyOf(ctx, accountID)
	if err != nil {
		return Decision{}, err
	}
	if ownerID != accountID {
		name, plan, err := r.family.Owner(ctx, ownerID)
		if err != nil {
			return Decision{}, err
		}
		if plan == planPaid {
			return Decision{Reason: ReasonCoveredByFamily, CoveredBy: name}, nil
		}
	}
	return Decision{}, nil
}

// CanSubscribe is Decide for a read (no lock): what /planes needs to draw the button or the reason there is none.
func (r *Repository) CanSubscribe(ctx context.Context, accountID uuid.UUID) (Decision, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Decision{}, fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var acc account
	err = tx.QueryRow(ctx, `SELECT email, plan::text, plan_source FROM accounts WHERE id = $1`, accountID).Scan(&acc.email, &acc.plan, &acc.source)
	if errors.Is(err, pgx.ErrNoRows) {
		return Decision{}, ErrNotFound
	}
	if err != nil {
		return Decision{}, fmt.Errorf("reading the account: %w", err)
	}
	return r.Decide(ctx, tx, accountID, acc)
}

// Current is the account's open subscription (nil if none), for reading.
func (r *Repository) Current(ctx context.Context, accountID uuid.UUID) (*Subscription, error) {
	s, err := scanSubscription(r.pool.QueryRow(ctx, `SELECT `+subscriptionColumns+` FROM subscriptions WHERE account_id = $1 AND status <> 'ended'`, accountID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading the subscription: %w", err)
	}
	return &s, nil
}

// LastEnded is the account's most recently ended subscription (nil if none): /planes says «tu plan terminó el …».
func (r *Repository) LastEnded(ctx context.Context, accountID uuid.UUID) (*Subscription, error) {
	s, err := scanSubscription(r.pool.QueryRow(ctx, `SELECT `+subscriptionColumns+` FROM subscriptions WHERE account_id = $1 AND status = 'ended' ORDER BY updated_at DESC LIMIT 1`, accountID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading the last subscription: %w", err)
	}
	return &s, nil
}

// bySubscriptionID finds a subscription by the provider's id, locking its account's row first so its state is changed under the
// same lock as the plan (nil if unknown).
func (r *Repository) bySubscriptionID(ctx context.Context, tx pgx.Tx, provider, providerID string) (*Subscription, error) {
	var accountID uuid.UUID
	err := tx.QueryRow(ctx, `SELECT account_id FROM subscriptions WHERE provider = $1 AND provider_subscription_id = $2`, provider, providerID).Scan(&accountID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("finding the subscription: %w", err)
	}
	if _, err := lockAccount(ctx, tx, accountID); err != nil {
		return nil, err
	}
	s, err := scanSubscription(tx.QueryRow(ctx, `SELECT `+subscriptionColumns+` FROM subscriptions WHERE provider = $1 AND provider_subscription_id = $2 FOR UPDATE`, provider, providerID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading the subscription: %w", err)
	}
	return &s, nil
}

// recordEvent notes that an event was processed; it returns false if it already had been (the idempotency of the notices).
func recordEvent(ctx context.Context, tx pgx.Tx, provider, key, resourceType, resourceID string, subscriptionID *uuid.UUID) (bool, error) {
	tag, err := tx.Exec(ctx, `
		INSERT INTO payment_events (provider, event_key, resource_type, resource_id, subscription_id)
		VALUES ($1, $2, $3, $4, $5) ON CONFLICT (provider, event_key) DO NOTHING`, provider, key, resourceType, resourceID, subscriptionID)
	if err != nil {
		return false, fmt.Errorf("recording the event: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}

// update writes the mutable fields of a subscription.
func update(ctx context.Context, tx pgx.Tx, s Subscription, now time.Time) error {
	_, err := tx.Exec(ctx, `
		UPDATE subscriptions
		SET status = $2, paid_through = $3, next_renewal_at = $4, grace_until = $5, checkout_url = $6, last_checked_at = $7, updated_at = $8
		WHERE id = $1`, s.ID, string(s.Status), s.PaidThrough, s.NextRenewalAt, s.GraceUntil, s.CheckoutURL, s.LastCheckedAt, now)
	if err != nil {
		return fmt.Errorf("updating the subscription: %w", err)
	}
	return nil
}
