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
)

// specs/047-dispositivo-del-hijo: the routes of a child's own phone are a SHORT CLOSED LIST. Everything else of the API refuses its
// credential, and the list's routes refuse a resource that isn't the phone's child's.

// phoneRoutes are the only routes the phone's credential opens (contracts/api.md, section C), as [method, pattern].
var phoneRoutes = map[string]bool{
	"GET /child-device/me":                                              true,
	"POST /child-device/rotate":                                         true,
	"GET /child-device/children/{childId}/overview":                     true,
	"GET /child-device/children/{childId}/routines":                     true,
	"PATCH /child-device/consultations/{consultationId}/doses/{doseId}": true,
	"PATCH /child-device/routines/{routineId}/doses/{doseId}":           true,
	"POST /child-device/routines/{routineId}/done":                      true,
}

// publicRoutes need no session at all, so the phone's credential means nothing to them.
var publicRoutes = map[string]bool{
	"POST /child-device/redeem":           true,
	"POST /reminders/actions/taken":       true,
	"POST /payments/webhooks/mercadopago": true,
}

var param = regexp.MustCompile(`\{[^}]+\}`)

func TestRouter_ThePhoneOpensOnlyItsOwnShortList(t *testing.T) {
	w := newWorld(t)
	mux, ok := w.router.(*chi.Mux)
	require.True(t, ok)

	seen := map[string]bool{}
	require.NoError(t, chi.Walk(mux, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		route = strings.TrimSuffix(route, "/")
		key := method + " " + route
		seen[key] = true
		if phoneRoutes[key] || publicRoutes[key] || strings.HasPrefix(route, "/catalog") || strings.HasPrefix(route, "/swagger") || strings.HasPrefix(route, "/payments/fake") {
			return nil
		}
		path := param.ReplaceAllStringFunc(route, func(string) string { return uuid.NewString() })
		rec := w.doDevice(t, method, path, w.deviceCredential, `{}`)
		require.Contains(t, []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusMethodNotAllowed}, rec.Code,
			"%s answered %d to a child's credential: %s", key, rec.Code, rec.Body.String())
		return nil
	}))
	for key := range phoneRoutes {
		require.True(t, seen[key], "the list names %s but the router doesn't have it", key)
	}
}

