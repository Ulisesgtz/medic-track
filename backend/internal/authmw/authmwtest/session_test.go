package authmwtest_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/clerk/clerk-sdk-go/v2/user"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/authmw/authmwtest"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

type noopRecorder struct{}

func (noopRecorder) Create(context.Context, *errorlog.Entry) error { return nil }

// TestVerifier_TokenVerifiesThroughMiddleware covers the exact property this
// package exists for: a token minted by Verifier.Token actually verifies
// through the Middleware it built (not just "some JWT was produced").
func TestVerifier_TokenVerifiesThroughMiddleware(t *testing.T) {
	responder := httpx.NewResponder(noopRecorder{})
	verifier := authmwtest.NewVerifier(t, responder)

	var reached bool
	handler := verifier.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+verifier.Token(t, "user_abc"))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.True(t, reached)
}

// TestVerifier_DifferentVerifiersDoNotAcceptEachOthersTokens confirms each
// Verifier generates its own key pair — a token from one must not verify
// against another's Middleware, or tests using this package could pass for
// the wrong reason.
func TestVerifier_DifferentVerifiersDoNotAcceptEachOthersTokens(t *testing.T) {
	responder := httpx.NewResponder(noopRecorder{})
	a := authmwtest.NewVerifier(t, responder)
	b := authmwtest.NewVerifier(t, responder)

	handler := b.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("must not reach the handler with a token signed by a different verifier")
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+a.Token(t, "user_abc"))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

// TestMockUserProfile covers the Backend API mock: user.Get resolves the
// email/id MockUserProfile was configured with.
func TestMockUserProfile(t *testing.T) {
	authmwtest.MockUserProfile(t, "user_abc", "ana@example.com")

	got, err := user.Get(context.Background(), "user_abc")
	require.NoError(t, err)
	require.Equal(t, "user_abc", got.ID)
	require.NotNil(t, got.PrimaryEmailAddressID)
	for _, e := range got.EmailAddresses {
		if e.ID == *got.PrimaryEmailAddressID {
			require.Equal(t, "ana@example.com", e.EmailAddress)
			return
		}
	}
	t.Fatal("primary email address not found among EmailAddresses")
}
