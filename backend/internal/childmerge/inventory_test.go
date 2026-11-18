package childmerge_test

import (
	"context"
	"os"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// The tables the union moves or merges (repository.go and childrecord.MergeInto) and the ones it leaves alone on purpose.
// A new table that hangs from a child must be put in one of the two lists, deciding what a union does with its rows.
var (
	mergeMoves = []string{
		"consultations", "consultation_symptoms", "consultation_appointments", "supplement_routines", "vaccine_records",
		"vaccine_card_photos", "growth_measurements", "child_device_links",
		"child_records", "child_record_allergies", "child_record_conditions", // merged by childrecord.MergeInto
	}
	mergeExcluded = map[string]string{
		"family_members":     "the Child-role member of a family: a child that is somebody's role cannot be merged (the union refuses)",
		"family_invitations": "same: an invitation of the Child role names its child (the union refuses)",
		"child_merges":       "the record of the unions itself: points at the child that remains",
	}
)

// Tables with an account_id column that hang (through foreign keys, at any depth) from what the union moves. When the account
// that owns the moved rows changes, the ones in mergeAccountMoved must be rewritten too (they have no child_id, so the generic
// UPDATE of repository.go does not reach them); the ones in mergeAccountExcluded keep their account on purpose.
var (
	mergeAccountMoved = []string{
		"consultation_symptoms", "consultation_appointments", "child_record_allergies", "child_record_conditions",
		"medication_extensions", // the account that owns the consultation: no child column, rewritten after the consultations move
	}
	mergeAccountExcluded = map[string]string{
		"dose_reminders":                   "account_id is the person who receives the reminder, not an owner",
		"supplement_dose_reminders":        "account_id is the person who receives the reminder",
		"appointment_notice_reminders":     "account_id is the person who receives the reminder",
		"appointment_muted":                "account_id is the person who muted the notices",
		"supplement_muted":                 "account_id is the person who muted the notices",
		"own_consultation_reminder_optins": "account_id is the Tutor who opted in, only for a person's own consultation (a child's has none)",
	}
)

// TestMerge_KnowsEveryTableThatHangsFromTheOwnerAccount: a new table with an account_id that hangs from consultations,
// medications, routines, appointments or the sheet must be moved by the union (and written in mergeAccountMoved, found in the
// code of the union) or excluded with its reason.
func TestMerge_KnowsEveryTableThatHangsFromTheOwnerAccount(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	rows, err := pool.Query(ctx, `
		WITH RECURSIVE fks AS (
			SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent
			FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace
		), reach AS (
			SELECT child FROM fks WHERE parent IN ('consultations', 'medications', 'supplement_routines', 'consultation_appointments', 'child_records')
			UNION
			SELECT f.child FROM fks f JOIN reach r ON f.parent = r.child
		)
		SELECT DISTINCT r.child FROM reach r
		WHERE EXISTS (SELECT 1 FROM information_schema.columns c
		              WHERE c.table_schema = 'public' AND c.table_name = r.child AND c.column_name = 'account_id')`)
	require.NoError(t, err)
	found := map[string]bool{}
	for rows.Next() {
		var name string
		require.NoError(t, rows.Scan(&name))
		found[name] = true
	}
	rows.Close()
	require.NoError(t, rows.Err())

	known := map[string]bool{}
	for _, name := range mergeAccountMoved {
		known[name] = true
	}
	for name := range mergeAccountExcluded {
		known[name] = true
	}
	unknown := []string{}
	for name := range found {
		if !known[name] {
			unknown = append(unknown, name)
		}
	}
	sort.Strings(unknown)
	require.Empty(t, unknown, "a table with account_id hangs from what the union moves: rewrite its account in Merge or list it in mergeAccountExcluded with the reason")

	// every table said to be moved is really written by the union's code, so removing the fix fails here
	var code strings.Builder
	for _, file := range []string{"repository.go", "../childrecord/merge.go"} {
		b, err := os.ReadFile(file)
		require.NoError(t, err)
		code.Write(b)
	}
	for _, name := range mergeAccountMoved {
		require.True(t, found[name], "%s is listed but has no account_id or does not hang from what moves", name)
		require.Regexp(t, `(?s)(UPDATE|INSERT INTO|DELETE FROM)\s+`+name+`\b|"`+name+`"`, code.String(), "the union does not write %s", name)
	}
}

func TestMerge_KnowsEveryChildTable(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	known := map[string]bool{}
	for _, name := range mergeMoves {
		known[name] = true
	}
	for name := range mergeExcluded {
		known[name] = true
	}

	found := map[string]bool{}
	rows, err := pool.Query(ctx, `SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name IN ('child_id', 'target_child_id')`)
	require.NoError(t, err)
	for rows.Next() {
		var name string
		require.NoError(t, rows.Scan(&name))
		found[name] = true
	}
	rows.Close()
	require.NoError(t, rows.Err())

	// also any foreign key to children, whatever its column is called
	rows, err = pool.Query(ctx, `SELECT DISTINCT conrelid::regclass::text FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.children'::regclass`)
	require.NoError(t, err)
	for rows.Next() {
		var name string
		require.NoError(t, rows.Scan(&name))
		found[name] = true
	}
	rows.Close()
	require.NoError(t, rows.Err())

	unknown := []string{}
	for name := range found {
		if !known[name] {
			unknown = append(unknown, name)
		}
	}
	sort.Strings(unknown)
	require.Empty(t, unknown, "a table hangs from a child and the union does not know it: move its rows in repository.go Merge or list it in mergeExcluded with the reason")

	// and the lists do not name tables that no longer exist
	for name := range known {
		require.True(t, found[name], "%s is listed but has no child_id", name)
	}
}
