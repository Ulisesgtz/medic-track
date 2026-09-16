package httpx_test

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

func TestWriteJSON(t *testing.T) {
	rec := httptest.NewRecorder()

	httpx.WriteJSON(rec, 201, map[string]string{"hello": "world"})

	require.Equal(t, 201, rec.Code)
	require.Equal(t, "application/json", rec.Header().Get("Content-Type"))

	var body map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "world", body["hello"])
}

func TestWriteJSONError(t *testing.T) {
	rec := httptest.NewRecorder()

	httpx.WriteJSONError(rec, 404, "not_found", "Resource not found")

	require.Equal(t, 404, rec.Code)

	var body map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "not_found", body["error"])
	require.Equal(t, "Resource not found", body["message"])
}
