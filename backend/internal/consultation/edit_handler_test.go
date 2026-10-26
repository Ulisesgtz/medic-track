package consultation_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// specs/051: PUT /consultations/{consultationId} through the handler, with the access the route's guard leaves.

type logCapture struct {
	mu      sync.Mutex
	entries []errorlog.Entry
}

func (c *logCapture) Create(_ context.Context, e *errorlog.Entry) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = append(c.entries, *e)
	return nil
}

func (c *logCapture) all() []errorlog.Entry {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]errorlog.Entry(nil), c.entries...)
}

func editRouter(w *editWorld, logs *logCapture, withAccess bool) http.Handler {
	h := consultation.NewHandler(w.svc, httpx.NewResponder(logs))
	r := chi.NewRouter()
	if withAccess {
		r.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(rw http.ResponseWriter, req *http.Request) {
				next.ServeHTTP(rw, req.WithContext(access.WithAccess(req.Context(), access.Access{Level: access.Full, ActorAccountID: w.editor})))
			})
		})
	}
	r.Put("/consultations/{consultationId}", h.UpdateConsultation)
	return r
}

func put(router http.Handler, id string, body any) *httptest.ResponseRecorder {
	var raw []byte
	if s, ok := body.(string); ok {
		raw = []byte(s)
	} else {
		raw, _ = json.Marshal(body)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodPut, "/consultations/"+id, bytes.NewReader(raw)))
	return rec
}

// bodyOf is the request the form sends for the consultation as it is saved.
func bodyOf(c *consultation.Consultation) map[string]any {
	meds := []map[string]any{}
	for _, m := range c.Medications {
		meds = append(meds, map[string]any{"id": m.ID.String(), "name": m.Name, "frequencyHours": m.FrequencyHours, "durationDays": m.DurationDays, "startTime": m.StartTime})
	}
	return map[string]any{
		"expectedVersion": versionOf(c).UTC().Format(time.RFC3339Nano),
		"doctorName":      c.DoctorName,
		"consultDate":     c.ConsultDate.Format("2006-01-02"),
		"notes":           c.Notes,
		"medications":     meds,
	}
}

func TestEditHandler_SavesAndAnswersTheDetailWithWhoEdited(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consult(t, false)
	body := bodyOf(c)
	body["doctorName"] = "Dra. Laura Cázares"
	body["photoBase64"] = base64.StdEncoding.EncodeToString(testJPEG)

	rec := put(editRouter(w, &logCapture{}, true), c.ID.String(), body)

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var got map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, "Dra. Laura Cázares", got["doctorName"])
	require.NotEmpty(t, got["createdAt"])
	edited := got["edited"].(map[string]any)
	require.Equal(t, "Ana", edited["by"])

	// The answer's version is what the next edit sends back.
	again := bodyOf(w.get(t, c.ID))
	require.Equal(t, edited["at"], again["expectedVersion"])
	require.Equal(t, http.StatusOK, put(editRouter(w, &logCapture{}, true), c.ID.String(), again).Code)
}

func TestEditHandler_AnswersEveryErrorOfTheContract(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consult(t, false,
		consultation.CreateMedicationInput{Name: "Amoxicilina", FrequencyHours: 6, DurationDays: 7, StartTime: strPtr("08:00")},
		consultation.CreateMedicationInput{Name: "Paracetamol", FrequencyHours: 8, DurationDays: 3, StartTime: strPtr("08:00")})
	w.mark(t, c, c.Medications[1].Doses[0])
	c = w.get(t, c.ID)
	router := editRouter(w, &logCapture{}, true)

	type tc struct {
		body   any
		status int
		want   string
	}
	stale := bodyOf(c)
	stale["expectedVersion"] = c.CreatedAt.Add(-time.Second).UTC().Format(time.RFC3339Nano)
	marked := bodyOf(c)
	marked["medications"] = marked["medications"].([]map[string]any)[:1]
	badVersion := bodyOf(c)
	badVersion["expectedVersion"] = "ayer"
	badDate := bodyOf(c)
	badDate["consultDate"] = "18/10/2026"
	badPhoto := bodyOf(c)
	badPhoto["photoBase64"] = "%%%"
	notImage := bodyOf(c)
	notImage["photoBase64"] = base64.StdEncoding.EncodeToString([]byte("not an image"))
	badMedID := bodyOf(c)
	badMedID["medications"].([]map[string]any)[0]["id"] = "x"
	unknownSymptom := bodyOf(c)
	unknownSymptom["symptomCodes"] = []string{"no_existe"}
	cases := map[string]tc{
		"malformed":         {"{", http.StatusBadRequest, "validation_error"},
		"empty":             {`{}`, http.StatusBadRequest, "expectedVersion"},
		"version":           {badVersion, http.StatusBadRequest, "expectedVersion"},
		"date":              {badDate, http.StatusBadRequest, "consultDate"},
		"photo":             {badPhoto, http.StatusBadRequest, "photoBase64"},
		"not an image":      {notImage, http.StatusBadRequest, "photoBase64"},
		"medication id":     {badMedID, http.StatusBadRequest, "medication_not_found"},
		"symptom":           {unknownSymptom, http.StatusBadRequest, "symptom_not_available"},
		"conflict":          {stale, http.StatusConflict, "edit_conflict"},
		"marked medication": {marked, http.StatusConflict, "medication_has_marks"},
	}
	for name, tc := range cases {
		rec := put(router, c.ID.String(), tc.body)
		require.Equal(t, tc.status, rec.Code, name+": "+rec.Body.String())
		require.Contains(t, rec.Body.String(), tc.want, name)
	}

	require.Equal(t, http.StatusNotFound, put(router, "x", bodyOf(c)).Code)
	require.Equal(t, http.StatusNotFound, put(router, uuid.NewString(), bodyOf(c)).Code)
	require.Equal(t, http.StatusInternalServerError, put(editRouter(w, &logCapture{}, false), c.ID.String(), bodyOf(c)).Code,
		"without the route's guard there is no author: it fails closed")
}

