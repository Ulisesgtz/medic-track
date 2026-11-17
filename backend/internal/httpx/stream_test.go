package httpx_test

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

func TestResponder_Stream_SendsTheFile(t *testing.T) {
	recorder := newFakeRecorder()
	responder := httpx.NewResponder(recorder)
	rec := httptest.NewRecorder()

	responder.Stream(context.Background(), rec, "application/zip", "datos.zip", nil, func(w io.Writer) error {
		_, err := io.WriteString(w, "PK…")
		return err
	})

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "application/zip", rec.Header().Get("Content-Type"))
	require.Equal(t, `attachment; filename="datos.zip"`, rec.Header().Get("Content-Disposition"))
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	require.Equal(t, "PK…", rec.Body.String())
	require.Nil(t, recorder.lastEntry(), "a download that worked writes nothing to error_logs")
}

func TestResponder_Stream_AFailureHalfWayIsRecordedAndCutsTheConnection(t *testing.T) {
	recorder := newFakeRecorder()
	responder := httpx.NewResponder(recorder)
	rec := httptest.NewRecorder()
	accountID := uuid.New()

	require.PanicsWithValue(t, http.ErrAbortHandler, func() {
		responder.Stream(context.Background(), rec, "application/zip", "datos.zip", &accountID, func(w io.Writer) error {
			_, _ = io.WriteString(w, "PK")
			return errors.New("reading the photo of Mateo's prescription failed")
		})
	})
	recorder.waitForRecord(t)

	entry := recorder.lastEntry()
	require.NotNil(t, entry)
	require.Equal(t, httpx.StreamFailedMessage, entry.Message, "a fixed message, never the error's text")
	require.False(t, strings.Contains(entry.Message, "Mateo"))
	require.Equal(t, 500, *entry.HTTPStatus)
	require.Equal(t, accountID, *entry.AccountID)
	require.Contains(t, entry.File, "stream_test.go", "the caller's file, not httpx's")
}

func TestResponder_Stream_ThroughARealServerTheClientSeesAFailedDownload(t *testing.T) {
	recorder := newFakeRecorder()
	responder := httpx.NewResponder(recorder)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		responder.Stream(r.Context(), w, "application/zip", "datos.zip", nil, func(w io.Writer) error {
			_, _ = w.Write([]byte(strings.Repeat("x", 64<<10)))
			w.(http.Flusher).Flush()
			return errors.New("broke")
		})
	}))
	defer server.Close()

	resp, err := http.Get(server.URL)
	require.NoError(t, err)
	defer resp.Body.Close()
	_, err = io.ReadAll(resp.Body)
	require.Error(t, err, "the body ends with an error, not as a complete file")
	recorder.waitForRecord(t)
}
