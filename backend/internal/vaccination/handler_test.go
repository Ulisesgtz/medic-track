package vaccination_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/vaccination"
)

// capture keeps what the Responder would write to error_logs.
type capture struct {
	mu      sync.Mutex
	entries []errorlog.Entry
}

func (c *capture) Create(_ context.Context, e *errorlog.Entry) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = append(c.entries, *e)
	return nil
}

func (c *capture) all() []errorlog.Entry {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]errorlog.Entry(nil), c.entries...)
}

type env struct {
	router http.Handler
	log    *capture
	f      family
	// a second child of the same account, to prove an id of another child is a 404
	other uuid.UUID
}

// newEnv wires the handler behind a stand-in of the access middleware (the real levels are walked by the server's router test).
func newEnv(t *testing.T) *env {
	t.Helper()
	pool := testPool(t)
	e := &env{log: &capture{}, f: newFamily(t, pool)}
	e.other = e.f.addChild(t, pool)
	h := vaccination.NewHandler(vaccination.NewService(vaccination.NewRepository(pool)), httpx.NewResponder(e.log))
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(access.WithAccess(req.Context(), access.Access{Level: access.Full, ActorAccountID: e.f.accountID})))
		})
	})
	r.Get("/children/{childId}/vaccinations", h.ListVaccinations)
	r.Post("/children/{childId}/vaccinations", h.CreateVaccination)
	r.Patch("/children/{childId}/vaccinations/{vaccinationId}", h.UpdateVaccination)
	r.Delete("/children/{childId}/vaccinations/{vaccinationId}", h.DeleteVaccination)
	registerPhotoRoutes(r, h)
	e.router = r
	return e
}

func (e *env) do(t *testing.T, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	switch b := body.(type) {
	case nil:
		reader = bytes.NewReader(nil)
	case string:
		reader = bytes.NewReader([]byte(b))
	default:
		raw, err := json.Marshal(b)
		require.NoError(t, err)
		reader = bytes.NewReader(raw)
	}
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, httptest.NewRequest(method, path, reader))
	return rec
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out), rec.Body.String())
	return out
}

func TestHandler_RecordsListsCorrectsAndDeletesADose(t *testing.T) {
	e := newEnv(t)
	base := "/children/" + e.f.childID.String() + "/vaccinations"

	created := e.do(t, http.MethodPost, base, map[string]any{"vaccineCode": "hepatitis_b", "appliedOn": "2024-05-01", "doseNumber": 1, "place": "Centro de salud"})
	require.Equal(t, http.StatusCreated, created.Code, created.Body.String())
	body := decode(t, created)
	require.Equal(t, "Hepatitis B", body["name"])
	require.Equal(t, "Ana", body["createdByName"])
	require.Nil(t, body["correctedByName"])
	require.NotContains(t, created.Body.String(), "@", "no e-mail in any answer")
	id := body["id"].(string)

	listed := decode(t, e.do(t, http.MethodGet, base, nil))
	require.Len(t, listed["vaccinations"], 1)

	fixed := e.do(t, http.MethodPatch, base+"/"+id, map[string]any{"vaccineCode": "hepatitis_b", "appliedOn": "2024-05-02", "doseNumber": 1})
	require.Equal(t, http.StatusOK, fixed.Code, fixed.Body.String())
	require.Equal(t, "2024-05-02", decode(t, fixed)["appliedOn"])
	require.Equal(t, "Ana", decode(t, fixed)["correctedByName"])
	require.NotNil(t, decode(t, fixed)["correctedAt"])

	require.Equal(t, http.StatusNoContent, e.do(t, http.MethodDelete, base+"/"+id, nil).Code)
	require.Empty(t, decode(t, e.do(t, http.MethodGet, base, nil))["vaccinations"])
}

func TestHandler_AnEmptyCardIsAnEmptyListNotNull(t *testing.T) {
	e := newEnv(t)

	rec := e.do(t, http.MethodGet, "/children/"+e.f.childID.String()+"/vaccinations", nil)

	require.Equal(t, http.StatusOK, rec.Code)
	require.JSONEq(t, `{"vaccinations":[]}`, rec.Body.String())
}

