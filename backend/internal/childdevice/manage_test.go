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

func TestList_ShowsPendingActiveAndRecentlyRemovedWithoutSecrets(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)

	_, pendingToken, err := repo.Create(ctx, f.childID, f.accountID, "Sin abrir", now)
	require.NoError(t, err)
	_, activeID := activeDevice(t, pool, f, "Activo", now.Add(-48*time.Hour))
	_, oldRemovedID := activeDevice(t, pool, f, "Quitado hace mucho", now.Add(-60*24*time.Hour))
	require.NoError(t, repo.Revoke(ctx, f.childID, oldRemovedID, f.accountID, now.Add(-40*24*time.Hour)))
	_, recentID := activeDevice(t, pool, f, "Quitado hace poco", now.Add(-5*24*time.Hour))
	require.NoError(t, repo.Revoke(ctx, f.childID, recentID, f.accountID, now.Add(-2*24*time.Hour)))

	links, err := repo.List(ctx, f.childID, now)
	require.NoError(t, err)
	names := map[string]string{}
	for _, l := range links {
		names[l.Name] = l.StatusAt(now)
	}
	require.Equal(t, map[string]string{"Sin abrir": "pending", "Activo": "active", "Quitado hace poco": "revoked"}, names)
	_ = pendingToken
	_ = activeID

	// Later: the unopened link is expired and the phone nobody used for 90 days too.
	later := now.Add(childdevice.CredentialIdle + 2*time.Hour)
	links, err = repo.List(ctx, f.childID, later)
	require.NoError(t, err)
	for _, l := range links {
		if l.Name == "Sin abrir" || l.Name == "Activo" {
			require.Equal(t, childdevice.StatusExpired, l.StatusAt(later), l.Name)
		}
	}
}

func TestRevoke_CutsTheNextRequestAndTurnsItsRemindersOff(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	other := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)
	cred, linkID := activeDevice(t, pool, f, "Teléfono", now.Add(-time.Hour))
	keep, keepID := activeDevice(t, pool, f, "Otro", now.Add(-time.Hour))
	_, err := pool.Exec(ctx, `INSERT INTO reminder_devices (child_link_id, endpoint, p256dh, auth) VALUES ($1, $3, 'k', 'a'), ($2, $4, 'k', 'a')`,
		linkID, keepID, "https://fcm.googleapis.com/"+uuid.NewString(), "https://fcm.googleapis.com/"+uuid.NewString())
	require.NoError(t, err)

	_, err = repo.Authenticate(ctx, hashOf(t, cred), now)
	require.NoError(t, err)
	require.NoError(t, repo.Revoke(ctx, f.childID, linkID, f.accountID, now))

	_, err = repo.Authenticate(ctx, hashOf(t, cred), now)
	require.ErrorIs(t, err, childdevice.ErrNotFound, "the very next request")
	_, err = repo.Authenticate(ctx, hashOf(t, keep), now)
	require.NoError(t, err, "the other phone is untouched")
	var active bool
	require.NoError(t, pool.QueryRow(ctx, `SELECT active FROM reminder_devices WHERE child_link_id = $1`, linkID).Scan(&active))
	require.False(t, active)
	require.NoError(t, pool.QueryRow(ctx, `SELECT active FROM reminder_devices WHERE child_link_id = $1`, keepID).Scan(&active))
	require.True(t, active)

	require.NoError(t, repo.Revoke(ctx, f.childID, linkID, f.accountID, now), "idempotent")
	require.ErrorIs(t, repo.Revoke(ctx, other.childID, keepID, other.accountID, now), childdevice.ErrNotFound, "a phone of another child")
	require.ErrorIs(t, repo.Revoke(ctx, f.childID, uuid.New(), f.accountID, now), childdevice.ErrNotFound)
}

func TestRevoke_CancelsALinkNobodyOpened(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)
	link, token, err := repo.Create(ctx, f.childID, f.accountID, "Teléfono", now)
	require.NoError(t, err)
	require.NoError(t, repo.Revoke(ctx, f.childID, link.ID, f.accountID, now))
	_, err = repo.Redeem(ctx, token, now)
	require.ErrorIs(t, err, childdevice.ErrNotFound)
}

