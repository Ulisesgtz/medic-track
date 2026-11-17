package accountdeletion

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/Ulisesgtz/medic-track/backend/internal/authmw"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// AllowedWhilePending are the only routes a paused account can use (method + chi route pattern, research R3): read itself,
// read and cancel its deletion, and download its data. A new route is blocked for a paused account unless it is added here.
var AllowedWhilePending = map[string]bool{
	"GET /accounts/me":                           true,
	"GET /accounts/{accountId}/deletion":         true,
	"POST /accounts/{accountId}/deletion":        true,
	"POST /accounts/{accountId}/deletion/cancel": true,
	"POST /accounts/{accountId}/data-export":     true,
}

// RequireNotPending returns middleware, to be used after RequireSession, that answers 409 account_deletion_pending to an
// account scheduled for deletion on every route but AllowedWhilePending. It asks the database on every request (nothing
// cached), so canceling frees the account on the next request. The 409 is an expected state, repeated by every open screen:
// it is not written to error_logs.
func RequireNotPending(responder *httpx.Responder, repo *Repository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			route := r.Method + " " + chi.RouteContext(r.Context()).RoutePattern()
			if AllowedWhilePending[route] {
				next.ServeHTTP(w, r)
				return
			}
			clerkUserID, ok := authmw.ClerkUserIDFromContext(r.Context())
			if !ok {
				next.ServeHTTP(w, r)
				return
			}
			d, err := repo.OpenForClerkUser(r.Context(), clerkUserID)
			if err != nil {
				responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not verify the account", nil)
				return
			}
			if d != nil {
				responder.WriteJSONUnlogged(w, http.StatusConflict, map[string]any{
					"error":        "account_deletion_pending",
					"message":      "This account is scheduled for deletion: it can only download its data or cancel",
					"scheduledFor": d.ScheduledFor.UTC().Format(time.RFC3339),
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
