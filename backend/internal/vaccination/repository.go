package vaccination

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository runs the vaccination card's SQL. Inside a transaction only the transaction is used (never the pool): a request that
// holds a connection and asks for a second one can starve the pool when several arrive at once (the lesson of specs/045).
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a Repository backed by the given pool.
func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

// recordSelect reads a dose with the catalog's name (or the parent's own) and the first names of who recorded and corrected it. The
// e-mail is never read.
const recordSelect = `
	SELECT r.id, r.child_id, r.vaccine_code, COALESCE(c.name, r.custom_name), r.custom_name, to_char(r.applied_on, 'YYYY-MM-DD'),
	       r.dose_number, r.lot, r.place, r.notes, cb.first_name, r.created_at, kb.first_name, r.corrected_at
	FROM vaccine_records r
	LEFT JOIN vaccine_catalog c ON c.code = r.vaccine_code
	JOIN accounts cb ON cb.id = r.created_by_account_id
	LEFT JOIN accounts kb ON kb.id = r.corrected_by_account_id`

func scanVaccination(row pgx.Row) (Vaccination, error) {
	var v Vaccination
	err := row.Scan(&v.ID, &v.ChildID, &v.VaccineCode, &v.Name, &v.CustomName, &v.AppliedOn, &v.DoseNumber, &v.Lot, &v.Place, &v.Notes,
		&v.CreatedByName, &v.CreatedAt, &v.CorrectedByName, &v.CorrectedAt)
	return v, err
}

// ChildBirthDate is the child's birth date, to validate a dose's date. ErrChildNotFound if there is no such child.
func (r *Repository) ChildBirthDate(ctx context.Context, childID uuid.UUID) (time.Time, error) {
	var birth time.Time
	err := r.pool.QueryRow(ctx, `SELECT birth_date FROM children WHERE id = $1`, childID).Scan(&birth)
	if errors.Is(err, pgx.ErrNoRows) {
		return time.Time{}, ErrChildNotFound
	}
	if err != nil {
		return time.Time{}, fmt.Errorf("reading the child's birth date: %w", err)
	}
	return birth, nil
}

