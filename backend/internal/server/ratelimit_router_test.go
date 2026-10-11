package server_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/ratelimit"
	"github.com/Ulisesgtz/medic-track/backend/internal/server"
)

type limitRecorder struct{}

func (limitRecorder) Create(context.Context, *errorlog.Entry) error { return nil }

// A request that is over the limit is answered 429 before it reaches any handler, so the router can be built with no
// handlers at all: the ones under the limit reach a nil handler and Recoverer turns that into a 500, which is "not 429".
func TestRouter_RateLimits(t *testing.T) {
	responder := httpx.NewResponder(limitRecorder{})
	router := server.NewRouter(server.Deps{
		Responder:       responder,
		FrontendOrigin:  "http://localhost:5173",
		RequireSession:  func(next http.Handler) http.Handler { return next },
		RateLimit:       ratelimit.Middleware(ratelimit.New(5, time.Minute), responder, 1),
		StrictRateLimit: ratelimit.Middleware(ratelimit.New(2, time.Minute), responder, 1),
	})

	status := func(method, path string) int {
		req := httptest.NewRequest(method, path, nil)
		req.RemoteAddr = "10.0.0.1:1234"
		req.Header.Set("X-Forwarded-For", "203.0.113.9")
		rec := httptest.NewRecorder()
		func() {
			defer func() { _ = recover() }() // a nil handler may panic outside Recoverer's reach: the limit is what is tested
			router.ServeHTTP(rec, req)
		}()
		return rec.Code
	}

	// The strict routes: the third request in the window is refused. (The general limiter also counts them.)
	require.NotEqual(t, http.StatusTooManyRequests, status(http.MethodPost, "/reminders/actions/taken"))
	require.NotEqual(t, http.StatusTooManyRequests, status(http.MethodPost, "/reminders/actions/taken"))
	require.Equal(t, http.StatusTooManyRequests, status(http.MethodPost, "/reminders/actions/taken"))
	// The strict counter is shared by the invitation routes: it is already spent for this client.
	require.Equal(t, http.StatusTooManyRequests, status(http.MethodPost, "/family/invitations/preview"))
	// A route that is not strict still has the general limit (5 per minute: three were spent above, one more got a 429 first).
	require.NotEqual(t, http.StatusTooManyRequests, status(http.MethodGet, "/catalog/countries"))
	require.Equal(t, http.StatusTooManyRequests, status(http.MethodGet, "/catalog/countries"))
}