func TestHandler_ValidationAnswersAreFieldByFieldWithFixedMessages(t *testing.T) {
	e := newEnv(t)
	base := "/children/" + e.f.childID.String() + "/vaccinations"

	rec := e.do(t, http.MethodPost, base, map[string]any{"customName": "Mi vacuna privada", "appliedOn": "2999-01-01", "doseNumber": 99, "notes": strings.Repeat("n", 501)})

	require.Equal(t, http.StatusBadRequest, rec.Code)
	body := decode(t, rec)
	require.Equal(t, "validation_error", body["error"])
	fields := []string{}
	for _, d := range body["details"].([]any) {
		fields = append(fields, d.(map[string]any)["field"].(string))
	}
	require.ElementsMatch(t, []string{"appliedOn", "doseNumber", "notes"}, fields)
	require.NotContains(t, rec.Body.String(), "privada")
}

func TestHandler_ADuplicateIs409AndConfirmedWithAllowDuplicate(t *testing.T) {
	e := newEnv(t)
	base := "/children/" + e.f.childID.String() + "/vaccinations"
	input := map[string]any{"vaccineCode": "bcg", "appliedOn": "2024-05-01"}
	require.Equal(t, http.StatusCreated, e.do(t, http.MethodPost, base, input).Code)

	dup := e.do(t, http.MethodPost, base, input)
	input["allowDuplicate"] = true
	confirmed := e.do(t, http.MethodPost, base, input)

	require.Equal(t, http.StatusConflict, dup.Code)
	require.Equal(t, "duplicate_vaccination", decode(t, dup)["error"])
	require.Equal(t, http.StatusCreated, confirmed.Code)
}

func TestHandler_NotFoundAndMalformedRequests(t *testing.T) {
	e := newEnv(t)
	child := e.f.childID.String()
	base := "/children/" + child + "/vaccinations"

	require.Equal(t, http.StatusNotFound, e.do(t, http.MethodGet, "/children/not-a-uuid/vaccinations", nil).Code)
	require.Equal(t, http.StatusNotFound, e.do(t, http.MethodPatch, base+"/not-a-uuid", dose("bcg", "2024-05-01")).Code)
	require.Equal(t, http.StatusNotFound, e.do(t, http.MethodDelete, base+"/not-a-uuid", nil).Code)
	missing := e.do(t, http.MethodDelete, base+"/"+uuid.NewString(), nil)
	require.Equal(t, http.StatusNotFound, missing.Code)
	require.Equal(t, "vaccination_not_found", decode(t, missing)["error"])
	unknownChild := e.do(t, http.MethodPost, "/children/"+uuid.NewString()+"/vaccinations", map[string]any{"vaccineCode": "bcg", "appliedOn": "2024-05-01"})
	require.Equal(t, http.StatusNotFound, unknownChild.Code)
	require.Equal(t, "child_not_found", decode(t, unknownChild)["error"])
	require.Equal(t, http.StatusBadRequest, e.do(t, http.MethodPost, base, "{not json").Code)
	require.Equal(t, http.StatusBadRequest, e.do(t, http.MethodPatch, base+"/"+uuid.NewString(), "{not json").Code)
}

func TestHandler_ADoseOfAnotherChildIsNotFound(t *testing.T) {
	e := newEnv(t)
	created := decode(t, e.do(t, http.MethodPost, "/children/"+e.f.childID.String()+"/vaccinations", map[string]any{"vaccineCode": "bcg", "appliedOn": "2024-05-01"}))
	id := created["id"].(string)
	otherBase := "/children/" + e.other.String() + "/vaccinations/" + id

	require.Equal(t, http.StatusNotFound, e.do(t, http.MethodPatch, otherBase, dose("bcg", "2024-05-02")).Code)
	require.Equal(t, http.StatusNotFound, e.do(t, http.MethodDelete, otherBase, nil).Code)
}

