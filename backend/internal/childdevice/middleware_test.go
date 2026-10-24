package childdevice_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/childdevice"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

type rig struct {
	router  http.Handler
	log     *capture
	f       family
	other   family
	cred    string
	linkID  uuid.UUID
	routine uuid.UUID
	consult uuid.UUID
}

func newRig(t *testing.T) *rig {
	t.Helper()
	pool := testPool(t)
	r := &rig{log: &capture{}}
	r.f = newFamily(t, pool, account.PlanPaid)
	r.other = newFamily(t, pool, account.PlanPaid)
	r.cred, r.linkID = activeDevice(t, pool, r.f, "Teléfono de Mateo", time.Now().Add(-time.Hour))
	ctx := context.Background()
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO supplement_routines (account_id, child_id, name, period, times, first_date, utc_offset_minutes, generated_until, created_by_account_id)
		VALUES ($1, $2, 'Vitamina D', 'daily', ARRAY['08:00']::time[], current_date, 0, now() + interval '14 days', $1) RETURNING id`,
		r.f.accountID, r.f.childID).Scan(&r.routine))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO consultations (child_id, doctor_name, consult_date, photo) VALUES ($1, 'Dra. López', current_date, '\x01') RETURNING id`,
		r.f.childID).Scan(&r.consult))

	responder := httpx.NewResponder(r.log)
	repo := childdevice.NewRepository(pool)
	ok := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		a, _ := access.FromContext(req.Context())
		p, _ := childdevice.PrincipalFromContext(req.Context())
		w.Header().Set("X-Level", map[access.Level]string{access.Mark: "mark", access.Full: "full", access.None: "none"}[a.Level])
		w.Header().Set("X-Device", a.ActorDeviceID.String())
		w.Header().Set("X-Account", a.ActorAccountID.String())
		w.Header().Set("X-Child", p.ChildFirstName)
		w.WriteHeader(http.StatusNoContent)
	})
	router := chi.NewRouter()
	router.Use(childdevice.RequireChildDevice(responder, repo, time.Now))
	router.With(childdevice.SameChild(responder, "childId")).Get("/c/{childId}", ok)
	router.With(childdevice.RoutineOfChild(responder, repo)).Get("/r/{routineId}", ok)
	router.With(childdevice.ConsultationOfChild(responder, repo)).Get("/k/{consultationId}", ok)
	r.router = router
	return r
}

func (r *rig) do(path, authorization string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if authorization != "" {
		req.Header.Set("Authorization", authorization)
	}
	rec := httptest.NewRecorder()
	r.router.ServeHTTP(rec, req)
	return rec
}

func TestRequireChildDevice_OnlyTheDeviceSchemeWithAWorkingCredentialPasses(t *testing.T) {
	r := newRig(t)
	good := "/c/" + r.f.childID.String()

	rec := r.do(good, "Device "+r.cred)
	require.Equal(t, http.StatusNoContent, rec.Code)
	require.Equal(t, "mark", rec.Header().Get("X-Level"), "a device never gets more than see-and-mark")
	require.Equal(t, r.linkID.String(), rec.Header().Get("X-Device"))
	require.Equal(t, uuid.Nil.String(), rec.Header().Get("X-Account"), "the actor is a device, not an account")
	require.Equal(t, "Mateo", rec.Header().Get("X-Child"))

	for name, header := range map[string]string{
		"no header":            "",
		"a Clerk-style bearer": "Bearer " + r.cred,
		"another scheme":       "Basic " + r.cred,
		"empty credential":     "Device ",
		"only the scheme":      "Device",
		"not a secret of ours": "Device not-a-token",
	} {
		rec := r.do(good, header)
		require.Equal(t, http.StatusUnauthorized, rec.Code, name)
		require.NotContains(t, rec.Body.String(), "Mateo", name)
	}
	rec = r.do(good, "device "+r.cred)
	require.Equal(t, http.StatusNoContent, rec.Code, "the scheme is not case sensitive")
	require.Empty(t, r.log.all(), "a 401 anyone can provoke is not written to error_logs")
}

func TestRequireChildDevice_ARemovedDeviceIsRejectedAtOnce(t *testing.T) {
	r := newRig(t)
	pool := testPool(t)
	good := "/c/" + r.f.childID.String()
	require.Equal(t, http.StatusNoContent, r.do(good, "Device "+r.cred).Code)

	_, err := pool.Exec(context.Background(),
		`UPDATE child_device_links SET status = 'revoked', revoked_at = now(), credential_hash = NULL WHERE id = $1`, r.linkID)
	require.NoError(t, err)
	require.Equal(t, http.StatusUnauthorized, r.do(good, "Device "+r.cred).Code)
}

func TestGuards_OnlyTheDevicesOwnChildAndItsThings(t *testing.T) {
	r := newRig(t)
	auth := "Device " + r.cred

	require.Equal(t, http.StatusNoContent, r.do("/r/"+r.routine.String(), auth).Code)
	require.Equal(t, http.StatusNoContent, r.do("/k/"+r.consult.String(), auth).Code)

	require.Equal(t, http.StatusForbidden, r.do("/c/"+r.other.childID.String(), auth).Code, "another child")
	require.Equal(t, http.StatusForbidden, r.do("/r/"+uuid.NewString(), auth).Code, "a routine that doesn't exist looks like one that isn't yours")
	require.Equal(t, http.StatusForbidden, r.do("/k/"+uuid.NewString(), auth).Code)

	// A malformed id falls through to the handler's own 404.
	require.Equal(t, http.StatusNoContent, r.do("/c/not-a-uuid", auth).Code)
	require.Equal(t, http.StatusNoContent, r.do("/r/not-a-uuid", auth).Code)
	require.Equal(t, http.StatusNoContent, r.do("/k/not-a-uuid", auth).Code)
}

func TestGuards_WithoutAPrincipalAreUnauthorized(t *testing.T) {
	pool := testPool(t)
	responder := httpx.NewResponder(&capture{})
	repo := childdevice.NewRepository(pool)
	router := chi.NewRouter()
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	router.With(childdevice.SameChild(responder, "childId")).Get("/c/{childId}", ok)
	router.With(childdevice.RoutineOfChild(responder, repo)).Get("/r/{routineId}", ok)
	for _, path := range []string{"/c/" + uuid.NewString(), "/r/" + uuid.NewString()} {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		require.Equal(t, http.StatusUnauthorized, rec.Code, path)
	}
}

func TestRequireChildDevice_ADatabaseFailureIsA500NotA401(t *testing.T) {
	pool := testPool(t)
	responder := httpx.NewResponder(&capture{})
	repo := childdevice.NewRepository(pool)
	token, _, err := childdevice.NewToken()
	require.NoError(t, err)
	pool.Close()
	router := chi.NewRouter()
	router.Use(childdevice.RequireChildDevice(responder, repo, time.Now))
	router.Get("/x", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Device "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusInternalServerError, rec.Code)
}