func TestSetReminderDetail_OnlyGenericOrDetailedOnAPhoneThatIsNotRemoved(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)
	_, linkID := activeDevice(t, pool, f, "Teléfono", now.Add(-time.Hour))

	got, err := repo.SetReminderDetail(ctx, f.childID, linkID, "detailed")
	require.NoError(t, err)
	require.Equal(t, "detailed", *got.ReminderDetail)
	_, err = repo.SetReminderDetail(ctx, f.childID, linkID, "todo")
	require.ErrorIs(t, err, childdevice.ErrInvalidDetail)
	_, err = repo.SetReminderDetail(ctx, f.childID, uuid.New(), "generic")
	require.ErrorIs(t, err, childdevice.ErrNotFound)

	require.NoError(t, repo.Revoke(ctx, f.childID, linkID, f.accountID, now))
	_, err = repo.SetReminderDetail(ctx, f.childID, linkID, "generic")
	require.ErrorIs(t, err, childdevice.ErrNotFound, "a removed phone")
}

func TestRotate_TheNewCredentialWorksAndTheOldOneForTwentyFourHours(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)
	oldCred, linkID := activeDevice(t, pool, f, "Teléfono", now.Add(-8*24*time.Hour))

	newCred, after, err := repo.Rotate(ctx, linkID, now)
	require.NoError(t, err)
	require.NotEqual(t, oldCred, newCred)
	require.WithinDuration(t, now.Add(childdevice.RotateEvery), after, time.Second)

	_, err = repo.Authenticate(ctx, hashOf(t, newCred), now)
	require.NoError(t, err)
	_, err = repo.Authenticate(ctx, hashOf(t, oldCred), now.Add(23*time.Hour))
	require.NoError(t, err, "inside the grace")
	_, err = repo.Authenticate(ctx, hashOf(t, oldCred), now.Add(25*time.Hour))
	require.ErrorIs(t, err, childdevice.ErrNotFound, "after the grace")

	// Rotating again keeps only the one before: a credential two rotations old does not work.
	third, _, err := repo.Rotate(ctx, linkID, now.Add(time.Hour))
	require.NoError(t, err)
	_, err = repo.Authenticate(ctx, hashOf(t, third), now.Add(time.Hour))
	require.NoError(t, err)
	_, err = repo.Authenticate(ctx, hashOf(t, oldCred), now.Add(time.Hour+time.Minute))
	require.ErrorIs(t, err, childdevice.ErrNotFound)

	require.NoError(t, repo.Revoke(ctx, f.childID, linkID, f.accountID, now))
	_, _, err = repo.Rotate(ctx, linkID, now)
	require.ErrorIs(t, err, childdevice.ErrNotFound, "a removed phone can't renew")
}

func TestManage_DatabaseFailures(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	pool.Close()
	ctx := context.Background()
	_, err := repo.List(ctx, uuid.New(), time.Now())
	require.Error(t, err)
	require.Error(t, repo.Revoke(ctx, uuid.New(), uuid.New(), uuid.New(), time.Now()))
	_, err = repo.SetReminderDetail(ctx, uuid.New(), uuid.New(), "generic")
	require.Error(t, err)
	require.NotErrorIs(t, err, childdevice.ErrNotFound)
	_, _, err = repo.Rotate(ctx, uuid.New(), time.Now())
	require.Error(t, err)
	require.NotErrorIs(t, err, childdevice.ErrNotFound)
}

// ---- the routes

type manageEnv struct {
	router http.Handler
	f      family
	level  access.Level
}

func newManageEnv(t *testing.T, level access.Level) *manageEnv {
	t.Helper()
	pool := testPool(t)
	e := &manageEnv{f: newFamily(t, pool, account.PlanPaid), level: level}
	h := childdevice.NewHandler(childdevice.NewService(childdevice.NewRepository(pool)), httpx.NewResponder(&capture{}))
	r := chi.NewRouter()
	asParent := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(access.WithAccess(req.Context(), access.Access{Level: e.level, ActorAccountID: e.f.accountID})))
		})
	}
	r.With(asParent).Post("/children/{childId}/device-links", h.CreateLink)
	r.With(asParent).Get("/children/{childId}/device-links", h.List)
	r.With(asParent).Post("/children/{childId}/device-links/{linkId}/revoke", h.Revoke)
	r.With(asParent).Patch("/children/{childId}/device-links/{linkId}", h.Update)
	r.With(h.Auth()).Post("/child-device/rotate", h.Rotate)
	e.router = r
	return e
}