func TestRouter_ThePhoneReachesItsOwnThings(t *testing.T) {
	w := newWorld(t)
	window := "?from=2026-01-15T00:00:00Z&to=2026-01-16T00:00:00Z"
	cred := w.deviceCredential

	rec := w.doDevice(t, http.MethodGet, "/child-device/me", cred, "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"childFirstName":"Hijo"`)
	require.Contains(t, rec.Body.String(), `"deviceName":"Teléfono de Ana"`)

	require.Equal(t, http.StatusOK, w.doDevice(t, http.MethodGet, "/child-device/children/"+w.childA.String()+"/overview"+window, cred, "").Code)
	require.Equal(t, http.StatusOK, w.doDevice(t, http.MethodGet, "/child-device/children/"+w.childA.String()+"/routines"+window, cred, "").Code)

	mark := w.doDevice(t, http.MethodPatch, "/child-device/consultations/"+w.consultationA.String()+"/doses/"+w.doseA.String(), cred, `{"taken":true}`)
	require.Equal(t, http.StatusOK, mark.Code, mark.Body.String())
	require.Contains(t, mark.Body.String(), `"mine":true`)
	require.Contains(t, mark.Body.String(), `"name":"Hijo"`, "the child's first name")
	unmark := w.doDevice(t, http.MethodPatch, "/child-device/consultations/"+w.consultationA.String()+"/doses/"+w.doseA.String(), cred, `{"taken":false}`)
	require.Equal(t, http.StatusOK, unmark.Code, "its own mark can be taken back")

	routineMark := w.doDevice(t, http.MethodPatch, "/child-device/routines/"+w.routineA.String()+"/doses/"+w.routineDoseA.String(), cred, `{"taken":true}`)
	require.Equal(t, http.StatusOK, routineMark.Code, routineMark.Body.String())
	require.Contains(t, routineMark.Body.String(), `"mine":true`)

	// «Realizado» is for an activity; a supplement answers that there is nothing to mark, which is a handler answer, not a refusal.
	done := w.doDevice(t, http.MethodPost, "/child-device/routines/"+w.routineA.String()+"/done", cred, `{"from":"2026-01-15T00:00:00Z","to":"2026-01-16T00:00:00Z"}`)
	require.Equal(t, http.StatusConflict, done.Code, done.Body.String())
}

func TestRouter_ThePhoneIsRefusedWhatIsNotItsChildsAndTheParentCannotUseItsRoutes(t *testing.T) {
	w := newWorld(t)
	window := "?from=2026-01-15T00:00:00Z&to=2026-01-16T00:00:00Z"
	cred := w.deviceCredential

	var childB, consultationB, routineB uuid.UUID
	require.NoError(t, w.pool.QueryRow(context.Background(), `SELECT id FROM children WHERE account_id = (SELECT id FROM accounts WHERE clerk_user_id = $1)`, w.clerkB).Scan(&childB))
	require.NoError(t, w.pool.QueryRow(context.Background(),
		`INSERT INTO consultations (child_id, doctor_name, consult_date, photo) VALUES ($1, 'Dra. Otra', current_date, '\x01') RETURNING id`, childB).Scan(&consultationB))
	require.NoError(t, w.pool.QueryRow(context.Background(), `
		INSERT INTO supplement_routines (account_id, child_id, name, period, times, first_date, utc_offset_minutes, generated_until, created_by_account_id)
		SELECT account_id, id, 'Otra', 'daily', ARRAY['08:00']::time[], current_date, 0, now() + interval '14 days', account_id FROM children WHERE id = $1 RETURNING id`, childB).Scan(&routineB))

	for name, path := range map[string]string{
		"another child's overview": "/child-device/children/" + childB.String() + "/overview" + window,
		"another child's routines": "/child-device/children/" + childB.String() + "/routines" + window,
	} {
		require.Equal(t, http.StatusForbidden, w.doDevice(t, http.MethodGet, path, cred, "").Code, name)
	}
	require.Equal(t, http.StatusForbidden, w.doDevice(t, http.MethodPatch, "/child-device/consultations/"+consultationB.String()+"/doses/"+uuid.NewString(), cred, `{"taken":true}`).Code)
	require.Equal(t, http.StatusForbidden, w.doDevice(t, http.MethodPatch, "/child-device/routines/"+routineB.String()+"/doses/"+uuid.NewString(), cred, `{"taken":true}`).Code)
	require.Equal(t, http.StatusForbidden, w.doDevice(t, http.MethodPost, "/child-device/routines/"+routineB.String()+"/done", cred, `{}`).Code)

	// A parent's session is not a phone's credential either: the phone's routes answer 401 to a Bearer token.
	token := w.verifier.Token(t, w.clerkA)
	for _, path := range []string{"/child-device/me", "/child-device/children/" + w.childA.String() + "/overview" + window} {
		require.Equal(t, http.StatusUnauthorized, w.do(t, http.MethodGet, path, token, "").Code, path)
	}
}

func TestRouter_ARemovedPhoneIsRefusedAtOnceEverywhere(t *testing.T) {
	w := newWorld(t)
	path := "/child-device/children/" + w.childA.String() + "/overview?from=2026-01-15T00:00:00Z&to=2026-01-16T00:00:00Z"
	require.Equal(t, http.StatusOK, w.doDevice(t, http.MethodGet, path, w.deviceCredential, "").Code)

	_, err := w.pool.Exec(context.Background(),
		`UPDATE child_device_links SET status = 'revoked', revoked_at = now(), credential_hash = NULL WHERE id = $1`, w.deviceLinkID)
	require.NoError(t, err)
	require.Equal(t, http.StatusUnauthorized, w.doDevice(t, http.MethodGet, path, w.deviceCredential, "").Code)
	require.Equal(t, http.StatusUnauthorized, w.doDevice(t, http.MethodGet, "/child-device/me", w.deviceCredential, "").Code)
}
