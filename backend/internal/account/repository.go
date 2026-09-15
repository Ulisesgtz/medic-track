package account

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository persists Account and Child records.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates an account Repository backed by the given pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// Create persists the account and, within the same transaction, any
// associated children (FR-010). It returns ErrEmailAlreadyExists if the
// email is already taken (FR-002).
func (r *Repository) Create(ctx context.Context, acc *Account) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback is a no-op after a successful commit

	err = tx.QueryRow(ctx, `
		INSERT INTO accounts (first_name, last_name, email, country_code, state_code, plan)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at
	`, acc.FirstName, acc.LastName, acc.Email, acc.CountryCode, acc.StateCode, acc.Plan,
	).Scan(&acc.ID, &acc.CreatedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrEmailAlreadyExists
		}
		return fmt.Errorf("inserting account: %w", err)
	}

	for i := range acc.Children {
		child := &acc.Children[i]
		child.AccountID = acc.ID
		err = tx.QueryRow(ctx, `
			INSERT INTO children (account_id, first_name, last_name, birth_date, height, weight)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id, created_at
		`, child.AccountID, child.FirstName, child.LastName, child.BirthDate, child.Height, child.Weight,
		).Scan(&child.ID, &child.CreatedAt)
		if err != nil {
			return fmt.Errorf("inserting child: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing transaction: %w", err)
	}
	return nil
}

// EmailExists reports whether an account with the given email already exists.
func (r *Repository) EmailExists(ctx context.Context, email string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM accounts WHERE email = $1)`, email).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("checking email existence: %w", err)
	}
	return exists, nil
}
