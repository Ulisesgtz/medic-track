package health_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/health"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

type fakePinger struct {
	calls atomic.Int32
	err   error
	// block, if set, is waited on (or the context) before answering.
	block chan struct{}
}

func (p *fakePinger) Ping(ctx context.Context) error {
	p.calls.Add(1)
	if p.block != nil {
		select {
		case <-p.block:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return p.err
}

// stuckPinger ignores its context, like a driver that does not honor it.
type stuckPinger struct{ release chan struct{} }

func (p stuckPinger) Ping(context.Context) error { <-p.release; return nil }

type countingRecorder struct{ n atomic.Int32 }

func (r *countingRecorder) Create(context.Context, *errorlog.Entry) error { r.n.Add(1); return nil }

func newHandler(t *testing.T, p health.Pinger, commit string) (*health.Handler, *health.Checker, *countingRecorder) {
	t.Helper()
	rec := &countingRecorder{}
	c := health.NewChecker(p, commit)
	return health.NewHandler(httpx.NewResponder(rec), c), c, rec
}

func do(h *health.Handler, method string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	h.Health(w, httptest.NewRequest(method, "/healthz", nil))
	return w
}

func TestHealth_OKWithVersionAndNoStore(t *testing.T) {
	h, _, rec := newHandler(t, &fakePinger{}, "3e34a6799b24ffffeeee")
	w := do(h, http.MethodGet)
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "no-store", w.Header().Get("Cache-Control"))
	require.Equal(t, "application/json", w.Header().Get("Content-Type"))
	require.JSONEq(t, `{"status":"ok","version":"3e34a6799b24"}`, w.Body.String())
	time.Sleep(20 * time.Millisecond)
	require.Zero(t, rec.n.Load())
}

func TestHealth_VersionDevWhenEmptyAndShortKept(t *testing.T) {
	_, c, _ := newHandler(t, &fakePinger{}, "  ")
	require.Equal(t, "dev", c.Version())
	_, c, _ = newHandler(t, &fakePinger{}, "abc")
	require.Equal(t, "abc", c.Version())
}

func TestHealth_PingFailureIs503WithoutDetailsAndNeverLogged(t *testing.T) {
	h, _, rec := newHandler(t, &fakePinger{err: errors.New("password authentication failed for host db.internal")}, "abc")
	w := do(h, http.MethodGet)
	require.Equal(t, http.StatusServiceUnavailable, w.Code)
	require.Equal(t, "no-store", w.Header().Get("Cache-Control"))
	require.JSONEq(t, `{"status":"unavailable"}`, w.Body.String())
	time.Sleep(20 * time.Millisecond)
	require.Zero(t, rec.n.Load(), "an expected state is never an error_logs row")
}

func TestHealth_SlowPingIs503WithinTwoSeconds(t *testing.T) {
	h, _, _ := newHandler(t, &fakePinger{block: make(chan struct{})}, "abc")
	start := time.Now()
	w := do(h, http.MethodGet)
	require.Equal(t, http.StatusServiceUnavailable, w.Code)
	require.Less(t, time.Since(start), 3*time.Second)
	require.GreaterOrEqual(t, time.Since(start), health.PingTimeout-100*time.Millisecond)
}

func TestHealth_PingThatIgnoresItsContextStillTimesOut(t *testing.T) {
	release := make(chan struct{})
	defer close(release)
	h, _, _ := newHandler(t, stuckPinger{release: release}, "abc")
	require.Equal(t, http.StatusServiceUnavailable, do(h, http.MethodGet).Code)
}

func TestHealth_ResultIsReusedFor5Seconds(t *testing.T) {
	p := &fakePinger{}
	_, c, _ := newHandler(t, p, "abc")
	now := time.Now()
	c.SetClock(func() time.Time { return now })

	require.True(t, c.Healthy(context.Background()))
	now = now.Add(4 * time.Second)
	require.True(t, c.Healthy(context.Background()))
	require.EqualValues(t, 1, p.calls.Load())

	now = now.Add(2 * time.Second) // 6 s after the first
	p.err = errors.New("down")
	require.False(t, c.Healthy(context.Background()))
	require.EqualValues(t, 2, p.calls.Load())
	// A failure is reused too.
	require.False(t, c.Healthy(context.Background()))
	require.EqualValues(t, 2, p.calls.Load())
}

func TestHealth_SimultaneousRequestsMakeOnePing(t *testing.T) {
	p := &fakePinger{block: make(chan struct{})}
	_, c, _ := newHandler(t, p, "abc")
	var wg sync.WaitGroup
	results := make([]bool, 20)
	for i := range results {
		wg.Add(1)
		go func() { defer wg.Done(); results[i] = c.Healthy(context.Background()) }()
	}
	// Let them all arrive, then answer the one ping.
	time.Sleep(100 * time.Millisecond)
	close(p.block)
	wg.Wait()
	require.EqualValues(t, 1, p.calls.Load())
	for _, ok := range results {
		require.True(t, ok)
	}
}

func TestHealth_WaiterGivesUpWhenItsRequestIsCanceled(t *testing.T) {
	p := &fakePinger{block: make(chan struct{})}
	_, c, _ := newHandler(t, p, "abc")
	go c.Healthy(context.Background()) // the one in flight
	time.Sleep(50 * time.Millisecond)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	require.False(t, c.Healthy(ctx))
	close(p.block)
}

func TestHealth_HeadHasNoBody(t *testing.T) {
	h, _, _ := newHandler(t, &fakePinger{}, "abc")
	w := do(h, http.MethodHead)
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "no-store", w.Header().Get("Cache-Control"))
	require.Empty(t, strings.TrimSpace(w.Body.String()))

	h, _, _ = newHandler(t, &fakePinger{err: errors.New("x")}, "abc")
	w = do(h, http.MethodHead)
	require.Equal(t, http.StatusServiceUnavailable, w.Code)
	require.Empty(t, w.Body.String())
}
