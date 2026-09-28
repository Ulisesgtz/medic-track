package httpx_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

func TestValidationBody(t *testing.T) {
	body := httpx.ValidationBody("One or more fields are invalid", []httpx.FieldError{{Field: "endpoint", Message: "is required"}})
	require.Equal(t, map[string]any{
		"error":   "validation_error",
		"message": "One or more fields are invalid",
		"details": []map[string]string{{"field": "endpoint", "message": "is required"}},
	}, body)

	require.Equal(t, []map[string]string{}, httpx.ValidationBody("m", nil)["details"], "never null in the JSON")
}
