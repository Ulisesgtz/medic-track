package account_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
)

// The first-use guide of the home (specs/071-primer-uso-guiado).

func insertChildConsultation(t *testing.T, acc *account.Account, doctor string, createdAt time.Time) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, testPool(t).QueryRow(context.Background(), `
		INSERT INTO consultations (child_id, doctor_name, consult_date, photo, created_at) VALUES ($1, $2, current_date, '', $3) RETURNING id`,
		acc.Children[0].ID, doctor, createdAt).Scan(&id))
	return id
}

func insertOwnConsultation(t *testing.T, accountID uuid.UUID, doctor string, createdAt time.Time, recordOnly bool) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, testPool(t).QueryRow(context.Background(), `
		INSERT INTO consultations (account_id, doctor_name, consult_date, photo, created_at, record_only) VALUES ($1, $2, current_date, '', $3, $4) RETURNING id`,
		accountID, doctor, createdAt, recordOnly).Scan(&id))
	return id
}

func newAccountWithChild(t *testing.T, repo *account.Repository, base string) *account.Account {
	t.Helper()
	acc := &account.Account{FirstName: "Ana", LastName: "Gómez", Email: uniqueEmail(base), Plan: account.PlanFree,
		Children: []account.Child{{FirstName: "Luis", LastName: "Gómez", BirthDate: mustParseDate(t, "2020-01-15")}}}
	require.NoError(t, repo.Create(context.Background(), acc))
	return acc
}

func TestRepository_FirstUseGuide_WithoutConsultations(t *testing.T) {
	repo := account.NewRepository(testPool(t))
	acc := newAccountWithChild(t, repo, "firstuse.repo.none")

	got, err := repo.FirstUseGuide(context.Background(), acc.ID)

	require.NoError(t, err)
	require.False(t, got.Dismissed)
	require.Nil(t, got.FirstConsultation)
}

func TestRepository_FirstUseGuide_ConsultationOfAChild(t *testing.T) {
	repo := account.NewRepository(testPool(t))
	acc := newAccountWithChild(t, repo, "firstuse.repo.child")
	id := insertChildConsultation(t, acc, "Dra. López", time.Now())

	got, err := repo.FirstUseGuide(context.Background(), acc.ID)

	require.NoError(t, err)
	require.NotNil(t, got.FirstConsultation)
	require.Equal(t, id, got.FirstConsultation.ID)
	require.Equal(t, "Dra. López", got.FirstConsultation.DoctorName)
	require.NotNil(t, got.FirstConsultation.ChildID)
	require.Equal(t, acc.Children[0].ID, *got.FirstConsultation.ChildID)
}

func TestRepository_FirstUseGuide_OwnAndRecordOnlyConsultationsCount(t *testing.T) {
	repo := account.NewRepository(testPool(t))
	acc := newAccountWithChild(t, repo, "firstuse.repo.own")
	id := insertOwnConsultation(t, acc.ID, "Dr. Propio", time.Now(), true)

	got, err := repo.FirstUseGuide(context.Background(), acc.ID)

	require.NoError(t, err)
	require.NotNil(t, got.FirstConsultation)
	require.Equal(t, id, got.FirstConsultation.ID)
	require.Nil(t, got.FirstConsultation.ChildID, "an own consultation has no child")
}

func TestRepository_FirstUseGuide_TheOldestConsultationWins(t *testing.T) {
	repo := account.NewRepository(testPool(t))
	acc := newAccountWithChild(t, repo, "firstuse.repo.oldest")
	now := time.Now()
	insertChildConsultation(t, acc, "Dra. Nueva", now)
	oldest := insertOwnConsultation(t, acc.ID, "Dr. Antiguo", now.Add(-48*time.Hour), false)
	insertChildConsultation(t, acc, "Dra. Media", now.Add(-24*time.Hour))

	got, err := repo.FirstUseGuide(context.Background(), acc.ID)

	require.NoError(t, err)
	require.Equal(t, oldest, got.FirstConsultation.ID)
	require.Equal(t, "Dr. Antiguo", got.FirstConsultation.DoctorName)
}

