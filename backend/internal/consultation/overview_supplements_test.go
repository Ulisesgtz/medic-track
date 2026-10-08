package consultation_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// specs/033: the doses of a child's active supplement routines are part of "Tomas de hoy", but never a treatment.

func insertRoutine(t *testing.T, pool *pgxpool.Pool, childID uuid.UUID, name, status string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO supplement_routines (account_id, child_id, name, period, times, first_date, utc_offset_minutes, status, paused_at, ended_at, generated_until, created_by_account_id)
		SELECT ch.account_id, ch.id, $2, 'daily', ARRAY['08:00']::time[], current_date - 2, 0, $3,
		       CASE WHEN $3 = 'paused' THEN now() END, CASE WHEN $3 = 'ended' THEN now() END, now() + interval '14 days', ch.account_id
		FROM children ch WHERE ch.id = $1
		RETURNING id`, childID, name, status).Scan(&id))
	return id
}

func insertRoutineDose(t *testing.T, pool *pgxpool.Pool, routineID uuid.UUID, at time.Time, taken bool) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO supplement_doses (routine_id, scheduled_at, taken) VALUES ($1, $2, $3) RETURNING id`, routineID, at, taken).Scan(&id))
	return id
}

func TestGetOverview_IncludesSupplementDosesOfActiveRoutinesOrderedByTime(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	childID := createTestChild(t, pool)
	day := today()
	c := createOverviewConsultation(t, repo, childID, day,
		consultation.Medication{Name: "Amoxicilina", FrequencyHours: 8, DurationDays: 3, StartTime: strPtr("08:00")})
	medDose := c.Medications[0].Doses[0]

	routine := insertRoutine(t, pool, childID, "Vitamina D", "active")
	earlier := insertRoutineDose(t, pool, routine, medDose.ScheduledAt.Add(-time.Hour), false)
	later := insertRoutineDose(t, pool, routine, medDose.ScheduledAt.Add(time.Hour), true)
	paused := insertRoutine(t, pool, childID, "Pausada", "paused")
	insertRoutineDose(t, pool, paused, medDose.ScheduledAt, false)
	ended := insertRoutine(t, pool, childID, "Terminada", "ended")
	insertRoutineDose(t, pool, ended, medDose.ScheduledAt, false)
	otherChild := createTestChild(t, pool)
	insertRoutineDose(t, pool, insertRoutine(t, pool, otherChild, "De otro hijo", "active"), medDose.ScheduledAt, false)

	now := medDose.ScheduledAt.Add(90 * time.Minute)
	got, err := repo.GetOverview(context.Background(), childID, medDose.ScheduledAt.Add(-2*time.Hour), medDose.ScheduledAt.Add(2*time.Hour), now)
	require.NoError(t, err)

	require.Len(t, got.Doses, 3, "the paused, the ended and another child's routine do not show")
	require.Equal(t, earlier, got.Doses[0].ID)
	require.Equal(t, consultation.DoseKindSupplement, got.Doses[0].Kind)
	require.Equal(t, routine, got.Doses[0].RoutineID)
	require.Equal(t, "Vitamina D", got.Doses[0].MedicationName)
	require.Equal(t, uuid.Nil, got.Doses[0].ConsultationID)
	require.Equal(t, consultation.DoseStatus("unregistered"), got.Doses[0].Status, "the routine's next dose came")
	require.Equal(t, medDose.ID, got.Doses[1].ID)
	require.Equal(t, consultation.DoseKindMedication, got.Doses[1].Kind)
	require.Equal(t, later, got.Doses[2].ID)
	require.True(t, got.Doses[2].Taken)
	require.Equal(t, consultation.DoseStatus("taken"), got.Doses[2].Status)

	// A supplement is never an active treatment.
	require.NotNil(t, got.ActiveTreatment)
	require.Equal(t, "Amoxicilina", got.ActiveTreatment.MedicationName)
	require.Zero(t, got.ActiveTreatment.OtherCount)
}

func TestGetOverview_ASupplementOnlyChildHasNoActiveTreatment(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	childID := createTestChild(t, pool)
	at := today().Add(10 * time.Hour)
	insertRoutineDose(t, pool, insertRoutine(t, pool, childID, "Zinc", "active"), at, false)

	got, err := repo.GetOverview(context.Background(), childID, at.Add(-time.Hour), at.Add(time.Hour), at)
	require.NoError(t, err)
	require.Len(t, got.Doses, 1)
	require.Nil(t, got.ActiveTreatment)
}

// specs/035: a child's activities are marked from their own card, so they are not in «Tomas de hoy».
func TestGetOverview_ActivitiesOfTheChildAreNotInTheTodayList(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	childID := createTestChild(t, pool)
	var activity uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO supplement_routines (account_id, child_id, kind, name, period, window_start, window_end, interval_minutes, first_date, utc_offset_minutes, generated_until, created_by_account_id)
		SELECT ch.account_id, ch.id, 'activity', 'Tomar agua', 'window', '08:00', '20:00', 60, current_date - 2, 0, now() + interval '14 days', ch.account_id
		FROM children ch WHERE ch.id = $1
		RETURNING id`, childID).Scan(&activity))
	at := time.Now().UTC().Truncate(time.Hour)
	insertRoutineDose(t, pool, activity, at, false)
	supplement := insertRoutine(t, pool, childID, "Vitamina D", "active")
	shown := insertRoutineDose(t, pool, supplement, at.Add(time.Minute), false)

	got, err := repo.GetOverview(context.Background(), childID, at.Add(-time.Hour), at.Add(time.Hour), at.Add(30*time.Minute))
	require.NoError(t, err)
	require.Len(t, got.Doses, 1, "only the supplement's dose")
	require.Equal(t, shown, got.Doses[0].ID)
}
