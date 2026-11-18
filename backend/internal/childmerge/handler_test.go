package childmerge_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw/authmwtest"
	"github.com/Ulisesgtz/medic-track/backend/internal/childmerge"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

type capture struct {
	mu      sync.Mutex
	entries []errorlog.Entry
}

func (c *capture) Create(_ context.Context, e *errorlog.Entry) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = append(c.entries, *e)
	return nil
}

func (c *capture) all() []errorlog.Entry {
	time.Sleep(300 * time.Millisecond) // the responder writes in the background
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]errorlog.Entry{}, c.entries...)
}

type api struct {
	t        *testing.T
	h        http.Handler
	verifier *authmwtest.Verifier
	log      *capture
}

func newAPI(t *testing.T, w *world) *api {
	t.Helper()
	log := &capture{}
	responder := httpx.NewResponder(log)
	v := authmwtest.NewVerifier(t, responder)
	h := childmerge.NewHandler(childmerge.NewRepository(w.pool), responder)
	r := chi.NewRouter()
	r.Use(v.Middleware)
	r.Get("/family/merge-options", h.GetOptions)
	r.Post("/family/merges/preview", h.Preview)
	r.Post("/family/merges", h.Merge)
	return &api{t: t, h: r, verifier: v, log: log}
}

func (a *api) call(clerk, method, path, body string) (*httptest.ResponseRecorder, map[string]any) {
	a.t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	if clerk != "" {
		req.Header.Set("Authorization", "Bearer "+a.verifier.Token(a.t, clerk))
	}
	rec := httptest.NewRecorder()
	a.h.ServeHTTP(rec, req)
	var m map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &m)
	return rec, m
}

func pairsBody(own, fam uuid.UUID, choices string) string {
	if choices == "" {
		choices = "{}"
	}
	return fmt.Sprintf(`{"pairs":[{"ownChildId":%q,"familyChildId":%q,"choices":%s}]}`, own, fam, choices)
}

func TestHandler_OptionsAndPreviewAndMerge(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	a := newAPI(t, w)

	rec, body := a.call(w.lauraClerk, http.MethodGet, "/family/merge-options", "")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, true, body["canMerge"])
	require.Len(t, body["suggestedPairs"], 1)

	rec, body = a.call(w.lauraClerk, http.MethodPost, "/family/merges/preview", pairsBody(w.lauraChild, w.anaChild, ""))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Len(t, body["pairs"], 1)
	require.Equal(t, 1, w.count(t, "children", "id", w.lauraChild), "preview writes nothing")

	rec, body = a.call(w.lauraClerk, http.MethodPost, "/family/merges", pairsBody(w.lauraChild, w.anaChild, ""))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	res := body["results"].([]any)[0].(map[string]any)
	require.Equal(t, "merged", res["status"])
	require.EqualValues(t, 1, res["moves"].(map[string]any)["consultations"])
	require.Equal(t, 0, w.count(t, "children", "id", w.lauraChild))

	// the child is gone: the same request now says not_found for the pair
	rec, body = a.call(w.lauraClerk, http.MethodPost, "/family/merges", pairsBody(w.lauraChild, w.anaChild, ""))
	require.Equal(t, http.StatusOK, rec.Code)
	res = body["results"].([]any)[0].(map[string]any)
	require.Equal(t, "failed", res["status"])
	require.Equal(t, "not_found", res["error"])
}

