package account

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync/atomic"
	"testing"
	"time"

	clerk "github.com/clerk/clerk-sdk-go/v2"
	"github.com/stretchr/testify/require"
)

const userBody = `{"id":"user_x","email_addresses":[{"id":"idn_1","email_address":"ana@example.com","verification":{"status":"verified"}}],"primary_email_address_id":"idn_1"}`

// slowClerk points Clerk's global Backend at a server that sleeps `slow` calls longer than the client's 50 ms limit.
func slowClerk(t *testing.T, slow int32) *atomic.Int32 {
	t.Helper()
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) <= slow {
			select {
			case <-time.After(300 * time.Millisecond):
			case <-r.Context().Done():
				return
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(userBody))
	}))
	t.Cleanup(server.Close)
	clerk.SetKey("test-secret-key")
	clerk.SetBackend(clerk.NewBackend(&clerk.BackendConfig{
		HTTPClient: &http.Client{Timeout: 50 * time.Millisecond},
		URL:        &server.URL,
	}))
	return &calls
}

func shortWaits(t *testing.T) {
	saved := clerkRateLimitWaits
	clerkRateLimitWaits = []time.Duration{time.Millisecond, time.Millisecond, time.Millisecond}
	t.Cleanup(func() { clerkRateLimitWaits = saved })
}

// Clerk too slow once (the client's time limit): it is asked again and answers.
func TestClerkPrimaryEmail_SlowOnceIsAskedAgain(t *testing.T) {
	shortWaits(t)
	calls := slowClerk(t, 1)
	email, err := clerkPrimaryEmail(context.Background(), "user_x")
	require.NoError(t, err)
	require.Equal(t, "ana@example.com", email)
	require.EqualValues(t, 2, calls.Load())
}

// Always too slow: an error after the first call and every retry.
func TestClerkPrimaryEmail_AlwaysSlowFailsAfterTheRetries(t *testing.T) {
	shortWaits(t)
	calls := slowClerk(t, 100)
	_, err := clerkPrimaryEmail(context.Background(), "user_x")
	require.Error(t, err)
	require.EqualValues(t, 1+len(clerkRateLimitWaits), calls.Load())
}

// The request's own context ended: nobody is waiting, so it does not ask again.
func TestClerkPrimaryEmail_CanceledRequestIsNotRetried(t *testing.T) {
	shortWaits(t)
	calls := slowClerk(t, 100)
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(10 * time.Millisecond); cancel() }()
	_, err := clerkPrimaryEmail(ctx, "user_x")
	require.Error(t, err)
	require.EqualValues(t, 1, calls.Load())
}

// The request's context is canceled during a wait between tries: it returns at once.
func TestClerkPrimaryEmail_CanceledDuringWaitStops(t *testing.T) {
	saved := clerkRateLimitWaits
	clerkRateLimitWaits = []time.Duration{time.Minute}
	t.Cleanup(func() { clerkRateLimitWaits = saved })
	slowClerk(t, 100)
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, err := clerkPrimaryEmail(ctx, "user_x")
	require.ErrorIs(t, err, context.DeadlineExceeded)
	require.Less(t, time.Since(start), 5*time.Second)
}

func TestClerkRetryable(t *testing.T) {
	require.False(t, clerkRetryable(context.Background(), nil))
	require.True(t, clerkRetryable(context.Background(), context.DeadlineExceeded))
	require.False(t, clerkRetryable(context.Background(), http.ErrAbortHandler))
	require.True(t, clerkRetryable(context.Background(), &clerk.APIErrorResponse{HTTPStatusCode: 503}))
	require.False(t, clerkRetryable(context.Background(), &clerk.APIErrorResponse{HTTPStatusCode: 404}))
}

// ConfigureClerk keeps the key (NewBackend copies it) and gives a call more than the SDK's 5 s... here, more than 50 ms.
func TestConfigureClerk(t *testing.T) {
	var auth atomic.Value
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth.Store(r.Header.Get("Authorization"))
		time.Sleep(100 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(userBody))
	}))
	t.Cleanup(server.Close)
	// The real Clerk URL is a constant: a transport sends everything to the test server instead.
	target, _ := url.Parse(server.URL)
	savedTransport := http.DefaultTransport
	http.DefaultTransport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		r.URL.Scheme, r.URL.Host = target.Scheme, target.Host
		return savedTransport.RoundTrip(r)
	})
	t.Cleanup(func() { http.DefaultTransport = savedTransport })

	ConfigureClerk("sk_test_abc", 2*time.Second)
	email, err := clerkPrimaryEmail(context.Background(), "user_x")
	require.NoError(t, err)
	require.Equal(t, "ana@example.com", email)
	require.Equal(t, "Bearer sk_test_abc", auth.Load())
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
