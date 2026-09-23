package authmw_test

import (
	"errors"

	"context"
	"encoding/json"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/authmw"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw/authmwtest"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// noopRecorder satisfies httpx.Recorder without a live database — these
// tests only care about the HTTP behavior of RequireSession, not whether
// error_logs actually receives a row (that's httpx's own test suite).
type noopRecorder struct{}

func (noopRecorder) Create(context.Context, *errorlog.Entry) error { return nil }

func newTestResponder() *httpx.Responder {
	return httpx.NewResponder(noopRecorder{})
}

func newRouter(t *testing.T, next http.HandlerFunc) (http.Handler, *authmwtest.Verifier) {
	t.Helper()
	responder := newTestResponder()
	verifier := authmwtest.NewVerifier(t, responder)

	mux := http.NewServeMux()
	mux.Handle("/protected", verifier.Middleware(next))
	return mux, verifier
}

func TestRequireSession_MissingHeader(t *testing.T) {
	router, _ := newRouter(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be reached without a session")
	})

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusUnauthorized, rec.Code)
	var body map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "unauthorized", body["error"])
}

func TestRequireSession_InvalidToken(t *testing.T) {
	router, _ := newRouter(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be reached with an invalid token")
	})

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer not-a-real-jwt")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusUnauthorized, rec.Code)
	var body map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "unauthorized", body["error"])
}

func TestRequireSession_ValidToken(t *testing.T) {
	var gotClerkUserID string
	var gotOK bool
	router, verifier := newRouter(t, func(w http.ResponseWriter, r *http.Request) {
		gotClerkUserID, gotOK = authmw.ClerkUserIDFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	token := verifier.Token(t, "user_123")
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.True(t, gotOK)
	require.Equal(t, "user_123", gotClerkUserID)
}

func TestClerkUserIDFromContext_NoClaims(t *testing.T) {
	_, ok := authmw.ClerkUserIDFromContext(httptest.NewRequest(http.MethodGet, "/", nil).Context())
	require.False(t, ok)
}

func newOwnerRouter(t *testing.T, check authmw.OwnerCheck, next http.HandlerFunc) (http.Handler, *authmwtest.Verifier) {
	t.Helper()
	responder := newTestResponder()
	verifier := authmwtest.NewVerifier(t, responder)
	r := chi.NewRouter()
	r.With(verifier.Middleware, authmw.RequireOwner(responder, "id", check)).Get("/things/{id}", next)
	// Same guarded route but without a session middleware in front.
	r.With(authmw.RequireOwner(responder, "id", check)).Get("/no-session/{id}", next)
	return r, verifier
}

func getThing(router http.Handler, path, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestRequireOwner_OwnerReachesTheHandler(t *testing.T) {
	id := uuid.New()
	var gotUser string
	router, verifier := newOwnerRouter(t, func(_ context.Context, clerkUserID string, got uuid.UUID) (bool, error) {
		gotUser = clerkUserID
		return got == id, nil
	}, func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })

	rec := getThing(router, "/things/"+id.String(), verifier.Token(t, "user_owner"))

	require.Equal(t, http.StatusNoContent, rec.Code)
	require.Equal(t, "user_owner", gotUser)
}

func TestRequireOwner_NotTheOwnerIs403AndNeverReachesTheHandler(t *testing.T) {
	router, verifier := newOwnerRouter(t, func(context.Context, string, uuid.UUID) (bool, error) { return false, nil },
		func(http.ResponseWriter, *http.Request) {
			t.Fatal("handler must not run for a resource the session doesn't own")
		})

	rec := getThing(router, "/things/"+uuid.NewString(), verifier.Token(t, "user_other"))

	require.Equal(t, http.StatusForbidden, rec.Code)
	var body map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "forbidden", body["error"])
}

func TestRequireOwner_CheckFailureIs500(t *testing.T) {
	router, verifier := newOwnerRouter(t, func(context.Context, string, uuid.UUID) (bool, error) { return false, errors.New("db down") },
		func(http.ResponseWriter, *http.Request) {
			t.Fatal("handler must not run when ownership can't be verified")
		})

	rec := getThing(router, "/things/"+uuid.NewString(), verifier.Token(t, "user_x"))

	require.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestRequireOwner_MalformedIDFallsThroughToTheHandler(t *testing.T) {
	router, verifier := newOwnerRouter(t, func(context.Context, string, uuid.UUID) (bool, error) {
		t.Fatal("the check must not run for a malformed id")
		return false, nil
	}, func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNotFound) })

	rec := getThing(router, "/things/not-a-uuid", verifier.Token(t, "user_x"))

	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestRequireOwner_WithoutASessionIs401(t *testing.T) {
	router, _ := newOwnerRouter(t, func(context.Context, string, uuid.UUID) (bool, error) { return true, nil },
		func(http.ResponseWriter, *http.Request) { t.Fatal("handler must not run without a session") })

	rec := getThing(router, "/no-session/"+uuid.NewString(), "")

	require.Equal(t, http.StatusUnauthorized, rec.Code)
}