func TestHandler_PerPairErrors(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	a := newAPI(t, w)
	exec(t, w.pool, `UPDATE children SET weight = 14 WHERE id = $1`, w.lauraChild)

	_, body := a.call(w.lauraClerk, http.MethodPost, "/family/merges", pairsBody(w.lauraChild, w.anaChild, ""))
	res := body["results"].([]any)[0].(map[string]any)
	require.Equal(t, "choices_missing", res["error"])
	require.Equal(t, "weight", res["field"])
	require.Equal(t, 1, w.count(t, "children", "id", w.lauraChild))

	// a record too long names the list and its count
	exec(t, w.pool, `INSERT INTO child_records (child_id, account_id, version) VALUES ($1, $2, 1), ($3, $4, 1)`, w.lauraChild, w.laura, w.anaChild, w.ana)
	for i := 0; i < 20; i++ {
		exec(t, w.pool, `INSERT INTO child_record_conditions (child_id, account_id, position, name) VALUES ($1, $2, $3, $4)`, w.anaChild, w.ana, i, fmt.Sprintf("a%d", i))
	}
	for i := 0; i < 11; i++ {
		exec(t, w.pool, `INSERT INTO child_record_conditions (child_id, account_id, position, name) VALUES ($1, $2, $3, $4)`, w.lauraChild, w.laura, i, fmt.Sprintf("l%d", i))
	}
	_, body = a.call(w.lauraClerk, http.MethodPost, "/family/merges", pairsBody(w.lauraChild, w.anaChild, `{"weight":"own"}`))
	res = body["results"].([]any)[0].(map[string]any)
	require.Equal(t, "record_too_long", res["error"])
	require.Equal(t, "conditions", res["list"])
	require.EqualValues(t, 31, res["resulting"])
	require.EqualValues(t, 30, res["limit"])

	// a birth date conflict
	both := []string{w.lauraChild.String(), w.anaChild.String()}
	exec(t, w.pool, `DELETE FROM child_record_conditions WHERE child_id = ANY($1::uuid[])`, both)
	exec(t, w.pool, `DELETE FROM child_records WHERE child_id = ANY($1::uuid[])`, both)
	exec(t, w.pool, `UPDATE children SET birth_date = '2026-09-15' WHERE id = $1`, w.anaChild)
	exec(t, w.pool, `DELETE FROM vaccine_records WHERE id = $1`, w.vaccine)
	_, body = a.call(w.lauraClerk, http.MethodPost, "/family/merges", pairsBody(w.lauraChild, w.anaChild, `{"weight":"own","birthDate":"family"}`))
	res = body["results"].([]any)[0].(map[string]any)
	require.Equal(t, "birth_date_conflict", res["error"])
}

func TestHandler_NotAllowedForACaregiver(t *testing.T) {
	w := newWorld(t, "caregiver", account.PlanPaid)
	a := newAPI(t, w)
	rec, body := a.call(w.lauraClerk, http.MethodPost, "/family/merges/preview", pairsBody(w.lauraChild, w.anaChild, ""))
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Equal(t, "merge_not_allowed", body["error"])
	rec, body = a.call(w.lauraClerk, http.MethodPost, "/family/merges", pairsBody(w.lauraChild, w.anaChild, ""))
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "merge_not_allowed", body["results"].([]any)[0].(map[string]any)["error"])
	require.Equal(t, 1, w.count(t, "children", "id", w.lauraChild))
}

func TestHandler_RequestErrors(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	a := newAPI(t, w)
	x, y := uuid.NewString(), uuid.NewString()
	many := `{"pairs":[` + strings.TrimSuffix(strings.Repeat(fmt.Sprintf(`{"ownChildId":%q,"familyChildId":%q},`, uuid.NewString(), uuid.NewString()), 11), ",") + `]}`
	cases := map[string]struct{ body, code string }{
		"empty":            {`{"pairs":[]}`, "pairs"},
		"no pairs":         {`{}`, "pairs"},
		"more than ten":    {many, "pairs"},
		"malformed ids":    {`{"pairs":[{"ownChildId":"x","familyChildId":"y"}]}`, "pairs"},
		"same child":       {fmt.Sprintf(`{"pairs":[{"ownChildId":%q,"familyChildId":%q}]}`, x, x), "pairs"},
		"repeated own":     {fmt.Sprintf(`{"pairs":[{"ownChildId":%q,"familyChildId":%q},{"ownChildId":%q,"familyChildId":%q}]}`, x, y, x, uuid.NewString()), "pairs"},
		"repeated family":  {fmt.Sprintf(`{"pairs":[{"ownChildId":%q,"familyChildId":%q},{"ownChildId":%q,"familyChildId":%q}]}`, x, y, uuid.NewString(), y), "pairs"},
		"not json":         {`{`, "invalid_request"},
		"unknown field":    {pairsBody(uuid.New(), uuid.New(), `{"shoeSize":"own"}`), "choices"},
		"unknown choice":   {pairsBody(uuid.New(), uuid.New(), `{"weight":"both"}`), "choices"},
		"choice not value": {pairsBody(uuid.New(), uuid.New(), `{"weight":""}`), "choices"},
	}
	for name, c := range cases {
		for _, path := range []string{"/family/merges", "/family/merges/preview"} {
			rec, body := a.call(w.lauraClerk, http.MethodPost, path, c.body)
			require.Equal(t, http.StatusBadRequest, rec.Code, name+" "+path)
			require.Equal(t, c.code, body["error"], name+" "+path)
		}
	}
}

