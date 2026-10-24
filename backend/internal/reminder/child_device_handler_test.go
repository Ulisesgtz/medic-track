package reminder_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/childdevice"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
)

// specs/047: the routes with which a child's phone turns its own reminders on and off, behind the phone's own credential.

type phoneRouter struct {
	http.Handler
	credential string
}

func newPhoneRouter(t *testing.T, config reminder.Config) phoneRouter {
	t.Helper()
	pool := testPool(t)
	responder := httpx.NewResponder(&noRecorder{})
	f := newFamily(t, pool, nil)
	credential, hash, err := childdevice.NewToken()
	require.NoError(t, err)
	_, err = pool.Exec(t.Context(), `
		INSERT INTO child_device_links (child_id, account_id, name, created_by_account_id, status, expires_at, redeemed_at, credential_hash, rotated_at)
		VALUES ($1, $2, 'Teléfono', $2, 'active', now(), now(), $3, now())`, f.childID, f.accountID, hash)
	require.NoError(t, err)

	h := reminder.NewHandler(reminder.NewService(reminder.NewRepository(pool), &fakeSender{}, config), responder)
	auth := childdevice.RequireChildDevice(responder, childdevice.NewRepository(pool), time.Now)
	r := chi.NewRouter()
	r.With(auth).Post("/child-device/reminder-devices", h.RegisterChildDevice)
	r.With(auth).Post("/child-device/reminder-devices/remove", h.RemoveChildDevice)
	// Without the phone's middleware: no principal in the context.
	r.Post("/open/reminder-devices", h.RegisterChildDevice)
	r.Post("/open/reminder-devices/remove", h.RemoveChildDevice)
	return phoneRouter{Handler: r, credential: credential}
}

type noRecorder struct{}

func (noRecorder) Create(context.Context, *errorlog.Entry) error { return nil }

func (p phoneRouter) post(path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if p.credential != "" && !strings.HasPrefix(path, "/open") {
		req.Header.Set("Authorization", "Device "+p.credential)
	}
	rec := httptest.NewRecorder()
	p.ServeHTTP(rec, req)
	return rec
}

func TestChildHandlers_RegisterAndRemoveThePhonesBrowser(t *testing.T) {
	p := newPhoneRouter(t, testConfig)
	endpoint := uniqueEndpoint()

	first := p.post("/child-device/reminder-devices", deviceBody(endpoint))
	require.Equal(t, http.StatusCreated, first.Code, first.Body.String())
	again := p.post("/child-device/reminder-devices", deviceBody(endpoint))
	require.Equal(t, http.StatusOK, again.Code, "registering again is idempotent")

	bad := p.post("/child-device/reminder-devices", deviceBody("https://evil.example.com/x"))
	require.Equal(t, http.StatusBadRequest, bad.Code)
	require.Equal(t, http.StatusBadRequest, p.post("/child-device/reminder-devices", "no json").Code)

	require.Equal(t, http.StatusNoContent, p.post("/child-device/reminder-devices/remove", `{"endpoint":"`+endpoint+`"}`).Code)
	require.Equal(t, http.StatusBadRequest, p.post("/child-device/reminder-devices/remove", `{"endpoint":"  "}`).Code)
	require.Equal(t, http.StatusBadRequest, p.post("/child-device/reminder-devices/remove", `no json`).Code)
}

func TestChildHandlers_NeedTheKeysOfTheServerAndAWorkingCredential(t *testing.T) {
	off := newPhoneRouter(t, reminder.Config{})
	require.Equal(t, http.StatusServiceUnavailable, off.post("/child-device/reminder-devices", deviceBody(uniqueEndpoint())).Code)

	on := newPhoneRouter(t, testConfig)
	on.credential = "" // no credential at all
	require.Equal(t, http.StatusUnauthorized, on.post("/child-device/reminder-devices", deviceBody(uniqueEndpoint())).Code)
	require.Equal(t, http.StatusUnauthorized, on.post("/child-device/reminder-devices/remove", `{"endpoint":"x"}`).Code)
	require.Equal(t, http.StatusUnauthorized, on.post("/open/reminder-devices", deviceBody(uniqueEndpoint())).Code, "a request without a principal")
	require.Equal(t, http.StatusUnauthorized, on.post("/open/reminder-devices/remove", `{"endpoint":"x"}`).Code)
}

func TestChildHandlers_ADatabaseFailureIsA500(t *testing.T) {
	pool := testPool(t)
	f := newFamily(t, pool, nil)
	repo := reminder.NewRepository(pool)
	link, _ := phone(t, pool, repo, f, time.Now(), nil)
	h := reminder.NewHandler(reminder.NewService(repo, &fakeSender{}, testConfig), httpx.NewResponder(&noRecorder{}))
	withPrincipal := func(next http.HandlerFunc) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next(w, r.WithContext(childdevice.WithPrincipal(r.Context(), &childdevice.Principal{LinkID: link, ChildID: f.childID})))
		})
	}
	pool.Close()
	for name, handler := range map[string]http.Handler{"register": withPrincipal(h.RegisterChildDevice), "remove": withPrincipal(h.RemoveChildDevice)} {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(deviceBody(uniqueEndpoint()))))
		require.Equal(t, http.StatusInternalServerError, rec.Code, name)
	}
}
