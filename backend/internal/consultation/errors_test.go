package consultation_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

func TestValidationErrors_Error(t *testing.T) {
	errs := consultation.ValidationErrors{{Field: "doctorName", Message: "is required"}}
	require.Equal(t, "doctorName: is required", errs.Error())

	require.Equal(t, "validation error", consultation.ValidationErrors{}.Error())
}

func TestValidationErrors_HasErrors(t *testing.T) {
	require.False(t, consultation.ValidationErrors{}.HasErrors())
	require.True(t, consultation.ValidationErrors{{Field: "x", Message: "y"}}.HasErrors())
}
