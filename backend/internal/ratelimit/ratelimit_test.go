package ratelimit

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

type noopRecorder struct{}

func (noopRecorder) Create(context.Context, *errorlog.Entry) error { return nil }

func TestLimiter_AllowsTheLimitThenBlocksUntilTheWindowEnds(t *testing.T) {
	l := New(3, time.Minute)
	now := time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)
	l.now = func() time.Time { return now }

	for i := 0; i < 3; i++ {
		ok, _ := l.Allow("a")
		require.True(t, ok)
	}
	ok, wait := l.Allow("a")
	require.False(t, ok)
	require.Equal(t, time.Minute, wait)

	other, _ := l.Allow("b")
	require.True(t, other, "another client has its own window")

	now = now.Add(30 * time.Second)
	_, wait = l.Allow("a")
	require.Equal(t, 30*time.Second, wait)

	now = now.Add(31 * time.Second)
	ok, _ = l.Allow("a")
	require.True(t, ok, "a new window starts")
}

func TestLimiter_SweepsExpiredClientsWhenFull(t *testing.T) {
	l := New(1, time.Minute)
	now := time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)
	l.now = func() time.Time { return now }
	for i := 0; i < maxClients; i++ {
		l.clients[strconv.Itoa(i)] = &window{start: now.Add(-2 * time.Minute), count: 1}
	}
	ok, _ := l.Allow("new")
	require.True(t, ok)
	require.Len(t, l.clients, 1, "the expired windows were swept")
}

func TestClientIP(t *testing.T) {
	req := func(remote string, xff ...string) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = remote
		for _, h := range xff {
			r.Header.Add("X-Forwarded-For", h)
		}
		return r
	}
	require.Equal(t, "203.0.113.9", ClientIP(req("10.0.0.1:1234", "6.6.6.6, 203.0.113.9"), 1), "the forged first entry is ignored")
	require.Equal(t, "6.6.6.6", ClientIP(req("10.0.0.1:1234", "6.6.6.6, 203.0.113.9"), 2), "two trusted proxies")
	require.Equal(t, "6.6.6.6", ClientIP(req("10.0.0.1:1234", "6.6.6.6"), 3), "fewer entries than hops: the first")
	require.Equal(t, "203.0.113.9", ClientIP(req("10.0.0.1:1234", "6.6.6.6", "203.0.113.9"), 1), "several header lines")
	require.Equal(t, "10.0.0.1", ClientIP(req("10.0.0.1:1234"), 1), "no header: the connection")
	require.Equal(t, "10.0.0.1", ClientIP(req("10.0.0.1:1234", "6.6.6.6"), 0), "no trusted proxy: the header is not believed")
	require.Equal(t, "no-port", ClientIP(req("no-port"), 1))
}

func TestMiddleware(t *testing.T) {
	responder := httpx.NewResponder(noopRecorder{})
	l := New(2, time.Minute)
	h := Middleware(l, responder, 1)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))

	call := func(remote, xff string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = remote
		if xff != "" {
			r.Header.Set("X-Forwarded-For", xff)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, r)
		return rec
	}
	require.Equal(t, http.StatusNoContent, call("10.0.0.1:1", "203.0.113.9").Code)
	require.Equal(t, http.StatusNoContent, call("10.0.0.1:1", "203.0.113.9").Code)
	blocked := call("10.0.0.1:1", "203.0.113.9")
	require.Equal(t, http.StatusTooManyRequests, blocked.Code)
	require.NotEmpty(t, blocked.Header().Get("Retry-After"))
	require.Contains(t, blocked.Body.String(), "too_many_requests")
	require.Equal(t, http.StatusNoContent, call("10.0.0.1:1", "198.51.100.7").Code, "another client")

	for i := 0; i < 10; i++ {
		require.Equal(t, http.StatusNoContent, call("127.0.0.1:5", "").Code, "loopback is never limited")
	}
}
