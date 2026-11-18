package childmerge_test

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/accountdeletion"
	"github.com/Ulisesgtz/medic-track/backend/internal/childmerge"
	"github.com/Ulisesgtz/medic-track/backend/internal/childrecord"
	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
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

// world: Ana (Y) owns a family and has Mateo (T); Laura (X) is an invited person with her own Mateo (S).
type world struct {
	pool                    *pgxpool.Pool
	ana, laura              uuid.UUID
	anaChild, lauraChild    uuid.UUID
	anaClerk, lauraClerk    string
	consultation, medicine  uuid.UUID
	doseTaken, dosePending  uuid.UUID
	appointment, routine    uuid.UUID
	vaccine, cardPhoto, msr uuid.UUID
	link                    uuid.UUID
}

func newAccountWith(t *testing.T, pool *pgxpool.Pool, first string, plan account.Plan, birth time.Time) (uuid.UUID, uuid.UUID, string) {
	t.Helper()
	clerk := "user_cm_" + uuid.NewString()[:12]
	h := 90.0
	acc := &account.Account{
		FirstName: first, LastName: "Prueba", Plan: plan, ClerkUserID: &clerk,
		Email:    fmt.Sprintf("childmerge.%d.%s@example.com", time.Now().UnixNano(), uuid.NewString()[:6]),
		Children: []account.Child{{FirstName: "Mateo", LastName: "López", BirthDate: birth, Height: &h}},
	}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))
	return acc.ID, acc.Children[0].ID, clerk
}

func exec(t *testing.T, pool *pgxpool.Pool, sql string, args ...any) {
	t.Helper()
	_, err := pool.Exec(context.Background(), sql, args...)
	require.NoError(t, err)
}

// newWorld builds the two families; role is the one Laura has in Ana's ("tutor" or "caregiver"), ownerPlan Ana's plan.
func newWorld(t *testing.T, role string, ownerPlan account.Plan) *world {
	t.Helper()
	pool := testPool(t)
	ctx := context.Background()
	w := &world{pool: pool}
	birth := time.Date(2022, 3, 3, 0, 0, 0, 0, time.UTC)
	w.ana, w.anaChild, w.anaClerk = newAccountWith(t, pool, "Ana", ownerPlan, birth)
	w.laura, w.lauraChild, w.lauraClerk = newAccountWith(t, pool, "Laura", account.PlanFree, birth)
	exec(t, pool, `INSERT INTO family_members (family_account_id, account_id, role) VALUES ($1, $2, $3)`, w.ana, w.laura, role)

	// Laura's Mateo holds one of everything.
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO consultations (child_id, account_id, doctor_name, consult_date, photo, notes)
		VALUES ($1, $2, 'Dra. Ruiz', '2026-10-01', '\x89504e47'::bytea, 'tos') RETURNING id`, w.lauraChild, w.laura).Scan(&w.consultation))
	exec(t, pool, `INSERT INTO consultation_symptoms (consultation_id, child_id, account_id, symptom_code) VALUES ($1, $2, $3, 'fever')`, w.consultation, w.lauraChild, w.laura)
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO medications (consultation_id, name, frequency_hours, duration_days, start_time)
		VALUES ($1, 'Paracetamol', 8, 3, '08:00') RETURNING id`, w.consultation).Scan(&w.medicine))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO doses (medication_id, scheduled_at, taken, taken_by_account_id, taken_at)
		VALUES ($1, now() - interval '2 days', true, $2, now() - interval '2 days') RETURNING id`, w.medicine, w.laura).Scan(&w.doseTaken))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO doses (medication_id, scheduled_at) VALUES ($1, now() + interval '1 day') RETURNING id`, w.medicine).Scan(&w.dosePending))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO consultation_appointments (consultation_id, child_id, account_id, starts_at, utc_offset_minutes, created_by_account_id)
		VALUES ($1, $2, $3, now() + interval '10 days', -360, $3) RETURNING id`, w.consultation, w.lauraChild, w.laura).Scan(&w.appointment))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO supplement_routines (account_id, child_id, name, period, times, first_date, utc_offset_minutes, generated_until, created_by_account_id)
		VALUES ($1, $2, 'Vitamina D', 'daily', ARRAY['08:00'::time], current_date, -360, now(), $1) RETURNING id`, w.laura, w.lauraChild).Scan(&w.routine))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO vaccine_records (child_id, account_id, vaccine_code, applied_on, created_by_account_id)
		VALUES ($1, $2, 'bcg', '2022-04-01', $2) RETURNING id`, w.lauraChild, w.laura).Scan(&w.vaccine))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO vaccine_card_photos (child_id, account_id, photo, created_by_account_id)
		VALUES ($1, $2, '\x89504e47'::bytea, $2) RETURNING id`, w.lauraChild, w.laura).Scan(&w.cardPhoto))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO growth_measurements (child_id, account_id, measured_on, weight_kg, created_by_account_id)
		VALUES ($1, $2, '2026-09-01', 13.2, $2) RETURNING id`, w.lauraChild, w.laura).Scan(&w.msr))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO child_device_links (child_id, account_id, name, created_by_account_id, status, expires_at, redeemed_at, credential_hash)
		VALUES ($1, $2, 'Teléfono', $2, 'active', now() + interval '1 day', now(), decode(md5(random()::text), 'hex')) RETURNING id`, w.lauraChild, w.laura).Scan(&w.link))
	return w
}

