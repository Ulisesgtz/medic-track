package authmw_test

import (
	"context"
	"encoding/json"
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
