package reminder_test

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

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
)

// newRouter mounts the handlers without the session/owner middlewares (router_test.go in
// internal/server covers those): these tests are about what each handler answers.
func newRouter(t *testing.T, config reminder.Config) (http.Handler, *reminder.Repository) {
	t.Helper()
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	h := reminder.NewHandler(reminder.NewService(repo, &fakeSender{}, config), httpx.NewResponder(errorlog.NewRepository(pool)))
	r := chi.NewRouter()
	r.Get("/reminders/config", h.GetConfig)
	r.Post("/accounts/{accountId}/reminder-devices", h.RegisterDevice)
	r.Post("/accounts/{accountId}/reminder-devices/remove", h.RemoveDevice)
	r.Post("/reminders/actions/taken", h.MarkTaken)
	return r, repo
}

func call(t *testing.T, h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func deviceBody(endpoint string) string {
	b, _ := json.Marshal(map[string]any{"endpoint": endpoint, "keys": map[string]string{"p256dh": "k", "auth": "a"}})
	return string(b)
}

func TestHandler_GetConfig(t *testing.T) {
	on, _ := newRouter(t, testConfig)
	rec := call(t, on, http.MethodGet, "/reminders/config", "")
	require.Equal(t, http.StatusOK, rec.Code)
	require.JSONEq(t, `{"available":true,"vapidPublicKey":"`+testConfig.VAPIDPublicKey+`"}`, rec.Body.String())

	off, _ := newRouter(t, reminder.Config{})
	rec = call(t, off, http.MethodGet, "/reminders/config", "")
	require.JSONEq(t, `{"available":false,"vapidPublicKey":null}`, rec.Body.String())
}

func TestHandler_RegisterDevice(t *testing.T) {
	router, _ := newRouter(t, testConfig)
	f := newFamily(t, testPool(t), nil)
	path := "/accounts/" + f.accountID.String() + "/reminder-devices"
	endpoint := uniqueEndpoint()

	created := call(t, router, http.MethodPost, path, deviceBody(endpoint))
	require.Equal(t, http.StatusCreated, created.Code, created.Body.String())
	var resp map[string]any
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &resp))
	require.Equal(t, true, resp["active"])
	require.NotEmpty(t, resp["id"])
	require.NotEmpty(t, resp["activatedAt"])

	again := call(t, router, http.MethodPost, path, deviceBody(endpoint))
	require.Equal(t, http.StatusOK, again.Code, "same browser: reactivated, not duplicated")

	for name, body := range map[string]string{
		"malformed json":      `nope`,
		"no endpoint":         `{"keys":{"p256dh":"k","auth":"a"}}`,
		"no keys":             `{"endpoint":"` + uniqueEndpoint() + `"}`,
		"not a push service":  deviceBody("https://example.com/x"),
		"plain http endpoint": deviceBody("http://fcm.googleapis.com/x"),
	} {
		rec := call(t, router, http.MethodPost, path, body)
		require.Equal(t, http.StatusBadRequest, rec.Code, name)
		require.Contains(t, rec.Body.String(), `"validation_error"`, name)
		require.NotContains(t, rec.Body.String(), "example.com", "the endpoint never comes back in an error")
	}

	require.Equal(t, http.StatusNotFound, call(t, router, http.MethodPost, "/accounts/not-a-uuid/reminder-devices", deviceBody(endpoint)).Code)
}

