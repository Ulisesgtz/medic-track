package consultation_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// specs/058: the routes of a person's own consultations, through their handlers (the access is decided in front, by the router).

func ownPayload(start string) map[string]any {
	return map[string]any{
		"doctorName":  "Dr. Propio",
		"consultDate": time.Now().Format("2006-01-02"),
		"photoBase64": base64.StdEncoding.EncodeToString(testJPEG),
		"notes":       "Dolor de garganta desde el lunes",
		"medications": []map[string]any{{"name": "Amoxicilina", "frequencyHours": 8, "durationDays": 3, "startTime": start}},
	}
}

func TestOwnHandler_CreateListOverviewAndDetail(t *testing.T) {
	router, pool := routerWithPool(t)
	accountID := accountOfChild(t, pool, createTestChild(t, pool))
	base := "/accounts/" + accountID.String()

	rec := doGet(t, router, base+"/consultations")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"consultations":[]`)

	start := time.Now().Add(-30 * time.Minute).UTC().Format("15:04")
	rec = doPostPath(t, router, base+"/consultations", ownPayload(start))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var created struct {
		ID        string  `json:"id"`
		ChildID   *string `json:"childId"`
		AccountID string  `json:"accountId"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &created))
	require.Nil(t, created.ChildID)
	require.Equal(t, accountID.String(), created.AccountID)

	rec = doGet(t, router, base+"/consultations")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), created.ID)

	now := time.Now().UTC()
	window := "?from=" + now.Add(-12*time.Hour).Format(time.RFC3339) + "&to=" + now.Add(12*time.Hour).Format(time.RFC3339)
	rec = doGet(t, router, base+"/overview"+window)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var overview struct {
		AccountID       string           `json:"accountId"`
		Doses           []map[string]any `json:"doses"`
		ActiveTreatment *map[string]any  `json:"activeTreatment"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &overview))
	require.NotEmpty(t, overview.Doses)
	require.NotNil(t, overview.ActiveTreatment)
	for _, d := range overview.Doses {
		require.Equal(t, created.ID, d["consultationId"])
	}

	rec = doGet(t, router, "/consultations/"+created.ID)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"childId":null`)
}

func TestOwnHandler_Errors(t *testing.T) {
	router, pool := routerWithPool(t)
	missing := "/accounts/" + uuid.NewString()

	for _, path := range []string{"/accounts/not-a-uuid/consultations", missing + "/consultations"} {
		require.Equal(t, http.StatusNotFound, doGet(t, router, path).Code, path)
	}
	window := "?from=2026-01-15T00:00:00Z&to=2026-01-16T00:00:00Z"
	require.Equal(t, http.StatusNotFound, doGet(t, router, "/accounts/not-a-uuid/overview"+window).Code)
	require.Equal(t, http.StatusNotFound, doGet(t, router, missing+"/overview"+window).Code)
	require.Equal(t, http.StatusNotFound, doPostPath(t, router, "/accounts/not-a-uuid/consultations", ownPayload("08:00")).Code)
	require.Equal(t, http.StatusNotFound, doPostPath(t, router, missing+"/consultations", ownPayload("08:00")).Code)

	accountID := accountOfChild(t, pool, createTestChild(t, pool))
	base := "/accounts/" + accountID.String()
	require.Equal(t, http.StatusBadRequest, doGet(t, router, base+"/overview").Code)
	require.Equal(t, http.StatusBadRequest, doGet(t, router, base+"/overview?from=2026-01-16T00:00:00Z&to=2026-01-15T00:00:00Z").Code)
	require.Equal(t, http.StatusBadRequest, doPostPath(t, router, base+"/consultations", map[string]any{}).Code)

	// The free plan: 422 with its reason, and the free text never reaches error_logs.
	free := accountOfChild(t, pool, createFreeTestChild(t, pool))
	rec := doPostPath(t, router, "/accounts/"+free.String()+"/consultations", ownPayload("08:00"))
	require.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	require.Contains(t, rec.Body.String(), `"reason":"own_consultations"`)
	time.Sleep(300 * time.Millisecond) // the error log is written in the background
	var leaked int
	require.NoError(t, pool.QueryRow(context.Background(), `
		SELECT count(*) FROM error_logs WHERE account_id IS NULL AND created_at > now() - interval '1 minute'
		  AND (message ILIKE '%Propio%' OR message ILIKE '%garganta%' OR message ILIKE '%Amoxicilina%' OR endpoint ILIKE '%' || $1 || '%')`,
		free.String()).Scan(&leaked))
	require.Zero(t, leaked)
}

func TestOwnHandler_ExtendNeedsThePlan(t *testing.T) {
	router, pool := routerWithPool(t)
	ctx := context.Background()
	accountID := accountOfChild(t, pool, createTestChild(t, pool))
	// A dose already «sin registrar» so there is something to extend.
	began := time.Now().Add(-10 * time.Hour).UTC()
	start := began.Format("15:04")
	c, err := consultation.NewService(consultation.NewRepository(pool)).CreateOwnConsultation(ctx, accountID, consultation.CreateConsultationInput{
		DoctorName: "Dr. Propio", ConsultDate: began, Photo: testJPEG,
		Medications: []consultation.CreateMedicationInput{{Name: "Ibuprofeno", FrequencyHours: 4, DurationDays: 1, StartTime: &start}},
	})
	require.NoError(t, err)
	path := "/consultations/" + c.ID.String() + "/medications/" + c.Medications[0].ID.String() + "/extend"

	_, err = pool.Exec(ctx, `UPDATE accounts SET plan = 'free' WHERE id = $1`, accountID)
	require.NoError(t, err)
	rec := doPostPath(t, router, path, map[string]any{"doses": 2})
	require.Equal(t, http.StatusUnprocessableEntity, rec.Code, rec.Body.String())
	require.True(t, strings.Contains(rec.Body.String(), `"reason":"own_consultations"`))

	_, err = pool.Exec(ctx, `UPDATE accounts SET plan = 'paid' WHERE id = $1`, accountID)
	require.NoError(t, err)
	rec = doPostPath(t, router, path, map[string]any{"doses": 2})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
}

func TestOwnHandler_DatabaseDown(t *testing.T) {
	router := newBrokenRouter(t)
	base := "/accounts/" + uuid.NewString()
	require.Equal(t, http.StatusInternalServerError, doGet(t, router, base+"/consultations").Code)
	require.Equal(t, http.StatusInternalServerError, doGet(t, router, base+"/overview?from=2026-01-15T00:00:00Z&to=2026-01-16T00:00:00Z").Code)
	require.Equal(t, http.StatusInternalServerError, doPostPath(t, router, base+"/consultations", ownPayload("08:00")).Code)
	require.Equal(t, http.StatusInternalServerError, doPostPath(t, router, "/consultations/"+uuid.NewString()+"/medications/"+uuid.NewString()+"/extend", map[string]any{"doses": 2}).Code)
}
