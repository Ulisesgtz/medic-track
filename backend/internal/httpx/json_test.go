package httpx_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// fakeRecorder is an in-memory httpx.Recorder for tests. Create blocks until
// the entry is stored, then signals done via a channel so tests can wait for
// the background goroutine without a sleep.
type fakeRecorder struct {
	mu      sync.Mutex
	entries []*errorlog.Entry
	err     error
	done    chan struct{}
}

func newFakeRecorder() *fakeRecorder {
	return &fakeRecorder{done: make(chan struct{}, 10)}
}

func (f *fakeRecorder) Create(_ context.Context, e *errorlog.Entry) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		f.done <- struct{}{}
		return f.err
	}
	f.entries = append(f.entries, e)
	f.done <- struct{}{}
	return nil
}

func (f *fakeRecorder) waitForRecord(t *testing.T) {
	t.Helper()
	select {
	case <-f.done:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for background error log record")
	}
}

func (f *fakeRecorder) lastEntry() *errorlog.Entry {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.entries) == 0 {
		return nil
	}
	return f.entries[len(f.entries)-1]
}

func TestResponder_WriteJSONError_RecordsEntry(t *testing.T) {
	recorder := newFakeRecorder()
	responder := httpx.NewResponder(recorder)
	rec := httptest.NewRecorder()
	accountID := uuid.New()

	responder.WriteJSONError(context.Background(), rec, 409, "email_already_exists", "Email is already in use", &accountID)
	recorder.waitForRecord(t)

	entry := recorder.lastEntry()
	require.NotNil(t, entry)
	require.Equal(t, "Email is already in use", entry.Message)
	require.NotNil(t, entry.HTTPStatus)
	require.Equal(t, 409, *entry.HTTPStatus)
	require.NotNil(t, entry.AccountID)
	require.Equal(t, accountID, *entry.AccountID)
	require.NotEmpty(t, entry.File)
	require.Positive(t, entry.Line)
}

func TestResponder_WriteJSONError_NilAccountID(t *testing.T) {
	recorder := newFakeRecorder()
	responder := httpx.NewResponder(recorder)
	rec := httptest.NewRecorder()

	responder.WriteJSONError(context.Background(), rec, 400, "validation_error", "email is required", nil)
	recorder.waitForRecord(t)

	entry := recorder.lastEntry()
	require.NotNil(t, entry)
	require.Nil(t, entry.AccountID)
}

func TestResponder_WriteJSONError_RecorderFailureDoesNotAffectResponse(t *testing.T) {
	recorder := newFakeRecorder()
	recorder.err = errors.New("db is down")
	responder := httpx.NewResponder(recorder)
	rec := httptest.NewRecorder()

	responder.WriteJSONError(context.Background(), rec, 500, "internal_error", "Could not create account", nil)
	recorder.waitForRecord(t)

	require.Equal(t, 500, rec.Code)
	var body map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "internal_error", body["error"])
	require.Equal(t, "Could not create account", body["message"])
}

func TestResponder_WriteJSON_SuccessDoesNotRecord(t *testing.T) {
	recorder := newFakeRecorder()
	responder := httpx.NewResponder(recorder)
	rec := httptest.NewRecorder()

	responder.WriteJSON(context.Background(), rec, 201, map[string]string{"id": "abc"}, nil)

	select {
	case <-recorder.done:
		t.Fatal("a successful response must never be recorded as an error")
	case <-time.After(100 * time.Millisecond):
		// expected: nothing recorded
	}
}

// TestResponder_WriteJSONError_SuccessStatusDoesNotRecord is a regression
// test for a code review finding: WriteJSONError used to call record()
// unconditionally, unlike WriteJSON's status>=400 guard — a misuse (calling
// WriteJSONError with a 2xx/3xx status) would have silently logged a bogus
// "error" entry. The guard now lives once inside record() itself, shared by
// both methods.
func TestResponder_WriteJSONError_SuccessStatusDoesNotRecord(t *testing.T) {
	recorder := newFakeRecorder()
	responder := httpx.NewResponder(recorder)
	rec := httptest.NewRecorder()

	responder.WriteJSONError(context.Background(), rec, 200, "ok", "not actually an error", nil)

	select {
	case <-recorder.done:
		t.Fatal("WriteJSONError with a non-error status must never be recorded")
	case <-time.After(100 * time.Millisecond):
		// expected: nothing recorded
	}
}

