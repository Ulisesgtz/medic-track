package consultation_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

func today() time.Time {
	n := time.Now().UTC()
	return time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, time.UTC)
}

func createOverviewConsultation(t *testing.T, repo *consultation.Repository, childID uuid.UUID, date time.Time, meds ...consultation.Medication) *consultation.Consultation {
	t.Helper()
	c := &consultation.Consultation{DoctorName: "Dra. López", ConsultDate: date, Photo: samplePhoto(), Symptoms: "Tos", Medications: meds}
	require.NoError(t, repo.Create(context.Background(), childID, c))
	return c
}

func TestRepository_GetOverview_NotFound(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)

	_, err := repo.GetOverview(context.Background(), uuid.New(), time.Now(), time.Now().Add(time.Hour), time.Now())

	require.ErrorIs(t, err, consultation.ErrChildNotFound)
}

func TestRepository_GetOverview_DosesInWindow(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	childID := createTestChild(t, pool)
	c := createOverviewConsultation(t, repo, childID, today(),
		consultation.Medication{Name: "Amoxicilina", FrequencyHours: 8, DurationDays: 3, StartTime: strPtr("08:00")})
	first := c.Medications[0].Doses[0]
	second := c.Medications[0].Doses[1]

	// Window covers exactly the first two doses (T0 and T0+8h), not the third.
	got, err := repo.GetOverview(context.Background(), childID, first.ScheduledAt, first.ScheduledAt.Add(9*time.Hour), time.Now())

	require.NoError(t, err)
	require.Len(t, got.Doses, 2)
	require.Equal(t, first.ID, got.Doses[0].ID)
	require.Equal(t, second.ID, got.Doses[1].ID)
	require.Equal(t, "Amoxicilina", got.Doses[0].MedicationName)
	require.Equal(t, c.ID, got.Doses[0].ConsultationID)
	require.False(t, got.Doses[0].Taken)

	_, err = repo.UpdateDoseStatus(context.Background(), c.ID, second.ID, true)
	require.NoError(t, err)
	got, err = repo.GetOverview(context.Background(), childID, first.ScheduledAt, first.ScheduledAt.Add(9*time.Hour), time.Now())
	require.NoError(t, err)
	require.True(t, got.Doses[1].Taken)

	// A window with no doses returns an empty (not nil) slice.
	empty, err := repo.GetOverview(context.Background(), childID, first.ScheduledAt.Add(-48*time.Hour), first.ScheduledAt.Add(-24*time.Hour), time.Now())
	require.NoError(t, err)
	require.NotNil(t, empty.Doses)
	require.Empty(t, empty.Doses)
}

func TestRepository_GetOverview_ActiveTreatment(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	childID := createTestChild(t, pool)
	// "Larga" (5 daily doses) ends after "Corta" (3 doses in the first day).
	c := createOverviewConsultation(t, repo, childID, today(),
		consultation.Medication{Name: "Corta", FrequencyHours: 8, DurationDays: 1, StartTime: strPtr("08:00")},
		consultation.Medication{Name: "Larga", FrequencyHours: 24, DurationDays: 5, StartTime: strPtr("08:00")},
	)
	larga := c.Medications[1].Doses
	lastLarga := larga[len(larga)-1].ScheduledAt

	got, err := repo.GetOverview(context.Background(), childID, time.Now(), time.Now().Add(time.Hour), time.Now().Add(-24*time.Hour))

	require.NoError(t, err)
	require.NotNil(t, got.ActiveTreatment)
	require.Equal(t, "Larga", got.ActiveTreatment.MedicationName)
	require.True(t, lastLarga.Equal(got.ActiveTreatment.EndsAt))
	require.Equal(t, 1, got.ActiveTreatment.OtherCount)
}

