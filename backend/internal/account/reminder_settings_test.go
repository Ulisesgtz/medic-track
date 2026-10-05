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

// What dose reminders show (specs/011-recordatorios-push, FR-008).

func doPatch(t *testing.T, router http.Handler, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPatch, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestHandler_ReminderDetail_NullUntilChosenThenOnEveryAccountResponse(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.reminder.detail"))
	id := createAccountThroughAPI(t, router, token)

	me := doGetAuthed(t, router, "/accounts/me", token)
	var before map[string]any
	require.NoError(t, json.Unmarshal(me.Body.Bytes(), &before))
	require.Contains(t, before, "reminderDetail")
	require.Nil(t, before["reminderDetail"], "not chosen yet: the first activation asks")

	rec := doPatch(t, router, "/accounts/"+id+"/reminder-settings", `{"reminderDetail":"generic"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var patched map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &patched))
	require.Equal(t, "generic", patched["reminderDetail"])
	require.Equal(t, id, patched["id"])

	rec = doPatch(t, router, "/accounts/"+id+"/reminder-settings", `{"reminderDetail":"detailed"}`)
	require.Equal(t, http.StatusOK, rec.Code)

	var after map[string]any
	require.NoError(t, json.Unmarshal(doGetAuthed(t, router, "/accounts/me", token).Body.Bytes(), &after))
	require.Equal(t, "detailed", after["reminderDetail"])

	added := doPostPath(t, router, "/accounts/"+id+"/children", map[string]any{"firstName": "Luis", "lastName": "Gómez", "birthDate": "2020-01-15"})
	require.Equal(t, http.StatusCreated, added.Code)
	var addedResp map[string]any
	require.NoError(t, json.Unmarshal(added.Body.Bytes(), &addedResp))
	require.Equal(t, "detailed", addedResp["reminderDetail"], "adding a child keeps the choice")
}

func TestHandler_UpdateReminderSettings_Errors(t *testing.T) {
	router, verifier := newTestRouter(t)
	token := newAuthedRequestSetup(t, verifier, uniqueEmail("handler.reminder.errors"))
	id := createAccountThroughAPI(t, router, token)
	path := "/accounts/" + id + "/reminder-settings"

	for name, body := range map[string]string{
		"other value":    `{"reminderDetail":"loud"}`,
		"missing":        `{}`,
		"malformed json": `nope`,
	} {
		rec := doPatch(t, router, path, body)
		require.Equal(t, http.StatusBadRequest, rec.Code, name)
		require.Contains(t, rec.Body.String(), `"validation_error"`, name)
	}
	require.Equal(t, http.StatusNotFound, doPatch(t, router, "/accounts/not-a-uuid/reminder-settings", `{"reminderDetail":"generic"}`).Code)
	require.Equal(t, http.StatusNotFound, doPatch(t, router, "/accounts/"+uuid.NewString()+"/reminder-settings", `{"reminderDetail":"generic"}`).Code)
}

func TestHandler_UpdateReminderSettings_InternalError(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	pool := closedPool(t, dsn)
	h := account.NewHandler(account.NewService(account.NewRepository(pool)), httpx.NewResponder(errorlog.NewRepository(pool)))
	r := chi.NewRouter()
	r.Patch("/accounts/{accountId}/reminder-settings", h.UpdateReminderSettings)

	rec := doPatch(t, r, "/accounts/"+uuid.NewString()+"/reminder-settings", `{"reminderDetail":"generic"}`)
	require.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestRepository_ReminderDetail_ReadBack(t *testing.T) {
	pool := testPool(t)
	repo := account.NewRepository(pool)
	acc := &account.Account{FirstName: "Ana", LastName: "Gómez", Email: uniqueEmail("repo.reminder.detail"), Plan: account.PlanFree}
	require.NoError(t, repo.Create(context.Background(), acc))

	got, err := repo.GetByID(context.Background(), acc.ID)
	require.NoError(t, err)
	require.Nil(t, got.ReminderDetail)

	updated, err := repo.UpdateReminderDetail(context.Background(), acc.ID, "generic")
	require.NoError(t, err)
	require.NotNil(t, updated.ReminderDetail)
	require.Equal(t, "generic", *updated.ReminderDetail)
}
