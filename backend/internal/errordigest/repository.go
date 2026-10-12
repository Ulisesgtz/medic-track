package errordigest

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// LeaseDuration is how long a process owns the week it claimed. A process that dies while sending leaves a 'sending' row; once
// its lease runs out another one takes the week over, and the provider's idempotency key keeps that retry from sending a second
// e-mail if the first one did go out (specs/039 research R2).
const LeaseDuration = 30 * time.Minute

// ClaimResult is what asking for a week gets.
type ClaimResult int

const (
	// Claimed: the week is this process's now; it must send it and mark it.
	Claimed ClaimResult = iota
	// Busy: another process holds it and its lease has not run out; asking again later may find it free.
	Busy
	// Done: the week was already sent, or given up on (a week that failed is never recovered).
	Done
)

// Repository keeps the record of which weeks were sent (the error_digest_runs table, migration 0024).
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a Repository backed by the given pool.
func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

// Claim takes a week for this process in a single atomic statement, so two copies of the API asking at once get one winner:
//   - nobody had it: it is inserted as 'sending' with a lease;
//   - it is 'sending' and its lease has run out: it is taken over (attempts + 1);
//   - anything else — 'sent', 'failed', or 'sending' with a live lease — is not touched.
func (r *Repository) Claim(ctx context.Context, weekKey string, lease time.Duration) (ClaimResult, error) {
	var claimed string
	err := r.pool.QueryRow(ctx, `
		INSERT INTO error_digest_runs (week_key, status, claimed_at, lease_until, attempts)
		VALUES ($1, 'sending', now(), now() + make_interval(secs => $2), 1)
		ON CONFLICT (week_key) DO UPDATE
		   SET claimed_at = now(),
		       lease_until = now() + make_interval(secs => $2),
		       attempts = error_digest_runs.attempts + 1
		 WHERE error_digest_runs.status = 'sending' AND error_digest_runs.lease_until < now()
		RETURNING week_key
	`, weekKey, lease.Seconds()).Scan(&claimed)
	if err == nil {
		return Claimed, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Busy, fmt.Errorf("claiming the digest week: %w", err)
	}

	// It was not ours: say whether it is finished or someone is working on it.
	var status string
	if err := r.pool.QueryRow(ctx, `SELECT status FROM error_digest_runs WHERE week_key = $1`, weekKey).Scan(&status); err != nil {
		return Busy, fmt.Errorf("reading the digest week: %w", err)
	}
	if status == "sending" {
		return Busy, nil
	}
	return Done, nil
}

// MarkSent records that the week's e-mail went out. Only a week still 'sending' changes: a finished one never goes back.
func (r *Repository) MarkSent(ctx context.Context, weekKey string) error {
	if _, err := r.pool.Exec(ctx, `
		UPDATE error_digest_runs SET status = 'sent', sent_at = now() WHERE week_key = $1 AND status = 'sending'
	`, weekKey); err != nil {
		return fmt.Errorf("marking the digest week as sent: %w", err)
	}
	return nil
}

// MarkFailed records that the week could not be sent and is given up on: it is not claimed again, and the next digest, which
// covers the last 7 days, takes over.
func (r *Repository) MarkFailed(ctx context.Context, weekKey string) error {
	if _, err := r.pool.Exec(ctx, `
		UPDATE error_digest_runs SET status = 'failed', failed_at = now() WHERE week_key = $1 AND status = 'sending'
	`, weekKey); err != nil {
		return fmt.Errorf("marking the digest week as failed: %w", err)
	}
	return nil
}
