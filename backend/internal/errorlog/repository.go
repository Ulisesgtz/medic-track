package errorlog

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository persists Entry records.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates an errorlog Repository backed by the given pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// Create persists a single error log entry.
func (r *Repository) Create(ctx context.Context, e *Entry) error {
	err := r.pool.QueryRow(ctx, `
		INSERT INTO error_logs (message, http_status, endpoint, file, line, account_id)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at
	`, e.Message, e.HTTPStatus, e.Endpoint, e.File, e.Line, e.AccountID,
	).Scan(&e.ID, &e.CreatedAt)
	if err != nil {
		return fmt.Errorf("inserting error log entry: %w", err)
	}
	return nil
}
