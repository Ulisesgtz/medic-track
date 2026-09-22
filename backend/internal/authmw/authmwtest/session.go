// Package authmwtest provides a fake, fully-verifiable Clerk session for
// tests — mirrors clerk-sdk-go's own clerktest package (which only exercises
// the middleware's failure paths), but produces sessions that actually
// verify end-to-end through authmw.RequireSession, without any network call
// to Clerk (specs/008-autenticacion-cuenta).
package authmwtest

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	clerk "github.com/clerk/clerk-sdk-go/v2"
	clerkhttp "github.com/clerk/clerk-sdk-go/v2/http"
	"github.com/go-jose/go-jose/v3"
	josejwt "github.com/go-jose/go-jose/v3/jwt"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/authmw"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// Verifier wires one authmw.RequireSession instance (built once per test,
// reused across every request that test makes) to a freshly generated key
// pair instead of Clerk's real network JWKS — Token then mints as many
// tokens as the test needs, all verifiable by the same Middleware.
type Verifier struct {
	privKey    *rsa.PrivateKey
	Middleware func(http.Handler) http.Handler
}

// NewVerifier generates a key pair and builds the middleware around it.
func NewVerifier(t *testing.T, responder *httpx.Responder) *Verifier {
	t.Helper()

	privKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	pubKeyBytes, err := x509.MarshalPKIXPublicKey(&privKey.PublicKey)
	require.NoError(t, err)
	pemKey := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: pubKeyBytes})

	return &Verifier{
		privKey:    privKey,
		Middleware: authmw.RequireSession(responder, clerkhttp.JSONWebKey(string(pemKey))),
	}
}

// Token mints a session token for clerkUserID, verifiable by v.Middleware.
func (v *Verifier) Token(t *testing.T, clerkUserID string) string {
	t.Helper()

	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: v.privKey}, nil)
	require.NoError(t, err)

	now := time.Now()
	token, err := josejwt.Signed(signer).Claims(map[string]any{
		"sub": clerkUserID,
		// isValidIssuer (clerk-sdk-go/v2/jwt) requires this exact shape.
		"iss": "https://test.clerk.accounts.dev",
		"iat": now.Unix(),
		"exp": now.Add(time.Hour).Unix(),
	}).CompactSerialize()
	require.NoError(t, err)
	return token
}

// MockUserProfile points Clerk's package-global Backend (clerk.SetBackend —
// there is no per-request way to configure it) at a local server that
// answers every Backend API call with a user profile whose primary email is
// email — enough for internal/account's clerkPrimaryEmail (user.Get) in
// tests. Because this is global state, don't run tests that call it with
// t.Parallel() in the same package; the last call before a request wins, so
// call it again with a different email/clerkUserID before each request that
// needs a different one.
func MockUserProfile(t *testing.T, clerkUserID, email string) {
	t.Helper()

	body := fmt.Sprintf(
		`{"id":%q,"email_addresses":[{"id":"idn_test","email_address":%q}],"primary_email_address_id":"idn_test"}`,
		clerkUserID, email,
	)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)

	clerk.SetKey("test-secret-key")
	clerk.SetBackend(clerk.NewBackend(&clerk.BackendConfig{
		HTTPClient: server.Client(),
		URL:        &server.URL,
	}))
}
