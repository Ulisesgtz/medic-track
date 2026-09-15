package account_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
)

func TestValidationErrors_Error(t *testing.T) {
	errs := account.ValidationErrors{{Field: "email", Message: "is required"}}
	require.Equal(t, "email: is required", errs.Error())

	require.Equal(t, "validation error", account.ValidationErrors{}.Error())
}

func TestValidationErrors_HasErrors(t *testing.T) {
	require.False(t, account.ValidationErrors{}.HasErrors())
	require.True(t, account.ValidationErrors{{Field: "x", Message: "y"}}.HasErrors())
}
