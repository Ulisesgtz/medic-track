package account_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
)

func newTestRouter(t *testing.T) http.Handler {
	pool := testPool(t)
	repo := account.NewRepository(pool)
	svc := account.NewService(repo)
	h := account.NewHandler(svc)

	r := chi.NewRouter()
	r.Post("/accounts", h.CreateAccount)
	return r
}

func doPost(t *testing.T, router http.Handler, body map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	b, err := json.Marshal(body)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/accounts", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestHandler_CreateAccount_Success_NoChildren(t *testing.T) {
	router := newTestRouter(t)

	rec := doPost(t, router, map[string]any{
		"firstName": "Ana",
		"lastName":  "Gómez",
		"email":     uniqueEmail("handler.success.nochildren"),
	})

	require.Equal(t, http.StatusCreated, rec.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "free", resp["plan"])
	require.Empty(t, resp["children"])
}

func TestHandler_CreateAccount_Success_OneChild(t *testing.T) {
	router := newTestRouter(t)

	rec := doPost(t, router, map[string]any{
		"firstName": "Ana",
		"lastName":  "Gómez",
		"email":     uniqueEmail("handler.success.onechild"),
		"children": []map[string]any{
			{"firstName": "Luis", "lastName": "Gómez", "birthDate": "2020-01-15"},
		},
	})

	require.Equal(t, http.StatusCreated, rec.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	children, ok := resp["children"].([]any)
	require.True(t, ok)
	require.Len(t, children, 1)
}

func TestHandler_CreateAccount_MalformedJSON(t *testing.T) {
	router := newTestRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/accounts", bytes.NewReader([]byte("{not-json")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestHandler_CreateAccount_InvalidBirthDateFormat(t *testing.T) {
	router := newTestRouter(t)

	rec := doPost(t, router, map[string]any{
		"firstName": "Ana",
		"lastName":  "Gómez",
		"email":     uniqueEmail("handler.invalid.birthdate"),
		"children": []map[string]any{
			{"firstName": "Luis", "lastName": "Gómez", "birthDate": "15-01-2020"},
		},
	})

	require.Equal(t, http.StatusBadRequest, rec.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "validation_error", resp["error"])
}

func TestHandler_CreateAccount_MissingRequiredFields(t *testing.T) {
	router := newTestRouter(t)

	rec := doPost(t, router, map[string]any{"lastName": "Gómez"})

	require.Equal(t, http.StatusBadRequest, rec.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "validation_error", resp["error"])
}

// TestHandler_CreateAccount_InvalidNameFormat covers the server-side
// character-set/length rule enforced independently of whatever the client
// already validated (defense in depth, mirroring the freemium check).
func TestHandler_CreateAccount_InvalidNameFormat(t *testing.T) {
	router := newTestRouter(t)

	rec := doPost(t, router, map[string]any{
		"firstName": "Ana123",
		"lastName":  "Gómez",
		"email":     uniqueEmail("handler.invalid-name"),
	})

	require.Equal(t, http.StatusBadRequest, rec.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "validation_error", resp["error"])
}

func TestHandler_CreateAccount_DuplicateEmail(t *testing.T) {
	router := newTestRouter(t)
	body := map[string]any{
		"firstName": "Ana",
		"lastName":  "Gómez",
		"email":     uniqueEmail("handler.duplicate"),
	}

	first := doPost(t, router, body)
	require.Equal(t, http.StatusCreated, first.Code)

	second := doPost(t, router, body)
	require.Equal(t, http.StatusConflict, second.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(second.Body.Bytes(), &resp))
	require.Equal(t, "email_already_exists", resp["error"])
}

// TestHandler_CreateAccount_FreemiumLimit covers FR-007's server-side gate:
// two children on a brand-new (free) account must be rejected with 422 and
// must NOT leave a partially created account behind.
func TestHandler_CreateAccount_FreemiumLimit(t *testing.T) {
	router := newTestRouter(t)

	rec := doPost(t, router, map[string]any{
		"firstName": "Carla",
		"lastName":  "Ruiz",
		"email":     uniqueEmail("handler.freemium"),
		"children": []map[string]any{
			{"firstName": "Hijo Uno", "lastName": "Ruiz", "birthDate": "2018-01-01"},
			{"firstName": "Hijo Dos", "lastName": "Ruiz", "birthDate": "2021-01-01"},
		},
	})

	require.Equal(t, http.StatusUnprocessableEntity, rec.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "freemium_child_limit_exceeded", resp["error"])
	require.Equal(t, float64(2), resp["received"])
}

// TestRouter_NoChildMutationRoutes covers FR-006a: once persisted, a Child
// can never be edited or deleted in this scope, so the router must not
// expose PATCH/DELETE for it. This asserts the router returns 404/405
// (chi's default for an unregistered route) rather than routing to a handler.
func TestRouter_NoChildMutationRoutes(t *testing.T) {
	router := newTestRouter(t)

	paths := []struct {
		method string
		path   string
	}{
		{http.MethodPatch, "/accounts/11111111-1111-1111-1111-111111111111/children/22222222-2222-2222-2222-222222222222"},
		{http.MethodDelete, "/accounts/11111111-1111-1111-1111-111111111111/children/22222222-2222-2222-2222-222222222222"},
	}

	for _, p := range paths {
		t.Run(p.method+" "+p.path, func(t *testing.T) {
			req := httptest.NewRequest(p.method, p.path, nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			require.True(t, rec.Code == http.StatusNotFound || rec.Code == http.StatusMethodNotAllowed,
				"expected 404 or 405 for an unregistered child mutation route, got %d", rec.Code)
		})
	}
}