func TestRepository_GetOverview_NoActiveTreatment(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	childID := createTestChild(t, pool)
	// Finished long ago, and a medication with no start time (no doses).
	createOverviewConsultation(t, repo, childID, today().AddDate(0, 0, -30),
		consultation.Medication{Name: "Vieja", FrequencyHours: 8, DurationDays: 3, StartTime: strPtr("08:00")},
		consultation.Medication{Name: "Sin horario", FrequencyHours: 8, DurationDays: 3},
	)

	got, err := repo.GetOverview(context.Background(), childID, time.Now(), time.Now().Add(time.Hour), time.Now())

	require.NoError(t, err)
	require.Nil(t, got.ActiveTreatment)
}

func TestRepository_Create_ReadsStartTimeInTheParentsTimeZone(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	childID := createTestChild(t, pool)
	c := &consultation.Consultation{
		DoctorName: "Dra. López", ConsultDate: time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC), Photo: samplePhoto(),
		ScheduleLocation: time.FixedZone("mx", -6*3600),
		Medications:      []consultation.Medication{{Name: "Amoxicilina", FrequencyHours: 8, DurationDays: 1, StartTime: strPtr("08:00")}},
	}

	require.NoError(t, repo.Create(context.Background(), childID, c))

	// 08:00 at UTC-6 is 14:00 UTC.
	require.True(t, time.Date(2026, 1, 15, 14, 0, 0, 0, time.UTC).Equal(c.Medications[0].Doses[0].ScheduledAt))
}

func TestRepository_GetByChild_IncludesSymptomsAndMedicationCount(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	childID := createTestChild(t, pool)
	createOverviewConsultation(t, repo, childID, today(),
		consultation.Medication{Name: "A", FrequencyHours: 8, DurationDays: 1},
		consultation.Medication{Name: "B", FrequencyHours: 8, DurationDays: 1},
	)

	got, err := repo.GetByChild(context.Background(), childID)

	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, "Tos", got[0].Symptoms)
	require.Equal(t, 2, got[0].MedicationCount)
}

func TestRepository_GetOverview_ConnectionError(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	repo := consultation.NewRepository(closedPool(t, dsn))

	_, err := repo.GetOverview(context.Background(), uuid.New(), time.Now(), time.Now().Add(time.Hour), time.Now())

	require.Error(t, err)
}

func TestService_GetChildOverview_ValidatesTheWindow(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	now := time.Now()

	for name, window := range map[string][2]time.Time{
		"to equals from":  {now, now},
		"to before from":  {now, now.Add(-time.Hour)},
		"wider than 48 h": {now, now.Add(49 * time.Hour)},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := svc.GetChildOverview(context.Background(), uuid.New(), window[0], window[1])

			var validationErrs consultation.ValidationErrors
			require.ErrorAs(t, err, &validationErrs)
		})
	}
}

func TestService_CreateConsultation_UTCOffsetRange(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	input := consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC), Photo: samplePhoto(),
		Medications: []consultation.CreateMedicationInput{validMedication()},
	}

	input.UTCOffsetMinutes = 900
	_, err := svc.CreateConsultation(context.Background(), childID, input)
	var validationErrs consultation.ValidationErrors
	require.ErrorAs(t, err, &validationErrs)
	require.Equal(t, "utcOffsetMinutes", validationErrs[0].Field)

	input.UTCOffsetMinutes = -360
	c, err := svc.CreateConsultation(context.Background(), childID, input)
	require.NoError(t, err)
	require.True(t, time.Date(2026, 1, 15, 14, 0, 0, 0, time.UTC).Equal(c.Medications[0].Doses[0].ScheduledAt))
}

func overviewURL(childID string, from, to time.Time) string {
	q := url.Values{}
	q.Set("from", from.Format(time.RFC3339))
	q.Set("to", to.Format(time.RFC3339))
	return "/children/" + childID + "/overview?" + q.Encode()
}