func (w *world) pair(choices map[string]string) childmerge.PairInput {
	return childmerge.PairInput{OwnChildID: w.lauraChild, FamilyChildID: w.anaChild, Choices: choices}
}

func (w *world) count(t *testing.T, table, col string, id uuid.UUID) int {
	t.Helper()
	var n int
	require.NoError(t, w.pool.QueryRow(context.Background(), fmt.Sprintf(`SELECT count(*) FROM %s WHERE %s = $1`, table, col), id).Scan(&n))
	return n
}

func TestMerge_MovesEverythingKeepingIdsAndAuthors(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	ctx := context.Background()
	exec(t, w.pool, `INSERT INTO child_records (child_id, account_id, blood_type, version, updated_by_account_id) VALUES ($1, $2, 'O+', 3, $2)`, w.lauraChild, w.laura)
	exec(t, w.pool, `INSERT INTO child_record_allergies (child_id, account_id, position, name) VALUES ($1, $2, 0, 'Polen')`, w.lauraChild, w.laura)
	repo := childmerge.NewRepository(w.pool)
	moves, err := repo.Merge(ctx, w.laura, w.pair(nil))
	require.NoError(t, err)
	require.Equal(t, childmerge.MoveCounts{Consultations: 1, Vaccines: 1, CardPhotos: 1, Measurements: 1, Supplements: 1, Record: true, DevicesRemoved: 1}, *moves)

	// the child that remains holds the rows with the same ids, now in Ana's account
	for table, id := range map[string]uuid.UUID{"consultations": w.consultation, "supplement_routines": w.routine, "vaccine_records": w.vaccine,
		"vaccine_card_photos": w.cardPhoto, "growth_measurements": w.msr, "consultation_appointments": w.appointment, "child_device_links": w.link} {
		var child, acc uuid.UUID
		require.NoError(t, w.pool.QueryRow(ctx, fmt.Sprintf(`SELECT child_id, account_id FROM %s WHERE id = $1`, table), id).Scan(&child, &acc), table)
		require.Equal(t, w.anaChild, child, table)
		require.Equal(t, w.ana, acc, table)
	}
	var child, acc uuid.UUID
	require.NoError(t, w.pool.QueryRow(ctx, `SELECT child_id, account_id FROM consultation_symptoms WHERE consultation_id = $1`, w.consultation).Scan(&child, &acc))
	require.Equal(t, w.anaChild, child)
	require.Equal(t, w.ana, acc)

	// authors and marks untouched
	var by *uuid.UUID
	var taken bool
	require.NoError(t, w.pool.QueryRow(ctx, `SELECT taken, taken_by_account_id FROM doses WHERE id = $1`, w.doseTaken).Scan(&taken, &by))
	require.True(t, taken)
	require.Equal(t, w.laura, *by)
	var vacBy uuid.UUID
	require.NoError(t, w.pool.QueryRow(ctx, `SELECT created_by_account_id FROM vaccine_records WHERE id = $1`, w.vaccine).Scan(&vacBy))
	require.Equal(t, w.laura, vacBy)

	// her child is gone, the phone is removed but kept as history, the sheet went with it
	require.Equal(t, 0, w.count(t, "children", "id", w.lauraChild))
	var status string
	require.NoError(t, w.pool.QueryRow(ctx, `SELECT status FROM child_device_links WHERE id = $1`, w.link).Scan(&status))
	require.Equal(t, "revoked", status)
	rec, err := childrecord.NewRepository(w.pool).Get(ctx, w.anaChild)
	require.NoError(t, err)
	require.True(t, rec.Exists)
	require.Equal(t, "Polen", rec.Allergies[0].Name)

	// the union is recorded with numbers only
	var counts []byte
	var src, by2 uuid.UUID
	require.NoError(t, w.pool.QueryRow(ctx, `SELECT counts, source_account_id, merged_by_account_id FROM child_merges WHERE target_child_id = $1`, w.anaChild).Scan(&counts, &src, &by2))
	require.JSONEq(t, `{"consultations":1,"vaccines":1,"cardPhotos":1,"measurements":1,"supplements":1,"activities":0,"record":true,"devicesRemoved":1}`, string(counts))
	require.Equal(t, w.laura, src)
	require.Equal(t, w.laura, by2)
}

