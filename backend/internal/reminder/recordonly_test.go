package reminder_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
)

// Specs/024: a consultation saved only as a record has no doses, so there is nothing to remind about.
func TestRepository_ClaimDueDoses_NothingFromARecordOnlyConsultation(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	f := newFamily(t, pool, nil)
	device := f.device(t, repo, uniqueEndpoint())
	activatedAt(t, pool, device.ID, time.Now().Add(-48*time.Hour))

	svc := consultation.NewService(consultation.NewRepository(pool))
	c, err := svc.CreateConsultation(context.Background(), f.childID, consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: time.Now().AddDate(0, 0, -1), Photo: []byte("x"), RecordOnly: true,
		Medications: []consultation.CreateMedicationInput{{Name: "Amoxicilina", FrequencyHours: 1, DurationDays: 3}},
	})
	require.NoError(t, err)

	claimed, err := repo.ClaimDueDoses(context.Background(), time.Now(), 24*time.Hour)

	require.NoError(t, err)
	for _, d := range claimed {
		require.NotEqual(t, c.ID, d.ConsultationID, "a record-only consultation must never be reminded")
	}
	var doses int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT count(*) FROM doses WHERE medication_id = $1`, c.Medications[0].ID).Scan(&doses))
	require.Zero(t, doses)
}
