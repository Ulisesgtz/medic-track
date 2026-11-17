package accountdeletion

import (
	"context"
	"fmt"
	"os"
	"sort"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

// world is two accounts: A (the one that is deleted) and X (another family where A is a Tutor), each with children and
// a row in every table that can hang from an account.
type world struct {
	A, C1, C2, B, X, CX, Link uuid.UUID
	// Rows of X that A touched (they must stay, without A as their author).
	XDose, XRoutineDose, XVaccine, XGrowth, XCabinet, XAppointment, XConsultation, XLink, XRoutine uuid.UUID
}

func newWorld() world {
	n := uuid.New
	return world{A: n(), C1: n(), C2: n(), B: n(), X: n(), CX: n(), Link: n(),
		XDose: n(), XRoutineDose: n(), XVaccine: n(), XGrowth: n(), XCabinet: n(), XAppointment: n(), XConsultation: n(),
		XLink: n(), XRoutine: n()}
}

// seedSQL fills every table. :A, :C1… are replaced by the world's ids (only uuids, generated here).
const seedSQL = `
INSERT INTO accounts (id, first_name, last_name, email, plan) VALUES
  (':A', 'Ana', 'Purga', ':A@purge.test', 'paid'),
  (':B', 'Beto', 'Purga', ':B@purge.test', 'free'),
  (':X', 'Xime', 'Purga', ':X@purge.test', 'paid');
INSERT INTO children (id, account_id, first_name, last_name, birth_date) VALUES
  (':C1', ':A', 'Mateo', 'Purga', '2020-01-01'),
  (':C2', ':A', 'Sofia', 'Purga', '2021-01-01'),
  (':CX', ':X', 'Pablo', 'Purga', '2019-01-01');
UPDATE children SET corrected_by_account_id = ':A', corrected_at = now() WHERE id = ':CX';

-- A's consultation of C1, with everything under it.
INSERT INTO consultations (id, child_id, account_id, doctor_name, consult_date, photo) VALUES
  ('11111111-0000-0000-0000-:N1', ':C1', ':A', 'Dra. Purga', '2026-10-01', '\x00'),
  ('11111111-0000-0000-0000-:N2', NULL, ':A', 'Dr. Propio', '2026-10-02', '\x00');
INSERT INTO consultation_symptoms (consultation_id, child_id, account_id, symptom_code)
  VALUES ('11111111-0000-0000-0000-:N1', ':C1', ':A', 'fever');
INSERT INTO medications (id, consultation_id, name, frequency_hours, duration_days)
  VALUES ('22222222-0000-0000-0000-:N1', '11111111-0000-0000-0000-:N1', 'Amoxicilina', 8, 1);
INSERT INTO medication_extensions (id, medication_id, account_id, proposed_doses, added_doses)
  VALUES ('33333333-0000-0000-0000-:N1', '22222222-0000-0000-0000-:N1', ':A', 1, 1);
INSERT INTO child_device_links (id, child_id, account_id, name, created_by_account_id, status, credential_hash, redeemed_at, expires_at)
  VALUES (':Link', ':C1', ':A', 'Tel Mateo', ':A', 'active', '\x01', now(), now() + interval '1 day');
INSERT INTO doses (id, medication_id, scheduled_at, taken, taken_by_account_id, taken_at, added_by_extension_id) VALUES
  ('44444444-0000-0000-0000-:N1', '22222222-0000-0000-0000-:N1', now(), true, ':B', now(), '33333333-0000-0000-0000-:N1'),
  ('44444444-0000-0000-0000-:N2', '22222222-0000-0000-0000-:N1', now(), false, NULL, NULL, NULL),
  ('44444444-0000-0000-0000-:N3', '22222222-0000-0000-0000-:N1', now(), true, NULL, now(), NULL);
UPDATE doses SET taken_by_child_device_id = ':Link' WHERE id = '44444444-0000-0000-0000-:N3';
INSERT INTO dose_reminders (dose_id, account_id) VALUES
  ('44444444-0000-0000-0000-:N2', ':A'), ('44444444-0000-0000-0000-:N2', ':B');
INSERT INTO child_dose_reminders (dose_id, link_id) VALUES ('44444444-0000-0000-0000-:N2', ':Link');
INSERT INTO reminder_devices (account_id, endpoint, p256dh, auth) VALUES (':A', 'https://push.test/:A', 'k', 'a');
INSERT INTO reminder_devices (child_link_id, endpoint, p256dh, auth) VALUES (':Link', 'https://push.test/:Link', 'k', 'a');
INSERT INTO own_consultation_sharing (account_id, shared) VALUES (':A', true);
INSERT INTO own_consultation_reminder_optins (consultation_id, account_id) VALUES ('11111111-0000-0000-0000-:N2', ':B');

-- An appointment with a notice, its reminder and a mute.
INSERT INTO consultation_appointments (id, consultation_id, child_id, account_id, starts_at, utc_offset_minutes, created_by_account_id)
  VALUES ('55555555-0000-0000-0000-:N1', '11111111-0000-0000-0000-:N1', ':C1', ':A', now() + interval '2 day', -360, ':A');
INSERT INTO appointment_notices (id, appointment_id, kind, lead_minutes, fire_at)
  VALUES ('66666666-0000-0000-0000-:N1', '55555555-0000-0000-0000-:N1', 'before', 60, now() + interval '1 day');
INSERT INTO appointment_notice_reminders (notice_id, account_id) VALUES ('66666666-0000-0000-0000-:N1', ':B');
INSERT INTO appointment_muted (appointment_id, account_id) VALUES ('55555555-0000-0000-0000-:N1', ':B');

-- A child's routine and a personal one.
INSERT INTO supplement_routines (id, account_id, child_id, name, period, times, first_date, utc_offset_minutes, generated_until, created_by_account_id)
  VALUES ('77777777-0000-0000-0000-:N1', ':A', ':C1', 'Vitamina D', 'daily', '{08:00}', '2026-10-01', -360, now(), ':A'),
         ('77777777-0000-0000-0000-:N2', ':A', NULL, 'Hierro', 'daily', '{09:00}', '2026-10-01', -360, now(), ':A');
INSERT INTO supplement_doses (id, routine_id, scheduled_at) VALUES ('88888888-0000-0000-0000-:N1', '77777777-0000-0000-0000-:N1', now());
INSERT INTO supplement_dose_reminders (dose_id, account_id) VALUES ('88888888-0000-0000-0000-:N1', ':B');
INSERT INTO child_supplement_dose_reminders (dose_id, link_id) VALUES ('88888888-0000-0000-0000-:N1', ':Link');
INSERT INTO supplement_muted (routine_id, account_id) VALUES ('77777777-0000-0000-0000-:N1', ':B');
INSERT INTO personal_routine_notices (account_id) VALUES (':A');

-- Records of the children and of the family.
INSERT INTO vaccine_records (child_id, account_id, custom_name, applied_on, created_by_account_id) VALUES (':C1', ':A', 'BCG', '2020-01-02', ':A');
INSERT INTO vaccine_card_photos (child_id, account_id, photo, created_by_account_id) VALUES (':C1', ':A', '\x00', ':A');
INSERT INTO growth_measurements (child_id, account_id, measured_on, weight_kg, created_by_account_id) VALUES (':C2', ':A', '2026-01-01', 12, ':A');
INSERT INTO child_records (child_id, account_id, blood_type, version, updated_by_account_id) VALUES (':C1', ':A', 'O+', 1, ':A');
INSERT INTO child_record_allergies (child_id, account_id, position, name) VALUES (':C1', ':A', 0, 'Penicilina');
INSERT INTO child_record_conditions (child_id, account_id, position, name) VALUES (':C1', ':A', 0, 'Asma');
INSERT INTO medicine_cabinet_items (account_id, name, quantity, unit, expires_year, expires_month, created_by_account_id)
  VALUES (':A', 'Paracetamol', 1, 'box', 2027, 3, ':A');
INSERT INTO disclaimer_acceptances (account_id, version) VALUES (':A', '2026-11-02');
INSERT INTO subscriptions (id, account_id, provider_subscription_id, status) VALUES ('99999999-0000-0000-0000-:N1', ':A', 'fake_:A', 'active');
INSERT INTO payment_events (provider, event_key, resource_type, resource_id, subscription_id)
  VALUES ('fake', 'k:A', 'preapproval', 'fake_:A', '99999999-0000-0000-0000-:N1');
INSERT INTO error_logs (message, endpoint, file, line, account_id) VALUES ('fixed', '/x', 'f.go', 1, ':A');

-- A's family: B is a Tutor, and there is a pending invitation.
INSERT INTO family_members (family_account_id, account_id, role, invited_by_account_id) VALUES (':A', ':B', 'tutor', ':A');
INSERT INTO family_invitations (family_account_id, email, role, token_hash, invited_by_account_id, expires_at)
  VALUES (':A', 'otra@purge.test', 'caregiver', '\x:N1', ':A', now() + interval '1 day');

-- X's family, where A is a Tutor and wrote things on X's child CX.
INSERT INTO family_members (family_account_id, account_id, role, invited_by_account_id) VALUES (':X', ':A', 'tutor', ':X');
INSERT INTO family_invitations (family_account_id, email, role, token_hash, invited_by_account_id, expires_at)
  VALUES (':X', 'tia@purge.test', 'caregiver', '\x:N2', ':A', now() + interval '1 day');
INSERT INTO consultations (id, child_id, account_id, doctor_name, consult_date, photo, edited_by_account_id, edited_at)
  VALUES (':XConsultation', ':CX', ':X', 'Dr. X', '2026-10-01', '\x00', ':A', now());
INSERT INTO medications (id, consultation_id, name, frequency_hours, duration_days)
  VALUES ('22222222-0000-0000-0000-:N2', ':XConsultation', 'Ibuprofeno', 8, 1);
INSERT INTO doses (id, medication_id, scheduled_at, taken, taken_by_account_id, taken_at)
  VALUES (':XDose', '22222222-0000-0000-0000-:N2', now(), true, ':A', now());
INSERT INTO dose_reminders (dose_id, account_id) VALUES (':XDose', ':A');
INSERT INTO supplement_routines (id, account_id, child_id, name, period, times, first_date, utc_offset_minutes, generated_until, created_by_account_id)
  VALUES (':XRoutine', ':X', ':CX', 'Zinc', 'daily', '{08:00}', '2026-10-01', -360, now(), ':A');
INSERT INTO supplement_doses (id, routine_id, scheduled_at, taken, taken_by_account_id, taken_at)
  VALUES (':XRoutineDose', ':XRoutine', now(), true, ':A', now());
INSERT INTO supplement_muted (routine_id, account_id) VALUES (':XRoutine', ':A');
INSERT INTO vaccine_records (id, child_id, account_id, custom_name, applied_on, created_by_account_id, corrected_by_account_id, corrected_at)
  VALUES (':XVaccine', ':CX', ':X', 'Polio', '2019-02-01', ':A', ':A', now());
INSERT INTO growth_measurements (id, child_id, account_id, measured_on, height_cm, created_by_account_id, corrected_by_account_id, corrected_at)
  VALUES (':XGrowth', ':CX', ':X', '2026-01-01', 90, ':A', ':A', now());
INSERT INTO child_records (child_id, account_id, general_note, version, updated_by_account_id) VALUES (':CX', ':X', 'Nota de X', 1, ':A');
INSERT INTO child_record_allergies (child_id, account_id, position, name) VALUES (':CX', ':X', 0, 'Polen');
INSERT INTO medicine_cabinet_items (id, account_id, name, quantity, unit, expires_year, expires_month, created_by_account_id, updated_by_account_id, updated_at)
  VALUES (':XCabinet', ':X', 'Suero', 2, 'bottle', 2027, 1, ':A', ':A', now());
INSERT INTO consultation_appointments (id, consultation_id, child_id, account_id, starts_at, utc_offset_minutes, created_by_account_id, status, status_by_account_id, status_at)
  VALUES (':XAppointment', ':XConsultation', ':CX', ':X', now(), -360, ':A', 'done', ':A', now());
INSERT INTO appointment_muted (appointment_id, account_id) VALUES (':XAppointment', ':A');
INSERT INTO child_device_links (id, child_id, account_id, name, created_by_account_id, status, revoked_at, revoked_by_account_id, expires_at)
  VALUES (':XLink', ':CX', ':X', 'Tel Pablo', ':A', 'revoked', now(), ':A', now());
`

func (w world) sql() string {
	r := strings.NewReplacer(
		":XConsultation", w.XConsultation.String(), ":XRoutineDose", w.XRoutineDose.String(), ":XRoutine", w.XRoutine.String(),
		":XDose", w.XDose.String(), ":XVaccine", w.XVaccine.String(), ":XGrowth", w.XGrowth.String(), ":XCabinet", w.XCabinet.String(),
		":XAppointment", w.XAppointment.String(), ":XLink", w.XLink.String(), ":Link", w.Link.String(),
		":C1", w.C1.String(), ":C2", w.C2.String(), ":CX", w.CX.String(),
		":A", w.A.String(), ":B", w.B.String(), ":X", w.X.String(),
		":N1", w.A.String()[24:], ":N2", w.X.String()[24:], ":N3", w.B.String()[24:],
	)
	return r.Replace(seedSQL)
}

func seedWorld(t *testing.T, pool *pgxpool.Pool) world {
	t.Helper()
	w := newWorld()
	_, err := pool.Exec(context.Background(), w.sql())
	require.NoError(t, err)
	t.Cleanup(func() {
		// Whatever a failed test left behind: X's world, and A's if the purge didn't run.
		ctx := context.Background()
		for _, id := range []uuid.UUID{w.A, w.X, w.B} {
			tx, err := pool.Begin(ctx)
			if err != nil {
				return
			}
			if Purge(ctx, tx, id) == nil {
				_ = tx.Commit(ctx)
			} else {
				_ = tx.Rollback(ctx)
			}
		}
	})
	return w
}

func purge(t *testing.T, pool *pgxpool.Pool, id uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	require.NoError(t, Purge(ctx, tx, id))
	require.NoError(t, tx.Commit(ctx))
}

// uuidColumns are every uuid column of every public table, except account_deletions (the record that stays on purpose).
func uuidColumns(t *testing.T, pool *pgxpool.Pool) [][2]string {
	t.Helper()
	rows, err := pool.Query(context.Background(), `SELECT table_name, column_name FROM information_schema.columns
		WHERE table_schema = 'public' AND data_type = 'uuid' AND table_name <> 'account_deletions'
		  AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE')`)
	require.NoError(t, err)
	defer rows.Close()
	var out [][2]string
	for rows.Next() {
		var table, column string
		require.NoError(t, rows.Scan(&table, &column))
		out = append(out, [2]string{table, column})
	}
	require.NoError(t, rows.Err())
	return out
}

func countRefs(t *testing.T, pool *pgxpool.Pool, cols [][2]string, ids ...uuid.UUID) map[string]int {
	t.Helper()
	found := map[string]int{}
	for _, c := range cols {
		var n int
		require.NoError(t, pool.QueryRow(context.Background(),
			fmt.Sprintf(`SELECT count(*) FROM %q WHERE %q = ANY($1)`, c[0], c[1]), ids).Scan(&n))
		if n > 0 {
			found[c[0]+"."+c[1]] = n
		}
	}
	return found
}

func TestPurge_LeavesNoTraceOfTheAccountNorItsChildren(t *testing.T) {
	pool := testPool(t)
	w := seedWorld(t, pool)
	cols := uuidColumns(t, pool)
	require.NotEmpty(t, countRefs(t, pool, cols, w.A, w.C1, w.C2), "the seed reaches the account")

	purge(t, pool, w.A)

	require.Empty(t, countRefs(t, pool, cols, w.A, w.C1, w.C2, w.Link),
		"no uuid column of any table keeps the account, its children or its child's phone (SC-004)")
}

func TestPurge_WhatItWroteOnAnotherFamilyStaysWithoutItsName(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	w := seedWorld(t, pool)

	purge(t, pool, w.A)

	var taken bool
	var by *uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT taken, taken_by_account_id FROM doses WHERE id = $1`, w.XDose).Scan(&taken, &by))
	require.True(t, taken, "the dose A marked is still marked (FR-015)")
	require.Nil(t, by)
	require.NoError(t, pool.QueryRow(ctx, `SELECT taken, taken_by_account_id FROM supplement_doses WHERE id = $1`, w.XRoutineDose).Scan(&taken, &by))
	require.True(t, taken)
	require.Nil(t, by)

	for _, c := range []struct {
		query string
		id    uuid.UUID
	}{
		{`SELECT count(*) FROM vaccine_records WHERE id = $1 AND corrected_at IS NOT NULL AND corrected_by_account_id IS NULL`, w.XVaccine},
		{`SELECT count(*) FROM growth_measurements WHERE id = $1 AND corrected_at IS NOT NULL AND created_by_account_id IS NULL`, w.XGrowth},
		{`SELECT count(*) FROM medicine_cabinet_items WHERE id = $1 AND updated_at IS NOT NULL AND updated_by_account_id IS NULL`, w.XCabinet},
		{`SELECT count(*) FROM consultation_appointments WHERE id = $1 AND status = 'done' AND status_by_account_id IS NULL`, w.XAppointment},
		{`SELECT count(*) FROM consultations WHERE id = $1 AND edited_at IS NOT NULL AND edited_by_account_id IS NULL`, w.XConsultation},
		{`SELECT count(*) FROM supplement_routines WHERE id = $1 AND created_by_account_id IS NULL`, w.XRoutine},
		{`SELECT count(*) FROM child_device_links WHERE id = $1 AND revoked_by_account_id IS NULL`, w.XLink},
	} {
		var n int
		require.NoError(t, pool.QueryRow(ctx, c.query, c.id).Scan(&n))
		require.Equal(t, 1, n, c.query)
	}

	// X's record sheet that A saved stays, without A as its author, and its lists stay too.
	var sheets, listed int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM child_records WHERE child_id = $1 AND version = 1 AND updated_by_account_id IS NULL`, w.CX).Scan(&sheets))
	require.Equal(t, 1, sheets)
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM child_record_allergies WHERE child_id = $1`, w.CX).Scan(&listed))
	require.Equal(t, 1, listed)
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM child_records WHERE child_id = $1`, w.C1).Scan(&sheets))
	require.Zero(t, sheets, "A's own children's sheets are gone")

	var children, members int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM children WHERE account_id = $1`, w.X).Scan(&children))
	require.Equal(t, 1, children, "X's family is intact")
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM family_members WHERE family_account_id = $1`, w.X).Scan(&members))
	require.Zero(t, members, "A left X's family")
	var b int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM accounts WHERE id = $1`, w.B).Scan(&b))
	require.Equal(t, 1, b, "B, who was in A's family, keeps their account")
	var errorLogs int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM error_logs WHERE message = 'fixed' AND file = 'f.go' AND account_id IS NULL`).Scan(&errorLogs))
	require.GreaterOrEqual(t, errorLogs, 1, "the error_logs row stays, without its account")
}