// A treatment extended before the union keeps its extension in the family's child, and purging the source account later
// neither fails on it nor takes it away.
func TestMerge_ExtensionsFollowTheConsultationAndSurviveThePurgeOfTheSourceAccount(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	ctx := context.Background()
	var ext uuid.UUID
	require.NoError(t, w.pool.QueryRow(ctx, `INSERT INTO medication_extensions (medication_id, account_id, proposed_doses, added_doses)
		VALUES ($1, $2, 2, 2) RETURNING id`, w.medicine, w.laura).Scan(&ext))

	_, err := childmerge.NewRepository(w.pool).Merge(ctx, w.laura, w.pair(nil))
	require.NoError(t, err)
	var acc uuid.UUID
	require.NoError(t, w.pool.QueryRow(ctx, `SELECT account_id FROM medication_extensions WHERE id = $1`, ext).Scan(&acc))
	require.Equal(t, w.ana, acc)

	tx, err := w.pool.Begin(ctx)
	require.NoError(t, err)
	require.NoError(t, accountdeletion.Purge(ctx, tx, w.laura))
	require.NoError(t, tx.Commit(ctx))

	require.Equal(t, 1, w.count(t, "medication_extensions", "id", ext))
	require.Equal(t, 1, w.count(t, "consultations", "id", w.consultation))
}

func TestMerge_ChoicesAreRequiredForWhatDiffersAndAppliedToTheTarget(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	ctx := context.Background()
	exec(t, w.pool, `UPDATE children SET birth_date = '2022-03-04', weight = 14, height = 95 WHERE id = $1`, w.lauraChild)
	exec(t, w.pool, `UPDATE children SET first_name = 'Mateito' WHERE id = $1`, w.lauraChild)
	repo := childmerge.NewRepository(w.pool)

	_, err := repo.Merge(ctx, w.laura, w.pair(map[string]string{"firstName": "own"}))
	var missing *childmerge.ChoicesMissingError
	require.True(t, errors.As(err, &missing))
	require.Equal(t, "birthDate", missing.Field)
	require.NotEmpty(t, missing.Error())
	require.Equal(t, 1, w.count(t, "children", "id", w.lauraChild), "nothing changed")
	require.Equal(t, 1, w.count(t, "consultations", "child_id", w.lauraChild))

	_, err = repo.Merge(ctx, w.laura, w.pair(map[string]string{"firstName": "own", "birthDate": "family", "height": "own", "weight": "family"}))
	require.NoError(t, err)
	var first string
	var birth time.Time
	var height, weight *float64
	var corrected *time.Time
	require.NoError(t, w.pool.QueryRow(ctx, `SELECT first_name, birth_date, height, weight, corrected_at FROM children WHERE id = $1`, w.anaChild).Scan(&first, &birth, &height, &weight, &corrected))
	require.Equal(t, "Mateito", first)
	require.Equal(t, "2022-03-03", birth.Format("2006-01-02"))
	require.Equal(t, 95.0, *height)
	require.Nil(t, weight, "the family's value (none) was chosen")
	require.Nil(t, corrected, "a union is not stamped as a correction")
}

