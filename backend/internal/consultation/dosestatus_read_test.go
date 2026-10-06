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

// specs/013: every dose read from the API carries its status, derived with the server's clock.

// yesterdaysConsultation registers, for a new child, a medication every 8 h for 2 days starting yesterday at 08:00
// UTC: yesterday's 08:00 is always "sin registrar" (its next dose, yesterday 16:00, is behind us) and the last one,
// tomorrow at 00:00, is always still to come — whatever time the tests run.
func yesterdaysConsultation(t *testing.T) (*consultation.Service, uuid.UUID, *consultation.Consultation) {
	t.Helper()
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	n := time.Now().UTC()
	yesterday := time.Date(n.Year(), n.Month(), n.Day()-1, 0, 0, 0, 0, time.UTC)
	c, err := svc.CreateConsultation(context.Background(), childID, consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: yesterday, Photo: samplePhoto(),
		Medications: []consultation.CreateMedicationInput{{Name: "Amoxicilina", FrequencyHours: 8, DurationDays: 2, StartTime: strPtr("08:00")}},
	})
	require.NoError(t, err)
	return svc, childID, c
}

// statusesMatchTheRule checks every dose against StatusAt at a moment within the call; a dose would only differ if
// the call straddled one of its boundaries, which the margin rules out.
func statusesMatchTheRule(t *testing.T, doses []consultation.Dose, before, after time.Time) {
	t.Helper()
	for _, d := range doses {
		want := consultation.StatusAt(d.ScheduledAt, d.Taken, 8, nil, before)
		if want != consultation.StatusAt(d.ScheduledAt, d.Taken, 8, nil, after) {
			continue // a boundary fell inside the call
		}
		require.Equal(t, want, d.Status, "dose at %s", d.ScheduledAt)
	}
}

func TestStatus_CreateAndGetByID(t *testing.T) {
	before := time.Now()
	svc, _, created := yesterdaysConsultation(t)
	doses := created.Medications[0].Doses
	require.Len(t, doses, 6)
	require.Equal(t, consultation.DoseStatusUnregistered, doses[0].Status, "yesterday 08:00")
	require.Equal(t, consultation.DoseStatusPending, doses[5].Status, "tomorrow 00:00")
	statusesMatchTheRule(t, doses, before, time.Now())

	before = time.Now()
	got, err := svc.GetConsultation(context.Background(), created.ID)
	require.NoError(t, err)
	require.Equal(t, consultation.DoseStatusUnregistered, got.Medications[0].Doses[0].Status)
	statusesMatchTheRule(t, got.Medications[0].Doses, before, time.Now())
}

// Marking an unregistered dose makes it taken; unmarking it brings it back to unregistered (FR-006).
func TestStatus_MarkAndUnmarkAnUnregisteredDose(t *testing.T) {
	svc, _, c := yesterdaysConsultation(t)
	old := c.Medications[0].Doses[0]

	marked, err := svc.MarkDose(context.Background(), c.ID, old.ID, true, anyone)
	require.NoError(t, err)
	require.Equal(t, consultation.DoseStatusTaken, marked.Status)

	unmarked, err := svc.MarkDose(context.Background(), c.ID, old.ID, false, anyone)
	require.NoError(t, err)
	require.Equal(t, consultation.DoseStatusUnregistered, unmarked.Status)

	future := c.Medications[0].Doses[5]
	unmarkedFuture, err := svc.MarkDose(context.Background(), c.ID, future.ID, false, anyone)
	require.NoError(t, err)
	require.Equal(t, consultation.DoseStatusPending, unmarkedFuture.Status)
}

func TestStatus_Overview(t *testing.T) {
	svc, childID, c := yesterdaysConsultation(t)
	first := c.Medications[0].Doses[0].ScheduledAt

	got, err := svc.GetChildOverview(context.Background(), childID, first, first.Add(12*time.Hour))

	require.NoError(t, err)
	require.Len(t, got.Doses, 2) // yesterday 08:00 and 16:00
	require.Equal(t, consultation.DoseStatusUnregistered, got.Doses[0].Status)
}

func TestStatus_InTheJSON(t *testing.T) {
	_, childID, c := yesterdaysConsultation(t)
	router, _ := routerWithPool(t)

	detail := doGet(t, router, "/consultations/"+c.ID.String())
	require.Equal(t, http.StatusOK, detail.Code)
	var body struct {
		Medications []struct {
			Doses []struct {
				Status string `json:"status"`
			} `json:"doses"`
		} `json:"medications"`
	}
	require.NoError(t, json.Unmarshal(detail.Body.Bytes(), &body))
	require.Equal(t, "unregistered", body.Medications[0].Doses[0].Status)
	require.Equal(t, "pending", body.Medications[0].Doses[5].Status)

	old := c.Medications[0].Doses[0].ID.String()
	unmarked := doPatchPath(t, router, "/consultations/"+c.ID.String()+"/doses/"+old, map[string]any{"taken": false})
	require.Equal(t, http.StatusOK, unmarked.Code)
	require.Contains(t, unmarked.Body.String(), `"status":"unregistered"`)

	first := c.Medications[0].Doses[0].ScheduledAt
	overview := doGet(t, router, overviewURL(childID.String(), first, first.Add(12*time.Hour)))
	require.Equal(t, http.StatusOK, overview.Code)
	require.Contains(t, overview.Body.String(), `"status":"unregistered"`)
}
