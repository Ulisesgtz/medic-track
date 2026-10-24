package childdevice_test

import (
	"bytes"
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

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/childdevice"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

type handlerEnv struct {
	router http.Handler
	log    *capture
	f      family
}

// newHandlerEnv wires the handler behind a stand-in of the access middleware (the real levels are walked by the server's router test).
func newHandlerEnv(t *testing.T, plan account.Plan) *handlerEnv {
	t.Helper()
	pool := testPool(t)
	e := &handlerEnv{log: &capture{}, f: newFamily(t, pool, plan)}
	h := childdevice.NewHandler(childdevice.NewService(childdevice.NewRepository(pool)), httpx.NewResponder(e.log))
	r := chi.NewRouter()
	r.With(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(access.WithAccess(req.Context(), access.Access{Level: access.Full, ActorAccountID: e.f.accountID})))
		})
	}).Post("/children/{childId}/device-links", h.CreateLink)
	r.Post("/child-device/redeem", h.Redeem)
	e.router = r
	return e
}

func (e *handlerEnv) do(t *testing.T, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	switch b := body.(type) {
	case string:
		buf.WriteString(b)
	case nil:
	default:
		require.NoError(t, json.NewEncoder(&buf).Encode(b))
	}
	req := httptest.NewRequest(method, path, &buf)
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, req)
	return rec
}

func decodeBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out), rec.Body.String())
	return out
}

func TestHandler_CreateAndRedeemTheWholeWay(t *testing.T) {
	e := newHandlerEnv(t, account.PlanPaid)
	created := e.do(t, http.MethodPost, "/children/"+e.f.childID.String()+"/device-links", map[string]string{"name": "Teléfono de Mateo"})
	require.Equal(t, http.StatusCreated, created.Code, created.Body.String())
	body := decodeBody(t, created)
	require.Equal(t, "pending", body["status"])
	require.Equal(t, "Teléfono de Mateo", body["name"])
	token, _ := body["token"].(string)
	require.Len(t, token, 43)
	exp, err := time.Parse(time.RFC3339, body["expiresAt"].(string))
	require.NoError(t, err)
	require.WithinDuration(t, time.Now().Add(childdevice.LinkLifetime), exp, time.Minute)

	redeemed := e.do(t, http.MethodPost, "/child-device/redeem", map[string]string{"token": token})
	require.Equal(t, http.StatusOK, redeemed.Code, redeemed.Body.String())
	got := decodeBody(t, redeemed)
	require.Equal(t, e.f.childID.String(), got["childId"])
	require.Equal(t, "Mateo", got["childFirstName"])
	require.Len(t, got["credential"], 43)
	require.NotEmpty(t, got["rotateAfter"])

	again := e.do(t, http.MethodPost, "/child-device/redeem", map[string]string{"token": token})
	require.Equal(t, http.StatusNotFound, again.Code)
}

func TestHandler_RedeemFailuresAreAllTheSame404AndNeverLogged(t *testing.T) {
	e := newHandlerEnv(t, account.PlanPaid)
	unknown, _, err := childdevice.NewToken()
	require.NoError(t, err)

	var first string
	for name, body := range map[string]any{
		"unknown":   map[string]string{"token": unknown},
		"empty":     map[string]string{"token": ""},
		"garbage":   map[string]string{"token": "xyz"},
		"not json":  "esto no es json",
		"no body":   nil,
		"too large": `{"token":"` + strings.Repeat("a", 10_000) + `"}`,
	} {
		rec := e.do(t, http.MethodPost, "/child-device/redeem", body)
		require.Equal(t, http.StatusNotFound, rec.Code, name)
		if first == "" {
			first = rec.Body.String()
		}
		require.Equal(t, first, rec.Body.String(), name+": the answer tells nothing")
	}
	require.Empty(t, e.log.all(), "what anyone can provoke is not written to error_logs")
}

