package server_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/clienterror"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/ratelimit"
	"github.com/Ulisesgtz/medic-track/backend/internal/server"
)

type countingRecorder struct {
	mu      sync.Mutex
	entries []errorlog.Entry
}

func (c *countingRecorder) Create(_ context.Context, e *errorlog.Entry) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = append(c.entries, *e)
	return nil
}

func (c *countingRecorder) all() []errorlog.Entry {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]errorlog.Entry(nil), c.entries...)
}

const clientErrorBody = `{"kind":"error","message":"boom","route":"/home","version":"abc","browser":"chrome","os":"android","installed":false,"count":1}`

func clientErrorsRouter(rec *countingRecorder, perMinute int) http.Handler {
	responder := httpx.NewResponder(rec)
	deps := server.Deps{
		Responder:       responder,
		FrontendOrigin:  "http://localhost:5173",
		RequireSession:  func(next http.Handler) http.Handler { return next },
		StrictRateLimit: ratelimit.Middleware(ratelimit.New(2, time.Minute), responder, 1),
	}
	if perMinute > 0 {
		deps.ClientErrors = clienterror.NewHandler(responder, rec)
		deps.ClientErrorsLimit = ratelimit.Middleware(ratelimit.New(perMinute, time.Minute), responder, 1)
	}
	return server.NewRouter(deps)
}

func send(h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.RemoteAddr = "10.0.0.1:1234"
	req.Header.Set("X-Forwarded-For", "203.0.113.9")
	rec := httptest.NewRecorder()
	func() {
		defer func() { _ = recover() }() // the other routes have nil handlers: only the limits are tested
		h.ServeHTTP(rec, req)
	}()
	return rec
}

// specs/072 US3: its own limit; the 11th is a 429 with Retry-After that writes nothing and spends nothing of the strict limit.
func TestClientErrors_OwnLimitNeverWritesAndDoesNotUseTheStrictOne(t *testing.T) {
	rec := &countingRecorder{}
	h := clientErrorsRouter(rec, 10)

	for i := 0; i < 10; i++ {
		require.Equal(t, http.StatusNoContent, send(h, http.MethodPost, "/client-errors", clientErrorBody).Code, "request %d", i+1)
	}
	over := send(h, http.MethodPost, "/client-errors", clientErrorBody)
	require.Equal(t, http.StatusTooManyRequests, over.Code)
	require.NotEmpty(t, over.Header().Get("Retry-After"))

	time.Sleep(200 * time.Millisecond) // the row is written in the background
	entries := rec.all()
	require.Len(t, entries, 1, "the same error is one row; the 429 is none")
	require.Nil(t, entries[0].HTTPStatus)
	require.Equal(t, "client:/home", entries[0].Endpoint)

	// The strict counter (2 per minute) is untouched: the first two "Tomada" are not refused.
	require.NotEqual(t, http.StatusTooManyRequests, send(h, http.MethodPost, "/reminders/actions/taken", "{}").Code)
	require.NotEqual(t, http.StatusTooManyRequests, send(h, http.MethodPost, "/reminders/actions/taken", "{}").Code)
	require.Equal(t, http.StatusTooManyRequests, send(h, http.MethodPost, "/reminders/actions/taken", "{}").Code)
}

func TestClientErrors_RouteNotRegisteredWithoutHandler(t *testing.T) {
	h := clientErrorsRouter(&countingRecorder{}, 0)
	require.Equal(t, http.StatusNotFound, send(h, http.MethodPost, "/client-errors", clientErrorBody).Code)
}

func TestClientErrors_WithoutOwnLimitStillWorks(t *testing.T) {
	rec := &countingRecorder{}
	responder := httpx.NewResponder(rec)
	h := server.NewRouter(server.Deps{Responder: responder, FrontendOrigin: "http://localhost:5173",
		RequireSession: func(next http.Handler) http.Handler { return next }, ClientErrors: clienterror.NewHandler(responder, rec)})
	require.Equal(t, http.StatusNoContent, send(h, http.MethodPost, "/client-errors", clientErrorBody).Code)
}