func TestMerge_RecordChoicesAndTooLong(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	ctx := context.Background()
	exec(t, w.pool, `INSERT INTO child_records (child_id, account_id, blood_type, version) VALUES ($1, $2, 'O+', 1), ($3, $4, 'A+', 1)`,
		w.lauraChild, w.laura, w.anaChild, w.ana)
	repo := childmerge.NewRepository(w.pool)
	_, err := repo.Merge(ctx, w.laura, w.pair(nil))
	var missing *childmerge.ChoicesMissingError
	require.True(t, errors.As(err, &missing))
	require.Equal(t, "bloodType", missing.Field)

	_, err = repo.Merge(ctx, w.laura, w.pair(map[string]string{"bloodType": "own"}))
	require.NoError(t, err)
	rec, err := childrecord.NewRepository(w.pool).Get(ctx, w.anaChild)
	require.NoError(t, err)
	require.Equal(t, "O+", *rec.BloodType)

	// too long: nothing moves
	w2 := newWorld(t, "tutor", account.PlanPaid)
	for i := 0; i < 20; i++ {
		exec(t, w2.pool, `INSERT INTO child_records (child_id, account_id, version) VALUES ($1, $2, 1) ON CONFLICT DO NOTHING`, w2.anaChild, w2.ana)
		exec(t, w2.pool, `INSERT INTO child_record_allergies (child_id, account_id, position, name) VALUES ($1, $2, $3, $4)`, w2.anaChild, w2.ana, i, fmt.Sprintf("t%d", i))
	}
	exec(t, w2.pool, `INSERT INTO child_records (child_id, account_id, version) VALUES ($1, $2, 1)`, w2.lauraChild, w2.laura)
	for i := 0; i < 12; i++ {
		exec(t, w2.pool, `INSERT INTO child_record_allergies (child_id, account_id, position, name) VALUES ($1, $2, $3, $4)`, w2.lauraChild, w2.laura, i, fmt.Sprintf("s%d", i))
	}
	_, err = childmerge.NewRepository(w2.pool).Merge(ctx, w2.laura, w2.pair(nil))
	var tooLong *childrecord.RecordTooLongError
	require.True(t, errors.As(err, &tooLong))
	require.Equal(t, 1, w2.count(t, "children", "id", w2.lauraChild))
	require.Equal(t, 1, w2.count(t, "consultations", "child_id", w2.lauraChild))
}

