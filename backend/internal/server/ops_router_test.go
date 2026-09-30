package server_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/ops"
	"github.com/Ulisesgtz/medic-track/backend/internal/server"
)

// specs/021: the operation queries are the one place outside the parents' sessions. They exist only when the server
// has an operation key, and only the key opens them. No database needed: the reader is a fake.

type emptyReader struct{}

func (emptyReader) List(context.Context, errorlog.Filter) ([]errorlog.Entry, bool, error) {
	return nil, false, nil
}
func (emptyReader) Summary(context.Context, errorlog.Filter) ([]errorlog.SummaryRow, error) {
	return nil, nil
}

type discardRecorder struct{}

func (discardRecorder) Create(context.Context, *errorlog.Entry) error { return nil }

func opsRouter(handler bool, key string) http.Handler {
	d := server.Deps{
		Responder:      httpx.NewResponder(discardRecorder{}),
		FrontendOrigin: "http://localhost:5173",
		RequireSession: func(next http.Handler) http.Handler { return next },
		OpsKey:         key,
	}
	if handler {
		d.Ops = ops.NewHandler(emptyReader{}, d.Responder)
	}
	return server.NewRouter(d)
}

func request(router http.Handler, path, authorization string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if authorization != "" {
		req.Header.Set("Authorization", authorization)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestRouter_OpsRoutesNeedTheKey(t *testing.T) {
	router := opsRouter(true, "the-key")
	unknown := request(router, "/no-such-route", "")
	require.Equal(t, http.StatusNotFound, unknown.Code)

	for _, path := range []string{"/ops/error-logs", "/ops/error-logs/summary"} {
		ok := request(router, path, "Bearer the-key")
		require.Equal(t, http.StatusOK, ok.Code, path)

		for _, bad := range []string{"", "Bearer wrong", "Bearer ", "Basic the-key", "the-key"} {
			rec := request(router, path, bad)
			require.Equal(t, http.StatusNotFound, rec.Code, "%s %q", path, bad)
			require.Equal(t, unknown.Body.String(), rec.Body.String(), "a wrong key looks like an unknown route: %s %q", path, bad)
		}
	}
}

func TestRouter_WithoutAnOperationKeyTheRoutesDoNotExist(t *testing.T) {
	for name, router := range map[string]http.Handler{
		"no handler":             opsRouter(false, "the-key"),
		"handler but empty key":  opsRouter(true, ""),
		"neither handler or key": opsRouter(false, ""),
	} {
		for _, auth := range []string{"", "Bearer the-key", "Bearer "} {
			for _, path := range []string{"/ops/error-logs", "/ops/error-logs/summary"} {
				require.Equal(t, http.StatusNotFound, request(router, path, auth).Code, "%s %s %q", name, path, auth)
			}
		}
	}
}

func TestRouter_TheOperationKeyIsNotASession(t *testing.T) {
	// The key opens the operation queries only: it does not stand in for a parent's session anywhere else.
	router := opsRouter(true, "the-key")
	require.Equal(t, http.StatusNotFound, request(router, "/ops/other", "Bearer the-key").Code)
}
