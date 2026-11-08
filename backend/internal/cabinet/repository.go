package cabinet

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository reads and writes the medicine cabinet. Inside a transaction every statement runs on the tx, never on the pool.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a cabinet Repository.
func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

// fold lower-cases a SQL text and drops its Spanish accents, so the list is alphabetical whatever was typed («Ácido» with the A).
// The upper-case ones are listed too because lower() depends on the database locale.
func fold(expr string) string {
	return "translate(lower(" + expr + "), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')"
}

const itemSelect = `
	SELECT i.id, i.name, i.strength, i.quantity, i.unit, i.expires_year, i.expires_month, i.expires_day, i.note,
	       i.photo IS NOT NULL, c.first_name, i.created_at, u.first_name, i.updated_at
	FROM medicine_cabinet_items i
	JOIN accounts c ON c.id = i.created_by_account_id
	LEFT JOIN accounts u ON u.id = i.updated_by_account_id`

func scan(row pgx.Row) (Item, error) {
	var it Item
	err := row.Scan(&it.ID, &it.Name, &it.Strength, &it.Quantity, &it.Unit, &it.Expires.Year, &it.Expires.Month, &it.Expires.Day,
		&it.Note, &it.HasPhoto, &it.CreatedBy, &it.CreatedAt, &it.UpdatedBy, &it.UpdatedAt)
	return it, err
}

// List is the family's cabinet, alphabetical by name — never by the expiry date.
func (r *Repository) List(ctx context.Context, accountID uuid.UUID) ([]Item, error) {
	rows, err := r.pool.Query(ctx, itemSelect+` WHERE i.account_id = $1 ORDER BY `+fold("i.name")+`, i.id`, accountID)
	if err != nil {
		return nil, fmt.Errorf("listing the cabinet: %w", err)
	}
	defer rows.Close()
	out := []Item{}
	for rows.Next() {
		it, err := scan(rows)
		if err != nil {
			return nil, fmt.Errorf("scanning a medicine: %w", err)
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// Get is one medicine of the family's cabinet (ErrItemNotFound for one of another family).
func (r *Repository) Get(ctx context.Context, accountID, itemID uuid.UUID) (Item, error) {
	it, err := scan(r.pool.QueryRow(ctx, itemSelect+` WHERE i.account_id = $1 AND i.id = $2`, accountID, itemID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Item{}, ErrItemNotFound
	}
	if err != nil {
		return Item{}, fmt.Errorf("reading a medicine: %w", err)
	}
	return it, nil
}

// PaidPlan says whether the family owner is on the paid plan (what adding asks).
func (r *Repository) PaidPlan(ctx context.Context, accountID uuid.UUID) (bool, error) {
	var paid bool
	err := r.pool.QueryRow(ctx, `SELECT plan = 'paid' FROM accounts WHERE id = $1`, accountID).Scan(&paid)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("reading the plan: %w", err)
	}
	return paid, nil
}

// Create adds a medicine. One transaction with the owner's account row locked, so two people adding at once are checked one
// after the other: the paid plan (ErrPlanRequired) and the cap (ErrLimit).
func (r *Repository) Create(ctx context.Context, accountID, actor uuid.UUID, in Input, photo []byte) (uuid.UUID, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, fmt.Errorf("starting the transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var plan string
	if err := tx.QueryRow(ctx, `SELECT plan FROM accounts WHERE id = $1 FOR UPDATE`, accountID).Scan(&plan); err != nil {
		return uuid.Nil, fmt.Errorf("locking the account: %w", err)
	}
	if plan != "paid" {
		return uuid.Nil, ErrPlanRequired
	}
	var kept int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM medicine_cabinet_items WHERE account_id = $1`, accountID).Scan(&kept); err != nil {
		return uuid.Nil, fmt.Errorf("counting the cabinet: %w", err)
	}
	if kept >= MaxItems {
		return uuid.Nil, ErrLimit
	}
	var id uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO medicine_cabinet_items
			(account_id, name, strength, quantity, unit, expires_year, expires_month, expires_day, note, photo, created_by_account_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
		accountID, in.Name, in.Strength, in.Quantity, in.Unit, in.Expires.Year, in.Expires.Month, in.Expires.Day, in.Note, photo, actor,
	).Scan(&id); err != nil {
		return uuid.Nil, fmt.Errorf("adding the medicine: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, fmt.Errorf("committing: %w", err)
	}
	return id, nil
}

// PhotoChange says what an edit does with the photo.
type PhotoChange struct {
	Keep   bool
	Remove bool
	Photo  []byte
}

// Update replaces a medicine's data and stamps who edited it and when. Any plan: correcting is never charged (Principio IV).
func (r *Repository) Update(ctx context.Context, accountID, itemID, actor uuid.UUID, in Input, photo PhotoChange) error {
	set := `photo`
	args := []any{accountID, itemID, in.Name, in.Strength, in.Quantity, in.Unit, in.Expires.Year, in.Expires.Month, in.Expires.Day, in.Note, actor}
	switch {
	case photo.Remove:
		set = `NULL`
	case !photo.Keep:
		set = `$12`
		args = append(args, photo.Photo)
	}
	tag, err := r.pool.Exec(ctx, `
		UPDATE medicine_cabinet_items SET name = $3, strength = $4, quantity = $5, unit = $6, expires_year = $7, expires_month = $8,
			expires_day = $9, note = $10, photo = `+set+`, updated_by_account_id = $11, updated_at = now()
		WHERE account_id = $1 AND id = $2`, args...)
	if err != nil {
		return fmt.Errorf("editing the medicine: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrItemNotFound
	}
	return nil
}

// Delete removes a medicine and its photo for good. Any plan.
func (r *Repository) Delete(ctx context.Context, accountID, itemID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM medicine_cabinet_items WHERE account_id = $1 AND id = $2`, accountID, itemID)
	if err != nil {
		return fmt.Errorf("removing the medicine: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrItemNotFound
	}
	return nil
}

// Photo is the image of a medicine (ErrItemNotFound when it has none).
func (r *Repository) Photo(ctx context.Context, accountID, itemID uuid.UUID) ([]byte, error) {
	var photo []byte
	err := r.pool.QueryRow(ctx, `SELECT photo FROM medicine_cabinet_items WHERE account_id = $1 AND id = $2`, accountID, itemID).Scan(&photo)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && photo == nil) {
		return nil, ErrItemNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("reading the photo: %w", err)
	}
	return photo, nil
}