func TestHandler_NoFamilyAndNoSession(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	a := newAPI(t, w)
	for _, p := range []struct{ method, path, body string }{
		{http.MethodGet, "/family/merge-options", ""},
		{http.MethodPost, "/family/merges/preview", pairsBody(w.lauraChild, w.anaChild, "")},
		{http.MethodPost, "/family/merges", pairsBody(w.lauraChild, w.anaChild, "")},
	} {
		rec, body := a.call(w.anaClerk, p.method, p.path, p.body)
		require.Equal(t, http.StatusNotFound, rec.Code, p.path)
		require.Equal(t, "no_family", body["error"], "the owner has no family to merge into")
		rec, body = a.call("user_nobody_"+uuid.NewString()[:8], p.method, p.path, p.body)
		require.Equal(t, http.StatusNotFound, rec.Code, p.path)
		require.Equal(t, "no_family", body["error"], "a session with no account")
		rec, _ = a.call("", p.method, p.path, p.body)
		require.Equal(t, http.StatusUnauthorized, rec.Code, p.path)
	}
}

func TestHandler_PreviewNotFound(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	a := newAPI(t, w)
	rec, body := a.call(w.lauraClerk, http.MethodPost, "/family/merges/preview", pairsBody(uuid.New(), w.anaChild, ""))
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Equal(t, "not_found", body["error"])
}

// TestErrorLogsNeverCarryChildData: whatever the failure, the names and the ids of the children never reach error_logs
// (Principio II) and the expected answers are not logged at all.
func TestErrorLogsNeverCarryChildData(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	a := newAPI(t, w)
	exec(t, w.pool, `UPDATE children SET first_name = 'NOMBRE-RECONOCIBLE-7731', weight = 14 WHERE id = $1`, w.lauraChild)

	a.call(w.lauraClerk, http.MethodPost, "/family/merges", pairsBody(w.lauraChild, w.anaChild, ""))               // choices_missing
	a.call(w.lauraClerk, http.MethodPost, "/family/merges", pairsBody(uuid.New(), w.anaChild, ""))                 // not_found
	a.call(w.lauraClerk, http.MethodPost, "/family/merges", `{"pairs":[]}`)                                        // 400
	a.call(w.lauraClerk, http.MethodPost, "/family/merges/preview", pairsBody(uuid.New(), w.anaChild, ""))         // 404
	a.call(w.anaClerk, http.MethodGet, "/family/merge-options", "")                                                // no_family
	a.call(w.lauraClerk, http.MethodPost, "/family/merges", pairsBody(w.lauraChild, w.anaChild, `{"weight":"x"}`)) // 400 choices

	entries := a.log.all()
	require.NotEmpty(t, entries, "the 400s are logged")
	secrets := []string{w.lauraChild.String(), w.anaChild.String(), "NOMBRE-RECONOCIBLE-7731"}
	for _, e := range entries {
		for _, secret := range secrets {
			require.NotContains(t, e.Message, secret)
			require.NotContains(t, e.Endpoint, secret)
			require.NotContains(t, e.File, secret)
		}
		require.NotNil(t, e.HTTPStatus)
		require.NotEqual(t, http.StatusNotFound, *e.HTTPStatus, "an expected 404 is not logged")
		require.NotEqual(t, http.StatusForbidden, *e.HTTPStatus)
	}
}

func TestHandler_DatabaseFailureIs500(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	a := newAPI(t, w)
	w.pool.Close()
	rec, body := a.call(w.lauraClerk, http.MethodGet, "/family/merge-options", "")
	require.Equal(t, http.StatusInternalServerError, rec.Code)
	require.Equal(t, "internal_error", body["error"])
}
