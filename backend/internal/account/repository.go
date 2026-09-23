package account

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
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
		INSERT INTO accounts (first_name, last_name, email, country_code, state_code, plan, clerk_user_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at
	`, acc.FirstName, acc.LastName, acc.Email, acc.CountryCode, acc.StateCode, acc.Plan, acc.ClerkUserID,
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
			// Two different UNIQUE constraints can fire this code on `accounts`
			// (email, clerk_user_id). A clerk_user_id collision means two
			// near-simultaneous requests for the same brand-new session both
			// passed CreateAccount's own GetByClerkUserID check: reported as
			// its own error (never as a duplicate email) so the service can
			// answer with the account the other request created.
			if strings.Contains(pgErr.ConstraintName, "clerk_user_id") {
				return ErrClerkUserAlreadyLinked
			}
			return ErrEmailAlreadyExists
		case "23514": // check_violation — e.g. the name-format/length CHECK constraints
			return ErrInvalidNameFormat
		}
	}
	return fmt.Errorf("%s: %w", context, err)
}

// GetByID retrieves an account and its children (ordered by creation, oldest
// first — spec.md's "mismo orden en que fueron dados de alta") by id. It
// returns ErrAccountNotFound if no account exists for that id
// (specs/003-home-listado-hijos FR-002).
func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*Account, error) {
	acc := &Account{ID: id}
	err := r.pool.QueryRow(ctx, `
		SELECT first_name, last_name, email, country_code, state_code, plan, created_at, clerk_user_id
		FROM accounts WHERE id = $1
	`, id).Scan(&acc.FirstName, &acc.LastName, &acc.Email, &acc.CountryCode, &acc.StateCode, &acc.Plan, &acc.CreatedAt, &acc.ClerkUserID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAccountNotFound
		}
		return nil, fmt.Errorf("querying account: %w", err)
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, first_name, last_name, birth_date, height, weight, created_at
		FROM children WHERE account_id = $1 ORDER BY created_at ASC
	`, id)
	if err != nil {
		return nil, fmt.Errorf("querying children: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		child := Child{AccountID: id}
		if err := rows.Scan(&child.ID, &child.FirstName, &child.LastName, &child.BirthDate, &child.Height, &child.Weight, &child.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning child: %w", err)
		}
		acc.Children = append(acc.Children, child)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating children: %w", err)
	}

	return acc, nil
}

// AddChildIfUnderLimit atomically checks the account's current child count
// against limit and inserts input as a new child only if it's still under
// that limit — all inside one transaction that locks the account row with
// `FOR UPDATE`, so two concurrent calls for the same account can't both read
// "under the limit" and both insert (the TOCTOU race a separate
// count-then-insert would have). Returns ErrAccountNotFound if the account
// doesn't exist, or a *FreemiumLimitError if the account is already at
// limit.
func (r *Repository) AddChildIfUnderLimit(ctx context.Context, accountID uuid.UUID, input CreateChildInput, limit int) (*Account, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback is a no-op after a successful commit

	acc := &Account{ID: accountID}
	err = tx.QueryRow(ctx, `
		SELECT first_name, last_name, email, country_code, state_code, plan, created_at, clerk_user_id
		FROM accounts WHERE id = $1
		FOR UPDATE
	`, accountID).Scan(&acc.FirstName, &acc.LastName, &acc.Email, &acc.CountryCode, &acc.StateCode, &acc.Plan, &acc.CreatedAt, &acc.ClerkUserID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAccountNotFound
		}
		return nil, fmt.Errorf("querying account: %w", err)
	}

	rows, err := tx.Query(ctx, `
		SELECT id, first_name, last_name, birth_date, height, weight, created_at
		FROM children WHERE account_id = $1 ORDER BY created_at ASC
	`, accountID)
	if err != nil {
		return nil, fmt.Errorf("querying children: %w", err)
	}
	for rows.Next() {
		child := Child{AccountID: accountID}
		if err := rows.Scan(&child.ID, &child.FirstName, &child.LastName, &child.BirthDate, &child.Height, &child.Weight, &child.CreatedAt); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scanning child: %w", err)
		}
		acc.Children = append(acc.Children, child)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, fmt.Errorf("iterating children: %w", err)
	}
	rows.Close()

	if len(acc.Children) >= limit {
		return nil, &FreemiumLimitError{Limit: limit, Received: len(acc.Children) + 1}
	}

	child := Child{
		AccountID: accountID,
		FirstName: input.FirstName,
		LastName:  input.LastName,
		BirthDate: input.BirthDate,
		Height:    input.Height,
		Weight:    input.Weight,
	}
	err = tx.QueryRow(ctx, `
		INSERT INTO children (account_id, first_name, last_name, birth_date, height, weight)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at
	`, child.AccountID, child.FirstName, child.LastName, child.BirthDate, child.Height, child.Weight,
	).Scan(&child.ID, &child.CreatedAt)
	if err != nil {
		return nil, mapInsertError(err, "inserting child")
	}
	acc.Children = append(acc.Children, child)

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing transaction: %w", err)
	}
	return acc, nil
}