func TestEditHandler_ThePlanAndThePhotoLimit(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	w.consult(t, false)
	old := w.consult(t, false, consultation.CreateMedicationInput{Name: "Paracetamol", FrequencyHours: 8, DurationDays: 1, StartTime: strPtr("08:00")})
	_, err := w.pool.Exec(context.Background(), `UPDATE accounts SET plan = 'free' WHERE id = $1`, w.editor)
	require.NoError(t, err)
	router := editRouter(w, &logCapture{}, true)

	body := bodyOf(old)
	body["medications"] = append(body["medications"].([]map[string]any), map[string]any{"name": "Jarabe", "frequencyHours": 8, "durationDays": 5, "startTime": "09:00"})
	rec := put(router, old.ID.String(), body)
	require.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	require.Contains(t, rec.Body.String(), `"reason":"active_treatment"`)

	_, err = w.pool.Exec(context.Background(), `UPDATE consultations SET photo = '' WHERE id = $1`, old.ID)
	require.NoError(t, err)
	fillPhotos(t, w.pool, w.childID, consultation.MaxPhotosPerAccount)
	body = bodyOf(old)
	body["photoBase64"] = base64.StdEncoding.EncodeToString(testJPEG)
	rec = put(router, old.ID.String(), body)
	require.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	require.Contains(t, rec.Body.String(), "photo_limit_exceeded")
}

// What the parent wrote (a doctor, a note, a medication's name) never reaches error_logs.
func TestEditHandler_ErrorLogsNeverCarryWhatWasWritten(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consult(t, false)
	logs := &logCapture{}
	router := editRouter(w, logs, true)

	stale := bodyOf(c)
	stale["expectedVersion"] = c.CreatedAt.Add(-time.Second).UTC().Format(time.RFC3339Nano)
	stale["doctorName"] = "Dra. Secreta"
	stale["notes"] = "varicela"
	put(router, c.ID.String(), stale)
	bad := bodyOf(c)
	bad["doctorName"] = "Dra. Secreta"
	bad["medications"].([]map[string]any)[0]["name"] = "Medicina secreta"
	bad["medications"].([]map[string]any)[0]["frequencyHours"] = 0
	put(router, c.ID.String(), bad)

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && len(logs.all()) < 2 {
		time.Sleep(10 * time.Millisecond)
	}
	entries := logs.all()
	require.Len(t, entries, 2)
	for _, e := range entries {
		for _, secret := range []string{"Secreta", "varicela", "secreta"} {
			require.False(t, strings.Contains(e.Message, secret), e.Message)
			require.False(t, strings.Contains(e.Endpoint, secret), e.Endpoint)
		}
	}
}

func TestEditHandler_ADatabaseFailureIs500(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	svc := consultation.NewService(consultation.NewRepository(closedPool(t, dsn)))
	h := consultation.NewHandler(svc, httpx.NewResponder(&logCapture{}))
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(rw http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(rw, req.WithContext(access.WithAccess(req.Context(), access.Access{Level: access.Full, ActorAccountID: uuid.New()})))
		})
	})
	r.Put("/consultations/{consultationId}", h.UpdateConsultation)
	body := map[string]any{
		"expectedVersion": time.Now().UTC().Format(time.RFC3339Nano), "doctorName": "Dra. López", "consultDate": "2026-01-15",
		"medications": []map[string]any{{"name": "Amoxicilina", "frequencyHours": 8, "durationDays": 3, "startTime": "08:00"}},
	}
	require.Equal(t, http.StatusInternalServerError, put(r, uuid.NewString(), body).Code)
}
