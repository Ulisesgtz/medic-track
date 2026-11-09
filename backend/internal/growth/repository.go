package growth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository runs the growth record's SQL. Inside a transaction only the transaction is used (never the pool): a request that holds
// a connection and asks for a second one can starve the pool when several arrive at once (the lesson of specs/045).
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a Repository backed by the given pool.
func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

// measurementSelect reads a measurement with the first names of who wrote it down and who corrected it. The e-mail is never read.
const measurementSelect = `
	SELECT m.id, m.child_id, to_char(m.measured_on, 'YYYY-MM-DD'), m.weight_kg::float8, m.height_cm::float8, m.note,
	       cb.first_name, m.created_at, kb.first_name, m.corrected_at
	FROM growth_measurements m
	JOIN accounts cb ON cb.id = m.created_by_account_id
	LEFT JOIN accounts kb ON kb.id = m.corrected_by_account_id`

func scanMeasurement(row pgx.Row) (Measurement, error) {
	var m Measurement
	err := row.Scan(&m.ID, &m.ChildID, &m.MeasuredOn, &m.WeightKg, &m.HeightCm, &m.Note, &m.CreatedByName, &m.CreatedAt,
		&m.CorrectedByName, &m.CorrectedAt)
	return m, err
}

// Child is what the record needs of the child: birth date, the owner's plan, the chosen WHO table and the signup's weight and
// height. ErrChildNotFound if there is no such child.
func (r *Repository) Child(ctx context.Context, childID uuid.UUID) (Child, error) {
	var c Child
	var sex *string
	err := r.pool.QueryRow(ctx, `
		SELECT c.birth_date, a.plan = 'paid', c.growth_reference_sex, c.weight::float8, c.height::float8
		FROM children c JOIN accounts a ON a.id = c.account_id
		WHERE c.id = $1`, childID).Scan(&c.BirthDate, &c.Paid, &sex, &c.WeightKg, &c.HeightCm)
	if errors.Is(err, pgx.ErrNoRows) {
		return Child{}, ErrChildNotFound
	}
	if err != nil {
		return Child{}, fmt.Errorf("reading the child: %w", err)
	}
	if sex != nil {
		s := Sex(*sex)
		c.Sex = &s
	}
	return c, nil
}

// List is the child's measurements, the most recent first.
func (r *Repository) List(ctx context.Context, childID uuid.UUID) ([]Measurement, error) {
	rows, err := r.pool.Query(ctx, measurementSelect+` WHERE m.child_id = $1 ORDER BY m.measured_on DESC, m.created_at DESC, m.id`, childID)
	if err != nil {
		return nil, fmt.Errorf("listing the measurements: %w", err)
	}
	defer rows.Close()
	out := []Measurement{}
	for rows.Next() {
		m, err := scanMeasurement(rows)
		if err != nil {
			return nil, fmt.Errorf("scanning a measurement: %w", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// beforeBirth is the error of a measurement dated before the child's birth, the same one Validate gives. The repository checks it
// again with the child's row locked, because the birth date can be corrected (specs/064-editar-datos-hijo) between the validation
// and the write.
var beforeBirth = ValidationErrors{{Field: "measuredOn", Message: "La fecha no puede ser anterior al nacimiento."}}

// Create writes a measurement down in one transaction with the child's row locked, so simultaneous requests can't pass the cap of
// MaxPerChild together, and the date is checked against the birth date nobody can change meanwhile.
func (r *Repository) Create(ctx context.Context, childID, actor uuid.UUID, c Cleaned) (*Measurement, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var accountID uuid.UUID
	var birth time.Time
	if err := tx.QueryRow(ctx, `SELECT account_id, birth_date FROM children WHERE id = $1 FOR UPDATE`, childID).Scan(&accountID, &birth); errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrChildNotFound
	} else if err != nil {
		return nil, fmt.Errorf("locking the child: %w", err)
	}
	if c.MeasuredOn.Before(birth) {
		return nil, beforeBirth
	}
	m, err := InsertInTx(ctx, tx, childID, accountID, actor, c)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing the measurement: %w", err)
	}
	return m, nil
}

// InsertInTx writes a measurement down inside tx, whose caller already locked the child's row FOR UPDATE and checked the date
// against the birth: it counts against MaxPerChild (ErrLimit) and inserts. Also used by the correction of the child's data
// (specs/064-editar-datos-hijo), to write its measurement in the same transaction.
func InsertInTx(ctx context.Context, tx pgx.Tx, childID, accountID, actor uuid.UUID, c Cleaned) (*Measurement, error) {
	var count int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM growth_measurements WHERE child_id = $1`, childID).Scan(&count); err != nil {
		return nil, fmt.Errorf("counting the measurements: %w", err)
	}
	if count >= MaxPerChild {
		return nil, ErrLimit
	}
	var id uuid.UUID
	err := tx.QueryRow(ctx, `
		INSERT INTO growth_measurements (child_id, account_id, measured_on, weight_kg, height_cm, note, created_by_account_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		childID, accountID, c.MeasuredOn, c.WeightKg, c.HeightCm, c.Note, actor).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("writing the measurement: %w", err)
	}
	m, err := scanMeasurement(tx.QueryRow(ctx, measurementSelect+` WHERE m.id = $1`, id))
	if err != nil {
		return nil, fmt.Errorf("reading the measurement: %w", err)
	}
	return &m, nil
}

// Update corrects a measurement of the child (all of it is replaced) and stamps who corrected it and when, with the child's row
// locked FOR SHARE so its birth date can't change between the check and the write.
func (r *Repository) Update(ctx context.Context, childID, id, actor uuid.UUID, c Cleaned) (*Measurement, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var birth time.Time
	if err := tx.QueryRow(ctx, `SELECT birth_date FROM children WHERE id = $1 FOR SHARE`, childID).Scan(&birth); errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	} else if err != nil {
		return nil, fmt.Errorf("locking the child: %w", err)
	}
	if c.MeasuredOn.Before(birth) {
		return nil, beforeBirth
	}
	m, err := scanMeasurement(tx.QueryRow(ctx, `
		WITH updated AS (
			UPDATE growth_measurements
			SET measured_on = $3, weight_kg = $4, height_cm = $5, note = $6, corrected_by_account_id = $7, corrected_at = now()
			WHERE id = $1 AND child_id = $2
			RETURNING *
		)
		SELECT m.id, m.child_id, to_char(m.measured_on, 'YYYY-MM-DD'), m.weight_kg::float8, m.height_cm::float8, m.note,
		       cb.first_name, m.created_at, kb.first_name, m.corrected_at
		FROM updated m
		JOIN accounts cb ON cb.id = m.created_by_account_id
		LEFT JOIN accounts kb ON kb.id = m.corrected_by_account_id`,
		id, childID, c.MeasuredOn, c.WeightKg, c.HeightCm, c.Note, actor))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("correcting the measurement: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing the correction: %w", err)
	}
	return &m, nil
}

// Delete removes a measurement of the child for good (no trash, no undo).
func (r *Repository) Delete(ctx context.Context, childID, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM growth_measurements WHERE id = $1 AND child_id = $2`, id, childID)
	if err != nil {
		return fmt.Errorf("deleting the measurement: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetSex saves which WHO table the child's chart uses. ErrChildNotFound if there is no such child.
func (r *Repository) SetSex(ctx context.Context, childID uuid.UUID, sex Sex) error {
	tag, err := r.pool.Exec(ctx, `UPDATE children SET growth_reference_sex = $2 WHERE id = $1`, childID, string(sex))
	if err != nil {
		return fmt.Errorf("saving the WHO table: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrChildNotFound
	}
	return nil
}