func TestMerge_NotAllowed(t *testing.T) {
	ctx := context.Background()
	t.Run("a Caregiver cannot", func(t *testing.T) {
		w := newWorld(t, "caregiver", account.PlanPaid)
		_, err := childmerge.NewRepository(w.pool).Merge(ctx, w.laura, w.pair(nil))
		require.ErrorIs(t, err, childmerge.ErrMergeNotAllowed)
		require.Equal(t, 1, w.count(t, "children", "id", w.lauraChild))
	})
	t.Run("a Tutor of a family that stopped paying cannot", func(t *testing.T) {
		w := newWorld(t, "tutor", account.PlanFree)
		_, err := childmerge.NewRepository(w.pool).Merge(ctx, w.laura, w.pair(nil))
		require.ErrorIs(t, err, childmerge.ErrMergeNotAllowed)
	})
	t.Run("a paused account cannot", func(t *testing.T) {
		w := newWorld(t, "tutor", account.PlanPaid)
		exec(t, w.pool, `INSERT INTO account_deletions (account_id, scheduled_for) VALUES ($1, now() + interval '30 days')`, w.laura)
		// an open deletion left behind would be purged by the next RunOnce of the accountdeletion tests
		t.Cleanup(func() {
			_, _ = w.pool.Exec(context.Background(), `DELETE FROM account_deletions WHERE account_id = $1`, w.laura)
		})
		_, err := childmerge.NewRepository(w.pool).Merge(ctx, w.laura, w.pair(nil))
		require.ErrorIs(t, err, childmerge.ErrMergeNotAllowed)
	})
	t.Run("a child that is not hers", func(t *testing.T) {
		w := newWorld(t, "tutor", account.PlanPaid)
		_, err := childmerge.NewRepository(w.pool).Merge(ctx, w.laura, childmerge.PairInput{OwnChildID: w.anaChild, FamilyChildID: w.lauraChild})
		require.Error(t, err)
		_, err = childmerge.NewRepository(w.pool).Merge(ctx, w.laura, childmerge.PairInput{OwnChildID: uuid.New(), FamilyChildID: w.anaChild})
		require.ErrorIs(t, err, childmerge.ErrNotFound)
		_, err = childmerge.NewRepository(w.pool).Merge(ctx, w.laura, childmerge.PairInput{OwnChildID: w.lauraChild, FamilyChildID: uuid.New()})
		require.ErrorIs(t, err, childmerge.ErrNotFound)
		_, err = childmerge.NewRepository(w.pool).Merge(ctx, w.laura, childmerge.PairInput{OwnChildID: w.lauraChild, FamilyChildID: w.lauraChild})
		require.ErrorIs(t, err, childmerge.ErrMergeNotAllowed)
	})
	t.Run("someone with no family", func(t *testing.T) {
		w := newWorld(t, "tutor", account.PlanPaid)
		exec(t, w.pool, `UPDATE family_members SET status = 'left', ended_at = now() WHERE account_id = $1`, w.laura)
		_, err := childmerge.NewRepository(w.pool).Merge(ctx, w.laura, w.pair(nil))
		require.ErrorIs(t, err, childmerge.ErrMergeNotAllowed)
	})
	t.Run("the child is somebody's role in a family of hers", func(t *testing.T) {
		w := newWorld(t, "tutor", account.PlanPaid)
		kid, _, _ := newAccountWith(t, w.pool, "Hijo", account.PlanFree, time.Now().AddDate(-15, 0, 0))
		exec(t, w.pool, `INSERT INTO family_members (family_account_id, account_id, role, child_id) VALUES ($1, $2, 'child', $3)`, w.laura, kid, w.lauraChild)
		_, err := childmerge.NewRepository(w.pool).Merge(ctx, w.laura, w.pair(nil))
		require.ErrorIs(t, err, childmerge.ErrMergeNotAllowed)
	})
}

func TestMerge_BirthDateAfterAMovedMeasurementRollsEverythingBack(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	ctx := context.Background()
	// the family's child was born after Laura's measurement of 2026-09-01 and the family's value is chosen
	exec(t, w.pool, `UPDATE children SET birth_date = '2026-09-15' WHERE id = $1`, w.anaChild)
	exec(t, w.pool, `UPDATE children SET birth_date = '2026-08-01' WHERE id = $1`, w.lauraChild)
	exec(t, w.pool, `DELETE FROM vaccine_records WHERE id = $1`, w.vaccine)
	_, err := childmerge.NewRepository(w.pool).Merge(ctx, w.laura, w.pair(map[string]string{"birthDate": "family"}))
	require.ErrorIs(t, err, childmerge.ErrBirthDateConflict)
	require.Equal(t, 1, w.count(t, "children", "id", w.lauraChild))
	require.Equal(t, 1, w.count(t, "growth_measurements", "child_id", w.lauraChild))
	require.Equal(t, 1, w.count(t, "consultations", "child_id", w.lauraChild))
	require.Equal(t, 0, w.count(t, "child_merges", "target_child_id", w.anaChild))
	var status string
	require.NoError(t, w.pool.QueryRow(ctx, `SELECT status FROM child_device_links WHERE id = $1`, w.link).Scan(&status))
	require.Equal(t, "active", status, "the removal of the phone rolled back too")

	// a vaccine before the birth also conflicts
	exec(t, w.pool, `INSERT INTO vaccine_records (child_id, account_id, vaccine_code, applied_on) VALUES ($1, $2, 'bcg', '2026-08-02')`, w.lauraChild, w.laura)
	exec(t, w.pool, `DELETE FROM growth_measurements WHERE child_id = $1`, w.lauraChild)
	_, err = childmerge.NewRepository(w.pool).Merge(ctx, w.laura, w.pair(map[string]string{"birthDate": "family"}))
	require.ErrorIs(t, err, childmerge.ErrBirthDateConflict)

	// choosing hers works: 2026-08-01 is before everything
	_, err = childmerge.NewRepository(w.pool).Merge(ctx, w.laura, w.pair(map[string]string{"birthDate": "own"}))
	require.NoError(t, err)
}

