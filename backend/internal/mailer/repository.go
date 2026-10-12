package mailer

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository is the Store over mail_daily_counts (migration 0025). It keeps how many e-mails went out each day and whether the
// day was already warned about: no address, link or text, ever.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a Repository.
func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

// Reserve takes one place of the day in a single statement, so copies of the API that ask at once share the cap and can't pass
// it. ok is false when the day already has cap.
func (r *Repository) Reserve(ctx context.Context, day time.Time, cap int) (count int, ok bool, err error) {
	if cap < 1 {
		return 0, false, nil
	}
	err = r.pool.QueryRow(ctx, `
		INSERT INTO mail_daily_counts (day, sent) VALUES ($1, 1)
		ON CONFLICT (day) DO UPDATE SET sent = mail_daily_counts.sent + 1
		WHERE mail_daily_counts.sent < $2
		RETURNING sent
	`, day, cap).Scan(&count)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("reserving an e-mail of the day: %w", err)
	}
	return count, true, nil
}

// Release gives a place of the day back (the send failed for good). It never goes below zero.
func (r *Repository) Release(ctx context.Context, day time.Time) error {
	if _, err := r.pool.Exec(ctx, `UPDATE mail_daily_counts SET sent = sent - 1 WHERE day = $1 AND sent > 0`, day); err != nil {
		return fmt.Errorf("releasing an e-mail of the day: %w", err)
	}
	return nil
}

// MarkWarned says the day reached the threshold. first is true for exactly one caller per day.
func (r *Repository) MarkWarned(ctx context.Context, day time.Time, threshold int) (first bool, err error) {
	err = r.pool.QueryRow(ctx, `
		UPDATE mail_daily_counts SET warned = true WHERE day = $1 AND NOT warned AND sent >= $2 RETURNING true
	`, day, threshold).Scan(&first)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("marking the day as warned: %w", err)
	}
	return first, nil
}