func TestRepository_SetFirstUseGuideDismissed_CloseAndReopen(t *testing.T) {
	pool := testPool(t)
	repo := account.NewRepository(pool)
	acc := newAccountWithChild(t, repo, "firstuse.repo.dismiss")
	ctx := context.Background()

	closed, err := repo.SetFirstUseGuideDismissed(ctx, acc.ID, true)
	require.NoError(t, err)
	require.True(t, closed.Dismissed)

	var firstClosedAt time.Time
	require.NoError(t, pool.QueryRow(ctx, `SELECT first_use_guide_dismissed_at FROM accounts WHERE id = $1`, acc.ID).Scan(&firstClosedAt))
	again, err := repo.SetFirstUseGuideDismissed(ctx, acc.ID, true)
	require.NoError(t, err)
	require.True(t, again.Dismissed)
	var secondClosedAt time.Time
	require.NoError(t, pool.QueryRow(ctx, `SELECT first_use_guide_dismissed_at FROM accounts WHERE id = $1`, acc.ID).Scan(&secondClosedAt))
	require.True(t, firstClosedAt.Equal(secondClosedAt), "closing a closed guide keeps the first date")

	got, err := repo.GetByID(ctx, acc.ID)
	require.NoError(t, err)
	require.True(t, got.FirstUseGuide.Dismissed)

	reopened, err := repo.SetFirstUseGuideDismissed(ctx, acc.ID, false)
	require.NoError(t, err)
	require.False(t, reopened.Dismissed)
}

func TestRepository_SetFirstUseGuideDismissed_AccountNotFound(t *testing.T) {
	repo := account.NewRepository(testPool(t))

	_, err := repo.SetFirstUseGuideDismissed(context.Background(), uuid.New(), true)

	require.ErrorIs(t, err, account.ErrAccountNotFound)
}

func TestRepository_FirstUseGuide_ConnectionErrors(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	repo := account.NewRepository(closedPool(t, dsn))

	_, err := repo.FirstUseGuide(context.Background(), uuid.New())
	require.Error(t, err)
	_, err = repo.SetFirstUseGuideDismissed(context.Background(), uuid.New(), true)
	require.Error(t, err)
	require.NotErrorIs(t, err, account.ErrAccountNotFound)
}

func TestRepository_FirstUseGuide_UnknownAccountReadsAsEmpty(t *testing.T) {
	repo := account.NewRepository(testPool(t))

	got, err := repo.FirstUseGuide(context.Background(), uuid.New())

	require.NoError(t, err)
	require.False(t, got.Dismissed)
	require.Nil(t, got.FirstConsultation)
}

