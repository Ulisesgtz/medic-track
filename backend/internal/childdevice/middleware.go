package childdevice

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

type principalKey struct{}

// PrincipalFromContext is the device behind the request, as RequireChildDevice found it.
func PrincipalFromContext(ctx context.Context) (*Principal, bool) {
	p, ok := ctx.Value(principalKey{}).(*Principal)
	return p, ok && p != nil
}

// WithPrincipal puts a device in the context, as RequireChildDevice does (for tests of handlers that read it).
func WithPrincipal(ctx context.Context, p *Principal) context.Context {
	return context.WithValue(ctx, principalKey{}, p)
}

// credentialFrom reads `Authorization: Device <credential>`. Any other scheme (a Clerk session is `Bearer`) is no credential.
func credentialFrom(r *http.Request) (string, bool) {
	scheme, value, ok := strings.Cut(r.Header.Get("Authorization"), " ")
	if !ok || !strings.EqualFold(scheme, "Device") || value == "" {
		return "", false
	}
	return strings.TrimSpace(value), true
}

// RequireChildDevice authenticates the request as a child's phone. Every failure — no header, another scheme, a credential that is
// unknown, removed or idle for too long — is the same 401, written WITHOUT logging it (anyone can provoke it). The scheme `Device`
// is what keeps the two identities apart: Clerk's middleware only looks at `Bearer`, so a device credential opens no parent route,
// and this one opens nothing a Clerk session could.
func RequireChildDevice(responder *httpx.Responder, repo *Repository, now func() time.Time) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			unauthorized := func() {
				responder.WriteJSONErrorUnlogged(w, http.StatusUnauthorized, "unauthorized", "This access is not active")
			}
			raw, ok := credentialFrom(r)
			if !ok {
				unauthorized()
				return
			}
			hash, ok := ParseToken(raw)
			if !ok {
				unauthorized()
				return
			}
			p, err := repo.Authenticate(r.Context(), hash, now())
			if err != nil {
				if errors.Is(err, ErrNotFound) {
					unauthorized()
					return
				}
				responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not verify access", nil)
				return
			}
			ctx := context.WithValue(r.Context(), principalKey{}, p)
			ctx = access.WithAccess(ctx, access.Access{Level: access.Mark, ActorDeviceID: p.LinkID})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// forbidden answers a resource that isn't the device's child's, with the same words as any other resource that isn't yours.
func forbidden(responder *httpx.Responder, w http.ResponseWriter, r *http.Request) {
	responder.WriteJSONError(r.Context(), w, http.StatusForbidden, "forbidden", "This resource does not belong to the current session", nil)
}

// SameChild lets through only the route whose {param} is the device's own child. A malformed id falls through to the handler's own 404.
func SameChild(responder *httpx.Responder, param string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p, ok := PrincipalFromContext(r.Context())
			if !ok {
				responder.WriteJSONErrorUnlogged(w, http.StatusUnauthorized, "unauthorized", "This access is not active")
				return
			}
			id, err := uuid.Parse(chi.URLParam(r, param))
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}
			if id != p.ChildID {
				forbidden(responder, w, r)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ownedBy is the check of a guard: does the resource belong to the child?
type ownedBy func(ctx context.Context, resourceID, childID uuid.UUID) (bool, error)

func guard(responder *httpx.Responder, param string, owned ownedBy) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p, ok := PrincipalFromContext(r.Context())
			if !ok {
				responder.WriteJSONErrorUnlogged(w, http.StatusUnauthorized, "unauthorized", "This access is not active")
				return
			}
			id, err := uuid.Parse(chi.URLParam(r, param))
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}
			yes, err := owned(r.Context(), id, p.ChildID)
			if err != nil {
				responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not verify access", nil)
				return
			}
			if !yes {
				// Another child's resource and one that doesn't exist look the same.
				forbidden(responder, w, r)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RoutineOfChild lets through only a routine ({routineId}) of the device's child.
func RoutineOfChild(responder *httpx.Responder, repo *Repository) func(http.Handler) http.Handler {
	return guard(responder, "routineId", repo.RoutineOfChild)
}

// ConsultationOfChild lets through only a consultation ({consultationId}) of the device's child.
func ConsultationOfChild(responder *httpx.Responder, repo *Repository) func(http.Handler) http.Handler {
	return guard(responder, "consultationId", repo.ConsultationOfChild)
}
