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

// Hiding children and the unions of a child (specs/074-unir-hijo-duplicado).

func doHiddenPut(t *testing.T, router http.Handler, accountID, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, "/accounts/"+accountID+"/hidden-children", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

type childrenBody struct {
	Children []struct {
		ID     string `json:"id"`
		Merges []struct {
			At          string  `json:"at"`
			ByFirstName *string `json:"byFirstName"`
		} `json:"merges"`
	} `json:"children"`
	HiddenChildren []struct {
		ID        string `json:"id"`
		FirstName string `json:"firstName"`
	} `json:"hiddenChildren"`
}

func decodeChildren(t *testing.T, rec *httptest.ResponseRecorder) childrenBody {
	t.Helper()
	var b childrenBody
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &b), rec.Body.String())
	return b
}

// aPersonWithAChild is an account created through the API (so it has a session) with one child, plus the router.
func aPersonWithAChild(t *testing.T, base string) (router http.Handler, token, accountID, childID string) {
	t.Helper()
	router, verifier := newTestRouter(t)
	token = newAuthedRequestSetup(t, verifier, uniqueEmail(base))
	accountID = createAccountThroughAPI(t, router, token)
	added := doPostPath(t, router, "/accounts/"+accountID+"/children", map[string]any{"firstName": "Mateo", "lastName": "López", "birthDate": "2022-03-03"})
	require.Equal(t, http.StatusCreated, added.Code)
	childID = decodeChildren(t, added).Children[0].ID
	return router, token, accountID, childID
}

// joinAFamily makes the account an active member of a new family and returns the owner's account.
func joinAFamily(t *testing.T, accountID, role string) *account.Account {
	t.Helper()
	pool := testPool(t)
	owner := &account.Account{FirstName: "Ana", LastName: "Dueña", Email: uniqueEmail("hidden.owner"), Plan: account.PlanPaid,
		Children: []account.Child{{FirstName: "Mateo", LastName: "López", BirthDate: mustParseDate(t, "2022-03-03")}}}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), owner))
	_, err := pool.Exec(context.Background(), `INSERT INTO family_members (family_account_id, account_id, role) VALUES ($1, $2, $3)`, owner.ID, accountID, role)
	require.NoError(t, err)
	return owner
}

func TestHandler_HiddenChildren_HideShowAndTheLimitStillCounts(t *testing.T) {
	router, token, id, childID := aPersonWithAChild(t, "hidden.cycle")
	joinAFamily(t, id, "caregiver")

	hid := doHiddenPut(t, router, id, `{"childIds":["`+childID+`"]}`)
	require.Equal(t, http.StatusOK, hid.Code, hid.Body.String())
	body := decodeChildren(t, hid)
	require.Len(t, body.HiddenChildren, 1)
	require.Equal(t, childID, body.HiddenChildren[0].ID)
	require.Equal(t, "Mateo", body.HiddenChildren[0].FirstName)
	for _, c := range body.Children {
		require.NotEqual(t, childID, c.ID, "the hidden child is not in children")
	}

	me := decodeChildren(t, doGetAuthed(t, router, "/accounts/me", token))
	require.Len(t, me.HiddenChildren, 1)
	byID := decodeChildren(t, doGetAuthed(t, router, "/accounts/"+id, token))
	require.Len(t, byID.HiddenChildren, 1)

	// the free plan allows one child: the hidden one still counts
	again := doPostPath(t, router, "/accounts/"+id+"/children", map[string]any{"firstName": "Luis", "lastName": "López", "birthDate": "2020-01-15"})
	require.Equal(t, http.StatusUnprocessableEntity, again.Code)

	// a second PUT with the same set keeps the date
	var first time.Time
	require.NoError(t, testPool(t).QueryRow(context.Background(), `SELECT hidden_at FROM children WHERE id = $1`, childID).Scan(&first))
	require.Equal(t, http.StatusOK, doHiddenPut(t, router, id, `{"childIds":["`+childID+`","`+childID+`"]}`).Code, "a repeated id is the same id")
	var second time.Time
	require.NoError(t, testPool(t).QueryRow(context.Background(), `SELECT hidden_at FROM children WHERE id = $1`, childID).Scan(&second))
	require.True(t, first.Equal(second))

	shown := doHiddenPut(t, router, id, `{"childIds":[]}`)
	require.Equal(t, http.StatusOK, shown.Code)
	body = decodeChildren(t, shown)
	require.Empty(t, body.HiddenChildren)
	require.Len(t, body.Children, 2, "her own child and the family's")
	require.Equal(t, childID, body.Children[0].ID, "her own come first")
	require.Equal(t, http.StatusOK, doHiddenPut(t, router, id, `{"childIds":[]}`).Code, "showing nothing hidden is fine")
}

func TestHandler_HiddenChildren_ItShowsAgainWhenThePersonLeavesTheFamily(t *testing.T) {
	router, token, id, childID := aPersonWithAChild(t, "hidden.leaves")
	owner := joinAFamily(t, id, "tutor")
	require.Equal(t, http.StatusOK, doHiddenPut(t, router, id, `{"childIds":["`+childID+`"]}`).Code)
	require.Len(t, decodeChildren(t, doGetAuthed(t, router, "/accounts/me", token)).HiddenChildren, 1)

	_, err := testPool(t).Exec(context.Background(), `UPDATE family_members SET status = 'left', ended_at = now() WHERE account_id = $1 AND family_account_id = $2`, id, owner.ID)
	require.NoError(t, err)

	me := decodeChildren(t, doGetAuthed(t, router, "/accounts/me", token))
	require.Empty(t, me.HiddenChildren, "no family: nothing is hidden, whatever the column says")
	found := false
	for _, c := range me.Children {
		found = found || c.ID == childID
	}
	require.True(t, found)
}