func (e *manageEnv) do(method, path, body, auth string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, stringsReader(body))
	if auth != "" {
		req.Header.Set("Authorization", auth)
	}
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, req)
	return rec
}

func TestRoutes_ListRevokeAndChooseTheReminderText(t *testing.T) {
	e := newManageEnv(t, access.Full)
	base := "/children/" + e.f.childID.String() + "/device-links"
	created := decodeBody(t, e.do(http.MethodPost, base, `{"name":"Teléfono de Mateo"}`, ""))
	id := created["id"].(string)

	list := e.do(http.MethodGet, base, "", "")
	require.Equal(t, http.StatusOK, list.Code)
	body := decodeBody(t, list)
	require.Equal(t, true, body["canManage"])
	require.EqualValues(t, childdevice.MaxLinksPerChild, body["limit"])
	links := body["links"].([]any)
	require.Len(t, links, 1)
	link := links[0].(map[string]any)
	require.Equal(t, "pending", link["status"])
	require.Equal(t, "Teléfono de Mateo", link["name"])
	require.Equal(t, "generic", link["reminderDetail"])
	require.NotContains(t, list.Body.String(), created["token"].(string), "the list never carries the secret")

	patched := e.do(http.MethodPatch, base+"/"+id, `{"reminderDetail":"detailed"}`, "")
	require.Equal(t, http.StatusOK, patched.Code, patched.Body.String())
	require.Equal(t, "detailed", decodeBody(t, patched)["reminderDetail"])
	require.Equal(t, http.StatusBadRequest, e.do(http.MethodPatch, base+"/"+id, `{"reminderDetail":"todo"}`, "").Code)
	require.Equal(t, http.StatusBadRequest, e.do(http.MethodPatch, base+"/"+id, `no json`, "").Code)
	require.Equal(t, http.StatusNotFound, e.do(http.MethodPatch, base+"/"+uuid.NewString(), `{"reminderDetail":"generic"}`, "").Code)
	require.Equal(t, http.StatusNotFound, e.do(http.MethodPatch, base+"/no-es-uuid", `{"reminderDetail":"generic"}`, "").Code)

	require.Equal(t, http.StatusNoContent, e.do(http.MethodPost, base+"/"+id+"/revoke", "", "").Code)
	require.Equal(t, http.StatusNoContent, e.do(http.MethodPost, base+"/"+id+"/revoke", "", "").Code, "idempotent")
	require.Equal(t, http.StatusNotFound, e.do(http.MethodPost, base+"/"+uuid.NewString()+"/revoke", "", "").Code)
	require.Equal(t, http.StatusNotFound, e.do(http.MethodPost, base+"/no-es-uuid/revoke", "", "").Code)
	require.Equal(t, http.StatusNotFound, e.do(http.MethodGet, "/children/no-es-uuid/device-links", "", "").Code)
	after := decodeBody(t, e.do(http.MethodGet, base, "", ""))["links"].([]any)
	require.Equal(t, "revoked", after[0].(map[string]any)["status"])
}

func TestRoutes_ACaregiverSeesTheListButCannotManage(t *testing.T) {
	e := newManageEnv(t, access.Mark)
	base := "/children/" + e.f.childID.String() + "/device-links"
	body := decodeBody(t, e.do(http.MethodGet, base, "", ""))
	require.Equal(t, false, body["canManage"])
}

func TestRoutes_RotateGivesTheNewCredentialOnceAndTheOldOneKeepsWorkingForAWhile(t *testing.T) {
	e := newManageEnv(t, access.Full)
	pool := testPool(t)
	cred, _ := activeDevice(t, pool, e.f, "Teléfono", time.Now().Add(-8*24*time.Hour))

	rec := e.do(http.MethodPost, "/child-device/rotate", "", "Device "+cred)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	body := decodeBody(t, rec)
	fresh := body["credential"].(string)
	require.Len(t, fresh, 43)
	require.NotEqual(t, cred, fresh)
	require.NotEmpty(t, body["rotateAfter"])

	require.Equal(t, http.StatusOK, e.do(http.MethodPost, "/child-device/rotate", "", "Device "+fresh).Code)
	require.Equal(t, http.StatusUnauthorized, e.do(http.MethodPost, "/child-device/rotate", "", "").Code)
	require.Equal(t, http.StatusUnauthorized, e.do(http.MethodPost, "/child-device/rotate", "", "Bearer "+fresh).Code)
}

