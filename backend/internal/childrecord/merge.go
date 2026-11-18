package childrecord

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// MergeChoices says, for the fields that can only keep one value, whether the merged sheet takes the source child's value
// (true) or the target child's (false). They only matter when both children have a sheet.
type MergeChoices struct {
	BloodTypeFromSource    bool
	PediatricianFromSource bool
	GeneralNoteFromSource  bool
}

// RecordTooLongError is a merge that would leave a list over MaxEntries; nothing was written.
type RecordTooLongError struct {
	// List is "allergies" or "conditions".
	List      string
	Resulting int
}

func (e *RecordTooLongError) Error() string { return "the merged " + e.List + " list is too long" }

// MergeInto folds the sheet of the source child into the target's inside a transaction that belongs to the caller (the
// children's rows must already be locked and the target's account is the one the sheet ends in). No sheet in the source: nothing
// happens. A source sheet and no target sheet: the sheet moves, with its list rows. Both: the lists are the target's followed
// by the source's that are not identical (name, kind and note after TrimSpace); blood type, pediatrician and general note
// follow choices; the version grows and actor is the author. The source's sheet is gone afterwards. Returns whether the source
// had a sheet.
func MergeInto(ctx context.Context, tx pgx.Tx, source, target, actor uuid.UUID, choices MergeChoices) (bool, error) {
	src, err := read(ctx, tx, source)
	if err != nil {
		return false, err
	}
	if !src.Exists {
		return false, nil
	}
	var targetAccount uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT account_id FROM children WHERE id = $1`, target).Scan(&targetAccount); err != nil {
		return false, fmt.Errorf("reading the target child: %w", err)
	}
	dst, err := read(ctx, tx, target)
	if err != nil {
		return false, err
	}

	if !dst.Exists {
		if err := moveSheet(ctx, tx, source, target, targetAccount); err != nil {
			return false, err
		}
		return true, nil
	}

	allergies, conditions := MergeLists(src.Content, dst.Content)
	if len(allergies) > MaxEntries {
		return false, &RecordTooLongError{List: "allergies", Resulting: len(allergies)}
	}
	if len(conditions) > MaxEntries {
		return false, &RecordTooLongError{List: "conditions", Resulting: len(conditions)}
	}

	chosen := dst.Content
	if choices.BloodTypeFromSource {
		chosen.BloodType = src.BloodType
	}
	if choices.GeneralNoteFromSource {
		chosen.GeneralNote = src.GeneralNote
	}
	if choices.PediatricianFromSource {
		chosen.Pediatrician = src.Pediatrician
	}
	var name, phone, office *string
	if p := chosen.Pediatrician; p != nil {
		name, phone, office = p.Name, p.Phone, p.Office
	}
	if _, err := tx.Exec(ctx, `
		UPDATE child_records SET blood_type = $2, general_note = $3, pediatrician_name = $4, pediatrician_phone = $5,
		       pediatrician_office = $6, version = version + 1, updated_at = now(), updated_by_account_id = $7
		WHERE child_id = $1`, target, chosen.BloodType, chosen.GeneralNote, name, phone, office, actor); err != nil {
		return false, fmt.Errorf("writing the merged record: %w", err)
	}
	for _, stmt := range []string{
		`DELETE FROM child_record_allergies WHERE child_id = $1`,
		`DELETE FROM child_record_conditions WHERE child_id = $1`,
	} {
		if _, err := tx.Exec(ctx, stmt, target); err != nil {
			return false, fmt.Errorf("clearing the lists: %w", err)
		}
	}
	for i, a := range allergies {
		if _, err := tx.Exec(ctx, `INSERT INTO child_record_allergies (child_id, account_id, position, name, kind, note)
			VALUES ($1, $2, $3, $4, $5, $6)`, target, targetAccount, i, a.Name, a.Kind, a.Note); err != nil {
			return false, fmt.Errorf("writing an allergy: %w", err)
		}
	}
	for i, c := range conditions {
		if _, err := tx.Exec(ctx, `INSERT INTO child_record_conditions (child_id, account_id, position, name, note)
			VALUES ($1, $2, $3, $4, $5)`, target, targetAccount, i, c.Name, c.Note); err != nil {
			return false, fmt.Errorf("writing a condition: %w", err)
		}
	}
	if err := dropSheet(ctx, tx, source); err != nil {
		return false, err
	}
	return true, nil
}

// moveSheet gives the target the source's sheet as it is (version, author and date included) and removes the source's. The
// list rows are moved, so they keep their ids.
func moveSheet(ctx context.Context, tx pgx.Tx, source, target, targetAccount uuid.UUID) error {
	if _, err := tx.Exec(ctx, `
		INSERT INTO child_records (child_id, account_id, blood_type, general_note, pediatrician_name, pediatrician_phone,
		       pediatrician_office, version, updated_at, updated_by_account_id)
		SELECT $2, $3, blood_type, general_note, pediatrician_name, pediatrician_phone, pediatrician_office, version, updated_at,
		       updated_by_account_id
		FROM child_records WHERE child_id = $1`, source, target, targetAccount); err != nil {
		return fmt.Errorf("moving the record: %w", err)
	}
	for _, stmt := range []string{
		`UPDATE child_record_allergies SET child_id = $2, account_id = $3 WHERE child_id = $1`,
		`UPDATE child_record_conditions SET child_id = $2, account_id = $3 WHERE child_id = $1`,
	} {
		if _, err := tx.Exec(ctx, stmt, source, target, targetAccount); err != nil {
			return fmt.Errorf("moving the lists: %w", err)
		}
	}
	return dropSheet(ctx, tx, source)
}

// dropSheet deletes a child's sheet and whatever lists it still has.
func dropSheet(ctx context.Context, tx pgx.Tx, child uuid.UUID) error {
	for _, stmt := range []string{
		`DELETE FROM child_record_allergies WHERE child_id = $1`,
		`DELETE FROM child_record_conditions WHERE child_id = $1`,
		`DELETE FROM child_records WHERE child_id = $1`,
	} {
		if _, err := tx.Exec(ctx, stmt, child); err != nil {
			return fmt.Errorf("removing the source record: %w", err)
		}
	}
	return nil
}

func same(a, b *string) bool {
	var x, y string
	if a != nil {
		x = strings.TrimSpace(*a)
	}
	if b != nil {
		y = strings.TrimSpace(*b)
	}
	return x == y
}

func hasAllergy(list []Allergy, a Allergy) bool {
	for _, b := range list {
		if strings.TrimSpace(a.Name) == strings.TrimSpace(b.Name) && same(a.Kind, b.Kind) && same(a.Note, b.Note) {
			return true
		}
	}
	return false
}

func hasCondition(list []Condition, c Condition) bool {
	for _, b := range list {
		if strings.TrimSpace(c.Name) == strings.TrimSpace(b.Name) && same(c.Note, b.Note) {
			return true
		}
	}
	return false
}

// MergeLists is the allergies and conditions a merged sheet would have: the target's followed by the source's that are not
// identical (name, kind and note after TrimSpace). It does not check the cap (MaxEntries).
func MergeLists(src, dst Content) ([]Allergy, []Condition) {
	allergies := append([]Allergy(nil), dst.Allergies...)
	for _, a := range src.Allergies {
		if !hasAllergy(allergies, a) {
			allergies = append(allergies, a)
		}
	}
	conditions := append([]Condition(nil), dst.Conditions...)
	for _, c := range src.Conditions {
		if !hasCondition(conditions, c) {
			conditions = append(conditions, c)
		}
	}
	return allergies, conditions
}
