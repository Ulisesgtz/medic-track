package consultation_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// specs/016: ending a treatment early. yesterdaysConsultation (dosestatus_read_test.go) has a medication every 8 h for
// 2 days from yesterday 08:00 UTC: six doses, the first behind us and the last one (tomorrow 00:00) still ahead.

func TestEndTreatment_CancelsTheDosesAheadAndKeepsTheRest(t *testing.T) {
	svc, _, c := yesterdaysConsultation(t)
	med := c.Medications[0]
	require.NoError(t, func() error { _, err := svc.MarkDose(context.Background(), c.ID, med.Doses[0].ID, true, anyone); return err }())

	ended, err := svc.EndTreatment(context.Background(), c.ID, med.ID)

	require.NoError(t, err)
	require.NotNil(t, ended.EndedAt)
	require.Len(t, ended.Doses, 6, "no dose is deleted")
	require.Equal(t, consultation.DoseStatusTaken, ended.Doses[0].Status, "a marked dose stays")
	require.Equal(t, consultation.DoseStatusCanceled, ended.Doses[5].Status, "tomorrow 00:00 had not come")
	require.True(t, ended.Doses[0].Taken)
	// The doses that had already come keep their own status and can still be marked.
	marked, err := svc.MarkDose(context.Background(), c.ID, med.Doses[1].ID, true, anyone)
	require.NoError(t, err)
	require.Equal(t, consultation.DoseStatusTaken, marked.Status)
	// A canceled dose read again is still canceled (unless the parent marks it).
	got, err := svc.GetConsultation(context.Background(), c.ID)
	require.NoError(t, err)
	require.Equal(t, consultation.DoseStatusCanceled, got.Medications[0].Doses[5].Status)
	require.NotNil(t, got.Medications[0].EndedAt)
}

func TestEndTreatment_IsIdempotent(t *testing.T) {
	svc, _, c := yesterdaysConsultation(t)

	first, err := svc.EndTreatment(context.Background(), c.ID, c.Medications[0].ID)
	require.NoError(t, err)
	time.Sleep(20 * time.Millisecond)
	second, err := svc.EndTreatment(context.Background(), c.ID, c.Medications[0].ID)

	require.NoError(t, err)
	require.True(t, first.EndedAt.Equal(*second.EndedAt), "the first moment is kept")
}

func TestEndTreatment_OnlyThatMedicationInThatConsultation(t *testing.T) {
	svc, _, c := yesterdaysConsultation(t)
	_, otherChildC := func() (*consultation.Service, *consultation.Consultation) {
		s, _, other := yesterdaysConsultation(t)
		return s, other
	}()

	_, err := svc.EndTreatment(context.Background(), c.ID, uuid.New())
	require.ErrorIs(t, err, consultation.ErrMedicationNotFound)
	// A medication of another consultation is not found through this one.
	_, err = svc.EndTreatment(context.Background(), c.ID, otherChildC.Medications[0].ID)
	require.ErrorIs(t, err, consultation.ErrMedicationNotFound)
}

func TestEndTreatment_NothingAheadIsRefused(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	c, err := svc.CreateConsultation(context.Background(), childID, consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: time.Now().AddDate(0, 0, -10), Photo: samplePhoto(),
		Medications: []consultation.CreateMedicationInput{{Name: "Vieja", FrequencyHours: 8, DurationDays: 1, StartTime: strPtr("08:00")}},
	})
	require.NoError(t, err)

	_, err = svc.EndTreatment(context.Background(), c.ID, c.Medications[0].ID)

	require.ErrorIs(t, err, consultation.ErrNothingToEnd)
}

func TestEndTreatment_LeavesTheOtherMedicationAndTheActiveTreatmentAlone(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	n := time.Now().UTC()
	yesterday := time.Date(n.Year(), n.Month(), n.Day()-1, 0, 0, 0, 0, time.UTC)
	c, err := svc.CreateConsultation(context.Background(), childID, consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: yesterday, Photo: samplePhoto(),
		Medications: []consultation.CreateMedicationInput{
			{Name: "Termina", FrequencyHours: 8, DurationDays: 2, StartTime: strPtr("08:00")},
			{Name: "Sigue", FrequencyHours: 8, DurationDays: 2, StartTime: strPtr("08:00")},
		},
	})
	require.NoError(t, err)

	_, err = svc.EndTreatment(context.Background(), c.ID, c.Medications[0].ID)
	require.NoError(t, err)

	got, err := svc.GetConsultation(context.Background(), c.ID)
	require.NoError(t, err)
	byName := map[string]consultation.Medication{}
	for _, m := range got.Medications {
		byName[m.Name] = m
	}
	require.NotNil(t, byName["Termina"].EndedAt)
	require.Nil(t, byName["Sigue"].EndedAt)
	require.Equal(t, consultation.DoseStatusPending, byName["Sigue"].Doses[5].Status)

	// The ended one is no longer "active treatment": only the other is (specs/006).
	first := c.Medications[0].Doses[0].ScheduledAt
	overview, err := svc.GetChildOverview(context.Background(), childID, first, first.Add(47*time.Hour))
	require.NoError(t, err)
	require.NotNil(t, overview.ActiveTreatment)
	require.Equal(t, "Sigue", overview.ActiveTreatment.MedicationName)
	require.Zero(t, overview.ActiveTreatment.OtherCount)
	for _, d := range overview.Doses {
		require.NotEqual(t, consultation.DoseStatusCanceled, d.Status)
	}
	var canceledOfTheEnded int
	for _, d := range overview.Doses {
		if d.MedicationName == "Termina" && d.ScheduledAt.After(*byName["Termina"].EndedAt) && !d.Taken {
			canceledOfTheEnded++
		}
	}
	require.Zero(t, canceledOfTheEnded, "canceled doses are not among the day's")
}

