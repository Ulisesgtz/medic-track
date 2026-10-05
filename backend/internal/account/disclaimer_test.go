package account_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// The audit trail of the "Antes de empezar" notice (specs/010-registro-aceptacion-aviso).

func newAccountForDisclaimer(t *testing.T, repo *account.Repository, base string) *account.Account {
	t.Helper()
	acc := &account.Account{FirstName: "Ana", LastName: "Gómez", Email: uniqueEmail(base), Plan: account.PlanFree}
	require.NoError(t, repo.Create(context.Background(), acc))
	return acc
}

func TestRepository_AcceptDisclaimer_RecordsOnceAndKeepsTheFirstTimestamp(t *testing.T) {
	pool := testPool(t)
	repo := account.NewRepository(pool)
	acc := newAccountForDisclaimer(t, repo, "disclaimer.repo.idempotent")

	first, err := repo.AcceptDisclaimer(context.Background(), acc.ID, account.CurrentDisclaimerVersion)
	require.NoError(t, err)
	require.Equal(t, account.CurrentDisclaimerVersion, first.Version)
	require.Equal(t, acc.ID.String(), first.AccountID)
	require.False(t, first.AcceptedAt.IsZero())

	again, err := repo.AcceptDisclaimer(context.Background(), acc.ID, account.CurrentDisclaimerVersion)
	require.NoError(t, err)
	require.True(t, first.AcceptedAt.Equal(again.AcceptedAt), "the audit trail keeps when it was first acknowledged")

	var rows int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT count(*) FROM disclaimer_acceptances WHERE account_id = $1`, acc.ID).Scan(&rows))
	require.Equal(t, 1, rows)
}

func TestRepository_AcceptDisclaimer_AccountNotFound(t *testing.T) {
	repo := account.NewRepository(testPool(t))

	_, err := repo.AcceptDisclaimer(context.Background(), uuid.New(), account.CurrentDisclaimerVersion)

	require.ErrorIs(t, err, account.ErrAccountNotFound)
}

func TestRepository_AcceptDisclaimer_ConnectionError(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	repo := account.NewRepository(closedPool(t, dsn))

	_, err := repo.AcceptDisclaimer(context.Background(), uuid.New(), account.CurrentDisclaimerVersion)

	require.Error(t, err)
	require.NotErrorIs(t, err, account.ErrAccountNotFound)
}

func TestRepository_DisclaimerAccepted_OnlyForTheCurrentVersion(t *testing.T) {
	pool := testPool(t)
	repo := account.NewRepository(pool)
	acc := newAccountForDisclaimer(t, repo, "disclaimer.repo.version")

	got, err := repo.GetByID(context.Background(), acc.ID)
	require.NoError(t, err)
	require.False(t, got.DisclaimerAccepted)

	// An acknowledgement of an older text does not count for the current one.
	_, err = pool.Exec(context.Background(),
		`INSERT INTO disclaimer_acceptances (account_id, version) VALUES ($1, '2000-01-01')`, acc.ID)
	require.NoError(t, err)
	got, err = repo.GetByID(context.Background(), acc.ID)
	require.NoError(t, err)
	require.False(t, got.DisclaimerAccepted)

	_, err = repo.AcceptDisclaimer(context.Background(), acc.ID, account.CurrentDisclaimerVersion)
	require.NoError(t, err)
	got, err = repo.GetByID(context.Background(), acc.ID)
	require.NoError(t, err)
	require.True(t, got.DisclaimerAccepted)
}

func TestService_AcceptDisclaimer_RejectsAStaleVersion(t *testing.T) {
	pool := testPool(t)
	repo := account.NewRepository(pool)
	svc := account.NewService(repo)
	acc := newAccountForDisclaimer(t, repo, "disclaimer.service.stale")

	_, err := svc.AcceptDisclaimer(context.Background(), acc.ID, "1999-12-31")

	var validationErrs account.ValidationErrors
	require.ErrorAs(t, err, &validationErrs)
	require.Equal(t, "version", validationErrs[0].Field)

	got, err := repo.GetByID(context.Background(), acc.ID)
	require.NoError(t, err)
	require.False(t, got.DisclaimerAccepted, "a stale acknowledgement is not recorded")
}

func doDisclaimerPost(t *testing.T, router http.Handler, accountID, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/accounts/"+accountID+"/disclaimer-acceptance", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func createAccountThroughAPI(t *testing.T, router http.Handler, token string) string {
	t.Helper()
	rec := doPost(t, router, token, map[string]any{"firstName": "Ana", "lastName": "Gómez"})
	require.Equal(t, http.StatusCreated, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	return resp["id"].(string)
}

func TestHandler_AcceptDisclaimer_FullCycle(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.disclaimer.cycle"))
	id := createAccountThroughAPI(t, router, token)

	// A brand-new account has not acknowledged the notice, and the response says which version to show.
	before := doGetAuthed(t, router, "/accounts/me", token)
	require.Equal(t, http.StatusOK, before.Code)
	var beforeResp map[string]any
	require.NoError(t, json.Unmarshal(before.Body.Bytes(), &beforeResp))
	require.Equal(t, account.CurrentDisclaimerVersion, beforeResp["disclaimerVersion"])
	require.Equal(t, false, beforeResp["disclaimerAccepted"])

	rec := doDisclaimerPost(t, router, id, `{"version":"`+account.CurrentDisclaimerVersion+`"}`)
	require.Equal(t, http.StatusOK, rec.Code)
	var accepted map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &accepted))
	require.Equal(t, account.CurrentDisclaimerVersion, accepted["version"])
	require.NotEmpty(t, accepted["acceptedAt"])

	after := doGetAuthed(t, router, "/accounts/me", token)
	var afterResp map[string]any
	require.NoError(t, json.Unmarshal(after.Body.Bytes(), &afterResp))
	require.Equal(t, true, afterResp["disclaimerAccepted"])

	// Adding a child returns the whole account: it must not forget the acknowledgement.
	added := doPostPath(t, router, "/accounts/"+id+"/children", map[string]any{
		"firstName": "Luis", "lastName": "Gómez", "birthDate": "2020-01-15",
	})
	require.Equal(t, http.StatusCreated, added.Code)
	var addedResp map[string]any
	require.NoError(t, json.Unmarshal(added.Body.Bytes(), &addedResp))
	require.Equal(t, true, addedResp["disclaimerAccepted"])
}

func TestHandler_AcceptDisclaimer_IsIdempotent(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.disclaimer.idempotent"))
	id := createAccountThroughAPI(t, router, token)
	body := `{"version":"` + account.CurrentDisclaimerVersion + `"}`

	first := doDisclaimerPost(t, router, id, body)
	second := doDisclaimerPost(t, router, id, body)

	require.Equal(t, http.StatusOK, first.Code)
	require.Equal(t, http.StatusOK, second.Code)
	var a, b map[string]any
	require.NoError(t, json.Unmarshal(first.Body.Bytes(), &a))
	require.NoError(t, json.Unmarshal(second.Body.Bytes(), &b))
	require.Equal(t, a["acceptedAt"], b["acceptedAt"])
}

func TestHandler_AcceptDisclaimer_Errors(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.disclaimer.errors"))
	id := createAccountThroughAPI(t, router, token)

	stale := doDisclaimerPost(t, router, id, `{"version":"1999-12-31"}`)
	require.Equal(t, http.StatusBadRequest, stale.Code)
	var staleResp map[string]any
	require.NoError(t, json.Unmarshal(stale.Body.Bytes(), &staleResp))
	require.Equal(t, "validation_error", staleResp["error"])

	require.Equal(t, http.StatusBadRequest, doDisclaimerPost(t, router, id, `{}`).Code, "missing version")
	require.Equal(t, http.StatusBadRequest, doDisclaimerPost(t, router, id, `not json`).Code, "malformed JSON")
	require.Equal(t, http.StatusNotFound, doDisclaimerPost(t, router, "not-a-uuid", `{}`).Code, "malformed id")
	require.Equal(t, http.StatusNotFound,
		doDisclaimerPost(t, router, uuid.NewString(), `{"version":"`+account.CurrentDisclaimerVersion+`"}`).Code, "unknown account")
}

func TestHandler_AcceptDisclaimer_InternalError(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	pool := closedPool(t, dsn)
	h := account.NewHandler(account.NewService(account.NewRepository(pool)), httpx.NewResponder(errorlog.NewRepository(pool)))
	r := chi.NewRouter()
	r.Post("/accounts/{accountId}/disclaimer-acceptance", h.AcceptDisclaimer)

	rec := doDisclaimerPost(t, r, uuid.NewString(), `{"version":"`+account.CurrentDisclaimerVersion+`"}`)

	require.Equal(t, http.StatusInternalServerError, rec.Code)
}