func doFirstUseGuidePut(t *testing.T, router http.Handler, accountID, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, "/accounts/"+accountID+"/first-use-guide", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func guideOf(t *testing.T, body []byte) map[string]any {
	t.Helper()
	var resp map[string]any
	require.NoError(t, json.Unmarshal(body, &resp))
	guide, ok := resp["firstUseGuide"].(map[string]any)
	require.True(t, ok, "the account carries firstUseGuide")
	return guide
}

func TestHandler_FirstUseGuide_InTheAccountResponses(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.firstuse.account"))
	id := createAccountThroughAPI(t, router, token)

	me := doGetAuthed(t, router, "/accounts/me", token)
	require.Equal(t, http.StatusOK, me.Code)
	guide := guideOf(t, me.Body.Bytes())
	require.Equal(t, false, guide["dismissed"])
	require.Nil(t, guide["firstConsultation"])

	byID := doGetAuthed(t, router, "/accounts/"+id, token)
	require.Equal(t, http.StatusOK, byID.Code)
	require.Nil(t, guideOf(t, byID.Body.Bytes())["firstConsultation"])

	own := insertOwnConsultation(t, uuid.MustParse(id), "Dr. Propio", time.Now(), false)

	me = doGetAuthed(t, router, "/accounts/me", token)
	first := guideOf(t, me.Body.Bytes())["firstConsultation"].(map[string]any)
	require.Equal(t, own.String(), first["id"])
	require.Equal(t, "Dr. Propio", first["doctorName"])
	require.Nil(t, first["childId"])

	// Adding a child returns the whole account: it must not forget the guide.
	added := doPostPath(t, router, "/accounts/"+id+"/children", map[string]any{
		"firstName": "Luis", "lastName": "Gómez", "birthDate": "2020-01-15",
	})
	require.Equal(t, http.StatusCreated, added.Code)
	require.Equal(t, own.String(), guideOf(t, added.Body.Bytes())["firstConsultation"].(map[string]any)["id"])
}

func TestHandler_FirstUseGuide_ChildConsultationCarriesItsChildID(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.firstuse.child"))
	id := createAccountThroughAPI(t, router, token)
	added := doPostPath(t, router, "/accounts/"+id+"/children", map[string]any{
		"firstName": "Luis", "lastName": "Gómez", "birthDate": "2020-01-15",
	})
	require.Equal(t, http.StatusCreated, added.Code)
	var resp struct {
		Children []struct {
			ID string `json:"id"`
		} `json:"children"`
	}
	require.NoError(t, json.Unmarshal(added.Body.Bytes(), &resp))
	childID := uuid.MustParse(resp.Children[0].ID)
	_, err := testPool(t).Exec(context.Background(),
		`INSERT INTO consultations (child_id, doctor_name, consult_date, photo) VALUES ($1, 'Dra. López', current_date, '')`, childID)
	require.NoError(t, err)

	me := doGetAuthed(t, router, "/accounts/me", token)

	first := guideOf(t, me.Body.Bytes())["firstConsultation"].(map[string]any)
	require.Equal(t, "Dra. López", first["doctorName"])
	require.Equal(t, childID.String(), first["childId"])
}

func TestHandler_SetFirstUseGuide_FullCycle(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.firstuse.cycle"))
	id := createAccountThroughAPI(t, router, token)

	closed := doFirstUseGuidePut(t, router, id, `{"dismissed":true}`)
	require.Equal(t, http.StatusOK, closed.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(closed.Body.Bytes(), &body))
	require.Equal(t, true, body["dismissed"])
	require.Nil(t, body["firstConsultation"])

	again := doFirstUseGuidePut(t, router, id, `{"dismissed":true}`)
	require.Equal(t, http.StatusOK, again.Code, "idempotent")

	me := doGetAuthed(t, router, "/accounts/me", token)
	require.Equal(t, true, guideOf(t, me.Body.Bytes())["dismissed"])

	reopened := doFirstUseGuidePut(t, router, id, `{"dismissed":false}`)
	require.Equal(t, http.StatusOK, reopened.Code)
	require.NoError(t, json.Unmarshal(reopened.Body.Bytes(), &body))
	require.Equal(t, false, body["dismissed"])
}

func TestHandler_SetFirstUseGuide_Errors(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.firstuse.errors"))
	id := createAccountThroughAPI(t, router, token)

	for name, body := range map[string]string{"missing": `{}`, "not a boolean": `{"dismissed":"yes"}`, "malformed": `not json`, "null": `{"dismissed":null}`} {
		rec := doFirstUseGuidePut(t, router, id, body)
		require.Equal(t, http.StatusBadRequest, rec.Code, name)
		var resp map[string]any
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		require.Equal(t, "invalid_request", resp["error"], name)
	}
	require.Equal(t, http.StatusNotFound, doFirstUseGuidePut(t, router, "not-a-uuid", `{"dismissed":true}`).Code, "malformed id")
	require.Equal(t, http.StatusNotFound, doFirstUseGuidePut(t, router, uuid.NewString(), `{"dismissed":true}`).Code, "unknown account")
}