func TestHandler_NothingTheParentWroteReachesErrorLogsOrAMessage(t *testing.T) {
	e := newEnv(t)
	base := "/children/" + e.f.childID.String() + "/vaccinations"
	secrets := map[string]any{"customName": "VACUNA-PRIVADA-123", "appliedOn": "2024-05-01", "lot": "LOTE-PRIVADO-456", "place": "LUGAR-PRIVADO-789", "notes": "NOTA-PRIVADA-000"}
	first := e.do(t, http.MethodPost, base, secrets)
	require.Equal(t, http.StatusCreated, first.Code)

	dup := e.do(t, http.MethodPost, base, secrets)                                                                                            // 409
	bad := e.do(t, http.MethodPost, base, map[string]any{"customName": "VACUNA-PRIVADA-123", "appliedOn": "no", "notes": "NOTA-PRIVADA-000"}) // 400

	for _, rec := range []*httptest.ResponseRecorder{dup, bad} {
		for _, word := range []string{"VACUNA-PRIVADA", "LOTE-PRIVADO", "LUGAR-PRIVADO", "NOTA-PRIVADA"} {
			require.NotContains(t, rec.Body.String(), word)
		}
	}
	require.NotEmpty(t, e.log.all(), "the errors were logged…")
	for _, entry := range e.log.all() {
		line := entry.Message + entry.Endpoint
		for _, word := range []string{"VACUNA-PRIVADA", "LOTE-PRIVADO", "LUGAR-PRIVADO", "NOTA-PRIVADA"} {
			require.NotContains(t, line, word, "…and none carries what the parent wrote")
		}
	}
}

func TestHandler_AnUnexpectedFailureIs500WithAFixedMessage(t *testing.T) {
	testPool(t)
	h := vaccination.NewHandler(vaccination.NewService(vaccination.NewRepository(closedPool(t))), httpx.NewResponder(&capture{}))
	r := chi.NewRouter()
	actor := uuid.New()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(access.WithAccess(req.Context(), access.Access{Level: access.Full, ActorAccountID: actor})))
		})
	})
	r.Get("/children/{childId}/vaccinations", h.ListVaccinations)
	r.Delete("/children/{childId}/vaccinations/{vaccinationId}", h.DeleteVaccination)

	list := httptest.NewRecorder()
	r.ServeHTTP(list, httptest.NewRequest(http.MethodGet, "/children/"+uuid.NewString()+"/vaccinations", nil))
	del := httptest.NewRecorder()
	r.ServeHTTP(del, httptest.NewRequest(http.MethodDelete, "/children/"+uuid.NewString()+"/vaccinations/"+uuid.NewString(), nil))

	require.Equal(t, http.StatusInternalServerError, list.Code)
	require.Equal(t, http.StatusInternalServerError, del.Code)
}

func TestHandler_AWriteWithNoSessionActorIs500(t *testing.T) {
	pool := testPool(t)
	f := newFamily(t, pool)
	h := vaccination.NewHandler(vaccination.NewService(vaccination.NewRepository(pool)), httpx.NewResponder(&capture{}))
	r := chi.NewRouter()
	r.Post("/children/{childId}/vaccinations", h.CreateVaccination)
	r.Patch("/children/{childId}/vaccinations/{vaccinationId}", h.UpdateVaccination)

	post := httptest.NewRecorder()
	r.ServeHTTP(post, httptest.NewRequest(http.MethodPost, "/children/"+f.childID.String()+"/vaccinations", strings.NewReader(`{"vaccineCode":"bcg","appliedOn":"2024-05-01"}`)))
	patch := httptest.NewRecorder()
	r.ServeHTTP(patch, httptest.NewRequest(http.MethodPatch, "/children/"+f.childID.String()+"/vaccinations/"+uuid.NewString(), strings.NewReader(`{"vaccineCode":"bcg","appliedOn":"2024-05-01"}`)))

	require.Equal(t, http.StatusInternalServerError, post.Code)
	require.Equal(t, http.StatusInternalServerError, patch.Code)
}
