package errordigest

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func sampleMessage() Message {
	return Message{
		From:           "PediTrack <alertas@pedi-track.com>",
		To:             "soporte@pedi-track.com",
		Subject:        "[PediTrack DEV] Errores del 5 oct al 12 oct 2026: 3",
		Text:           "line one\nline two",
		IdempotencyKey: "error-digest-2026-W42",
	}
}

func TestResendSender_SendsTheDocumentedRequest(t *testing.T) {
	var gotMethod, gotPath, gotAuth, gotType, gotKey string
	var gotBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		gotAuth, gotType, gotKey = r.Header.Get("Authorization"), r.Header.Get("Content-Type"), r.Header.Get("Idempotency-Key")
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &gotBody)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"}`))
	}))
	defer server.Close()

	err := NewResendSender("re_secret_key", server.Client(), server.URL).Send(context.Background(), sampleMessage())

	require.NoError(t, err)
	require.Equal(t, http.MethodPost, gotMethod)
	require.Equal(t, "/emails", gotPath)
	require.Equal(t, "Bearer re_secret_key", gotAuth)
	require.Equal(t, "application/json", gotType)
	require.Equal(t, "error-digest-2026-W42", gotKey)
	require.Equal(t, "PediTrack <alertas@pedi-track.com>", gotBody["from"])
	require.Equal(t, []any{"soporte@pedi-track.com"}, gotBody["to"])
	require.Equal(t, "[PediTrack DEV] Errores del 5 oct al 12 oct 2026: 3", gotBody["subject"])
	require.Equal(t, "line one\nline two", gotBody["text"])
	require.NotContains(t, gotBody, "html", "plain text only")
}

func TestResendSender_NoIdempotencyKeyNoHeader(t *testing.T) {
	var hasHeader bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, hasHeader = r.Header["Idempotency-Key"]
	}))
	defer server.Close()
	m := sampleMessage()
	m.IdempotencyKey = ""

	require.NoError(t, NewResendSender("k", server.Client(), server.URL).Send(context.Background(), m))
	require.False(t, hasHeader)
}

func TestResendSender_ClassifiesTheAnswers(t *testing.T) {
	cases := []struct {
		status    int
		retryable bool
		ok        bool
	}{
		{200, false, true}, {202, false, true}, {409, false, true},
		{408, true, false}, {429, true, false}, {500, true, false}, {503, true, false},
		{400, false, false}, {401, false, false}, {403, false, false}, {422, false, false},
		{302, false, false},
	}
	for _, tc := range cases {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(tc.status)
		}))
		err := NewResendSender("k", server.Client(), server.URL).Send(context.Background(), sampleMessage())
		server.Close()

		if tc.ok {
			require.NoError(t, err, tc.status)
			continue
		}
		var sendErr *SendError
		require.True(t, errors.As(err, &sendErr), tc.status)
		require.Equal(t, tc.status, sendErr.Status)
		require.Equal(t, tc.retryable, sendErr.Retryable, tc.status)
		require.Equal(t, tc.retryable, IsRetryable(err), tc.status)
	}
}

func TestResendSender_ANetworkErrorIsRetryableAndHasNoStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	url := server.URL
	server.Close() // nothing listens any more

	err := NewResendSender("k", nil, url).Send(context.Background(), sampleMessage())

	var sendErr *SendError
	require.True(t, errors.As(err, &sendErr))
	require.True(t, sendErr.Retryable)
	require.Zero(t, sendErr.Status)
	require.NotContains(t, err.Error(), url, "the address of the request is not repeated")
}

func TestResendSender_ACancelledContextIsNotAProviderFailure(t *testing.T) {
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-release }))
	defer server.Close()
	defer close(release)
	ctx, cancel := context.WithCancel(context.Background())
	time.AfterFunc(50*time.Millisecond, cancel)

	err := NewResendSender("k", server.Client(), server.URL).Send(ctx, sampleMessage())

	require.ErrorIs(t, err, context.Canceled)
	var sendErr *SendError
	require.False(t, errors.As(err, &sendErr))
}

func TestResendSender_DoesNotFollowRedirects(t *testing.T) {
	var elsewhere atomic.Int32
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { elsewhere.Add(1) }))
	defer other.Close()
	redirecting := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, other.URL, http.StatusFound)
	}))
	defer redirecting.Close()

	// nil client: the one the sender builds for itself.
	err := NewResendSender("k", nil, redirecting.URL).Send(context.Background(), sampleMessage())

	var sendErr *SendError
	require.True(t, errors.As(err, &sendErr))
	require.Equal(t, http.StatusFound, sendErr.Status)
	require.False(t, sendErr.Retryable)
	require.Zero(t, elsewhere.Load(), "the redirect target never receives the request")
}

func TestResendSender_NeverRepeatsTheKeyTheAddressOrTheAnswerInTheError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = w.Write([]byte(`{"message":"The to address soporte@pedi-track.com is invalid; key re_secret_key"}`))
	}))
	defer server.Close()

	err := NewResendSender("re_secret_key", server.Client(), server.URL).Send(context.Background(), sampleMessage())

	require.Error(t, err)
	text := err.Error()
	require.False(t, strings.Contains(text, "re_secret_key") || strings.Contains(text, "soporte@") || strings.Contains(text, "invalid"), text)
}

func TestNewResendSender_Defaults(t *testing.T) {
	s := NewResendSender("k", nil, "")
	require.Equal(t, DefaultBaseURL, s.baseURL)
	require.Equal(t, sendTimeout, s.client.Timeout)
	require.NotNil(t, s.client.CheckRedirect)
}

func TestIsRetryable_AnUnexpectedErrorIsRetried(t *testing.T) {
	require.True(t, IsRetryable(errors.New("something unexpected")))
	require.False(t, IsRetryable(&SendError{Retryable: false, Status: 401}))
	require.True(t, IsRetryable(&SendError{Retryable: true, Status: 503}))
}