func TestMerge_AMarkOfTheSameMomentIsKept(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	ctx := context.Background()
	// somebody marks the pending dose (the row is locked, not committed) while the union runs
	tx, err := w.pool.Begin(ctx)
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(ctx) }()
	_, err = tx.Exec(ctx, `UPDATE doses SET taken = true, taken_by_account_id = $2, taken_at = now() WHERE id = $1`, w.dosePending, w.laura)
	require.NoError(t, err)

	done := make(chan error, 1)
	go func() { _, err := childmerge.NewRepository(w.pool).Merge(ctx, w.laura, w.pair(nil)); done <- err }()
	select {
	case err := <-done:
		require.NoError(t, err, "the union does not wait for a mark: it never touches the dose row")
	case <-time.After(10 * time.Second):
		t.Fatal("the union waited for the dose row")
	}
	require.NoError(t, tx.Commit(ctx))

	var taken bool
	var by uuid.UUID
	require.NoError(t, w.pool.QueryRow(ctx, `SELECT taken, taken_by_account_id FROM doses WHERE id = $1`, w.dosePending).Scan(&taken, &by))
	require.True(t, taken)
	require.Equal(t, w.laura, by)
	require.Equal(t, 1, w.count(t, "consultations", "child_id", w.anaChild))
}

func TestMerge_FutureDosesAreRemindedToTheNewOwnerAndAnAlreadySentNoticeIsNotRepeated(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	ctx := context.Background()
	now := time.Date(2090, 1, 1, 12, 0, 0, 0, time.UTC).Add(time.Duration(rand.IntN(2_000_000)) * time.Hour) // far from every other test: the dev database is shared
	// a dose due now (not yet reminded) and one already reminded to Laura before the union
	var due, sent uuid.UUID
	require.NoError(t, w.pool.QueryRow(ctx, `INSERT INTO doses (medication_id, scheduled_at) VALUES ($1, $2) RETURNING id`, w.medicine, now.Add(-5*time.Minute)).Scan(&due))
	require.NoError(t, w.pool.QueryRow(ctx, `INSERT INTO doses (medication_id, scheduled_at) VALUES ($1, $2) RETURNING id`, w.medicine, now.Add(-10*time.Minute)).Scan(&sent))
	exec(t, w.pool, `INSERT INTO dose_reminders (dose_id, account_id) VALUES ($1, $2)`, sent, w.laura)
	for _, a := range []uuid.UUID{w.ana, w.laura} {
		exec(t, w.pool, `INSERT INTO reminder_devices (account_id, endpoint, p256dh, auth, activated_at) VALUES ($1, $2, 'k', 'a', $3)`,
			a, "https://fcm.googleapis.com/fcm/send/"+uuid.NewString(), now.Add(-time.Hour))
	}
	_, err := childmerge.NewRepository(w.pool).Merge(ctx, w.laura, w.pair(nil))
	require.NoError(t, err)

	got, err := reminder.NewRepository(w.pool).ClaimDueDoses(ctx, now, time.Hour)
	require.NoError(t, err)
	byDose := map[uuid.UUID][]uuid.UUID{}
	for _, d := range got {
		byDose[d.DoseID] = append(byDose[d.DoseID], d.AccountID)
	}
	require.ElementsMatch(t, []uuid.UUID{w.ana, w.laura}, byDose[due], "the owner (Ana) and the person in her family")
	require.ElementsMatch(t, []uuid.UUID{w.ana}, byDose[sent], "the notice sent to Laura is never repeated; Ana, who had none, gets hers")
}

