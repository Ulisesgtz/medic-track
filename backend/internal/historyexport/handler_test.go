package historyexport_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
	"github.com/Ulisesgtz/medic-track/backend/internal/historyexport"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

func post(t *testing.T, h *historyexport.Handler, childID, body string) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	r.Post("/children/{childId}/export", h.Export)
	req := httptest.NewRequest(http.MethodPost, "/children/"+childID+"/export", strings.NewReader(body))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func handler(t *testing.T, recorder *capture) *historyexport.Handler {
	t.Helper()
	return historyexport.NewHandler(newService(testPool(t)), httpx.NewResponder(recorder))
}

// waitLogs gives the Responder's background writes a moment.
func waitLogs(c *capture, n int) {
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && len(c.all()) < n {
		time.Sleep(10 * time.Millisecond)
	}
}

func TestExport_AnswersTheDocument(t *testing.T) {
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanPaid)
	consult(t, pool, f, today(), "Dra. Laura Cázares", consultation.CreateMedicationInput{Name: "Amoxicilina", FrequencyHours: 8, DurationDays: 1, StartTime: strPtr("00:00")})

	rec := post(t, handler(t, &capture{}), f.childID.String(), `{"period":{"kind":"all"},"sections":{"consultations":true,"vaccinations":true,"photos":true}}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "Mateo", body["child"].(map[string]any)["firstName"])
	consultations := body["consultations"].([]any)
	require.Len(t, consultations, 1)
	c := consultations[0].(map[string]any)
	require.Equal(t, today().Format("2006-01-02"), c["consultDate"])
	med := c["medications"].([]any)[0].(map[string]any)
	require.Equal(t, float64(3), med["doses"].(map[string]any)["total"])
	require.NotNil(t, body["photos"])
	require.Equal(t, []any{}, body["vaccinations"])
}

func TestExport_AFreeFamilyGets422AndNoData(t *testing.T) {
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanFree)
	rec := post(t, handler(t, &capture{}), f.childID.String(), `{"period":{"kind":"all"},"sections":{"vaccinations":true}}`)
	require.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "freemium_consultation_limit_exceeded", body["error"])
	require.Equal(t, "pdf_export", body["reason"])
	require.NotContains(t, body, "child")
}

func TestExport_RefusesABadRequest(t *testing.T) {
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanPaid)
	h := handler(t, &capture{})
	cases := map[string]string{
		`not json`: "",
		`{"period":{"kind":"week"},"sections":{"consultations":true}}`:                                        "period.kind",
		`{"period":{"kind":"all"},"sections":{}}`:                                                             "sections",
		`{"period":{"kind":"range","from":"2026-10-24","to":"2026-01-01"},"sections":{"consultations":true}}`: "period.to",
		`{"period":{"kind":"range"},"sections":{"consultations":true}}`:                                       "period.from",
		`{"period":{"kind":"range","from":"ayer","to":"2026-01-01"},"sections":{"consultations":true}}`:       "period.from",
		`{"period":{"kind":"filters","filters":{"kind":"otra"}},"sections":{"consultations":true}}`:           "period.filters.kind",
		`{"period":{"kind":"filters","filters":{"from":"x"}},"sections":{"consultations":true}}`:              "period.filters.from",
	}
	for body, field := range cases {
		rec := post(t, h, f.childID.String(), body)
		require.Equal(t, http.StatusBadRequest, rec.Code, body)
		require.Contains(t, rec.Body.String(), field, body)
	}
}

func TestExport_AnUnknownSymptomInTheFilters(t *testing.T) {
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanPaid)
	rec := post(t, handler(t, &capture{}), f.childID.String(), `{"period":{"kind":"filters","filters":{"symptomCodes":["no_existe"]}},"sections":{"consultations":true}}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "symptom_not_available")
}

func TestExport_AChildThatDoesNotExistOrAMalformedID(t *testing.T) {
	h := handler(t, &capture{})
	ok := `{"period":{"kind":"all"},"sections":{"consultations":true}}`
	require.Equal(t, http.StatusNotFound, post(t, h, "no-es-un-id", ok).Code)
	require.Equal(t, http.StatusNotFound, post(t, h, uuid.NewString(), ok).Code)
}

// What the parent chose (a doctor, a text) is never written to error_logs.
func TestExport_ErrorLogsNeverCarryTheChoice(t *testing.T) {
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanFree)
	logs := &capture{}
	h := handler(t, logs)
	post(t, h, f.childID.String(), `{"period":{"kind":"filters","filters":{"doctor":"Dra. Secreta","q":"varicela"}},"sections":{"consultations":true}}`)
	post(t, h, f.childID.String(), `{"period":{"kind":"filters","filters":{"doctor":"Dra. Secreta","kind":"mala"}},"sections":{"consultations":true}}`)
	waitLogs(logs, 2)
	entries := logs.all()
	require.NotEmpty(t, entries)
	for _, e := range entries {
		require.NotContains(t, e.Message, "Secreta")
		require.NotContains(t, e.Message, "varicela")
		require.NotContains(t, e.Endpoint, "Secreta")
	}
}

func TestGetPhoto_TheConsultationPhotoAlone(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanPaid)
	c := consult(t, pool, f, today(), "Dra. Laura Cázares")
	repo := consultation.NewRepository(pool)
	got, err := repo.Photo(ctx, c.ID)
	require.NoError(t, err)
	require.Equal(t, jpeg, got)
	_, err = repo.Photo(ctx, uuid.New())
	require.ErrorIs(t, err, consultation.ErrConsultationNotFound)

	h := consultation.NewHandler(consultation.NewService(repo), httpx.NewResponder(&capture{}))
	r := chi.NewRouter()
	r.Get("/consultations/{consultationId}/photo", h.GetPhoto)
	for id, want := range map[string]int{c.ID.String(): http.StatusOK, uuid.NewString(): http.StatusNotFound, "x": http.StatusNotFound} {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/consultations/"+id+"/photo", nil))
		require.Equal(t, want, rec.Code, id)
	}
}
