// Package authmw wraps Clerk's session-verification middleware for this
// project's routes: verifying "is there a valid session" is a concern
// shared by internal/account and internal/consultation alike, while "is
// this session's account the owner of what's being requested" stays
// business logic owned by internal/account (see plan.md's Decisión de
// Estructura, specs/008-autenticacion-cuenta).
package authmw

import (
	"context"
	"net/http"

	clerk "github.com/clerk/clerk-sdk-go/v2"
	clerkhttp "github.com/clerk/clerk-sdk-go/v2/http"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// RequireSession returns chi-compatible middleware that verifies a Clerk
// session token from the Authorization header. A missing or invalid token
// is rejected with 401 through responder, so it is captured in error_logs
// like any other 4xx/5xx response (specs/002-registro-log-errores) instead
// of clerkhttp's default empty-body response.
func RequireSession(responder *httpx.Responder) func(http.Handler) http.Handler {
	return clerkhttp.RequireHeaderAuthorization(
		clerkhttp.AuthorizationFailureHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			responder.WriteJSONError(r.Context(), w, http.StatusUnauthorized, "unauthorized", "A valid session is required", nil)
		})),
	)
}

// ClerkUserIDFromContext returns the verified Clerk user id (the session
// token's `sub` claim) for the current request, as set by RequireSession.
// The bool is false when there are no verified session claims in the
// context — a handler reached through RequireSession should never see
// that, but it is checked rather than assumed.
func ClerkUserIDFromContext(ctx context.Context) (string, bool) {
	claims, ok := clerk.SessionClaimsFromContext(ctx)
	if !ok {
		return "", false
	}
	return claims.Subject, true
}
