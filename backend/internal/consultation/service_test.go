package consultation_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

func validMedication() consultation.CreateMedicationInput {
	return consultation.CreateMedicationInput{Name: "Amoxicilina", FrequencyHours: 8, DurationDays: 3, StartTime: strPtr("08:00")}
}

func TestService_CreateConsultation_Success(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)

	c, err := svc.CreateConsultation(context.Background(), childID, consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: time.Now(), Photo: samplePhoto(),
		Medications: []consultation.CreateMedicationInput{validMedication()},
	})

	require.NoError(t, err)
	require.Len(t, c.Medications, 1)
	require.Len(t, c.Medications[0].Doses, 9)
}

// TestService_CreateConsultation_Validation covers FR-004/FR-015.
func TestService_CreateConsultation_Validation(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)

	future := time.Now().AddDate(1, 0, 0)

	tests := []struct {
		name          string
		input         consultation.CreateConsultationInput
		wantFieldErrs []string
	}{
		{
			name:          "missing doctor name",
			input:         consultation.CreateConsultationInput{ConsultDate: time.Now(), Photo: samplePhoto(), Medications: []consultation.CreateMedicationInput{validMedication()}},
			wantFieldErrs: []string{"doctorName"},
		},
		{
			name:          "missing consult date",
			input:         consultation.CreateConsultationInput{DoctorName: "Dra. López", Photo: samplePhoto(), Medications: []consultation.CreateMedicationInput{validMedication()}},
			wantFieldErrs: []string{"consultDate"},
		},
		{
			name:          "future consult date",
			input:         consultation.CreateConsultationInput{DoctorName: "Dra. López", ConsultDate: future, Photo: samplePhoto(), Medications: []consultation.CreateMedicationInput{validMedication()}},
			wantFieldErrs: []string{"consultDate"},
		},
		{
			name:          "missing photo",
			input:         consultation.CreateConsultationInput{DoctorName: "Dra. López", ConsultDate: time.Now(), Medications: []consultation.CreateMedicationInput{validMedication()}},
			wantFieldErrs: []string{"photoBase64"},
		},
		{
			name:          "no medications",
			input:         consultation.CreateConsultationInput{DoctorName: "Dra. López", ConsultDate: time.Now(), Photo: samplePhoto()},
			wantFieldErrs: []string{"medications"},
		},
		{
			name: "non-positive frequency",
			input: consultation.CreateConsultationInput{
				DoctorName: "Dra. López", ConsultDate: time.Now(), Photo: samplePhoto(),
				Medications: []consultation.CreateMedicationInput{{Name: "X", FrequencyHours: 0, DurationDays: 1}},
			},
			wantFieldErrs: []string{"medications[0].frequencyHours"},
		},
		{
			name: "non-positive duration",
			input: consultation.CreateConsultationInput{
				DoctorName: "Dra. López", ConsultDate: time.Now(), Photo: samplePhoto(),
				Medications: []consultation.CreateMedicationInput{{Name: "X", FrequencyHours: 8, DurationDays: -1}},
			},
			wantFieldErrs: []string{"medications[0].durationDays"},
		},
		{
			name: "missing start time",
			input: consultation.CreateConsultationInput{
				DoctorName: "Dra. López", ConsultDate: time.Now(), Photo: samplePhoto(),
				Medications: []consultation.CreateMedicationInput{{Name: "X", FrequencyHours: 8, DurationDays: 1}},
			},
			wantFieldErrs: []string{"medications[0].startTime"},
		},
		{
			name: "empty start time",
			input: consultation.CreateConsultationInput{
				DoctorName: "Dra. López", ConsultDate: time.Now(), Photo: samplePhoto(),
				Medications: []consultation.CreateMedicationInput{{Name: "X", FrequencyHours: 8, DurationDays: 1, StartTime: strPtr("")}},
			},
			wantFieldErrs: []string{"medications[0].startTime"},
		},
		{
			name: "malformed start time",
			input: consultation.CreateConsultationInput{
				DoctorName: "Dra. López", ConsultDate: time.Now(), Photo: samplePhoto(),
				Medications: []consultation.CreateMedicationInput{{Name: "X", FrequencyHours: 8, DurationDays: 1, StartTime: strPtr("25:99")}},
			},
			wantFieldErrs: []string{"medications[0].startTime"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := svc.CreateConsultation(context.Background(), childID, tt.input)

			require.Error(t, err)
			var validationErrs consultation.ValidationErrors
			require.ErrorAs(t, err, &validationErrs)

			gotFields := make(map[string]bool)
			for _, e := range validationErrs {
				gotFields[e.Field] = true
			}
			for _, want := range tt.wantFieldErrs {
				require.True(t, gotFields[want], "expected a validation error on field %q, got %+v", want, validationErrs)
			}
		})
	}
}

func TestService_CreateConsultation_ChildNotFound(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))

	_, err := svc.CreateConsultation(context.Background(), uuid.New(), consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: time.Now(), Photo: samplePhoto(),
		Medications: []consultation.CreateMedicationInput{validMedication()},
	})

	require.ErrorIs(t, err, consultation.ErrChildNotFound)
}

// TestService_DoseGeneration covers the corrected algorithm (analyze A1):
// total = floor(duration_days*24 / frequency_hours) doses.
func TestService_DoseGeneration(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)

	tests := []struct {
		name          string
		frequency     int
		duration      int
		startTime     *string
		expectedDoses int
	}{
		{name: "every 8h for 3 days", frequency: 8, duration: 3, startTime: strPtr("08:00"), expectedDoses: 9},
		{name: "every 24h for 1 day", frequency: 24, duration: 1, startTime: strPtr("08:00"), expectedDoses: 1},
		{name: "every 5h for 1 day (non-divisor)", frequency: 5, duration: 1, startTime: strPtr("08:00"), expectedDoses: 4},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, err := svc.CreateConsultation(context.Background(), childID, consultation.CreateConsultationInput{
				DoctorName: "Dra. López", ConsultDate: time.Now(), Photo: samplePhoto(),
				Medications: []consultation.CreateMedicationInput{
					{Name: "X", FrequencyHours: tt.frequency, DurationDays: tt.duration, StartTime: tt.startTime},
				},
			})
			require.NoError(t, err)
			require.Len(t, c.Medications[0].Doses, tt.expectedDoses)
		})
	}
}

func TestService_GetConsultation_NotFound(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))

	_, err := svc.GetConsultation(context.Background(), uuid.New())

	require.ErrorIs(t, err, consultation.ErrConsultationNotFound)
}

func TestService_MarkDose(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)

	c, err := svc.CreateConsultation(context.Background(), childID, consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: time.Now(), Photo: samplePhoto(),
		Medications: []consultation.CreateMedicationInput{validMedication()},
	})
	require.NoError(t, err)

	dose, err := svc.MarkDose(context.Background(), c.ID, c.Medications[0].Doses[0].ID, true)

	require.NoError(t, err)
	require.True(t, dose.Taken)
}

func TestService_MarkDose_NotFound(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))

	_, err := svc.MarkDose(context.Background(), uuid.New(), uuid.New(), true)

	require.ErrorIs(t, err, consultation.ErrDoseNotFound)
}
