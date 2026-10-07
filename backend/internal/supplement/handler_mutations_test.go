package supplement_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/supplement"
)

func TestMutations_PauseResumeEditFinishAnswerWithTheRoutine(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	id := e.createRoutine(t)
	path := "/routines/" + id

	code, got := e.do(t, e.owner, http.MethodPost, path+"/pause", "")
	require.Equal(t, http.StatusOK, code, got)
	require.Equal(t, "paused", got["status"])
	require.NotNil(t, got["pausedAt"])
	code, got = e.do(t, e.owner, http.MethodPost, path+"/pause", "")
	require.Equal(t, http.StatusConflict, code)
	require.Equal(t, "routine_not_active", got["error"])

	code, got = e.do(t, e.owner, http.MethodPost, path+"/resume", `{"utcOffsetMinutes":0}`)
	require.Equal(t, http.StatusOK, code, got)
	require.Equal(t, "active", got["status"])
	code, _ = e.do(t, e.owner, http.MethodPost, path+"/resume", `{"utcOffsetMinutes":0}`)
	require.Equal(t, http.StatusConflict, code)
	code, _ = e.do(t, e.owner, http.MethodPost, path+"/resume", `{"utcOffsetMinutes":9999}`)
	require.Equal(t, http.StatusBadRequest, code)
	code, _ = e.do(t, e.owner, http.MethodPost, path+"/resume", `nope`)
	require.Equal(t, http.StatusBadRequest, code)

	code, got = e.do(t, e.owner, http.MethodPatch, path, createBody("Vitamina D3"))
	require.Equal(t, http.StatusOK, code, got)
	require.Equal(t, "Vitamina D3", got["name"])
	code, _ = e.do(t, e.owner, http.MethodPatch, path, `{"name":""}`)
	require.Equal(t, http.StatusBadRequest, code)
	code, _ = e.do(t, e.owner, http.MethodPatch, path, `nope`)
	require.Equal(t, http.StatusBadRequest, code)

	code, got = e.do(t, e.owner, http.MethodPost, path+"/finish", "")
	require.Equal(t, http.StatusOK, code, got)
	require.Equal(t, "ended", got["status"])
	require.NotNil(t, got["endedAt"])
	code, _ = e.do(t, e.owner, http.MethodPost, path+"/finish", "")
	require.Equal(t, http.StatusOK, code, "finishing is idempotent")

	code, got = e.do(t, e.owner, http.MethodPatch, path, createBody("x"))
	require.Equal(t, http.StatusConflict, code)
	require.Equal(t, "routine_ended", got["error"])
	code, got = e.do(t, e.owner, http.MethodPost, path+"/resume", `{"utcOffsetMinutes":0}`)
	require.Equal(t, http.StatusConflict, code)
	require.Equal(t, "routine_ended", got["error"])

	for _, p := range []string{"/pause", "/resume", "/finish", ""} {
		method := http.MethodPost
		if p == "" {
			method = http.MethodPatch
		}
		code, _ = e.do(t, e.owner, method, "/routines/not-a-uuid"+p, `{}`)
		require.Equal(t, http.StatusNotFound, code, p)
	}
}

func TestMutations_ACaregiverCannotManageAndAFreeOwnerCanOnlyStop(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	id := e.createRoutine(t)
	path := "/routines/" + id
	for _, p := range []string{"/pause", "/resume", "/finish"} {
		code, got := e.do(t, e.caregiver, http.MethodPost, path+p, `{}`)
		require.Equal(t, http.StatusForbidden, code, p)
		require.Equal(t, "forbidden", got["error"])
	}
	code, _ := e.do(t, e.caregiver, http.MethodPatch, path, createBody("x"))
	require.Equal(t, http.StatusForbidden, code)

	// The plan lapses: she can still pause and finish; she can no longer edit nor resume.
	_, err := e.pool.Exec(context.Background(), `UPDATE accounts SET plan = 'free' WHERE id = $1`, e.accountID)
	require.NoError(t, err)
	code, got := e.do(t, e.owner, http.MethodPatch, path, createBody("x"))
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "supplements", got["reason"])
	code, _ = e.do(t, e.owner, http.MethodPost, path+"/pause", "")
	require.Equal(t, http.StatusOK, code)
	code, got = e.do(t, e.owner, http.MethodPost, path+"/resume", `{"utcOffsetMinutes":0}`)
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "supplements", got["reason"])
	code, _ = e.do(t, e.owner, http.MethodPost, path+"/finish", "")
	require.Equal(t, http.StatusOK, code)
}

func TestResume_TheCapAnswers422WithTheLimit(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	first := e.createRoutine(t)
	e.do(t, e.owner, http.MethodPost, "/routines/"+first+"/pause", "")
	for i := 0; i < supplement.MaxActivePerChild; i++ {
		e.createRoutine(t)
	}
	code, got := e.do(t, e.owner, http.MethodPost, "/routines/"+first+"/resume", `{"utcOffsetMinutes":0}`)
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "routine_limit_exceeded", got["error"])
	require.EqualValues(t, 10, got["limit"])
}

func TestMyReminders_EachPersonDecidesAndItShowsInTheirOwnView(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	id := e.createRoutine(t)
	path := "/routines/" + id

	code, got := e.do(t, e.caregiver, http.MethodPut, path+"/my-reminders", `{"enabled":false}`)
	require.Equal(t, http.StatusOK, code, got)
	require.Equal(t, false, got["myReminders"])

	_, mine := e.do(t, e.caregiver, http.MethodGet, path+windowQuery(), "")
	require.Equal(t, false, mine["myReminders"])
	_, owners := e.do(t, e.owner, http.MethodGet, path+windowQuery(), "")
	require.Equal(t, true, owners["myReminders"], "the owner's reminders are untouched")
	_, list := e.do(t, e.caregiver, http.MethodGet, "/children/"+e.childID.String()+"/routines"+windowQuery(), "")
	require.Equal(t, false, list["routines"].([]any)[0].(map[string]any)["myReminders"])

	code, got = e.do(t, e.caregiver, http.MethodPut, path+"/my-reminders", `{"enabled":true}`)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, true, got["myReminders"])

	code, _ = e.do(t, e.caregiver, http.MethodPut, path+"/my-reminders", `nope`)
	require.Equal(t, http.StatusBadRequest, code)
	code, _ = e.do(t, e.caregiver, http.MethodPut, "/routines/not-a-uuid/my-reminders", `{"enabled":true}`)
	require.Equal(t, http.StatusNotFound, code)

	e.do(t, e.owner, http.MethodPost, path+"/pause", "")
	code, got = e.do(t, e.caregiver, http.MethodPut, path+"/my-reminders", `{"enabled":false}`)
	require.Equal(t, http.StatusConflict, code)
	require.Equal(t, "routine_not_active", got["error"])
}

func TestMutations_HandlersFailClosedWithoutWhoIsAsking(t *testing.T) {
	h := supplement.NewHandler(supplement.NewService(nil), httpx.NewResponder(&capture{}))
	r := chi.NewRouter()
	r.Put("/routines/{routineId}/my-reminders", h.SetMyReminders)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPut, "/routines/"+uuid.NewString()+"/my-reminders", strings.NewReader(`{"enabled":true}`)))
	require.Equal(t, http.StatusInternalServerError, rec.Code)
}