func TestOptions(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	ctx := context.Background()
	exec(t, w.pool, `UPDATE children SET hidden_at = now() WHERE id = $1`, w.lauraChild)
	opts, err := childmerge.NewRepository(w.pool).Options(ctx, w.laura)
	require.NoError(t, err)
	require.True(t, opts.CanMerge)
	require.Equal(t, "Ana", opts.FamilyOwnerFirstName)
	require.Len(t, opts.OwnChildren, 1)
	require.True(t, opts.OwnChildren[0].Hidden, "hidden children are listed too")
	require.Equal(t, 1, opts.OwnChildren[0].Counts.Consultations)
	require.Equal(t, 1, opts.OwnChildren[0].Counts.ActiveDevices)
	require.Equal(t, 1, opts.OwnChildren[0].Counts.Supplements)
	require.Len(t, opts.FamilyChildren, 1)
	require.Equal(t, w.anaChild.String(), opts.FamilyChildren[0].ID)
	require.Equal(t, []childmerge.SuggestedPair{{OwnChildID: w.lauraChild.String(), FamilyChildID: w.anaChild.String(), Reason: "same_name"}}, opts.SuggestedPairs)

	// a Caregiver sees the screen but cannot merge; the owner has no family to merge into
	cg := newWorld(t, "caregiver", account.PlanPaid)
	opts, err = childmerge.NewRepository(cg.pool).Options(ctx, cg.laura)
	require.NoError(t, err)
	require.False(t, opts.CanMerge)
	_, err = childmerge.NewRepository(w.pool).Options(ctx, w.ana)
	require.ErrorIs(t, err, childmerge.ErrNoFamily)
	_, err = childmerge.NewRepository(w.pool).Options(ctx, uuid.New())
	require.ErrorIs(t, err, childmerge.ErrNoFamily)
}

func TestPreview_DifferencesMovesAndOverLimits(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	ctx := context.Background()
	exec(t, w.pool, `UPDATE children SET weight = 14 WHERE id = $1`, w.lauraChild)
	// Ana's Mateo already has 10 vitamins: 11 would be over the cap of 10
	for i := 0; i < 10; i++ {
		exec(t, w.pool, `INSERT INTO supplement_routines (account_id, child_id, name, period, times, first_date, utc_offset_minutes, generated_until)
			VALUES ($1, $2, $3, 'daily', ARRAY['08:00'::time], current_date, -360, now())`, w.ana, w.anaChild, fmt.Sprintf("v%d", i))
	}
	// both have a sheet and 25 + 10 conditions
	exec(t, w.pool, `INSERT INTO child_records (child_id, account_id, version) VALUES ($1, $2, 1), ($3, $4, 1)`, w.lauraChild, w.laura, w.anaChild, w.ana)
	for i := 0; i < 25; i++ {
		exec(t, w.pool, `INSERT INTO child_record_conditions (child_id, account_id, position, name) VALUES ($1, $2, $3, $4)`, w.anaChild, w.ana, i, fmt.Sprintf("a%d", i))
	}
	for i := 0; i < 10; i++ {
		exec(t, w.pool, `INSERT INTO child_record_conditions (child_id, account_id, position, name) VALUES ($1, $2, $3, $4)`, w.lauraChild, w.laura, i, fmt.Sprintf("l%d", i))
	}
	got, err := childmerge.NewRepository(w.pool).Preview(ctx, w.laura, []childmerge.PairInput{w.pair(nil)})
	require.NoError(t, err)
	require.Len(t, got, 1)
	p := got[0]
	require.Equal(t, []string{"weight"}, p.Differences)
	require.Equal(t, 1, p.Moves.Consultations)
	require.True(t, p.Moves.Record)
	require.Equal(t, 1, p.Moves.DevicesRemoved)
	require.Equal(t, []childmerge.OverLimit{{Kind: "supplements", Resulting: 11, Limit: 10}}, p.OverLimits)
	require.NotNil(t, p.RecordTooLong)
	require.Equal(t, childmerge.TooLong{List: "conditions", Resulting: 35, Limit: 30}, *p.RecordTooLong)

	// nothing was written
	require.Equal(t, 1, w.count(t, "children", "id", w.lauraChild))
	require.Equal(t, 0, w.count(t, "child_merges", "target_child_id", w.anaChild))
}

