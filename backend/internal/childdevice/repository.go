package childdevice

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository runs the SQL of the device links. Inside a transaction only the transaction is used (never the pool): a request that
// holds a connection and asks for a second one can starve the pool when several arrive at once (the lesson of specs/045).
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a Repository backed by the given pool.
func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

// Authenticate finds the device behind a credential, asked of the database on EVERY request (nothing is cached, so removing a
// device or letting its credential lapse takes effect on the next call). The credential's hash must be the current one, or the
// previous one while it is still in its grace after a rotation; the link must be active and used in the last CredentialIdle.
// Anything else is ErrNotFound, the same whichever the reason. last_seen_at is only written if it is older than TouchEvery.
func (r *Repository) Authenticate(ctx context.Context, credentialHash []byte, now time.Time) (*Principal, error) {
	var p Principal
	var rotatedAt time.Time
	var lastSeen *time.Time
	err := r.pool.QueryRow(ctx, `
		SELECT l.id, l.child_id, l.account_id, c.first_name, l.name, l.reminder_detail, COALESCE(l.rotated_at, l.redeemed_at), l.last_seen_at
		FROM child_device_links l
		JOIN children c ON c.id = l.child_id
		WHERE l.status = 'active'
		  AND (l.credential_hash = $1
		       OR (l.credential_hash_previous = $1 AND l.rotated_at > $2::timestamptz - make_interval(secs => $3)))
		  AND COALESCE(l.last_seen_at, l.redeemed_at) > $2::timestamptz - make_interval(secs => $4)`,
		credentialHash, now, RotateGrace.Seconds(), CredentialIdle.Seconds(),
	).Scan(&p.LinkID, &p.ChildID, &p.OwnerAccountID, &p.ChildFirstName, &p.DeviceName, &p.ReminderDetail, &rotatedAt, &lastSeen)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("authenticating a child device: %w", err)
	}
	p.RotateAfter = rotatedAt.Add(RotateEvery)
	if lastSeen == nil || now.Sub(*lastSeen) > TouchEvery {
		// A failed touch must not fail the request: it only keeps «last used» a little stale.
		_, _ = r.pool.Exec(ctx, `UPDATE child_device_links SET last_seen_at = $2 WHERE id = $1`, p.LinkID, now)
	}
	return &p, nil
}

// RoutineOfChild reports whether the supplement routine or activity belongs to the child.
func (r *Repository) RoutineOfChild(ctx context.Context, routineID, childID uuid.UUID) (bool, error) {
	var ok bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM supplement_routines WHERE id = $1 AND child_id = $2)`, routineID, childID).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("checking the routine's child: %w", err)
	}
	return ok, nil
}

// ConsultationOfChild reports whether the consultation belongs to the child.
func (r *Repository) ConsultationOfChild(ctx context.Context, consultationID, childID uuid.UUID) (bool, error) {
	var ok bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM consultations WHERE id = $1 AND child_id = $2)`, consultationID, childID).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("checking the consultation's child: %w", err)
	}
	return ok, nil
}