func TestHandler_GetChildOverview_Success(t *testing.T) {
	pool := testPool(t)
	childID := createTestChild(t, pool)
	router, _ := routerWithPool(t)
	rec := doPostPath(t, router, "/children/"+childID.String()+"/consultations", map[string]any{
		"doctorName":       "Dra. López",
		"consultDate":      today().Format("2006-01-02"),
		"photoBase64":      base64.StdEncoding.EncodeToString([]byte("fake-jpeg")),
		"symptoms":         "Tos",
		"utcOffsetMinutes": 0,
		"medications":      []map[string]any{validMedicationPayload()},
	})
	require.Equal(t, http.StatusCreated, rec.Code)

	start := today()
	got := doGet(t, router, overviewURL(childID.String(), start, start.Add(24*time.Hour)))

	require.Equal(t, http.StatusOK, got.Code)
	var resp struct {
		ChildID string `json:"childId"`
		Doses   []struct {
			MedicationName string `json:"medicationName"`
			Taken          bool   `json:"taken"`
		} `json:"doses"`
		ActiveTreatment *struct {
			MedicationName string `json:"medicationName"`
			OtherCount     int    `json:"otherCount"`
		} `json:"activeTreatment"`
	}
	require.NoError(t, json.Unmarshal(got.Body.Bytes(), &resp))
	require.Equal(t, childID.String(), resp.ChildID)
	require.Len(t, resp.Doses, 2) // 08:00 and 16:00; the third dose (next day 00:00) is outside the window
	require.Equal(t, "Amoxicilina", resp.Doses[0].MedicationName)
	require.NotNil(t, resp.ActiveTreatment)
	require.Equal(t, "Amoxicilina", resp.ActiveTreatment.MedicationName)

	listRec := doGet(t, router, "/children/"+childID.String()+"/consultations")
	var list struct {
		Consultations []struct {
			Symptoms        string `json:"symptoms"`
			MedicationCount int    `json:"medicationCount"`
		} `json:"consultations"`
	}
	require.NoError(t, json.Unmarshal(listRec.Body.Bytes(), &list))
	require.Equal(t, "Tos", list.Consultations[0].Symptoms)
	require.Equal(t, 1, list.Consultations[0].MedicationCount)
}

func TestHandler_GetChildOverview_NoTreatmentIsNull(t *testing.T) {
	pool := testPool(t)
	childID := createTestChild(t, pool)
	router, _ := routerWithPool(t)

	got := doGet(t, router, overviewURL(childID.String(), today(), today().Add(24*time.Hour)))

	require.Equal(t, http.StatusOK, got.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(got.Body.Bytes(), &resp))
	require.Nil(t, resp["activeTreatment"])
	require.Empty(t, resp["doses"])
}

func TestHandler_GetChildOverview_BadWindow(t *testing.T) {
	pool := testPool(t)
	childID := createTestChild(t, pool)
	router, _ := routerWithPool(t)
	base := "/children/" + childID.String() + "/overview"

	for name, path := range map[string]string{
		"missing":    base,
		"not a time": base + "?from=ayer&to=hoy",
		"reversed":   overviewURL(childID.String(), today().Add(24*time.Hour), today()),
		"too wide":   overviewURL(childID.String(), today(), today().Add(72*time.Hour)),
	} {
		t.Run(name, func(t *testing.T) {
			rec := doGet(t, router, path)

			require.Equal(t, http.StatusBadRequest, rec.Code)
		})
	}
}

func TestHandler_GetChildOverview_ChildNotFound(t *testing.T) {
	router := newTestRouter(t)

	for _, id := range []string{"11111111-1111-1111-1111-111111111111", "not-a-uuid"} {
		rec := doGet(t, router, overviewURL(id, today(), today().Add(24*time.Hour)))

		require.Equal(t, http.StatusNotFound, rec.Code)
	}
}

func TestHandler_GetChildOverview_InternalError(t *testing.T) {
	router := newBrokenRouter(t)

	rec := doGet(t, router, overviewURL("11111111-1111-1111-1111-111111111111", today(), today().Add(24*time.Hour)))

	require.Equal(t, http.StatusInternalServerError, rec.Code)
}
