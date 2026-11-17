package clienterror

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

type fakeRecorder struct {
	mu      sync.Mutex
	entries []*errorlog.Entry
	err     error
}

func (f *fakeRecorder) Create(_ context.Context, e *errorlog.Entry) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.entries = append(f.entries, e)
	return f.err
}

// newTestHandler writes the row synchronously and gives the same recorder to the responder, so a rejection that logged would show.
func newTestHandler() (*Handler, *fakeRecorder, *clock) {
	rec := &fakeRecorder{}
	h := NewHandler(httpx.NewResponder(rec), rec)
	h.spawn = func(f func()) { f() }
	th, c := newTestThrottle()
	h.throttle = th
	return h, rec, c
}

const goodBody = `{"kind":"render","message":"Cannot read properties of undefined (reading 'doses')","route":"/consultations/:consultationId","version":"3e34a6799b24","browser":"safari","os":"ios","installed":true,"count":3}`

func post(h *Handler, body string, headers ...string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/client-errors", strings.NewReader(body))
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	w := httptest.NewRecorder()
	h.Submit(w, req)
	return w
}

func TestSubmit_AcceptsAndWritesTheRow(t *testing.T) {
	h, rec, _ := newTestHandler()
	w := post(h, goodBody)

	require.Equal(t, http.StatusNoContent, w.Code)
	require.Empty(t, w.Body.String())
	require.Len(t, rec.entries, 1)
	e := rec.entries[0]
	require.Equal(t, "client:/consultations/:consultationId", e.Endpoint)
	require.Equal(t, "render · Cannot read properties of undefined (reading 'doses') · safari/ios · instalada · v3e34a6799b24 · repetido 2–9 veces", e.Message)
	require.Nil(t, e.HTTPStatus)
	require.Nil(t, e.AccountID)
	require.Equal(t, "frontend", e.File)
	require.Zero(t, e.Line)
}

func TestSubmit_IgnoresAuthorization(t *testing.T) {
	h, rec, _ := newTestHandler()
	w := post(h, goodBody, "Authorization", "Bearer something.that.is.not.checked")
	require.Equal(t, http.StatusNoContent, w.Code)
	require.Len(t, rec.entries, 1)
	require.Nil(t, rec.entries[0].AccountID)
	require.NotContains(t, rec.entries[0].Message, "Bearer")
}

func TestSubmit_RejectionsNeverWriteARow(t *testing.T) {
	h, rec, _ := newTestHandler()
	cases := map[string]struct {
		body   string
		status int
		code   string
	}{
		"not json":      {`nope`, 400, "invalid_client_error"},
		"empty":         {``, 400, "invalid_client_error"},
		"unknown field": {strings.Replace(goodBody, `"count":3`, `"count":3,"accountId":"x"`, 1), 400, "invalid_client_error"},
		"wrong type":    {strings.Replace(goodBody, `"count":3`, `"count":"3"`, 1), 400, "invalid_client_error"},
		"bad value":     {strings.Replace(goodBody, `"render"`, `"boom"`, 1), 400, "invalid_client_error"},
		"real route":    {strings.Replace(goodBody, `:consultationId`, `3e34a679`, 1), 400, "invalid_client_error"},
		"two objects":   {goodBody + goodBody, 400, "invalid_client_error"},
		"too large":     {strings.Replace(goodBody, `"message":"C`, `"message":"`+strings.Repeat("a", 3000)+`C`, 1), 413, "body_too_large"},
	}
	for name, c := range cases {
		w := post(h, c.body)
		require.Equal(t, c.status, w.Code, name)
		require.Contains(t, w.Body.String(), c.code, name)
	}
	require.Empty(t, rec.entries)
}

func TestSubmit_ThrottledAnswersTheSame204AndTheNextRowCountsTheRest(t *testing.T) {
	h, rec, c := newTestHandler()
	for i := 0; i < 3; i++ {
		require.Equal(t, http.StatusNoContent, post(h, goodBody).Code)
	}
	require.Len(t, rec.entries, 1)

	c.t = c.t.Add(6 * time.Minute)
	post(h, goodBody)
	require.Len(t, rec.entries, 2)
	require.True(t, strings.HasSuffix(rec.entries[1].Message, " (+2 más desde la última)"), rec.entries[1].Message)
}

func TestSubmit_ARecorderFailureDoesNotChangeTheAnswer(t *testing.T) {
	h, rec, _ := newTestHandler()
	rec.err = errors.New("db down")
	require.Equal(t, http.StatusNoContent, post(h, goodBody).Code)
}

func TestNewHandler_WritesInTheBackground(t *testing.T) {
	rec := &fakeRecorder{}
	h := NewHandler(httpx.NewResponder(rec), rec)
	done := make(chan struct{})
	h.spawn = func(f func()) { go func() { f(); close(done) }() }
	require.Equal(t, http.StatusNoContent, post(h, goodBody).Code)
	<-done
	require.Len(t, rec.entries, 1)
}

func TestNewHandler_DefaultSpawnRuns(t *testing.T) {
	rec := &fakeRecorder{}
	h := NewHandler(httpx.NewResponder(rec), rec)
	ran := make(chan struct{})
	h.spawn(func() { close(ran) })
	<-ran
}
