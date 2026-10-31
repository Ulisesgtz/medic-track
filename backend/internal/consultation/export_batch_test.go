package consultation_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// specs/050 (T034): the history's PDF reads its consultations in one batch. It must read exactly what GetByIDWithoutPhoto reads
// for each one — symptoms, medications in their order, doses with their status and author, extensions and the end.

func TestListWithoutPhoto_ReadsTheSameAsOneByOneInTheOrderAsked(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	now := time.Now()
	consultation.SetNow(repo, func() time.Time { return now })
	svc := consultation.NewService(repo)
	ctx := context.Background()
	childID := createTestChild(t, pool)
	n := time.Now().UTC()
	day := func(back int) time.Time { return time.Date(n.Year(), n.Month(), n.Day()-back, 0, 0, 0, 0, time.UTC) }

	marked, err := svc.CreateConsultation(ctx, childID, consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: day(1), Photo: samplePhoto(), SymptomCodes: []string{"cough", "fever"}, Notes: "Tos",
		Medications: []consultation.CreateMedicationInput{
			{Name: "Amoxicilina", FrequencyHours: 8, DurationDays: 2, StartTime: strPtr("08:00")},
			{Name: "Paracetamol", FrequencyHours: 6, DurationDays: 1, StartTime: strPtr("09:00")},
		},
	})
	require.NoError(t, err)
	amox := marked.Medications[0]
	_, err = svc.MarkDose(ctx, marked.ID, amox.Doses[0].ID, true, consultation.Actor{})
	require.NoError(t, err)
	_, err = svc.ExtendTreatment(ctx, marked.ID, amox.ID, 2)
	require.NoError(t, err)
	_, err = svc.EndTreatment(ctx, marked.ID, amox.ID)
	require.NoError(t, err)

	record, err := svc.CreateConsultation(ctx, childID, consultation.CreateConsultationInput{
		DoctorName: "Dr. Ruiz", ConsultDate: day(30), RecordOnly: true, Photo: samplePhoto(),
		Medications: []consultation.CreateMedicationInput{{Name: "Vitamina D", FrequencyHours: 24, DurationDays: 30}},
	})
	require.NoError(t, err)
	bare, err := svc.CreateConsultation(ctx, childID, consultation.CreateConsultationInput{
		DoctorName: "Dra. Ana", ConsultDate: day(60), Photo: samplePhoto(),
		Medications: []consultation.CreateMedicationInput{{Name: "Ibuprofeno", FrequencyHours: 12, DurationDays: 1, StartTime: strPtr("10:00")}},
	})
	require.NoError(t, err)

	ids := []uuid.UUID{bare.ID, uuid.New(), marked.ID, record.ID}
	got, err := repo.ListWithoutPhoto(ctx, ids)
	require.NoError(t, err)
	require.Len(t, got, 3, "an id that doesn't exist is left out")
	for i, id := range []uuid.UUID{bare.ID, marked.ID, record.ID} {
		one, err := repo.GetByIDWithoutPhoto(ctx, id)
		require.NoError(t, err)
		require.Equal(t, one, got[i], "consultation %d reads the same in the batch", i)
	}
	require.NotEmpty(t, got[1].Medications[0].Extensions)
	require.NotNil(t, got[1].Medications[0].EndedAt)

	empty, err := repo.ListWithoutPhoto(ctx, nil)
	require.NoError(t, err)
	require.Empty(t, empty)
}

func TestListWithoutPhoto_ADatabaseErrorIsReturned(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := repo.ListWithoutPhoto(ctx, []uuid.UUID{uuid.New()})
	require.Error(t, err)
}