func TestPurge_AnInvitedPersonLeavesTheFamilyIntact(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	w := seedWorld(t, pool)

	purge(t, pool, w.B) // B is a Tutor in A's family and marked a dose of Mateo

	var n int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM children WHERE account_id = $1`, w.A).Scan(&n))
	require.Equal(t, 2, n)
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM doses WHERE id = $1 AND taken AND taken_by_account_id IS NULL`,
		uuid.MustParse("44444444-0000-0000-0000-"+w.A.String()[24:])).Scan(&n))
	require.Equal(t, 1, n, "B's mark stays, without B's name")
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM family_members WHERE account_id = $1`, w.B).Scan(&n))
	require.Zero(t, n)
	require.Empty(t, countRefs(t, pool, uuidColumns(t, pool), w.B))
}

// TestPurge_KnowsEveryTable fails when a table that can hang from an account (a key towards accounts or children, or towards
// a table that does, all the way down) is not named by any step of Purge: a new feature must add its step (research R1).
func TestPurge_KnowsEveryTable(t *testing.T) {
	pool := testPool(t)
	rows, err := pool.Query(context.Background(), `
		WITH RECURSIVE fks AS (
			SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent
			FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace
		), reach AS (
			SELECT child FROM fks WHERE parent IN ('accounts', 'children')
			UNION
			SELECT f.child FROM fks f JOIN reach r ON f.parent = r.child
		)
		SELECT DISTINCT child FROM reach`)
	require.NoError(t, err)
	defer rows.Close()
	known := map[string]bool{"accounts": true}
	for _, s := range purgeSteps {
		known[s.Table] = true
	}
	var missing []string
	for rows.Next() {
		var table string
		require.NoError(t, rows.Scan(&table))
		table = strings.Trim(table, `"`)
		if !known[table] {
			missing = append(missing, table)
		}
	}
	require.NoError(t, rows.Err())
	sort.Strings(missing)
	require.Empty(t, missing, "these tables hang from an account but Purge doesn't know them: add their step to purgeSteps")
}