func TestHandler_RegisterDevice_UnavailableAndInternalError(t *testing.T) {
	off, _ := newRouter(t, reminder.Config{})
	rec := call(t, off, http.MethodPost, "/accounts/"+uuid.NewString()+"/reminder-devices", deviceBody(uniqueEndpoint()))
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Contains(t, rec.Body.String(), `"reminders_unavailable"`)

	// An account that doesn't exist (only possible past RequireOwner in a broken wiring): the FK
	// fails and it's an opaque 500.
	on, _ := newRouter(t, testConfig)
	rec = call(t, on, http.MethodPost, "/accounts/"+uuid.NewString()+"/reminder-devices", deviceBody(uniqueEndpoint()))
	require.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestHandler_RemoveDevice(t *testing.T) {
	router, repo := newRouter(t, testConfig)
	pool := testPool(t)
	f := newFamily(t, pool, nil)
	device := f.device(t, repo, uniqueEndpoint())
	path := "/accounts/" + f.accountID.String() + "/reminder-devices/remove"
	body := `{"endpoint":"` + device.Endpoint + `"}`

	require.Equal(t, http.StatusNoContent, call(t, router, http.MethodPost, path, body).Code)
	require.False(t, deviceActive(t, pool, device.ID))
	require.Equal(t, http.StatusNoContent, call(t, router, http.MethodPost, path, body).Code, "idempotent")

	require.Equal(t, http.StatusBadRequest, call(t, router, http.MethodPost, path, `{}`).Code)
	require.Equal(t, http.StatusBadRequest, call(t, router, http.MethodPost, path, `nope`).Code)
	require.Equal(t, http.StatusNotFound, call(t, router, http.MethodPost, "/accounts/x/reminder-devices/remove", body).Code)
}

func TestHandler_MarkTaken(t *testing.T) {
	router, repo := newRouter(t, testConfig)
	pool := testPool(t)
	f := newFamily(t, pool, nil)
	device := f.device(t, repo, uniqueEndpoint())
	dose := f.dose(t, pool, time.Now(), false)
	token := reminder.SignActionToken(testConfig.ActionSecret, dose, device.ID, time.Now().Add(time.Hour))

	rec := call(t, router, http.MethodPost, "/reminders/actions/taken", `{"token":"`+token+`"}`)
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())
	require.Empty(t, rec.Body.String(), "it reads nothing back")
	require.True(t, doseTaken(t, pool, dose))

	for name, c := range map[string]struct {
		body   string
		status int
	}{
		"malformed json": {`nope`, http.StatusBadRequest},
		"no token":       {`{}`, http.StatusBadRequest},
		"forged":         {`{"token":"x.y"}`, http.StatusForbidden},
		"expired":        {`{"token":"` + reminder.SignActionToken(testConfig.ActionSecret, dose, device.ID, time.Now().Add(-time.Minute)) + `"}`, http.StatusForbidden},
	} {
		rec := call(t, router, http.MethodPost, "/reminders/actions/taken", c.body)
		require.Equal(t, c.status, rec.Code, name)
		require.False(t, strings.Contains(rec.Body.String(), token), "the token never comes back")
	}

	// Turned off: the reminder already on the screen can't mark the dose anymore.
	require.NoError(t, repo.DeactivateByID(context.Background(), device.ID))
	rec = call(t, router, http.MethodPost, "/reminders/actions/taken", `{"token":"`+token+`"}`)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), `"invalid_action_token"`)
}

func TestHandler_DatabaseErrorsAreOpaque500s(t *testing.T) {
	pool := closedPool(t)
	h := reminder.NewHandler(reminder.NewService(reminder.NewRepository(pool), &fakeSender{}, testConfig), httpx.NewResponder(errorlog.NewRepository(pool)))
	r := chi.NewRouter()
	r.Post("/accounts/{accountId}/reminder-devices/remove", h.RemoveDevice)
	r.Post("/reminders/actions/taken", h.MarkTaken)

	rec := call(t, r, http.MethodPost, "/accounts/"+uuid.NewString()+"/reminder-devices/remove", `{"endpoint":"e"}`)
	require.Equal(t, http.StatusInternalServerError, rec.Code)

	token := reminder.SignActionToken(testConfig.ActionSecret, uuid.New(), uuid.New(), time.Now().Add(time.Hour))
	rec = call(t, r, http.MethodPost, "/reminders/actions/taken", `{"token":"`+token+`"}`)
	require.Equal(t, http.StatusInternalServerError, rec.Code)
}
