package account_test

import (
	"errors"
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

// TestFreemiumLimitError_MatchesSentinel covers that *FreemiumLimitError
// still satisfies errors.Is(err, ErrFreemiumChildLimitExceeded) via Unwrap,
// and carries the same message as the sentinel it wraps.
func TestFreemiumLimitError_MatchesSentinel(t *testing.T) {
	err := &account.FreemiumLimitError{Limit: 1, Received: 2}

	require.ErrorIs(t, err, account.ErrFreemiumChildLimitExceeded)
	require.Equal(t, account.ErrFreemiumChildLimitExceeded.Error(), err.Error())
	require.Equal(t, account.ErrFreemiumChildLimitExceeded, errors.Unwrap(err))
}