// List is the child's doses, the most recent first.
func (r *Repository) List(ctx context.Context, childID uuid.UUID) ([]Vaccination, error) {
	rows, err := r.pool.Query(ctx, recordSelect+` WHERE r.child_id = $1 ORDER BY r.applied_on DESC, r.created_at DESC, r.id`, childID)
	if err != nil {
		return nil, fmt.Errorf("listing the doses: %w", err)
	}
	defer rows.Close()
	out := []Vaccination{}
	for rows.Next() {
		v, err := scanVaccination(rows)
		if err != nil {
			return nil, fmt.Errorf("scanning a dose: %w", err)
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// Create records a dose in one transaction: the vaccine must be in the catalog and active (when it has a code), and a dose that
// matches one already recorded is ErrDuplicate unless the parent confirmed it.
func (r *Repository) Create(ctx context.Context, childID, actor uuid.UUID, c Cleaned, allowDuplicate bool) (*Vaccination, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var accountID uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT account_id FROM children WHERE id = $1`, childID).Scan(&accountID); errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrChildNotFound
	} else if err != nil {
		return nil, fmt.Errorf("reading the child: %w", err)
	}
	if c.VaccineCode != nil {
		if err := checkCatalog(ctx, tx, *c.VaccineCode); err != nil {
			return nil, err
		}
	}
	if !allowDuplicate {
		if err := checkDuplicate(ctx, tx, childID, uuid.Nil, c); err != nil {
			return nil, err
		}
	}
	var id uuid.UUID
	err = tx.QueryRow(ctx, `
		INSERT INTO vaccine_records (child_id, account_id, vaccine_code, custom_name, applied_on, dose_number, lot, place, notes, created_by_account_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
		childID, accountID, c.VaccineCode, c.CustomName, c.AppliedOn, c.DoseNumber, c.Lot, c.Place, c.Notes, actor).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("recording the dose: %w", err)
	}
	v, err := scanVaccination(tx.QueryRow(ctx, recordSelect+` WHERE r.id = $1`, id))
	if err != nil {
		return nil, fmt.Errorf("reading the dose: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing the dose: %w", err)
	}
	return &v, nil
}

// Update corrects a dose of the child (the whole record is replaced) and stamps who corrected it and when. The vaccine of the
// catalog is only checked when it changes: a dose recorded with a vaccine that was retired since can still be corrected.
func (r *Repository) Update(ctx context.Context, childID, id, actor uuid.UUID, c Cleaned, allowDuplicate bool) (*Vaccination, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var current *string
	if err := tx.QueryRow(ctx, `SELECT vaccine_code FROM vaccine_records WHERE id = $1 AND child_id = $2 FOR UPDATE`, id, childID).Scan(&current); errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	} else if err != nil {
		return nil, fmt.Errorf("locking the dose: %w", err)
	}
	if c.VaccineCode != nil && (current == nil || *current != *c.VaccineCode) {
		if err := checkCatalog(ctx, tx, *c.VaccineCode); err != nil {
			return nil, err
		}
	}
	if !allowDuplicate {
		if err := checkDuplicate(ctx, tx, childID, id, c); err != nil {
			return nil, err
		}
	}
	_, err = tx.Exec(ctx, `
		UPDATE vaccine_records
		SET vaccine_code = $3, custom_name = $4, applied_on = $5, dose_number = $6, lot = $7, place = $8, notes = $9,
		    corrected_by_account_id = $10, corrected_at = now()
		WHERE id = $1 AND child_id = $2`,
		id, childID, c.VaccineCode, c.CustomName, c.AppliedOn, c.DoseNumber, c.Lot, c.Place, c.Notes, actor)
	if err != nil {
		return nil, fmt.Errorf("correcting the dose: %w", err)
	}
	v, err := scanVaccination(tx.QueryRow(ctx, recordSelect+` WHERE r.id = $1`, id))
	if err != nil {
		return nil, fmt.Errorf("reading the dose: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing the correction: %w", err)
	}
	return &v, nil
}

// Delete removes a dose of the child for good (no trash, no undo).
func (r *Repository) Delete(ctx context.Context, childID, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM vaccine_records WHERE id = $1 AND child_id = $2`, id, childID)
	if err != nil {
		return fmt.Errorf("deleting the dose: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// checkCatalog is ValidationErrors{vaccine} unless the code is an active vaccine of the catalog.
func checkCatalog(ctx context.Context, tx pgx.Tx, code string) error {
	var active bool
	err := tx.QueryRow(ctx, `SELECT active FROM vaccine_catalog WHERE code = $1`, code).Scan(&active)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !active) {
		return ValidationErrors{{Field: "vaccine", Message: "Esa vacuna ya no está en la lista. Elige otra o escríbela."}}
	}
	if err != nil {
		return fmt.Errorf("reading the catalog: %w", err)
	}
	return nil
}

// checkDuplicate is ErrDuplicate when the child already has a dose of the same vaccine (same code, or the same own name without
// regard to case or accents), the same dose number and the same date. `except` is the dose being corrected, if any.
func checkDuplicate(ctx context.Context, tx pgx.Tx, childID, except uuid.UUID, c Cleaned) error {
	rows, err := tx.Query(ctx, `
		SELECT vaccine_code, custom_name FROM vaccine_records
		WHERE child_id = $1 AND applied_on = $2 AND dose_number IS NOT DISTINCT FROM $3 AND id <> $4`,
		childID, c.AppliedOn, c.DoseNumber, except)
	if err != nil {
		return fmt.Errorf("looking for the same dose: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var code, name *string
		if err := rows.Scan(&code, &name); err != nil {
			return fmt.Errorf("scanning a dose: %w", err)
		}
		switch {
		case c.VaccineCode != nil && code != nil && *c.VaccineCode == *code:
			return ErrDuplicate
		case c.CustomName != nil && name != nil && fold(*c.CustomName) == fold(*name):
			return ErrDuplicate
		}
	}
	return rows.Err()
}