func TestEndTreatment_Handler(t *testing.T) {
	_, _, c := yesterdaysConsultation(t)
	router, _ := routerWithPool(t)
	path := "/consultations/" + c.ID.String() + "/medications/" + c.Medications[0].ID.String() + "/end"

	rec := doPostPath(t, router, path, nil)
	require.Equal(t, http.StatusOK, rec.Code)
	var med struct {
		EndedAt *string `json:"endedAt"`
		Doses   []struct {
			Status string `json:"status"`
		} `json:"doses"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &med))
	require.NotNil(t, med.EndedAt)
	require.Equal(t, "canceled", med.Doses[5].Status)

	again := doPostPath(t, router, path, nil)
	require.Equal(t, http.StatusOK, again.Code)
	var med2 struct {
		EndedAt *string `json:"endedAt"`
	}
	require.NoError(t, json.Unmarshal(again.Body.Bytes(), &med2))
	require.Equal(t, *med.EndedAt, *med2.EndedAt)

	detail := doGet(t, router, "/consultations/"+c.ID.String())
	require.Contains(t, detail.Body.String(), `"endedAt":"`)
	require.Contains(t, detail.Body.String(), `"status":"canceled"`)

	for _, bad := range []string{
		"/consultations/" + c.ID.String() + "/medications/" + uuid.NewString() + "/end",
		"/consultations/" + c.ID.String() + "/medications/not-a-uuid/end",
		"/consultations/not-a-uuid/medications/" + c.Medications[0].ID.String() + "/end",
	} {
		require.Equal(t, http.StatusNotFound, doPostPath(t, router, bad, nil).Code, bad)
	}
}

func TestEndTreatment_HandlerNothingToEnd(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	c, err := svc.CreateConsultation(context.Background(), childID, consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: time.Now().AddDate(0, 0, -10), Photo: samplePhoto(),
		Medications: []consultation.CreateMedicationInput{{Name: "Vieja", FrequencyHours: 8, DurationDays: 1, StartTime: strPtr("08:00")}},
	})
	require.NoError(t, err)
	router, _ := routerWithPool(t)

	rec := doPostPath(t, router, "/consultations/"+c.ID.String()+"/medications/"+c.Medications[0].ID.String()+"/end", nil)

	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.JSONEq(t, `{"error":"validation_error","message":"One or more fields are invalid",
		"details":[{"field":"medicationId","message":"nothing_to_end"}]}`, rec.Body.String())
}

// specs/019: the calendar numbers the medications by their place in the detail, so that place must never change. A
// `DEFAULT now()` is the start of the transaction — every medication of a consultation got the same created_at — and
// updating a row (ending its treatment) moves it in the heap, which is what used to reorder them.
func TestGetConsultation_KeepsTheMedicationsInTheOrderTheyWereCreatedEvenAfterOneIsUpdated(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	n := time.Now().UTC()
	yesterday := time.Date(n.Year(), n.Month(), n.Day()-1, 0, 0, 0, 0, time.UTC)
	names := []string{"Zinc", "Amoxicilina", "Paracetamol", "Loratadina"}
	meds := make([]consultation.CreateMedicationInput, len(names))
	for i, name := range names {
		meds[i] = consultation.CreateMedicationInput{Name: name, FrequencyHours: 8, DurationDays: 2, StartTime: strPtr("08:00")}
	}
	c, err := svc.CreateConsultation(context.Background(), childID, consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: yesterday, Photo: samplePhoto(), Medications: meds,
	})
	require.NoError(t, err)

	order := func(got *consultation.Consultation) []string {
		var out []string
		for _, m := range got.Medications {
			out = append(out, m.Name)
		}
		return out
	}
	require.Equal(t, names, order(c), "creation answers in the order of the request")

	// Ending the first one rewrites its row; the order must not move.
	_, err = svc.EndTreatment(context.Background(), c.ID, c.Medications[0].ID)
	require.NoError(t, err)
	for i := 0; i < 5; i++ {
		got, err := svc.GetConsultation(context.Background(), c.ID)
		require.NoError(t, err)
		require.Equal(t, names, order(got))
	}
}