func TestHandler_HiddenChildren_Errors(t *testing.T) {
	router, _, id, childID := aPersonWithAChild(t, "hidden.errors")

	// no family: hiding is a 409 and shows nothing hidden
	rec := doHiddenPut(t, router, id, `{"childIds":["`+childID+`"]}`)
	require.Equal(t, http.StatusConflict, rec.Code)
	require.Contains(t, rec.Body.String(), "no_family")
	require.Equal(t, http.StatusOK, doHiddenPut(t, router, id, `{"childIds":[]}`).Code, "showing never needs a family")

	joinAFamily(t, id, "tutor")
	for name, body := range map[string]string{"missing": `{}`, "null": `{"childIds":null}`, "malformed": `no`, "not a list": `{"childIds":"x"}`} {
		rec := doHiddenPut(t, router, id, body)
		require.Equal(t, http.StatusBadRequest, rec.Code, name)
		require.Contains(t, rec.Body.String(), "invalid_request", name)
	}
	bad := doHiddenPut(t, router, id, `{"childIds":["no-es-un-id"]}`)
	require.Equal(t, http.StatusBadRequest, bad.Code)
	require.Contains(t, bad.Body.String(), "childIds")
	foreign := doHiddenPut(t, router, id, `{"childIds":["`+uuid.NewString()+`"]}`)
	require.Equal(t, http.StatusBadRequest, foreign.Code, "an id that is not one of the account's children")
	require.Contains(t, foreign.Body.String(), "childIds")
	require.Equal(t, http.StatusNotFound, doHiddenPut(t, router, "not-a-uuid", `{"childIds":[]}`).Code)
	require.Equal(t, http.StatusNotFound, doHiddenPut(t, router, uuid.NewString(), `{"childIds":[]}`).Code)
}

func TestHandler_HiddenChildren_OtherAccountsChildIsRejected(t *testing.T) {
	router, _, id, _ := aPersonWithAChild(t, "hidden.foreign")
	owner := joinAFamily(t, id, "caregiver")
	rec := doHiddenPut(t, router, id, `{"childIds":["`+owner.Children[0].ID.String()+`"]}`)
	require.Equal(t, http.StatusBadRequest, rec.Code, "the family's child is not hers to hide")
}

func TestHandler_ChildrenCarryTheirMerges(t *testing.T) {
	router, token, id, childID := aPersonWithAChild(t, "merges.carry")
	pool := testPool(t)

	me := decodeChildren(t, doGetAuthed(t, router, "/accounts/me", token))
	require.NotNil(t, me.Children[0].Merges, "always a list")
	require.Empty(t, me.Children[0].Merges)

	var laura uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `INSERT INTO accounts (first_name, last_name, email, plan) VALUES ('Laura', 'X', $1, 'free') RETURNING id`, uniqueEmail("merges.laura")).Scan(&laura))
	at := time.Date(2026, 12, 3, 16, 0, 0, 0, time.UTC)
	for i, by := range []*uuid.UUID{&laura, nil} {
		_, err := pool.Exec(context.Background(), `INSERT INTO child_merges (family_account_id, target_child_id, source_account_id, merged_by_account_id, merged_at, counts)
			VALUES ($1, $2, $3, $3, $4, '{}')`, id, childID, by, at.Add(time.Duration(i)*time.Hour))
		require.NoError(t, err)
	}

	for _, path := range []string{"/accounts/me", "/accounts/" + id} {
		got := decodeChildren(t, doGetAuthed(t, router, path, token))
		merges := got.Children[0].Merges
		require.Len(t, merges, 2, path)
		require.Equal(t, "2026-12-03T16:00:00Z", merges[0].At)
		require.Equal(t, "Laura", *merges[0].ByFirstName)
		require.Nil(t, merges[1].ByFirstName, "the account that merged was deleted")
	}

	// adding a child returns the whole account: it must not forget the unions
	_, err := pool.Exec(context.Background(), `UPDATE accounts SET plan = 'paid' WHERE id = $1`, id)
	require.NoError(t, err)
	added := doPostPath(t, router, "/accounts/"+id+"/children", map[string]any{"firstName": "Luis", "lastName": "López", "birthDate": "2020-01-15"})
	require.Equal(t, http.StatusCreated, added.Code)
	body := decodeChildren(t, added)
	require.Len(t, body.Children, 2)
	require.Len(t, body.Children[0].Merges, 2)
	require.NotNil(t, body.Children[1].Merges)
	require.Empty(t, body.Children[1].Merges)
}

func TestRepository_HiddenChildren_ConnectionErrors(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	repo := account.NewRepository(closedPool(t, dsn))
	require.Error(t, repo.SetHiddenChildren(context.Background(), uuid.New(), nil))
}

func TestService_SetHiddenChildren_AccountNotFound(t *testing.T) {
	repo := account.NewRepository(testPool(t))
	err := repo.SetHiddenChildren(context.Background(), uuid.New(), nil)
	require.ErrorIs(t, err, account.ErrAccountNotFound)
}
