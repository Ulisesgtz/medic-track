package account_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw/authmwtest"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

func newTestRouter(t *testing.T) (http.Handler, *authmwtest.Verifier) {
	router, _, verifier := newTestRouterWithPool(t)
	return router, verifier
}

func newTestRouterWithPool(t *testing.T) (http.Handler, *pgxpool.Pool, *authmwtest.Verifier) {
	pool := testPool(t)
	repo := account.NewRepository(pool)
	svc := account.NewService(repo)
	responder := httpx.NewResponder(errorlog.NewRepository(pool))
	h := account.NewHandler(svc, responder)
	verifier := authmwtest.NewVerifier(t, responder)

	r := chi.NewRouter()
	r.Group(func(r chi.Router) {
		r.Use(verifier.Middleware)
		r.Get("/accounts/me", h.GetMe)
		r.Post("/accounts", h.CreateAccount)
	})
	r.Get("/accounts/{accountId}", h.GetAccount)
	r.Post("/accounts/{accountId}/children", h.AddChild)
	return r, pool, verifier
}

// newAuthedRequestSetup mocks a Clerk user profile for a fresh clerkUserID
// and mints a token for it, in one call — the shape most tests need to
// create an account as their own tutor.
func newAuthedRequestSetup(t *testing.T, verifier *authmwtest.Verifier, email string) (token string) {
	t.Helper()
	clerkUserID := "user_" + uuid.NewString()
	authmwtest.MockUserProfile(t, clerkUserID, email)
	return verifier.Token(t, clerkUserID)
}

