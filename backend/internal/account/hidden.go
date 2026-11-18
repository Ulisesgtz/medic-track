package account

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Ulisesgtz/medic-track/backend/internal/childhidden"
)

// Hiding and joining children (specs/074-unir-hijo-duplicado).

// ErrNoFamilyToHideIn: hiding children only makes sense for an active Tutor or Caregiver of a family (409 no_family).
var ErrNoFamilyToHideIn = errors.New("the account is not an active member of a family")

// ErrInvalidChildIDs: one of the ids is not a child of the account (400 childIds). It never carries an id.
var ErrInvalidChildIDs = errors.New("a child id is not one of the account's children")

// childQuerier is a pool or a transaction.
type childQuerier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// loadOwnChildren reads the account's own children, oldest first: the ones that show, the ones hidden (effective, see
// childhidden) and how many there are in all — hidden ones still count for the limit of the plan.
func loadOwnChildren(ctx context.Context, q childQuerier, accountID uuid.UUID) (visible []Child, hidden []HiddenChild, total int, err error) {
	rows, err := q.Query(ctx, `
		SELECT c.id, c.first_name, c.last_name, c.birth_date, c.height, c.weight, c.created_at, c.corrected_at,
		       (SELECT first_name FROM accounts WHERE id = c.corrected_by_account_id), (`+childhidden.HiddenSQL("c")+`)
		FROM children c WHERE c.account_id = $1 ORDER BY c.created_at ASC
	`, accountID)
	if err != nil {
		return nil, nil, 0, fmt.Errorf("querying children: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		child := Child{AccountID: accountID}
		var isHidden bool
		if err := rows.Scan(&child.ID, &child.FirstName, &child.LastName, &child.BirthDate, &child.Height, &child.Weight, &child.CreatedAt, &child.CorrectedAt, &child.CorrectedBy, &isHidden); err != nil {
			return nil, nil, 0, fmt.Errorf("scanning child: %w", err)
		}
		total++
		if isHidden {
			hidden = append(hidden, HiddenChild{ID: child.ID, FirstName: child.FirstName})
			continue
		}
		visible = append(visible, child)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, 0, fmt.Errorf("iterating children: %w", err)
	}
	return visible, hidden, total, nil
}

// fillMerges gives every child of the account's answer (own and shared) the unions that added records to it, oldest first. One
// query for the whole account, not one per child.
func (r *Repository) fillMerges(ctx context.Context, acc *Account) error {
	if len(acc.Children) == 0 {
		return nil
	}
	ids := make([]string, 0, len(acc.Children))
	for _, c := range acc.Children {
		ids = append(ids, c.ID.String())
	}
	rows, err := r.pool.Query(ctx, `
		SELECT m.target_child_id, m.merged_at, (SELECT first_name FROM accounts WHERE id = m.merged_by_account_id)
		FROM child_merges m WHERE m.target_child_id = ANY($1::uuid[]) ORDER BY m.merged_at, m.id
	`, ids)
	if err != nil {
		return fmt.Errorf("querying the unions: %w", err)
	}
	defer rows.Close()
	byChild := map[uuid.UUID][]ChildMerge{}
	for rows.Next() {
		var id uuid.UUID
		var m ChildMerge
		if err := rows.Scan(&id, &m.At, &m.ByFirstName); err != nil {
			return fmt.Errorf("scanning a union: %w", err)
		}
		byChild[id] = append(byChild[id], m)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterating the unions: %w", err)
	}
	for i := range acc.Children {
		acc.Children[i].Merges = byChild[acc.Children[i].ID]
	}
	return nil
}

// SetHiddenChildren replaces the set of the account's hidden children: the ones in ids are hidden now (those that already were
// keep their date) and the rest show again. Hiding needs the account to be an active Tutor or Caregiver of a family
// (ErrNoFamilyToHideIn) — showing never does — and every id must be one of the account's children (ErrInvalidChildIDs). Any plan.
// Nothing is deleted and the children still count for the limit of the plan.
func (r *Repository) SetHiddenChildren(ctx context.Context, accountID uuid.UUID, ids []uuid.UUID) error {
	strs := make([]string, 0, len(ids))
	seen := map[uuid.UUID]bool{}
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			strs = append(strs, id.String())
		}
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback is a no-op after a successful commit

	var locked uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT id FROM accounts WHERE id = $1 FOR UPDATE`, accountID).Scan(&locked); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrAccountNotFound
		}
		return fmt.Errorf("locking the account: %w", err)
	}
	var owned int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM children WHERE account_id = $1 AND id = ANY($2::uuid[])`, accountID, strs).Scan(&owned); err != nil {
		return fmt.Errorf("checking the children: %w", err)
	}
	if owned != len(strs) {
		return ErrInvalidChildIDs
	}
	if len(strs) > 0 {
		var member bool
		if err := tx.QueryRow(ctx, `
			SELECT EXISTS (SELECT 1 FROM family_members WHERE account_id = $1 AND status = 'active' AND role IN ('tutor', 'caregiver'))
		`, accountID).Scan(&member); err != nil {
			return fmt.Errorf("checking the family: %w", err)
		}
		if !member {
			return ErrNoFamilyToHideIn
		}
	}
	if _, err := tx.Exec(ctx, `
		UPDATE children SET hidden_at = CASE WHEN id = ANY($2::uuid[]) THEN COALESCE(hidden_at, now()) ELSE NULL END
		WHERE account_id = $1 AND ((id = ANY($2::uuid[])) <> (hidden_at IS NOT NULL))
	`, accountID, strs); err != nil {
		return fmt.Errorf("updating the hidden children: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing: %w", err)
	}
	return nil
}
