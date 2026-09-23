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
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// RequireSession returns chi-compatible middleware that verifies a Clerk
// session token from the Authorization header. A missing or invalid token
// is rejected with 401 through responder, so it is captured in error_logs
// like any other 4xx/5xx response (specs/002-registro-log-errores) instead
// of clerkhttp's default empty-body response. Extra opts are appended after
// the failure handler below — production code passes none (verification
// fetches Clerk's real JWKS over the network); tests pass
// clerkhttp.JSONWebKey(...) to verify locally instead (see authmwtest).
//
// Built on WithHeaderAuthorization (not clerkhttp.RequireHeaderAuthorization):
// that helper only routes an *invalid* token through AuthorizationFailureHandler
// — a *missing* Authorization header instead falls through to its own
// hardcoded 403 with an empty body, bypassing responder (and error_logs)
// entirely. Checking the claims here too makes both cases behave the same.
func RequireSession(responder *httpx.Responder, opts ...clerkhttp.AuthorizationOption) func(http.Handler) http.Handler {
	unauthorized := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		responder.WriteJSONError(r.Context(), w, http.StatusUnauthorized, "unauthorized", "A valid session is required", nil)
	})
	allOpts := append([]clerkhttp.AuthorizationOption{
		clerkhttp.AuthorizationFailureHandler(unauthorized),
	}, opts...)
	withAuth := clerkhttp.WithHeaderAuthorization(allOpts...)

	return func(next http.Handler) http.Handler {
		return withAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if claims, ok := clerk.SessionClaimsFromContext(r.Context()); !ok || claims == nil {
				unauthorized.ServeHTTP(w, r)
				return
			}
			next.ServeHTTP(w, r)
		}))
	}
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

// OwnerCheck reports whether the Clerk user owns the resource with the given
// id (see internal/ownership).
type OwnerCheck func(ctx context.Context, clerkUserID string, id uuid.UUID) (bool, error)

// RequireOwner returns middleware, to be used after RequireSession, that
// answers 403 unless the session owns the resource whose UUID is in the
// route parameter param. The check runs before the handler, so no
// validation, lookup or side effect of the handler is reachable for a
// resource that isn't the session's. A resource that doesn't exist answers
// 403 too — the same as one that belongs to someone else — so a caller
// can't probe which ids are real. A malformed id is passed through: the
// handler already answers it with its own 404.
func RequireOwner(responder *httpx.Responder, param string, check OwnerCheck) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			clerkUserID, ok := ClerkUserIDFromContext(r.Context())
			if !ok {
				responder.WriteJSONError(r.Context(), w, http.StatusUnauthorized, "unauthorized", "A valid session is required", nil)
				return
			}
			id, err := uuid.Parse(chi.URLParam(r, param))
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}
			owns, err := check(r.Context(), clerkUserID, id)
			if err != nil {
				responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not verify access", nil)
				return
			}
			if !owns {
				responder.WriteJSONError(r.Context(), w, http.StatusForbidden, "forbidden", "This resource does not belong to the current session", nil)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
