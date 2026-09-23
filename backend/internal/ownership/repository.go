// Package ownership answers "does this Clerk session own this account /
// child / consultation?" (specs/008-autenticacion-cuenta, FR-005). The only
// source of truth for who owns what is `accounts.clerk_user_id` and
// `children.account_id`, so a consultation (which only has a child_id) is
// resolved through its child — nothing here is duplicated onto the
// consultation tables.
package ownership

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository runs the ownership queries.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a Repository backed by the given pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// OwnsAccount reports whether accountID is the account linked to clerkUserID.
func (r *Repository) OwnsAccount(ctx context.Context, clerkUserID string, accountID uuid.UUID) (bool, error) {
	return r.exists(ctx, clerkUserID,
		`SELECT EXISTS (SELECT 1 FROM accounts WHERE id = $1 AND clerk_user_id = $2)`, accountID)
}

// OwnsChild reports whether childID belongs to the account linked to clerkUserID.
func (r *Repository) OwnsChild(ctx context.Context, clerkUserID string, childID uuid.UUID) (bool, error) {
	return r.exists(ctx, clerkUserID,
		`SELECT EXISTS (
		   SELECT 1 FROM children c JOIN accounts a ON a.id = c.account_id
		   WHERE c.id = $1 AND a.clerk_user_id = $2)`, childID)
}

// OwnsConsultation reports whether consultationID belongs to a child of the
// account linked to clerkUserID.
func (r *Repository) OwnsConsultation(ctx context.Context, clerkUserID string, consultationID uuid.UUID) (bool, error) {
	return r.exists(ctx, clerkUserID,
		`SELECT EXISTS (
		   SELECT 1 FROM consultations k
		   JOIN children c ON c.id = k.child_id
		   JOIN accounts a ON a.id = c.account_id
		   WHERE k.id = $1 AND a.clerk_user_id = $2)`, consultationID)
}

// exists runs an EXISTS query. An empty clerkUserID never owns anything, so
// a session without a subject can't match rows whose clerk_user_id was
// stored as an empty string.
func (r *Repository) exists(ctx context.Context, clerkUserID, query string, id uuid.UUID) (bool, error) {
	if clerkUserID == "" {
		return false, nil
	}
	var owns bool
	if err := r.pool.QueryRow(ctx, query, id, clerkUserID).Scan(&owns); err != nil {
		return false, err
	}
	return owns, nil
}
