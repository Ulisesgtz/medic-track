package consultation_test

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

func samplePhoto() []byte { return []byte("fake-jpeg-bytes") }

// TestRepository_GetByChild_Empty covers FR-002: a child with no
// consultations returns an empty (not nil) slice.
func TestRepository_GetByChild_Empty(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	childID := createTestChild(t, pool)

	got, err := repo.GetByChild(context.Background(), childID)

	require.NoError(t, err)
	require.NotNil(t, got)
	require.Empty(t, got)
}

// TestRepository_GetByChild_NotFound covers the 404 case (FR-001).
func TestRepository_GetByChild_NotFound(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)

	_, err := repo.GetByChild(context.Background(), uuid.New())

	require.ErrorIs(t, err, consultation.ErrChildNotFound)
}

// TestRepository_Create_WithDoses covers FR-009: a medication with a start
// time generates all its expected doses at once, in the same transaction.
func TestRepository_Create_WithDoses(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	childID := createTestChild(t, pool)

	c := &consultation.Consultation{
		DoctorName:  "Dra. López",
		ConsultDate: time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Photo:       samplePhoto(),
		Symptoms:    "Tos",
		Medications: []consultation.Medication{
			{Name: "Amoxicilina", FrequencyHours: 8, DurationDays: 3, StartTime: strPtr("08:00")},
		},
	}

	err := repo.Create(context.Background(), childID, c)

	require.NoError(t, err)
	require.NotEqual(t, uuid.Nil, c.ID)
	require.Len(t, c.Medications, 1)
	require.Len(t, c.Medications[0].Doses, 9) // 3 days * 24h / 8h = 9

	got, err := repo.GetByChild(context.Background(), childID)
	require.NoError(t, err)
	require.Len(t, got, 1)
}

// TestRepository_Create_WithoutStartTime covers FR-010: a medication with
// no start time generates zero doses.
func TestRepository_Create_WithoutStartTime(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	childID := createTestChild(t, pool)

	c := &consultation.Consultation{
		DoctorName:  "Dra. López",
		ConsultDate: time.Now(),
		Photo:       samplePhoto(),
		Medications: []consultation.Medication{
			{Name: "Ibuprofeno", FrequencyHours: 12, DurationDays: 2},
		},
	}

	err := repo.Create(context.Background(), childID, c)

	require.NoError(t, err)
	require.Empty(t, c.Medications[0].Doses)
}

// TestRepository_Create_NonDivisorFrequency covers the corrected dose-count
// algorithm (analyze finding A1): a frequency that doesn't divide 24 evenly
// must still compute the right number of doses via elapsed-time math, not
// per-day bucketing.
func TestRepository_Create_NonDivisorFrequency(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	childID := createTestChild(t, pool)

	c := &consultation.Consultation{
		DoctorName:  "Dra. López",
		ConsultDate: time.Now(),
		Photo:       samplePhoto(),
		Medications: []consultation.Medication{
			{Name: "Jarabe", FrequencyHours: 5, DurationDays: 1, StartTime: strPtr("08:00")},
		},
	}

	err := repo.Create(context.Background(), childID, c)

	require.NoError(t, err)
	require.Len(t, c.Medications[0].Doses, 4) // floor(24/5) = 4, not 5
}

// TestRepository_Create_ChildNotFound covers the 404 case (FR-004).
func TestRepository_Create_ChildNotFound(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)

	c := &consultation.Consultation{
		DoctorName: "Dra. López", ConsultDate: time.Now(), Photo: samplePhoto(),
		Medications: []consultation.Medication{{Name: "X", FrequencyHours: 8, DurationDays: 1}},
	}

	err := repo.Create(context.Background(), uuid.New(), c)

	require.ErrorIs(t, err, consultation.ErrChildNotFound)
}

// TestRepository_GetByID_NotFound covers FR-013's 404 case.
func TestRepository_GetByID_NotFound(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)

	_, err := repo.GetByID(context.Background(), uuid.New())

	require.ErrorIs(t, err, consultation.ErrConsultationNotFound)
}

// TestRepository_GetByID_WithMedicationsAndDoses covers FR-013's happy path.
func TestRepository_GetByID_WithMedicationsAndDoses(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	childID := createTestChild(t, pool)

	created := &consultation.Consultation{
		DoctorName: "Dra. López", ConsultDate: time.Now(), Photo: samplePhoto(), Symptoms: "Fiebre",
		Medications: []consultation.Medication{
			{Name: "Amoxicilina", FrequencyHours: 24, DurationDays: 1, StartTime: strPtr("08:00")},
		},
	}
	require.NoError(t, repo.Create(context.Background(), childID, created))

	got, err := repo.GetByID(context.Background(), created.ID)

	require.NoError(t, err)
	require.Equal(t, "Dra. López", got.DoctorName)
	require.Equal(t, samplePhoto(), got.Photo)
	require.Len(t, got.Medications, 1)
	require.Len(t, got.Medications[0].Doses, 1)
	require.False(t, got.Medications[0].Doses[0].Taken)
}

// TestRepository_UpdateDoseStatus covers FR-011/FR-016: marking a dose
// works regardless of its scheduled date.
func TestRepository_UpdateDoseStatus(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	childID := createTestChild(t, pool)

	created := &consultation.Consultation{
		DoctorName: "Dra. López", ConsultDate: time.Now().AddDate(0, 0, -30), Photo: samplePhoto(),
		Medications: []consultation.Medication{
			{Name: "Amoxicilina", FrequencyHours: 24, DurationDays: 1, StartTime: strPtr("08:00")},
		},
	}
	require.NoError(t, repo.Create(context.Background(), childID, created))
	doseID := created.Medications[0].Doses[0].ID

	updated, err := repo.UpdateDoseStatus(context.Background(), doseID, true)

	require.NoError(t, err)
	require.True(t, updated.Taken)
}

func TestRepository_UpdateDoseStatus_NotFound(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)

	_, err := repo.UpdateDoseStatus(context.Background(), uuid.New(), true)

	require.ErrorIs(t, err, consultation.ErrDoseNotFound)
}

func TestRepository_GetByChild_ConnectionError(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	repo := consultation.NewRepository(closedPool(t, dsn))

	_, err := repo.GetByChild(context.Background(), uuid.New())

	require.Error(t, err)
}

func TestRepository_GetByID_ConnectionError(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	repo := consultation.NewRepository(closedPool(t, dsn))

	_, err := repo.GetByID(context.Background(), uuid.New())

	require.Error(t, err)
	require.False(t, errors.Is(err, consultation.ErrConsultationNotFound))
}

func TestRepository_Create_ConnectionError(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	repo := consultation.NewRepository(closedPool(t, dsn))

	err := repo.Create(context.Background(), uuid.New(), &consultation.Consultation{
		DoctorName: "X", ConsultDate: time.Now(), Photo: samplePhoto(),
	})

	require.Error(t, err)
}

func TestRepository_UpdateDoseStatus_ConnectionError(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	repo := consultation.NewRepository(closedPool(t, dsn))

	_, err := repo.UpdateDoseStatus(context.Background(), uuid.New(), true)

	require.Error(t, err)
}
