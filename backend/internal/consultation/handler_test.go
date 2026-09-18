package consultation_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

func newTestRouter(t *testing.T) http.Handler {
	router, _ := routerWithPool(t)
	return router
}

func doGet(t *testing.T, router http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func doPostPath(t *testing.T, router http.Handler, path string, body map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	b, err := json.Marshal(body)
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func doPatchPath(t *testing.T, router http.Handler, path string, body map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	b, err := json.Marshal(body)
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPatch, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func validMedicationPayload() map[string]any {
	return map[string]any{"name": "Amoxicilina", "frequencyHours": 8, "durationDays": 3, "startTime": "08:00"}
}

func TestHandler_ListConsultations_Empty(t *testing.T) {
	pool := testPool(t)
	childID := createTestChild(t, pool)
	router, _ := routerWithPool(t)

	rec := doGet(t, router, "/children/"+childID.String()+"/consultations")

	require.Equal(t, http.StatusOK, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Empty(t, resp["consultations"])
}

func TestHandler_ListConsultations_ChildNotFound(t *testing.T) {
	router := newTestRouter(t)

	for _, id := range []string{"11111111-1111-1111-1111-111111111111", "not-a-uuid"} {
		rec := doGet(t, router, "/children/"+id+"/consultations")
		require.Equal(t, http.StatusNotFound, rec.Code)
	}
}

func TestHandler_CreateConsultation_Success(t *testing.T) {
	pool := testPool(t)
	childID := createTestChild(t, pool)
	router, _ := routerWithPool(t)

	photo := base64.StdEncoding.EncodeToString([]byte("fake-jpeg"))
	rec := doPostPath(t, router, "/children/"+childID.String()+"/consultations", map[string]any{
		"doctorName":  "Dra. López",
		"consultDate": "2026-01-15",
		"photoBase64": photo,
		"symptoms":    "Tos",
		"medications": []map[string]any{validMedicationPayload()},
	})

	require.Equal(t, http.StatusCreated, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	meds, ok := resp["medications"].([]any)
	require.True(t, ok)
	require.Len(t, meds, 1)

	listRec := doGet(t, router, "/children/"+childID.String()+"/consultations")
	var listResp map[string]any
	require.NoError(t, json.Unmarshal(listRec.Body.Bytes(), &listResp))
	require.Len(t, listResp["consultations"], 1)
}

func TestHandler_CreateConsultation_NoMedications(t *testing.T) {
	pool := testPool(t)
	childID := createTestChild(t, pool)
	router, _ := routerWithPool(t)

	rec := doPostPath(t, router, "/children/"+childID.String()+"/consultations", map[string]any{
		"doctorName":  "Dra. López",
		"consultDate": "2026-01-15",
		"photoBase64": base64.StdEncoding.EncodeToString([]byte("x")),
	})

	require.Equal(t, http.StatusBadRequest, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "validation_error", resp["error"])
}

func TestHandler_CreateConsultation_ChildNotFound(t *testing.T) {
	router := newTestRouter(t)

	rec := doPostPath(t, router, "/children/11111111-1111-1111-1111-111111111111/consultations", map[string]any{
		"doctorName":  "Dra. López",
		"consultDate": "2026-01-15",
		"photoBase64": base64.StdEncoding.EncodeToString([]byte("x")),
		"medications": []map[string]any{validMedicationPayload()},
	})

	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestHandler_CreateConsultation_MalformedJSON(t *testing.T) {
	pool := testPool(t)
	childID := createTestChild(t, pool)
	router, _ := routerWithPool(t)

	req := httptest.NewRequest(http.MethodPost, "/children/"+childID.String()+"/consultations", bytes.NewReader([]byte("{not-json")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestHandler_CreateConsultation_InvalidConsultDateFormat(t *testing.T) {
	pool := testPool(t)
	childID := createTestChild(t, pool)
	router, _ := routerWithPool(t)

	rec := doPostPath(t, router, "/children/"+childID.String()+"/consultations", map[string]any{
		"doctorName":  "Dra. López",
		"consultDate": "15-01-2026",
		"photoBase64": base64.StdEncoding.EncodeToString([]byte("x")),
		"medications": []map[string]any{validMedicationPayload()},
	})

	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestHandler_CreateConsultation_InvalidPhotoBase64(t *testing.T) {
	pool := testPool(t)
	childID := createTestChild(t, pool)
	router, _ := routerWithPool(t)

	rec := doPostPath(t, router, "/children/"+childID.String()+"/consultations", map[string]any{
		"doctorName":  "Dra. López",
		"consultDate": "2026-01-15",
		"photoBase64": "not-valid-base64!!!",
		"medications": []map[string]any{validMedicationPayload()},
	})

	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestHandler_GetConsultation_Success(t *testing.T) {
	pool := testPool(t)
	childID := createTestChild(t, pool)
	router, _ := routerWithPool(t)

	created := doPostPath(t, router, "/children/"+childID.String()+"/consultations", map[string]any{
		"doctorName":  "Dra. López",
		"consultDate": "2026-01-15",
		"photoBase64": base64.StdEncoding.EncodeToString([]byte("x")),
		"medications": []map[string]any{validMedicationPayload()},
	})
	var createdResp map[string]any
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &createdResp))
	id := createdResp["id"].(string)

	rec := doGet(t, router, "/consultations/"+id)

	require.Equal(t, http.StatusOK, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, id, resp["id"])
}

func TestHandler_GetConsultation_NotFound(t *testing.T) {
	router := newTestRouter(t)

	for _, id := range []string{"11111111-1111-1111-1111-111111111111", "not-a-uuid"} {
		rec := doGet(t, router, "/consultations/"+id)
		require.Equal(t, http.StatusNotFound, rec.Code)
	}
}

func TestHandler_UpdateDose_Success(t *testing.T) {
	pool := testPool(t)
	childID := createTestChild(t, pool)
	router, _ := routerWithPool(t)

	created := doPostPath(t, router, "/children/"+childID.String()+"/consultations", map[string]any{
		"doctorName":  "Dra. López",
		"consultDate": "2026-01-15",
		"photoBase64": base64.StdEncoding.EncodeToString([]byte("x")),
		"medications": []map[string]any{validMedicationPayload()},
	})
	var createdResp map[string]any
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &createdResp))
	consultationID := createdResp["id"].(string)
	meds := createdResp["medications"].([]any)
	firstMed := meds[0].(map[string]any)
	doses := firstMed["doses"].([]any)
	doseID := doses[0].(map[string]any)["id"].(string)

	rec := doPatchPath(t, router, "/consultations/"+consultationID+"/doses/"+doseID, map[string]any{"taken": true})

	require.Equal(t, http.StatusOK, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, true, resp["taken"])
}

func TestHandler_UpdateDose_NotFound(t *testing.T) {
	router := newTestRouter(t)

	for _, id := range []string{"11111111-1111-1111-1111-111111111111", "not-a-uuid"} {
		rec := doPatchPath(t, router, "/consultations/11111111-1111-1111-1111-111111111111/doses/"+id, map[string]any{"taken": true})
		require.Equal(t, http.StatusNotFound, rec.Code)
	}
}

// TestHandler_UpdateDose_WrongConsultation covers the analyze finding: a
// real dose addressed through a mismatched consultationId in the URL must
// 404, not silently update someone else's dose.
func TestHandler_UpdateDose_WrongConsultation(t *testing.T) {
	pool := testPool(t)
	childID := createTestChild(t, pool)
	router, _ := routerWithPool(t)

	created := doPostPath(t, router, "/children/"+childID.String()+"/consultations", map[string]any{
		"doctorName":  "Dra. López",
		"consultDate": "2026-01-15",
		"photoBase64": base64.StdEncoding.EncodeToString([]byte("x")),
		"medications": []map[string]any{validMedicationPayload()},
	})
	var createdResp map[string]any
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &createdResp))
	meds := createdResp["medications"].([]any)
	doses := meds[0].(map[string]any)["doses"].([]any)
	doseID := doses[0].(map[string]any)["id"].(string)

	rec := doPatchPath(t, router, "/consultations/11111111-1111-1111-1111-111111111111/doses/"+doseID, map[string]any{"taken": true})

	require.Equal(t, http.StatusNotFound, rec.Code)
}

// TestRouter_ConsultationsAreImmutable covers FR-014/SC-003 (analyze
// finding A2): once created, a consultation must never be editable or
// deletable — the router must not expose PUT/PATCH/DELETE for it, mirroring
// TestRouter_NoChildMutationRoutes from feature 001.
func TestRouter_ConsultationsAreImmutable(t *testing.T) {
	router := newTestRouter(t)

	paths := []struct {
		method string
		path   string
	}{
		{http.MethodPut, "/consultations/11111111-1111-1111-1111-111111111111"},
		{http.MethodPatch, "/consultations/11111111-1111-1111-1111-111111111111"},
		{http.MethodDelete, "/consultations/11111111-1111-1111-1111-111111111111"},
	}

	for _, p := range paths {
		t.Run(p.method+" "+p.path, func(t *testing.T) {
			req := httptest.NewRequest(p.method, p.path, nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			require.True(t, rec.Code == http.StatusNotFound || rec.Code == http.StatusMethodNotAllowed,
				"expected 404 or 405 for an unregistered consultation mutation route, got %d", rec.Code)
		})
	}
}

// routerWithPool mirrors newTestRouter but also returns the pool, for tests
// that need to assert on database state directly.
func routerWithPool(t *testing.T) (http.Handler, *pgxpool.Pool) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	svc := consultation.NewService(repo)
	responder := httpx.NewResponder(errorlog.NewRepository(pool))
	h := consultation.NewHandler(svc, responder)

	r := chi.NewRouter()
	r.Get("/children/{childId}/consultations", h.ListConsultations)
	r.Post("/children/{childId}/consultations", h.CreateConsultation)
	r.Get("/consultations/{consultationId}", h.GetConsultation)
	r.Patch("/consultations/{consultationId}/doses/{doseId}", h.UpdateDose)
	return r, pool
}

// newBrokenRouter wires a handler backed by an already-closed pool, so every
// query fails with a connection error (not a "not found") — used to
// exercise each handler's generic 500 internal_error branch.
func newBrokenRouter(t *testing.T) http.Handler {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	pool := closedPool(t, dsn)
	repo := consultation.NewRepository(pool)
	svc := consultation.NewService(repo)
	responder := httpx.NewResponder(errorlog.NewRepository(pool))
	h := consultation.NewHandler(svc, responder)

	r := chi.NewRouter()
	r.Get("/children/{childId}/consultations", h.ListConsultations)
	r.Post("/children/{childId}/consultations", h.CreateConsultation)
	r.Get("/consultations/{consultationId}", h.GetConsultation)
	r.Patch("/consultations/{consultationId}/doses/{doseId}", h.UpdateDose)
	return r
}

func TestHandler_ListConsultations_InternalError(t *testing.T) {
	router := newBrokenRouter(t)

	rec := doGet(t, router, "/children/11111111-1111-1111-1111-111111111111/consultations")

	require.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestHandler_CreateConsultation_InternalError(t *testing.T) {
	router := newBrokenRouter(t)

	rec := doPostPath(t, router, "/children/11111111-1111-1111-1111-111111111111/consultations", map[string]any{
		"doctorName":  "Dra. López",
		"consultDate": "2026-01-15",
		"photoBase64": base64.StdEncoding.EncodeToString([]byte("x")),
		"medications": []map[string]any{validMedicationPayload()},
	})

	require.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestHandler_GetConsultation_InternalError(t *testing.T) {
	router := newBrokenRouter(t)

	rec := doGet(t, router, "/consultations/11111111-1111-1111-1111-111111111111")

	require.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestHandler_UpdateDose_MalformedJSON(t *testing.T) {
	router := newTestRouter(t)

	req := httptest.NewRequest(http.MethodPatch, "/consultations/11111111-1111-1111-1111-111111111111/doses/22222222-2222-2222-2222-222222222222", bytes.NewReader([]byte("{not-json")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestHandler_UpdateDose_InternalError(t *testing.T) {
	router := newBrokenRouter(t)

	rec := doPatchPath(t, router, "/consultations/11111111-1111-1111-1111-111111111111/doses/22222222-2222-2222-2222-222222222222", map[string]any{"taken": true})

	require.Equal(t, http.StatusInternalServerError, rec.Code)
}