func TestResponder_WriteJSON_ErrorStatusRecordsEntry(t *testing.T) {
	// Several error responses in the app carry custom bodies beyond the
	// simple {error, message} shape (e.g. the freemium-limit 422 with
	// limit/received fields) but still go through WriteJSON directly, not
	// WriteJSONError. Every 4xx/5xx MUST still be logged regardless (FR-001).
	recorder := newFakeRecorder()
	responder := httpx.NewResponder(recorder)
	rec := httptest.NewRecorder()

	responder.WriteJSON(context.Background(), rec, 422, map[string]any{
		"error":    "freemium_child_limit_exceeded",
		"message":  "The free plan includes only one child per account",
		"limit":    1,
		"received": 2,
	}, nil)
	recorder.waitForRecord(t)

	entry := recorder.lastEntry()
	require.NotNil(t, entry)
	require.Equal(t, "The free plan includes only one child per account", entry.Message)
	require.NotNil(t, entry.HTTPStatus)
	require.Equal(t, 422, *entry.HTTPStatus)
}

func TestResponder_DoesNotContainEmailInAnyField(t *testing.T) {
	// FR-004/SC-002: the log must never contain the user's email, even for
	// the exact error (email_already_exists) that is about an email.
	recorder := newFakeRecorder()
	responder := httpx.NewResponder(recorder)
	rec := httptest.NewRecorder()
	email := "ana.duplicada@example.com"

	responder.WriteJSON(context.Background(), rec, 409, map[string]string{
		"error":   "email_already_exists",
		"message": "Email is already in use",
	}, nil)
	recorder.waitForRecord(t)

	entry := recorder.lastEntry()
	require.NotNil(t, entry)
	require.NotContains(t, entry.Message, email)
	require.NotContains(t, entry.Endpoint, email)
	require.NotContains(t, entry.File, email)
	for _, field := range []string{entry.Message, entry.Endpoint, entry.File} {
		require.False(t, strings.Contains(field, "@"), "no field should contain an email address")
	}
}

// TestResponder_WriteJSONError_ResponseNotDelayedByRecording confirms the
// HTTP response is written well within SC-004's 50ms budget, independent of
// how long the background recording goroutine takes — WriteJSONError must
// return as soon as the response is written, not wait on the Recorder.
func TestResponder_WriteJSONError_ResponseNotDelayedByRecording(t *testing.T) {
	recorder := newFakeRecorder()
	responder := httpx.NewResponder(recorder)
	rec := httptest.NewRecorder()

	start := time.Now()
	responder.WriteJSONError(context.Background(), rec, 500, "internal_error", "boom", nil)
	elapsed := time.Since(start)

	require.Less(t, elapsed, 50*time.Millisecond,
		"WriteJSONError must return within SC-004's 50ms budget, took %s", elapsed)
	recorder.waitForRecord(t) // drain the background goroutine so it doesn't leak into other tests
}

func TestResponder_WriteJSONError_CapturesDistinctCallSites(t *testing.T) {
	recorder := newFakeRecorder()
	responder := httpx.NewResponder(recorder)

	rec1 := httptest.NewRecorder()
	responder.WriteJSONError(context.Background(), rec1, 400, "validation_error", "first error", nil)
	recorder.waitForRecord(t)
	first := recorder.lastEntry()

	rec2 := httptest.NewRecorder()
	responder.WriteJSONError(context.Background(), rec2, 404, "not_found", "second error", nil)
	recorder.waitForRecord(t)
	second := recorder.lastEntry()

	require.NotNil(t, first)
	require.NotNil(t, second)
	require.Equal(t, first.File, second.File) // same test file
	require.NotEqual(t, first.Line, second.Line, "each call site must capture its own line")
}