// errorLogCount returns the current number of rows in error_logs, used as a
// baseline so a later poll can wait for a genuinely NEW entry rather than
// possibly re-reading a stale one written by an earlier request (the
// recording goroutine isn't synchronous with the HTTP response).
func errorLogCount(t *testing.T, pool *pgxpool.Pool) int {
	t.Helper()
	var count int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM error_logs`).Scan(&count))
	return count
}

// waitForNewErrorLogLine polls error_logs until its row count exceeds
// baseline, then returns the `line` of the newest entry.
func waitForNewErrorLogLine(t *testing.T, pool *pgxpool.Pool, baseline int) int {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if errorLogCount(t, pool) > baseline {
			var line int
			require.NoError(t, pool.QueryRow(context.Background(),
				`SELECT line FROM error_logs ORDER BY created_at DESC LIMIT 1`).Scan(&line))
			return line
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("timed out waiting for a new error_logs entry")
	return 0
}

// doPost sends POST /accounts with token as the bearer token (empty = no
// Authorization header at all, for the 401 case).
func doPost(t *testing.T, router http.Handler, token string, body map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	b, err := json.Marshal(body)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/accounts", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestHandler_CreateAccount_Success_NoChildren(t *testing.T) {
	router, verifier := newTestRouter(t)
	email := uniqueEmail("handler.success.nochildren")
	token := newAuthedRequestSetup(t, verifier, email)

	rec := doPost(t, router, token, map[string]any{
		"firstName": "Ana",
		"lastName":  "Gómez",
	})

	require.Equal(t, http.StatusCreated, rec.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "free", resp["plan"])
	require.Equal(t, email, resp["email"])
	require.Empty(t, resp["children"])
}

func TestHandler_CreateAccount_Success_OneChild(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.success.onechild"))

	rec := doPost(t, router, token, map[string]any{
		"firstName": "Ana",
		"lastName":  "Gómez",
		"children": []map[string]any{
			{"firstName": "Luis", "lastName": "Gómez", "birthDate": "2020-01-15"},
		},
	})

	require.Equal(t, http.StatusCreated, rec.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	children, ok := resp["children"].([]any)
	require.True(t, ok)
	require.Len(t, children, 1)
}

// TestHandler_CreateAccount_Unauthorized covers the new session requirement
// (specs/008-autenticacion-cuenta, contracts/post-accounts.md): no
// Authorization header at all is rejected before the body is even read.
func TestHandler_CreateAccount_Unauthorized(t *testing.T) {
	router, _ := newTestRouter(t)

	rec := doPost(t, router, "", map[string]any{"firstName": "Ana", "lastName": "Gómez"})

	require.Equal(t, http.StatusUnauthorized, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "unauthorized", resp["error"])
}

// TestHandler_CreateAccount_Idempotent_AlreadyLinked covers
// contracts/post-accounts.md's doble-envío case: retrying POST /accounts
// with the same already-linked session returns the existing account with
// 200, not a duplicate.
func TestHandler_CreateAccount_Idempotent_AlreadyLinked(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.idempotent"))
	body := map[string]any{"firstName": "Ana", "lastName": "Gómez"}

	first := doPost(t, router, token, body)
	require.Equal(t, http.StatusCreated, first.Code)
	var firstResp map[string]any
	require.NoError(t, json.Unmarshal(first.Body.Bytes(), &firstResp))

	second := doPost(t, router, token, body)
	require.Equal(t, http.StatusOK, second.Code)
	var secondResp map[string]any
	require.NoError(t, json.Unmarshal(second.Body.Bytes(), &secondResp))
	require.Equal(t, firstResp["id"], secondResp["id"])
}

func TestHandler_CreateAccount_MalformedJSON(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.malformed"))

	req := httptest.NewRequest(http.MethodPost, "/accounts", bytes.NewReader([]byte("{not-json")))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestHandler_CreateAccount_InvalidBirthDateFormat(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.invalid.birthdate"))

	rec := doPost(t, router, token, map[string]any{
		"firstName": "Ana",
		"lastName":  "Gómez",
		"children": []map[string]any{
			{"firstName": "Luis", "lastName": "Gómez", "birthDate": "15-01-2020"},
		},
	})

	require.Equal(t, http.StatusBadRequest, rec.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "validation_error", resp["error"])
}

func TestHandler_CreateAccount_MissingRequiredFields(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.missing"))

	rec := doPost(t, router, token, map[string]any{"lastName": "Gómez"})

	require.Equal(t, http.StatusBadRequest, rec.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "validation_error", resp["error"])
}

// TestHandler_CreateAccount_InvalidNameFormat covers the server-side
// character-set/length rule enforced independently of whatever the client
// already validated (defense in depth, mirroring the freemium check).
func TestHandler_CreateAccount_InvalidNameFormat(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.invalid-name"))

	rec := doPost(t, router, token, map[string]any{
		"firstName": "Ana123",
		"lastName":  "Gómez",
	})

	require.Equal(t, http.StatusBadRequest, rec.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "validation_error", resp["error"])
}

// TestHandler_CreateAccount_DuplicateEmail covers the DB-level email
// uniqueness backstop: two different Clerk identities whose verified email
// happens to be the same (the mock lets this scenario be provoked directly;
// Clerk itself enforces unique emails per instance) still can't both create
// a PediTrack account.
func TestHandler_CreateAccount_DuplicateEmail(t *testing.T) {
	router, verifier := newTestRouter(t)
	email := uniqueEmail("handler.duplicate")
	body := map[string]any{"firstName": "Ana", "lastName": "Gómez"}

	firstToken := newAuthedRequestSetup(t, verifier, email)
	first := doPost(t, router, firstToken, body)
	require.Equal(t, http.StatusCreated, first.Code)

	secondClerkUserID := "user_" + uuid.NewString()
	authmwtest.MockUserProfile(t, secondClerkUserID, email)
	secondToken := verifier.Token(t, secondClerkUserID)
	second := doPost(t, router, secondToken, body)
	require.Equal(t, http.StatusConflict, second.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(second.Body.Bytes(), &resp))
	require.Equal(t, "email_already_exists", resp["error"])
}

// TestHandler_CreateAccount_FreemiumLimit covers FR-007's server-side gate:
// two children on a brand-new (free) account must be rejected with 422 and
// must NOT leave a partially created account behind.
func TestHandler_CreateAccount_FreemiumLimit(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.freemium"))

	rec := doPost(t, router, token, map[string]any{
		"firstName": "Carla",
		"lastName":  "Ruiz",
		"children": []map[string]any{
			{"firstName": "Hijo Uno", "lastName": "Ruiz", "birthDate": "2018-01-01"},
			{"firstName": "Hijo Dos", "lastName": "Ruiz", "birthDate": "2021-01-01"},
		},
	})

	require.Equal(t, http.StatusUnprocessableEntity, rec.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "freemium_child_limit_exceeded", resp["error"])
	require.Equal(t, float64(2), resp["received"])
}

// TestHandler_CreateAccount_ErrorLogAttributesDistinctCallSites is a
// regression test for a code review finding on specs/002-registro-log-errores:
// writeCreateAccountError used to funnel every validation-error kind through
// one shared writeValidationError helper, collapsing them all to the same
// error_logs line. Each error kind now calls h.responder directly, so two
// different validation failures must produce two different logged lines.
func TestHandler_CreateAccount_ErrorLogAttributesDistinctCallSites(t *testing.T) {
	router, pool, verifier := newTestRouterWithPool(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.errlog"))

	// A malformed birth date is detected inline in CreateAccount, before
	// even reaching the service layer.
	baseline := errorLogCount(t, pool)
	doPost(t, router, token, map[string]any{
		"firstName": "Ana",
		"lastName":  "Gómez",
		"children": []map[string]any{
			{"firstName": "Luis", "lastName": "Gómez", "birthDate": "15-01-2020"},
		},
	})
	birthDateLine := waitForNewErrorLogLine(t, pool, baseline)

	// A missing required field is detected by the service and surfaces via
	// the ValidationErrors branch of writeCreateAccountError.
	baseline = errorLogCount(t, pool)
	doPost(t, router, token, map[string]any{"lastName": "Gómez"})
	missingFieldLine := waitForNewErrorLogLine(t, pool, baseline)

	require.NotEqual(t, birthDateLine, missingFieldLine,
		"two different validation-error kinds must attribute to two different source lines")
}

func doGet(t *testing.T, router http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func doGetAuthed(t *testing.T, router http.Handler, path, token string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

// TestHandler_GetMe covers contracts/get-accounts-me.md's direct-link cases:
// 401 without a session, 404 when the session has no account linked yet,
// 200 with the account once POST /accounts has created one.
func TestHandler_GetMe(t *testing.T) {
	router, verifier := newTestRouter(t)

	unauthed := doGetAuthed(t, router, "/accounts/me", "")
	require.Equal(t, http.StatusUnauthorized, unauthed.Code)

	clerkUserID := "user_" + uuid.NewString()
	email := uniqueEmail("handler.getme")
	authmwtest.MockUserProfile(t, clerkUserID, email)
	token := verifier.Token(t, clerkUserID)

	notYetLinked := doGetAuthed(t, router, "/accounts/me", token)
	require.Equal(t, http.StatusNotFound, notYetLinked.Code)
	var notFoundResp map[string]any
	require.NoError(t, json.Unmarshal(notYetLinked.Body.Bytes(), &notFoundResp))
	require.Equal(t, "account_not_found_for_session", notFoundResp["error"])

	created := doPost(t, router, token, map[string]any{"firstName": "Ana", "lastName": "Gómez"})
	require.Equal(t, http.StatusCreated, created.Code)

	linked := doGetAuthed(t, router, "/accounts/me", token)
	require.Equal(t, http.StatusOK, linked.Code)
	var linkedResp map[string]any
	require.NoError(t, json.Unmarshal(linked.Body.Bytes(), &linkedResp))
	require.Equal(t, email, linkedResp["email"])
}

func doPostPath(t *testing.T, router http.Handler, path string, body map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	b, err := json.Marshal(body)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

// TestHandler_GetAccount_Success covers contracts/get-account.md's 200 case:
// same body shape as POST /accounts' 201.
func TestHandler_GetAccount_Success(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.getaccount.success"))

	created := doPost(t, router, token, map[string]any{
		"firstName": "Ana",
		"lastName":  "Gómez",
		"children": []map[string]any{
			{"firstName": "Luis", "lastName": "Gómez", "birthDate": "2020-01-15"},
		},
	})
	require.Equal(t, http.StatusCreated, created.Code)
	var createdResp map[string]any
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &createdResp))
	id := createdResp["id"].(string)

	rec := doGet(t, router, "/accounts/"+id)

	require.Equal(t, http.StatusOK, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, id, resp["id"])
	children, ok := resp["children"].([]any)
	require.True(t, ok)
	require.Len(t, children, 1)
}

// TestHandler_GetAccount_NotFound covers the 404 case: a well-formed but
// non-existent UUID, and a malformed id (both treated as "no account").
func TestHandler_GetAccount_NotFound(t *testing.T) {
	router, _ := newTestRouter(t)

	for _, id := range []string{"11111111-1111-1111-1111-111111111111", "not-a-uuid"} {
		t.Run(id, func(t *testing.T) {
			rec := doGet(t, router, "/accounts/"+id)

			require.Equal(t, http.StatusNotFound, rec.Code)
			var resp map[string]any
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
			require.Equal(t, "account_not_found", resp["error"])
		})
	}
}

// TestHandler_AddChild_Success covers contracts/post-account-children.md's
// 201 case: the returned account includes the newly added child.
func TestHandler_AddChild_Success(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.addchild.success"))

	created := doPost(t, router, token, map[string]any{
		"firstName": "Ana",
		"lastName":  "Gómez",
	})
	var createdResp map[string]any
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &createdResp))
	id := createdResp["id"].(string)

	rec := doPostPath(t, router, "/accounts/"+id+"/children", map[string]any{
		"firstName": "Luis", "lastName": "Gómez", "birthDate": "2020-01-15",
	})

	require.Equal(t, http.StatusCreated, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	children, ok := resp["children"].([]any)
	require.True(t, ok)
	require.Len(t, children, 1)
}

// TestHandler_AddChild_FreemiumLimit covers the 422 case: a free-plan
// account that already has 1 child.
func TestHandler_AddChild_FreemiumLimit(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.addchild.freemium"))

	created := doPost(t, router, token, map[string]any{
		"firstName": "Carla",
		"lastName":  "Ruiz",
		"children": []map[string]any{
			{"firstName": "Hijo Uno", "lastName": "Ruiz", "birthDate": "2018-01-01"},
		},
	})
	var createdResp map[string]any
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &createdResp))
	id := createdResp["id"].(string)

	rec := doPostPath(t, router, "/accounts/"+id+"/children", map[string]any{
		"firstName": "Hijo Dos", "lastName": "Ruiz", "birthDate": "2021-01-01",
	})

	require.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "freemium_child_limit_exceeded", resp["error"])
}

// TestHandler_AddChild_AccountNotFound covers the 404 case.
func TestHandler_AddChild_AccountNotFound(t *testing.T) {
	router, _ := newTestRouter(t)

	rec := doPostPath(t, router, "/accounts/11111111-1111-1111-1111-111111111111/children", map[string]any{
		"firstName": "Luis", "lastName": "Gómez", "birthDate": "2020-01-15",
	})

	require.Equal(t, http.StatusNotFound, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "account_not_found", resp["error"])
}

// TestHandler_AddChild_InvalidFields covers the 400 case.
func TestHandler_AddChild_InvalidFields(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.addchild.invalid"))

	created := doPost(t, router, token, map[string]any{
		"firstName": "Ana",
		"lastName":  "Gómez",
	})
	var createdResp map[string]any
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &createdResp))
	id := createdResp["id"].(string)

	rec := doPostPath(t, router, "/accounts/"+id+"/children", map[string]any{
		"lastName": "Gómez", "birthDate": "2020-01-15",
	})

	require.Equal(t, http.StatusBadRequest, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "validation_error", resp["error"])
}

// TestHandler_AddChild_MalformedAccountId covers the same "not even a valid
// UUID" edge case as TestHandler_GetAccount_NotFound, for the path param
// shared by AddChild.
func TestHandler_AddChild_MalformedAccountId(t *testing.T) {
	router, _ := newTestRouter(t)

	rec := doPostPath(t, router, "/accounts/not-a-uuid/children", map[string]any{
		"firstName": "Luis", "lastName": "Gómez", "birthDate": "2020-01-15",
	})

	require.Equal(t, http.StatusNotFound, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "account_not_found", resp["error"])
}

// TestHandler_AddChild_MalformedJSON covers AddChild's own malformed-body
// branch, mirroring TestHandler_CreateAccount_MalformedJSON.
func TestHandler_AddChild_MalformedJSON(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.addchild.malformedjson"))

	created := doPost(t, router, token, map[string]any{
		"firstName": "Ana", "lastName": "Gómez",
	})
	var createdResp map[string]any
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &createdResp))
	id := createdResp["id"].(string)

	req := httptest.NewRequest(http.MethodPost, "/accounts/"+id+"/children", bytes.NewReader([]byte("{not-json")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
}

// TestHandler_AddChild_InvalidBirthDateFormat covers AddChild's own
// birth-date-parse branch, mirroring TestHandler_CreateAccount_InvalidBirthDateFormat.
func TestHandler_AddChild_InvalidBirthDateFormat(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.addchild.invalidbirthdate"))

	created := doPost(t, router, token, map[string]any{
		"firstName": "Ana", "lastName": "Gómez",
	})
	var createdResp map[string]any
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &createdResp))
	id := createdResp["id"].(string)

	rec := doPostPath(t, router, "/accounts/"+id+"/children", map[string]any{
		"firstName": "Luis", "lastName": "Gómez", "birthDate": "15-01-2020",
	})

	require.Equal(t, http.StatusBadRequest, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "validation_error", resp["error"])
}

// TestRouter_NoChildMutationRoutes covers FR-006a: once persisted, a Child
// can never be edited or deleted in this scope, so the router must not
// expose PATCH/DELETE for it. This asserts the router returns 404/405
// (chi's default for an unregistered route) rather than routing to a handler.
func TestRouter_NoChildMutationRoutes(t *testing.T) {
	router, _ := newTestRouter(t)

	paths := []struct {
		method string
		path   string
	}{
		{http.MethodPatch, "/accounts/11111111-1111-1111-1111-111111111111/children/22222222-2222-2222-2222-222222222222"},
		{http.MethodDelete, "/accounts/11111111-1111-1111-1111-111111111111/children/22222222-2222-2222-2222-222222222222"},
	}

	for _, p := range paths {
		t.Run(p.method+" "+p.path, func(t *testing.T) {
			req := httptest.NewRequest(p.method, p.path, nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			require.True(t, rec.Code == http.StatusNotFound || rec.Code == http.StatusMethodNotAllowed,
				"expected 404 or 405 for an unregistered child mutation route, got %d", rec.Code)
		})
	}
}
