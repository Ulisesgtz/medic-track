package server_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/health"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/ratelimit"
	"github.com/Ulisesgtz/medic-track/backend/internal/server"
)

type okPinger struct{}

func (okPinger) Ping(context.Context) error { return nil }

// specs/072: /healthz lives in the root router, outside the limit and CORS; the API's routes keep both.
func TestNewHandler_HealthzIsOutsideTheLimitAndCORSButTheAPIIsNot(t *testing.T) {
	responder := httpx.NewResponder(limitRecorder{})
	handler := server.NewHandler(server.Deps{
		Responder:      responder,
		FrontendOrigin: "http://localhost:5173",
		RequireSession: func(next http.Handler) http.Handler { return next },
		RateLimit:      ratelimit.Middleware(ratelimit.New(2, time.Minute), responder, 1),
		Health:         health.NewHandler(responder, health.NewChecker(okPinger{}, "abc")),
	})

	call := func(method, path string, headers map[string]string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, nil)
		req.RemoteAddr = "10.0.0.1:1234"
		req.Header.Set("X-Forwarded-For", "203.0.113.9")
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		rec := httptest.NewRecorder()
		func() {
			defer func() { _ = recover() }() // a nil handler may panic: only the limit and the headers are tested
			handler.ServeHTTP(rec, req)
		}()
		return rec
	}

	// Many more than the limit of 2 per minute: /healthz is never refused, and it has no CORS headers.
	for i := 0; i < 10; i++ {
		rec := call(http.MethodGet, "/healthz", map[string]string{"Origin": "http://localhost:5173"})
		require.Equal(t, http.StatusOK, rec.Code)
		require.Empty(t, rec.Header().Get("Access-Control-Allow-Origin"))
		require.JSONEq(t, `{"status":"ok","version":"abc"}`, rec.Body.String())
	}
	require.Equal(t, http.StatusOK, call(http.MethodHead, "/healthz", nil).Code)

	// Another method on /healthz is 405, never the API.
	require.Equal(t, http.StatusMethodNotAllowed, call(http.MethodPost, "/healthz", nil).Code)

	// The API's routes still pass through CORS and the limit: the third request in the window is a 429, and the CORS header is there.
	rec := call(http.MethodGet, "/catalog/countries", map[string]string{"Origin": "http://localhost:5173"})
	require.Equal(t, "http://localhost:5173", rec.Header().Get("Access-Control-Allow-Origin"))
	call(http.MethodGet, "/catalog/countries", nil)
	require.Equal(t, http.StatusTooManyRequests, call(http.MethodGet, "/catalog/countries", nil).Code)
}

func TestNewHandler_WithoutHealthTheRouteIsNotRegistered(t *testing.T) {
	responder := httpx.NewResponder(limitRecorder{})
	handler := server.NewHandler(server.Deps{
		Responder:      responder,
		FrontendOrigin: "http://localhost:5173",
		RequireSession: func(next http.Handler) http.Handler { return next },
	})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	require.Equal(t, http.StatusNotFound, rec.Code)
}
