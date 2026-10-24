package childdevice

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Listed statuses: the stored ones plus «expired» (a link nobody opened in time, or a phone idle for longer than its credential lasts).
const (
	StatusExpired = "expired"
	// revokedShownFor is how long a removed phone still shows in the parent's list.
	revokedShownFor = 30 * 24 * time.Hour
)

// StatusAt is what the parent's list says of a link at `now`.
func (l Link) StatusAt(now time.Time) string {
	switch l.Status {
	case StatusPending:
		if !l.ExpiresAt.After(now) {
			return StatusExpired
		}
	case StatusActive:
		last := l.RedeemedAt
		if l.LastSeenAt != nil {
			last = l.LastSeenAt
		}
		if last != nil && !last.After(now.Add(-CredentialIdle)) {
			return StatusExpired
		}
	}
	return l.Status
}

// List is a child's phones and links, newest first: the pending, the active and the ones removed in the last 30 days. It never carries
// a hash or a secret.
func (r *Repository) List(ctx context.Context, childID uuid.UUID, now time.Time) ([]Link, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, child_id, name, status, created_at, redeemed_at, last_seen_at, expires_at, reminder_detail
		FROM child_device_links
		WHERE child_id = $1 AND (status <> 'revoked' OR revoked_at > $2::timestamptz - make_interval(secs => $3))
		ORDER BY created_at DESC, id`, childID, now, revokedShownFor.Seconds())
	if err != nil {
		return nil, fmt.Errorf("listing the child's phones: %w", err)
	}
	defer rows.Close()
	out := []Link{}
	for rows.Next() {
		var l Link
		if err := rows.Scan(&l.ID, &l.ChildID, &l.Name, &l.Status, &l.CreatedAt, &l.RedeemedAt, &l.LastSeenAt, &l.ExpiresAt, &l.ReminderDetail); err != nil {
			return nil, fmt.Errorf("scanning a phone: %w", err)
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// Revoke removes a phone (or cancels a link nobody opened) of the child, for good and at once: the next request with its credential
// is ErrNotFound. Its reminder devices are turned off in the same transaction. Idempotent; a link of another child is ErrNotFound.
func (r *Repository) Revoke(ctx context.Context, childID, linkID, actor uuid.UUID, now time.Time) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx, `
		UPDATE child_device_links
		SET status = 'revoked', token_hash = NULL, credential_hash = NULL, credential_hash_previous = NULL, revoked_at = $3, revoked_by_account_id = $4
		WHERE id = $1 AND child_id = $2 AND status <> 'revoked'`, linkID, childID, now, actor)
	if err != nil {
		return fmt.Errorf("removing the phone: %w", err)
	}
	if tag.RowsAffected() == 0 {
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM child_device_links WHERE id = $1 AND child_id = $2)`, linkID, childID).Scan(&exists); err != nil {
			return fmt.Errorf("checking the phone: %w", err)
		}
		if !exists {
			return ErrNotFound
		}
		return nil
	}
	if _, err := tx.Exec(ctx, `UPDATE reminder_devices SET active = false, deactivated_at = $2 WHERE child_link_id = $1 AND active`, linkID, now); err != nil {
		return fmt.Errorf("turning off the phone's reminders: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing the removal: %w", err)
	}
	return nil
}

// ErrInvalidDetail is a reminder detail that isn't «generic» or «detailed».
var ErrInvalidDetail = errors.New("invalid reminder detail")

// SetReminderDetail chooses what the reminders of a phone say: «generic» (no medication, no child) or «detailed». A removed phone or one
// of another child is ErrNotFound.
func (r *Repository) SetReminderDetail(ctx context.Context, childID, linkID uuid.UUID, detail string) (*Link, error) {
	if detail != "generic" && detail != "detailed" {
		return nil, ErrInvalidDetail
	}
	var l Link
	err := r.pool.QueryRow(ctx, `
		UPDATE child_device_links SET reminder_detail = $3
		WHERE id = $1 AND child_id = $2 AND status <> 'revoked'
		RETURNING id, child_id, name, status, created_at, redeemed_at, last_seen_at, expires_at, reminder_detail`, linkID, childID, detail,
	).Scan(&l.ID, &l.ChildID, &l.Name, &l.Status, &l.CreatedAt, &l.RedeemedAt, &l.LastSeenAt, &l.ExpiresAt, &l.ReminderDetail)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("choosing the reminder detail: %w", err)
	}
	return &l, nil
}

// Rotate gives the phone a new credential. The previous one keeps working for RotateGrace (two tabs, a retry after a lost answer) and
// then stops. Only the holder of a working credential gets here (the middleware). The new credential is returned once.
func (r *Repository) Rotate(ctx context.Context, linkID uuid.UUID, now time.Time) (credential string, rotateAfter time.Time, err error) {
	credential, hash, err := NewToken()
	if err != nil {
		return "", time.Time{}, err
	}
	tag, err := r.pool.Exec(ctx, `
		UPDATE child_device_links
		SET credential_hash_previous = credential_hash, credential_hash = $2, rotated_at = $3
		WHERE id = $1 AND status = 'active'`, linkID, hash, now)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("rotating the credential: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return "", time.Time{}, ErrNotFound
	}
	return credential, now.Add(RotateEvery), nil
}
