// Package accountdeletion deletes an account and everything of it and its children (specs/070-eliminar-cuenta-y-datos). A
// person asks for it; the account is then "pending" for GracePeriod, during which it can only download its data or cancel;
// when the period ends a background process deletes the Clerk user and, in one transaction, every row of the account
// (Purge). What is derived from a pending request (the paused account, the invited people's lower level, the reminders it no
// longer gets) is never stored: it comes from the open row of account_deletions, so canceling undoes nothing.
package accountdeletion

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Ulisesgtz/medic-track/backend/internal/deletionstate"
)

// GracePeriod is how long a request waits before the deletion is done (decision of the owner, 2026-11-12: 30 days).
const GracePeriod = 30 * 24 * time.Hour

// Deletion is one row of account_deletions.
type Deletion struct {
	ID           uuid.UUID
	AccountID    uuid.UUID
	ClerkUserID  *string
	RequestedAt  time.Time
	ScheduledFor time.Time
	CanceledAt   *time.Time
	CompletedAt  *time.Time
	Attempts     int
}

// ErrAlreadyPending: the account already has an open request (the existing one comes with it).
var ErrAlreadyPending = errors.New("the account already has a pending deletion")

// OpenSQL is the condition of an open request on the alias d (internal/deletionstate holds the one definition).
const OpenSQL = deletionstate.OpenSQL

// PendingAccountSQL is true when the account with the id in the given SQL expression has an open request.
func PendingAccountSQL(accountExpr string) string {
	return deletionstate.PendingAccountSQL(accountExpr)
}

// Repository reads and writes account_deletions.
type Repository struct {
	pool *pgxpool.Pool
	now  func() time.Time
}

// NewRepository works on pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, now: time.Now}
}

// SetNow fixes the clock (tests).
func (r *Repository) SetNow(now func() time.Time) { r.now = now }

const deletionColumns = `id, account_id, clerk_user_id, requested_at, scheduled_for, canceled_at, completed_at, attempts`

func scanDeletion(row pgx.Row) (*Deletion, error) {
	var d Deletion
	if err := row.Scan(&d.ID, &d.AccountID, &d.ClerkUserID, &d.RequestedAt, &d.ScheduledFor, &d.CanceledAt, &d.CompletedAt, &d.Attempts); err != nil {
		return nil, err
	}
	return &d, nil
}

// Open is the account's open request, or nil.
func (r *Repository) Open(ctx context.Context, accountID uuid.UUID) (*Deletion, error) {
	d, err := scanDeletion(r.pool.QueryRow(ctx, `SELECT `+deletionColumns+` FROM account_deletions d
		WHERE d.account_id = $1 AND `+OpenSQL, accountID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading the account's deletion: %w", err)
	}
	return d, nil
}

// OpenForClerkUser is the open request of the account of a Clerk user, or nil (the paused-account middleware).
func (r *Repository) OpenForClerkUser(ctx context.Context, clerkUserID string) (*Deletion, error) {
	d, err := scanDeletion(r.pool.QueryRow(ctx, `SELECT d.id, d.account_id, d.clerk_user_id, d.requested_at, d.scheduled_for,
			d.canceled_at, d.completed_at, d.attempts
		FROM account_deletions d JOIN accounts a ON a.id = d.account_id
		WHERE a.clerk_user_id = $1 AND `+OpenSQL, clerkUserID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading the session's deletion: %w", err)
	}
	return d, nil
}

// request inserts an open request in tx. A second one for the account is ErrAlreadyPending, with the existing request.
func (r *Repository) request(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, clerkUserID *string) (*Deletion, error) {
	now := r.now()
	d, err := scanDeletion(tx.QueryRow(ctx, `INSERT INTO account_deletions (account_id, clerk_user_id, requested_at, scheduled_for)
		VALUES ($1, $2, $3, $4) RETURNING `+deletionColumns, accountID, clerkUserID, now, now.Add(GracePeriod)))
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return nil, ErrAlreadyPending
	}
	if err != nil {
		return nil, fmt.Errorf("saving the deletion request: %w", err)
	}
	return d, nil
}

// Cancel closes the account's open request. false when there was none (canceling twice is not an error).
func (r *Repository) Cancel(ctx context.Context, accountID uuid.UUID) (bool, error) {
	tag, err := r.pool.Exec(ctx, `UPDATE account_deletions d SET canceled_at = $2
		WHERE d.account_id = $1 AND `+OpenSQL, accountID, r.now())
	if err != nil {
		return false, fmt.Errorf("canceling the deletion: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// nextDue takes, in tx, the earliest open request whose date has come and that isn't in skip, locked so another copy of
// the API never takes it at the same time. nil when there is none.
func (r *Repository) nextDue(ctx context.Context, tx pgx.Tx, skip []uuid.UUID) (*Deletion, error) {
	if skip == nil {
		skip = []uuid.UUID{}
	}
	d, err := scanDeletion(tx.QueryRow(ctx, `SELECT `+deletionColumns+` FROM account_deletions d
		WHERE `+OpenSQL+` AND d.scheduled_for <= $1 AND NOT (d.id = ANY($2))
		ORDER BY d.scheduled_for LIMIT 1 FOR UPDATE SKIP LOCKED`, r.now(), skip))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading the due deletions: %w", err)
	}
	return d, nil
}

// markAttempt counts a failed try of the deletion (outside the failed transaction).
func (r *Repository) markAttempt(ctx context.Context, id uuid.UUID) error {
	if _, err := r.pool.Exec(ctx, `UPDATE account_deletions SET attempts = attempts + 1, last_attempt_at = $2 WHERE id = $1`,
		id, r.now()); err != nil {
		return fmt.Errorf("counting a deletion attempt: %w", err)
	}
	return nil
}

// complete closes the request in tx: from here on only its account id and dates remain.
func (r *Repository) complete(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	if _, err := tx.Exec(ctx, `UPDATE account_deletions SET completed_at = $2, clerk_user_id = NULL WHERE id = $1`,
		id, r.now()); err != nil {
		return fmt.Errorf("completing the deletion: %w", err)
	}
	return nil
}