// GetByClerkUserID retrieves an account and its children by the Clerk user id
// it is linked to. Returns ErrAccountNotFound if no account has that
// clerk_user_id — the caller (Service.GetAccountByClerkUserID) is
// responsible for the email-based linking fallback (specs/008-autenticacion-cuenta,
// Historia 5), this method only ever looks at the direct link.
func (r *Repository) GetByClerkUserID(ctx context.Context, clerkUserID string) (*Account, error) {
	var id uuid.UUID
	acc := &Account{}
	err := r.pool.QueryRow(ctx, `
		SELECT id, first_name, last_name, email, country_code, state_code, plan, created_at, clerk_user_id
		FROM accounts WHERE clerk_user_id = $1
	`, clerkUserID).Scan(&id, &acc.FirstName, &acc.LastName, &acc.Email, &acc.CountryCode, &acc.StateCode, &acc.Plan, &acc.CreatedAt, &acc.ClerkUserID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAccountNotFound
		}
		return nil, fmt.Errorf("querying account by clerk_user_id: %w", err)
	}
	acc.ID = id

	rows, err := r.pool.Query(ctx, `
		SELECT id, first_name, last_name, birth_date, height, weight, created_at
		FROM children WHERE account_id = $1 ORDER BY created_at ASC
	`, id)
	if err != nil {
		return nil, fmt.Errorf("querying children: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		child := Child{AccountID: id}
		if err := rows.Scan(&child.ID, &child.FirstName, &child.LastName, &child.BirthDate, &child.Height, &child.Weight, &child.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning child: %w", err)
		}
		acc.Children = append(acc.Children, child)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating children: %w", err)
	}

	return acc, nil
}

// LinkByEmail links the oldest account that has no Clerk user yet and whose
// email matches (case-insensitively) to clerkUserID, for accounts created
// before authentication existed (specs/008-autenticacion-cuenta, Historia 5).
// It returns ErrAccountNotFound when there is nothing to link. The caller
// must only pass an email Clerk has verified: whoever controls that email
// takes over the account. A single UPDATE (row locked by the subselect) so two
// concurrent first-logins can't both claim the same account.
func (r *Repository) LinkByEmail(ctx context.Context, clerkUserID, email string) (*Account, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE accounts SET clerk_user_id = $1
		WHERE id = (
			SELECT id FROM accounts
			WHERE clerk_user_id IS NULL AND lower(email) = lower($2)
			ORDER BY created_at ASC LIMIT 1
			FOR UPDATE
		)
	`, clerkUserID, email)
	if err != nil {
		return nil, mapInsertError(err, "linking account by email")
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrAccountNotFound
	}
	return r.GetByClerkUserID(ctx, clerkUserID)
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
