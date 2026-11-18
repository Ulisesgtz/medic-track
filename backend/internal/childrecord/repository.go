package childrecord

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository runs the sheet's SQL. Inside the transaction only the transaction is used (never the pool).
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a Repository.
func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

// querier is a pool or a transaction.
type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// Get reads the sheet of a child: an empty one (Exists false, Version 0) when it has none.
func (r *Repository) Get(ctx context.Context, childID uuid.UUID) (*Record, error) {
	return read(ctx, r.pool, childID)
}

func read(ctx context.Context, q querier, childID uuid.UUID) (*Record, error) {
	rec := &Record{Content: Content{Allergies: []Allergy{}, Conditions: []Condition{}}}
	var name, phone, office *string
	err := q.QueryRow(ctx, `
		SELECT r.version, r.blood_type, r.general_note, r.pediatrician_name, r.pediatrician_phone, r.pediatrician_office,
		       r.updated_at, (SELECT a.first_name FROM accounts a WHERE a.id = r.updated_by_account_id)
		FROM child_records r WHERE r.child_id = $1`, childID).Scan(
		&rec.Version, &rec.BloodType, &rec.GeneralNote, &name, &phone, &office, &rec.UpdatedAt, &rec.UpdatedBy)
	if errors.Is(err, pgx.ErrNoRows) {
		return rec, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading the record: %w", err)
	}
	rec.Exists = true
	if name != nil || phone != nil || office != nil {
		rec.Pediatrician = &Pediatrician{Name: name, Phone: phone, Office: office}
	}

	rows, err := q.Query(ctx, `SELECT name, kind, note FROM child_record_allergies WHERE child_id = $1 ORDER BY position`, childID)
	if err != nil {
		return nil, fmt.Errorf("reading the allergies: %w", err)
	}
	for rows.Next() {
		var a Allergy
		if err := rows.Scan(&a.Name, &a.Kind, &a.Note); err != nil {
			rows.Close()
			return nil, fmt.Errorf("reading an allergy: %w", err)
		}
		rec.Allergies = append(rec.Allergies, a)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("reading the allergies: %w", err)
	}

	rows, err = q.Query(ctx, `SELECT name, note FROM child_record_conditions WHERE child_id = $1 ORDER BY position`, childID)
	if err != nil {
		return nil, fmt.Errorf("reading the conditions: %w", err)
	}
	for rows.Next() {
		var c Condition
		if err := rows.Scan(&c.Name, &c.Note); err != nil {
			rows.Close()
			return nil, fmt.Errorf("reading a condition: %w", err)
		}
		rec.Conditions = append(rec.Conditions, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("reading the conditions: %w", err)
	}
	return rec, nil
}

// Save replaces the whole sheet in one transaction with the child's row locked FOR UPDATE: a stored version other than
// expected is a *ConflictError (nothing written); the same content is returned as it is stored, without writing (version,
// author and date stay); otherwise the sheet is written with the next version. A sheet that never existed is never created
// empty. The content must already be cleaned (Validate).
func (r *Repository) Save(ctx context.Context, childID, actor uuid.UUID, c Content, expected int) (*Record, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var accountID uuid.UUID
	err = tx.QueryRow(ctx, `SELECT account_id FROM children WHERE id = $1 FOR UPDATE`, childID).Scan(&accountID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("locking the child: %w", err)
	}
	cur, err := read(ctx, tx, childID)
	if err != nil {
		return nil, err
	}
	if cur.Version != expected {
		return nil, &ConflictError{Current: cur}
	}
	if Equal(cur.Content, c) {
		return cur, nil
	}

	var name, phone, office *string
	if p := c.Pediatrician; p != nil {
		name, phone, office = p.Name, p.Phone, p.Office
	}
	if cur.Exists {
		_, err = tx.Exec(ctx, `
			UPDATE child_records SET blood_type = $2, general_note = $3, pediatrician_name = $4, pediatrician_phone = $5,
			       pediatrician_office = $6, version = version + 1, updated_at = now(), updated_by_account_id = $7
			WHERE child_id = $1`, childID, c.BloodType, c.GeneralNote, name, phone, office, actor)
		if err == nil {
			_, err = tx.Exec(ctx, `DELETE FROM child_record_allergies WHERE child_id = $1`, childID)
		}
		if err == nil {
			_, err = tx.Exec(ctx, `DELETE FROM child_record_conditions WHERE child_id = $1`, childID)
		}
	} else {
		_, err = tx.Exec(ctx, `
			INSERT INTO child_records (child_id, account_id, blood_type, general_note, pediatrician_name, pediatrician_phone,
			       pediatrician_office, version, updated_at, updated_by_account_id)
			VALUES ($1, $2, $3, $4, $5, $6, $7, 1, now(), $8)`, childID, accountID, c.BloodType, c.GeneralNote, name, phone, office, actor)
	}
	if err != nil {
		return nil, fmt.Errorf("writing the record: %w", err)
	}
	for i, a := range c.Allergies {
		if _, err := tx.Exec(ctx, `INSERT INTO child_record_allergies (child_id, account_id, position, name, kind, note)
			VALUES ($1, $2, $3, $4, $5, $6)`, childID, accountID, i, a.Name, a.Kind, a.Note); err != nil {
			return nil, fmt.Errorf("writing an allergy: %w", err)
		}
	}
	for i, cd := range c.Conditions {
		if _, err := tx.Exec(ctx, `INSERT INTO child_record_conditions (child_id, account_id, position, name, note)
			VALUES ($1, $2, $3, $4, $5)`, childID, accountID, i, cd.Name, cd.Note); err != nil {
			return nil, fmt.Errorf("writing a condition: %w", err)
		}
	}
	saved, err := read(ctx, tx, childID)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing the record: %w", err)
	}
	return saved, nil
}