func TestPreview_Errors(t *testing.T) {
	ctx := context.Background()
	w := newWorld(t, "caregiver", account.PlanPaid)
	repo := childmerge.NewRepository(w.pool)
	_, err := repo.Preview(ctx, w.laura, []childmerge.PairInput{w.pair(nil)})
	require.ErrorIs(t, err, childmerge.ErrMergeNotAllowed)
	_, err = repo.Preview(ctx, w.ana, []childmerge.PairInput{w.pair(nil)})
	require.ErrorIs(t, err, childmerge.ErrNoFamily)

	w2 := newWorld(t, "tutor", account.PlanPaid)
	repo = childmerge.NewRepository(w2.pool)
	_, err = repo.Preview(ctx, w2.laura, []childmerge.PairInput{{OwnChildID: uuid.New(), FamilyChildID: w2.anaChild}})
	require.ErrorIs(t, err, childmerge.ErrNotFound)
	_, err = repo.Preview(ctx, w2.laura, []childmerge.PairInput{{OwnChildID: w2.lauraChild, FamilyChildID: uuid.New()}})
	require.ErrorIs(t, err, childmerge.ErrNotFound)
}

func TestMerge_ClosedPoolFails(t *testing.T) {
	pool := testPool(t)
	repo := childmerge.NewRepository(pool)
	pool.Close()
	ctx := context.Background()
	_, err := repo.Merge(ctx, uuid.New(), childmerge.PairInput{OwnChildID: uuid.New(), FamilyChildID: uuid.New()})
	require.Error(t, err)
	_, err = repo.Options(ctx, uuid.New())
	require.Error(t, err)
	_, err = repo.Preview(ctx, uuid.New(), nil)
	require.Error(t, err)
}

func TestOptions_ShowsTheSheetSummary(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	exec(t, w.pool, `INSERT INTO child_records (child_id, account_id, blood_type, general_note, pediatrician_name, pediatrician_phone, version) VALUES ($1, $2, 'O+', 'nota', 'Dra. Ruiz', '123', 1)`, w.lauraChild, w.laura)
	exec(t, w.pool, `INSERT INTO child_record_allergies (child_id, account_id, position, name) VALUES ($1, $2, 0, 'Polen')`, w.lauraChild, w.laura)
	exec(t, w.pool, `INSERT INTO child_record_conditions (child_id, account_id, position, name) VALUES ($1, $2, 0, 'Asma')`, w.lauraChild, w.laura)
	opts, err := childmerge.NewRepository(w.pool).Options(context.Background(), w.laura)
	require.NoError(t, err)
	rec := opts.OwnChildren[0].Record
	require.True(t, rec.Exists)
	require.Equal(t, "O+", *rec.BloodType)
	require.Equal(t, "nota", *rec.GeneralNote)
	require.Equal(t, "Dra. Ruiz", *rec.Pediatrician.Name)
	require.Equal(t, "123", *rec.Pediatrician.Phone)
	require.Nil(t, rec.Pediatrician.Office)
	require.Equal(t, 1, rec.Allergies)
	require.Equal(t, 1, rec.Conditions)
	require.False(t, opts.FamilyChildren[0].Record.Exists)
}
