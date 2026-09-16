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
		return mapInsertError(err, "inserting account")
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
			return mapInsertError(err, "inserting child")
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing transaction: %w", err)
	}
	return nil
}

// mapInsertError translates Postgres constraint-violation error codes into
// domain errors the handler knows how to turn into a proper 4xx response,
// instead of letting them fall through to a generic wrapped error (which the
// handler maps to an opaque 500).
func mapInsertError(err error, context string) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505": // unique_violation
			return ErrEmailAlreadyExists
		case "23514": // check_violation — e.g. the name-format/length CHECK constraints
			return ErrInvalidNameFormat
		}
	}
	return fmt.Errorf("%s: %w", context, err)
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