func TestHandler_CreateRefusals(t *testing.T) {
	paid := newHandlerEnv(t, account.PlanPaid)
	path := "/children/" + paid.f.childID.String() + "/device-links"

	bad := paid.do(t, http.MethodPost, path, map[string]string{"name": "   "})
	require.Equal(t, http.StatusBadRequest, bad.Code)
	require.Equal(t, "validation_error", decodeBody(t, bad)["error"])
	require.Equal(t, http.StatusBadRequest, paid.do(t, http.MethodPost, path, "no json").Code)

	for _, n := range []string{"uno", "dos", "tres"} {
		require.Equal(t, http.StatusCreated, paid.do(t, http.MethodPost, path, map[string]string{"name": n}).Code)
	}
	full := paid.do(t, http.MethodPost, path, map[string]string{"name": "cuatro"})
	require.Equal(t, http.StatusUnprocessableEntity, full.Code)
	require.Equal(t, "child_device_limit_exceeded", decodeBody(t, full)["error"])
	require.EqualValues(t, childdevice.MaxLinksPerChild, decodeBody(t, full)["limit"])

	free := newHandlerEnv(t, account.PlanFree)
	rec := free.do(t, http.MethodPost, "/children/"+free.f.childID.String()+"/device-links", map[string]string{"name": "Teléfono"})
	require.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	body := decodeBody(t, rec)
	require.Equal(t, "freemium_consultation_limit_exceeded", body["error"])
	require.Equal(t, "child_device", body["reason"])

	missing := paid.do(t, http.MethodPost, "/children/"+uuid.NewString()+"/device-links", map[string]string{"name": "Teléfono"})
	require.Equal(t, http.StatusNotFound, missing.Code)
	require.Equal(t, http.StatusNotFound, paid.do(t, http.MethodPost, "/children/not-a-uuid/device-links", map[string]string{"name": "x"}).Code)
}

func TestHandler_NothingSecretNorTypedReachesErrorLogs(t *testing.T) {
	e := newHandlerEnv(t, account.PlanFree)
	path := "/children/" + e.f.childID.String() + "/device-links"
	secretName := "NOMBRE-PRIVADO-DEL-TELEFONO"
	require.Equal(t, http.StatusUnprocessableEntity, e.do(t, http.MethodPost, path, map[string]string{"name": secretName}).Code)
	require.Equal(t, http.StatusBadRequest, e.do(t, http.MethodPost, path, map[string]string{"name": strings.Repeat("x", 100)}).Code)

	time.Sleep(200 * time.Millisecond) // the Responder writes in the background
	entries := e.log.all()
	require.NotEmpty(t, entries, "a 422 and a 400 are logged")
	for _, entry := range entries {
		require.NotContains(t, entry.Message, secretName)
		require.NotContains(t, entry.Endpoint, secretName)
	}
	_ = context.Background()
}

func TestHandler_MeAuthAndGuardsOfThePhonesOwnRoutes(t *testing.T) {
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanPaid)
	cred, _ := activeDevice(t, pool, f, "Teléfono de Mateo", time.Now().Add(-time.Hour))
	h := childdevice.NewHandler(childdevice.NewService(childdevice.NewRepository(pool)), httpx.NewResponder(&capture{}))
	r := chi.NewRouter()
	r.Use(h.Auth())
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	r.Get("/me", h.Me)
	r.With(h.SameChild()).Get("/c/{childId}", ok)
	r.With(h.RoutineOfChild()).Get("/r/{routineId}", ok)
	r.With(h.ConsultationOfChild()).Get("/k/{consultationId}", ok)

	do := func(path, auth string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		if auth != "" {
			req.Header.Set("Authorization", auth)
		}
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec
	}
	me := do("/me", "Device "+cred)
	require.Equal(t, http.StatusOK, me.Code, me.Body.String())
	body := decodeBody(t, me)
	require.Equal(t, "Mateo", body["childFirstName"])
	require.Equal(t, "Teléfono de Mateo", body["deviceName"])
	require.Equal(t, f.childID.String(), body["childId"])
	require.Equal(t, "generic", body["reminderDetail"], "generic unless the parent chose the detail")
	require.NotEmpty(t, body["rotateAfter"])

	_, err := pool.Exec(context.Background(), `UPDATE child_device_links SET reminder_detail = 'detailed' WHERE child_id = $1`, f.childID)
	require.NoError(t, err)
	require.Equal(t, "detailed", decodeBody(t, do("/me", "Device "+cred))["reminderDetail"])

	require.Equal(t, http.StatusUnauthorized, do("/me", "").Code)
	require.Equal(t, http.StatusNoContent, do("/c/"+f.childID.String(), "Device "+cred).Code)
	require.Equal(t, http.StatusForbidden, do("/c/"+uuid.NewString(), "Device "+cred).Code)
	require.Equal(t, http.StatusForbidden, do("/r/"+uuid.NewString(), "Device "+cred).Code)
	require.Equal(t, http.StatusForbidden, do("/k/"+uuid.NewString(), "Device "+cred).Code)
}

func TestHandler_MeWithoutAPrincipalIsUnauthorized(t *testing.T) {
	pool := testPool(t)
	h := childdevice.NewHandler(childdevice.NewService(childdevice.NewRepository(pool)), httpx.NewResponder(&capture{}))
	rec := httptest.NewRecorder()
	h.Me(rec, httptest.NewRequest(http.MethodGet, "/me", nil))
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestService_ClockCanBeReplaced(t *testing.T) {
	pool := testPool(t)
	svc := childdevice.NewService(childdevice.NewRepository(pool))
	fixed := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	svc.SetClock(func() time.Time { return fixed })
	require.Equal(t, fixed, svc.Now())
}
