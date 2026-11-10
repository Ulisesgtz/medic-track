package childprofile

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/growth"
)

// Repository runs the correction's SQL. Inside the transaction only the transaction is used (never the pool): a request that
// holds a connection and asks for a second one can starve the pool when several arrive at once (the lesson of specs/045).
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a Repository.
func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

// Saved is the child after the correction, with the plan of its family (for the API's shape).
type Saved struct {
	Child account.Child
	Plan  account.Plan
}

// Update corrects the child in one transaction with its row locked FOR UPDATE: the plan when the identity changes
// (ErrPlanRequired, nothing written), a new birth date against the measurements and vaccinations already written down
// (*ConflictError, nothing written), the child — stamped with who corrected it only when something changed — and, when asked,
// the growth measurement (growth.ErrLimit past the cap, nothing written). The writes of measurements and vaccinations lock the
// same row FOR SHARE, so none of them can slip before the new birth date meanwhile.
func (r *Repository) Update(ctx context.Context, childID, actor uuid.UUID, c Cleaned) (*Saved, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var cur current
	err = tx.QueryRow(ctx, `
		SELECT c.account_id, c.first_name, c.last_name, c.birth_date, c.height::float8, c.weight::float8, a.plan = 'paid'
		FROM children c JOIN accounts a ON a.id = c.account_id
		WHERE c.id = $1
		FOR UPDATE OF c`, childID).Scan(&cur.accountID, &cur.firstName, &cur.lastName, &cur.birthDate, &cur.height, &cur.weight, &cur.paid)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("locking the child: %w", err)
	}

	// The signup never trimmed the names: «Mateo » saved and «Mateo» sent are the same name, kept as it was.
	if strings.TrimSpace(cur.firstName) == c.FirstName {
		c.FirstName = cur.firstName
	}
	if strings.TrimSpace(cur.lastName) == c.LastName {
		c.LastName = cur.lastName
	}
	if identityChanged(cur, c) && !cur.paid {
		return nil, ErrPlanRequired
	}
	if c.BirthDate.After(cur.birthDate) {
		if err := conflicts(ctx, tx, childID, c); err != nil {
			return nil, err
		}
	}
	if anythingChanged(cur, c) {
		_, err := tx.Exec(ctx, `
			UPDATE children
			SET first_name = $2, last_name = $3, birth_date = $4, height = $5, weight = $6,
			    corrected_by_account_id = $7, corrected_at = now()
			WHERE id = $1`,
			childID, c.FirstName, c.LastName, c.BirthDate, c.Height, c.Weight, actor)
		if err != nil {
			return nil, fmt.Errorf("correcting the child: %w", err)
		}
	}
	if c.Measurement != nil {
		if _, err := growth.InsertInTx(ctx, tx, childID, cur.accountID, actor, *c.Measurement); err != nil {
			return nil, err
		}
	}

	saved := Saved{Child: account.Child{ID: childID, AccountID: cur.accountID}, Plan: account.PlanFree}
	if cur.paid {
		saved.Plan = account.PlanPaid
	}
	err = tx.QueryRow(ctx, `
		SELECT first_name, last_name, birth_date, height, weight, created_at, corrected_at,
		       (SELECT first_name FROM accounts WHERE id = corrected_by_account_id)
		FROM children WHERE id = $1`, childID).Scan(&saved.Child.FirstName, &saved.Child.LastName, &saved.Child.BirthDate,
		&saved.Child.Height, &saved.Child.Weight, &saved.Child.CreatedAt, &saved.Child.CorrectedAt, &saved.Child.CorrectedBy)
	if err != nil {
		return nil, fmt.Errorf("reading the child: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing the correction: %w", err)
	}
	return &saved, nil
}

// conflicts finds the measurements and vaccinations dated before the new birth date. *ConflictError if there is any.
func conflicts(ctx context.Context, tx pgx.Tx, childID uuid.UUID, c Cleaned) error {
	var conflict ConflictError
	for _, q := range []struct {
		sql   string
		count *int
		dates *[]string
	}{
		{`SELECT to_char(measured_on, 'YYYY-MM-DD'), count(*) OVER () FROM growth_measurements
		  WHERE child_id = $1 AND measured_on < $2 ORDER BY measured_on, created_at LIMIT $3`, &conflict.MeasurementCount, &conflict.Measurements},
		{`SELECT to_char(applied_on, 'YYYY-MM-DD'), count(*) OVER () FROM vaccine_records
		  WHERE child_id = $1 AND applied_on < $2 ORDER BY applied_on, created_at LIMIT $3`, &conflict.VaccinationCount, &conflict.Vaccinations},
	} {
		rows, err := tx.Query(ctx, q.sql, childID, c.BirthDate, MaxConflictDates)
		if err != nil {
			return fmt.Errorf("looking for records before the birth: %w", err)
		}
		*q.dates = []string{}
		for rows.Next() {
			var day string
			if err := rows.Scan(&day, q.count); err != nil {
				rows.Close()
				return fmt.Errorf("scanning a record before the birth: %w", err)
			}
			*q.dates = append(*q.dates, day)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return fmt.Errorf("iterating the records before the birth: %w", err)
		}
	}
	if conflict.MeasurementCount+conflict.VaccinationCount > 0 {
		return &conflict
	}
	return nil
}