func TestRotate_WithoutAPrincipalOrAfterRemovalIsUnauthorized(t *testing.T) {
	pool := testPool(t)
	h := childdevice.NewHandler(childdevice.NewService(childdevice.NewRepository(pool)), httpx.NewResponder(&capture{}))
	rec := httptest.NewRecorder()
	h.Rotate(rec, httptest.NewRequest(http.MethodPost, "/child-device/rotate", nil))
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestErrors_HaveTheirOwnWords(t *testing.T) {
	require.NotEmpty(t, childdevice.ErrPlanRequired{}.Error())
	require.NotEmpty(t, childdevice.ErrLimit{Limit: 3}.Error())
}

func TestList_TheResponseCarriesWhenItWasLinkedAndLastUsed(t *testing.T) {
	e := newManageEnv(t, access.Full)
	pool := testPool(t)
	_, linkID := activeDevice(t, pool, e.f, "Teléfono", time.Now().Add(-time.Hour))
	_, err := pool.Exec(context.Background(), `UPDATE child_device_links SET last_seen_at = now(), reminder_detail = 'detailed' WHERE id = $1`, linkID)
	require.NoError(t, err)
	body := decodeBody(t, e.do(http.MethodGet, "/children/"+e.f.childID.String()+"/device-links", "", ""))
	link := body["links"].([]any)[0].(map[string]any)
	require.NotNil(t, link["redeemedAt"])
	require.NotNil(t, link["lastSeenAt"])
	require.Equal(t, "detailed", link["reminderDetail"])
	require.Equal(t, "active", link["status"])
}

func TestHandlers_AnUnavailableDatabaseIsA500AndNeverAnInvalidLink(t *testing.T) {
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanPaid)
	h := childdevice.NewHandler(childdevice.NewService(childdevice.NewRepository(pool)), httpx.NewResponder(&capture{}))
	pool.Close()
	r := chi.NewRouter()
	parent := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(access.WithAccess(req.Context(), access.Access{Level: access.Full, ActorAccountID: f.accountID})))
		})
	}
	r.With(parent).Post("/children/{childId}/device-links", h.CreateLink)
	r.With(parent).Get("/children/{childId}/device-links", h.List)
	r.With(parent).Post("/children/{childId}/device-links/{linkId}/revoke", h.Revoke)
	r.With(parent).Patch("/children/{childId}/device-links/{linkId}", h.Update)
	r.Post("/child-device/redeem", h.Redeem)
	token, _, err := childdevice.NewToken()
	require.NoError(t, err)

	base := "/children/" + f.childID.String() + "/device-links"
	for name, c := range map[string]struct{ method, path, body string }{
		"create": {http.MethodPost, base, `{"name":"x"}`},
		"list":   {http.MethodGet, base, ""},
		"revoke": {http.MethodPost, base + "/" + uuid.NewString() + "/revoke", ""},
		"update": {http.MethodPatch, base + "/" + uuid.NewString(), `{"reminderDetail":"generic"}`},
		"redeem": {http.MethodPost, "/child-device/redeem", `{"token":"` + token + `"}`},
	} {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(c.method, c.path, stringsReader(c.body)))
		require.Equal(t, http.StatusInternalServerError, rec.Code, name)
	}
}

func TestRotate_ADatabaseFailureIsA500(t *testing.T) {
	pool := testPool(t)
	h := childdevice.NewHandler(childdevice.NewService(childdevice.NewRepository(pool)), httpx.NewResponder(&capture{}))
	f := newFamily(t, pool, account.PlanPaid)
	cred, _ := activeDevice(t, pool, f, "Teléfono", time.Now().Add(-time.Hour))
	r := chi.NewRouter()
	r.Use(h.Auth())
	r.Post("/child-device/rotate", h.Rotate)
	// Close only after the credential was read: a request that authenticates and then meets the failure.
	req := httptest.NewRequest(http.MethodPost, "/child-device/rotate", nil)
	req.Header.Set("Authorization", "Device "+cred)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	pool.Close()
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	require.Equal(t, http.StatusInternalServerError, rec.Code, "the middleware can't read the database")
}
