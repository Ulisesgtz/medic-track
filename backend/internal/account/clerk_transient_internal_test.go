package account

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

// Clerk overloaded (429, 502, 503, 504) is asked again; anything else is the answer.
func TestClerkTransient(t *testing.T) {
	for _, status := range []int{http.StatusTooManyRequests, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout} {
		require.True(t, clerkTransient(status), status)
	}
	for _, status := range []int{http.StatusOK, http.StatusBadRequest, http.StatusUnauthorized, http.StatusNotFound, http.StatusInternalServerError} {
		require.False(t, clerkTransient(status), status)
	}
}
