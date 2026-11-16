package server_test

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/accountdeletion"
)

// The routes outside the session group: they never see a Clerk session, so the paused-account guard is not theirs.
var publicRoute = regexp.MustCompile(`^/(catalog|child-device|payments|ops)/|^/reminders/actions/`)

// TestRouter_APausedAccountCanOnlyReadItselfDownloadAndCancel walks EVERY registered route (chi.Walk, not a hand-made list):
// an account scheduled for deletion gets 409 account_deletion_pending on all of them except the closed list
// (specs/070, research R3). A new route is blocked for it unless added to AllowedWhilePending on purpose.
func TestRouter_APausedAccountCanOnlyReadItselfDownloadAndCancel(t *testing.T) {
	w := newWorld(t)
	ctx := context.Background()
	_, err := w.pool.Exec(ctx, `INSERT INTO account_deletions (account_id, scheduled_for) VALUES ($1, now() + interval '30 days')`, w.accountA)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = w.pool.Exec(context.Background(), `DELETE FROM account_deletions WHERE account_id = $1`, w.accountA)
	})
	token := w.verifier.Token(t, w.clerkA)

	param := regexp.MustCompile(`\{[^}]+\}`)
	blocked, allowed := 0, 0
	require.NoError(t, chi.Walk(w.router.(chi.Routes), func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if publicRoute.MatchString(route) || method == http.MethodOptions || method == http.MethodHead {
			return nil
		}
		route = strings.TrimSuffix(route, "/")
		path := param.ReplaceAllStringFunc(route, func(p string) string {
			if p == "{accountId}" {
				return w.accountA.String()
			}
			return uuid.NewString()
		})
		if method+" "+route == "POST /accounts/{accountId}/deletion/cancel" {
			allowed++ // calling it here would end the pause for the rest of the walk: it is tried at the end
			return nil
		}
		rec := w.do(t, method, path, token, `{}`)
		if accountdeletion.AllowedWhilePending[method+" "+route] {
			allowed++
			require.NotEqual(t, http.StatusConflict, rec.Code, "%s %s is allowed while the deletion is pending", method, route)
			return nil
		}
		blocked++
		require.Equal(t, http.StatusConflict, rec.Code, "%s %s: %s", method, route, rec.Body.String())
		require.Contains(t, rec.Body.String(), "account_deletion_pending")
		require.Contains(t, rec.Body.String(), "scheduledFor")
		return nil
	}))
	require.Equal(t, len(accountdeletion.AllowedWhilePending), allowed, "every allowed route exists")
	require.Greater(t, blocked, 80, "the walk reached the whole API")

	// Somebody else is not affected, and canceling frees the account on the next request.
	require.Equal(t, http.StatusOK, w.do(t, http.MethodGet, "/children/"+w.childA.String()+"/consultations", w.verifier.Token(t, w.clerkTutor), "").Code)
	require.Equal(t, http.StatusOK, w.do(t, http.MethodPost, "/accounts/"+w.accountA.String()+"/deletion/cancel", token, "").Code)
	require.Equal(t, http.StatusOK, w.do(t, http.MethodGet, "/children/"+w.childA.String()+"/consultations", token, "").Code)
}
