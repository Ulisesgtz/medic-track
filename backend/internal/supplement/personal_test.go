package supplement_test

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
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw/authmwtest"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/ownership"
	"github.com/Ulisesgtz/medic-track/backend/internal/supplement"
)

// specs/033, part 3: a person's own routines (child_id NULL) — only theirs, reminders only to them, the plan being their own or
// their family's.

type personalEnv struct {
	*env
	careAccountID uuid.UUID
}

// newPersonalEnv is the routines' routes plus the three personal ones, with an owner (the given plan) and a caregiver of that family.
func newPersonalEnv(t *testing.T, plan account.Plan) *personalEnv {
	t.Helper()
	e := newEnv(t, plan)
	responder := httpx.NewResponder(e.log)
	e.verifier = authmwtest.NewVerifier(t, responder)
	acc := access.NewRepository(e.pool)
	h := supplement.NewHandler(supplement.NewService(supplement.NewRepository(e.pool)), responder)
	owns := authmw.RequireOwner(responder, "accountId", ownership.NewRepository(e.pool).OwnsAccount)
	seesRoutine := authmw.RequireAccess(responder, "routineId", access.Mark, acc.OnRoutine)
	fullRoutine := authmw.RequireAccess(responder, "routineId", access.Full, acc.OnRoutine)
	r := chi.NewRouter()
	r.Use(e.verifier.Middleware)
	seesChild := authmw.RequireAccess(responder, "childId", access.Mark, acc.OnChild)
	fullChild := authmw.RequireAccess(responder, "childId", access.Full, acc.OnChild)
	r.With(seesChild).Get("/children/{childId}/routines", h.ListRoutines)
	r.With(fullChild).Post("/children/{childId}/routines", h.CreateRoutine)
	r.With(owns).Get("/accounts/{accountId}/routines", h.ListPersonalRoutines)
	r.With(owns).Post("/accounts/{accountId}/routines", h.CreatePersonalRoutine)
	r.With(owns).Post("/accounts/{accountId}/routines/notice-seen", h.AcknowledgePersonalNotice)
	r.With(seesRoutine).Get("/routines/{routineId}", h.GetRoutine)
	r.With(seesRoutine).Patch("/routines/{routineId}/doses/{doseId}", h.UpdateDose)
	r.With(seesRoutine).Post("/routines/{routineId}/done", h.MarkRoutineDone)
	r.With(fullRoutine).Post("/routines/{routineId}/pause", h.PauseRoutine)
	r.With(fullRoutine).Post("/routines/{routineId}/resume", h.ResumeRoutine)
	r.With(fullRoutine).Post("/routines/{routineId}/finish", h.FinishRoutine)
	e.router = r

	var care uuid.UUID
	require.NoError(t, e.pool.QueryRow(context.Background(), `SELECT id FROM accounts WHERE clerk_user_id = $1`, e.caregiver).Scan(&care))
	return &personalEnv{env: e, careAccountID: care}
}

func (e *personalEnv) personalPath(account uuid.UUID) string { return "/accounts/" + account.String() + "/routines" }

func (e *personalEnv) createPersonal(t *testing.T, clerkID string, account uuid.UUID, name string) string {
	t.Helper()
	code, got := e.do(t, clerkID, http.MethodPost, e.personalPath(account), createBody(name))
	require.Equal(t, http.StatusCreated, code, got)
	return got["id"].(string)
}

func (e *personalEnv) setPlan(t *testing.T, id uuid.UUID, plan string) {
	t.Helper()
	_, err := e.pool.Exec(context.Background(), `UPDATE accounts SET plan = $2 WHERE id = $1`, id, plan)
	require.NoError(t, err)
}

func TestPersonal_CreateAnswersWithAnOwnRoutineAndItsDosesOfToday(t *testing.T) {
	e := newPersonalEnv(t, account.PlanPaid)
	code, got := e.do(t, e.owner, http.MethodPost, e.personalPath(e.accountID), createBody("Omega 3"))
	require.Equal(t, http.StatusCreated, code, got)
	require.Equal(t, "Omega 3", got["name"])
	require.Nil(t, got["childId"], "a person's own routine has no child")
	require.Equal(t, "Ana", got["createdBy"])
	require.Equal(t, true, got["canEdit"])
	require.Len(t, got["doses"], 2)

	var child *uuid.UUID
	var owner, createdBy uuid.UUID
	require.NoError(t, e.pool.QueryRow(context.Background(), `SELECT child_id, account_id, created_by_account_id FROM supplement_routines WHERE id = $1`, got["id"]).Scan(&child, &owner, &createdBy))
	require.Nil(t, child)
	require.Equal(t, e.accountID, owner)
	require.Equal(t, e.accountID, createdBy)
}

func TestPersonal_OnlyTheOwnerSeesAndReachesIt(t *testing.T) {
	e := newPersonalEnv(t, account.PlanPaid)
	id := e.createPersonal(t, e.owner, e.accountID, "Omega 3")
	_, dose := e.firstDose(t, id)

	// The owner reads, marks and stops it.
	code, got := e.do(t, e.owner, http.MethodGet, "/routines/"+id+windowQuery(), "")
	require.Equal(t, http.StatusOK, code, got)
	code, _ = e.do(t, e.owner, http.MethodPatch, "/routines/"+id+"/doses/"+dose, `{"taken":true}`)
	require.Equal(t, http.StatusOK, code)

	// Somebody of the same family — even a caregiver of the owner's — gets 403 on every route, and the list is theirs alone.
	code, _ = e.do(t, e.caregiver, http.MethodGet, "/routines/"+id+windowQuery(), "")
	require.Equal(t, http.StatusForbidden, code)
	code, _ = e.do(t, e.caregiver, http.MethodPatch, "/routines/"+id+"/doses/"+dose, `{"taken":false}`)
	require.Equal(t, http.StatusForbidden, code)
	code, _ = e.do(t, e.caregiver, http.MethodPost, "/routines/"+id+"/pause", "")
	require.Equal(t, http.StatusForbidden, code)
	code, _ = e.do(t, e.caregiver, http.MethodGet, e.personalPath(e.accountID)+windowQuery(), "")
	require.Equal(t, http.StatusForbidden, code, "somebody else's account")

	code, list := e.do(t, e.caregiver, http.MethodGet, e.personalPath(e.careAccountID)+windowQuery(), "")
	require.Equal(t, http.StatusOK, code, list)
	require.Empty(t, list["routines"])
	code, list = e.do(t, e.owner, http.MethodGet, e.personalPath(e.accountID)+windowQuery(), "")
	require.Equal(t, http.StatusOK, code, list)
	require.Len(t, list["routines"], 1)
}

func (e *personalEnv) firstDose(t *testing.T, routineID string) (string, string) {
	t.Helper()
	var dose string
	require.NoError(t, e.pool.QueryRow(context.Background(), `SELECT id::text FROM supplement_doses WHERE routine_id = $1 ORDER BY scheduled_at LIMIT 1`, routineID).Scan(&dose))
	return routineID, dose
}

func TestPersonal_TheListIsOnlyThePersonsOwnNotTheChildrens(t *testing.T) {
	e := newPersonalEnv(t, account.PlanPaid)
	e.createRoutine(t) // the child's
	code, list := e.do(t, e.owner, http.MethodGet, e.personalPath(e.accountID)+windowQuery(), "")
	require.Equal(t, http.StatusOK, code, list)
	require.Empty(t, list["routines"])
	require.EqualValues(t, 0, list["activeCount"])
	require.EqualValues(t, 10, list["limit"])
	require.Equal(t, true, list["paidPlan"])
	require.Equal(t, false, list["noticeSeen"])

	e.createPersonal(t, e.owner, e.accountID, "Omega 3")
	code, list = e.do(t, e.owner, http.MethodGet, e.personalPath(e.accountID)+windowQuery(), "")
	require.Equal(t, http.StatusOK, code, list)
	require.Len(t, list["routines"], 1)
	require.EqualValues(t, 1, list["activeCount"])
	require.Equal(t, true, list["routines"].([]any)[0].(map[string]any)["myReminders"])

	// And the child's list never carries the person's own.
	code, kids := e.do(t, e.owner, http.MethodGet, "/children/"+e.childID.String()+"/routines"+windowQuery(), "")
	require.Equal(t, http.StatusOK, code, kids)
	require.Len(t, kids["routines"], 1)
}

func TestPersonal_ThePlanIsTheirOwnOrTheirPaidFamilys(t *testing.T) {
	// A free person who belongs to a paid family uses their own routines while that family pays.
	e := newPersonalEnv(t, account.PlanPaid)
	code, got := e.do(t, e.caregiver, http.MethodPost, e.personalPath(e.careAccountID), createBody("Magnesio"))
	require.Equal(t, http.StatusCreated, code, got)
	require.Equal(t, true, got["canEdit"])

	// The family stops paying: what exists stays visible and markable; creating is refused.
	e.setPlan(t, e.accountID, "free")
	code, list := e.do(t, e.caregiver, http.MethodGet, e.personalPath(e.careAccountID)+windowQuery(), "")
	require.Equal(t, http.StatusOK, code, list)
	require.Equal(t, false, list["paidPlan"])
	require.Len(t, list["routines"], 1)
	require.Equal(t, false, list["routines"].([]any)[0].(map[string]any)["canEdit"])
	code, got = e.do(t, e.caregiver, http.MethodPost, e.personalPath(e.careAccountID), createBody("Otra"))
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "supplements", got["reason"])

	// Stopping is never blocked; resuming needs the plan.
	id := list["routines"].([]any)[0].(map[string]any)["id"].(string)
	code, _ = e.do(t, e.caregiver, http.MethodPost, "/routines/"+id+"/pause", "")
	require.Equal(t, http.StatusOK, code)
	code, got = e.do(t, e.caregiver, http.MethodPost, "/routines/"+id+"/resume", `{"utcOffsetMinutes":0}`)
	require.Equal(t, http.StatusUnprocessableEntity, code, got)
	code, _ = e.do(t, e.caregiver, http.MethodPost, "/routines/"+id+"/finish", "")
	require.Equal(t, http.StatusOK, code)
}

func TestPersonal_AFreePersonWithNoPaidFamilyGets422(t *testing.T) {
	e := newPersonalEnv(t, account.PlanFree)
	code, got := e.do(t, e.owner, http.MethodPost, e.personalPath(e.accountID), createBody("Omega 3"))
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "freemium_consultation_limit_exceeded", got["error"])
	require.Equal(t, "supplements", got["reason"])
}

func TestPersonal_TheCapIsTheirOwnAndResumingCountsToo(t *testing.T) {
	e := newPersonalEnv(t, account.PlanPaid)
	for i := 0; i < supplement.MaxActivePerChild; i++ {
		e.createRoutine(t) // the child's cap is full and is not theirs
	}
	ids := make([]string, 0, supplement.MaxActivePerChild)
	for i := 0; i < supplement.MaxActivePerChild; i++ {
		ids = append(ids, e.createPersonal(t, e.owner, e.accountID, "Rutina"))
	}
	code, got := e.do(t, e.owner, http.MethodPost, e.personalPath(e.accountID), createBody("la once"))
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "routine_limit_exceeded", got["error"])
	require.EqualValues(t, 10, got["limit"])

	// Pausing one makes room for another; the paused one cannot come back while the ten are active.
	code, _ = e.do(t, e.owner, http.MethodPost, "/routines/"+ids[0]+"/pause", "")
	require.Equal(t, http.StatusOK, code)
	e.createPersonal(t, e.owner, e.accountID, "la once")
	code, got = e.do(t, e.owner, http.MethodPost, "/routines/"+ids[0]+"/resume", `{"utcOffsetMinutes":0}`)
	require.Equal(t, http.StatusUnprocessableEntity, code, got)
	require.Equal(t, "routine_limit_exceeded", got["error"])
}

func TestPersonal_TheFirstTimeNoticeIsKeptPerAccountAndIsIdempotent(t *testing.T) {
	e := newPersonalEnv(t, account.PlanPaid)
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, e.personalPath(e.accountID)+"/notice-seen", bytes.NewBufferString(""))
		req.Header.Set("Authorization", "Bearer "+e.verifier.Token(t, e.owner))
		rec := httptest.NewRecorder()
		e.router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusNoContent, rec.Code)
	}
	code, list := e.do(t, e.owner, http.MethodGet, e.personalPath(e.accountID)+windowQuery(), "")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, true, list["noticeSeen"])
	code, list = e.do(t, e.caregiver, http.MethodGet, e.personalPath(e.careAccountID)+windowQuery(), "")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, false, list["noticeSeen"], "each account has its own")
}

func TestPersonal_RequestErrorsAreTheContractsOwn(t *testing.T) {
	e := newPersonalEnv(t, account.PlanPaid)
	path := e.personalPath(e.accountID)

	code, got := e.do(t, e.owner, http.MethodPost, path, `{"name":"","period":"daily","times":[],"firstDate":"x"}`)
	require.Equal(t, http.StatusBadRequest, code)
	require.Equal(t, "validation_error", got["error"])
	code, _ = e.do(t, e.owner, http.MethodPost, path, `{not json`)
	require.Equal(t, http.StatusBadRequest, code)
	code, _ = e.do(t, e.owner, http.MethodGet, path, "")
	require.Equal(t, http.StatusBadRequest, code, "no window")
	code, _ = e.do(t, e.owner, http.MethodGet, path+"?from=2026-01-01T00:00:00Z&to=2026-01-09T00:00:00Z", "")
	require.Equal(t, http.StatusBadRequest, code, "a window longer than 48 hours")
	for _, method := range []string{http.MethodGet, http.MethodPost} {
		code, _ = e.do(t, e.owner, method, "/accounts/not-a-uuid/routines"+windowQuery(), "{}")
		require.Equal(t, http.StatusNotFound, code)
	}
	code, _ = e.do(t, e.owner, http.MethodPost, "/accounts/not-a-uuid/routines/notice-seen", "")
	require.Equal(t, http.StatusNotFound, code)
}

func TestPersonal_NothingOfTheRoutineReachesTheErrorLog(t *testing.T) {
	e := newPersonalEnv(t, account.PlanFree)
	e.do(t, e.owner, http.MethodPost, e.personalPath(e.accountID), `{"name":"Secreto de salud","period":"daily","times":["08:00"],"firstDate":"`+today()+`","utcOffsetMinutes":0}`)
	time.Sleep(200 * time.Millisecond)
	body, err := json.Marshal(e.log.all())
	require.NoError(t, err)
	require.NotContains(t, string(body), "Secreto de salud")
}

func TestPersonal_RepositoryAndServiceAnswerCleanlyForAnUnknownAccountAndAnUnavailableDatabase(t *testing.T) {
	pool := testPool(t)
	svc := newService(newRepo(pool))
	ctx := context.Background()
	unknown := uuid.New()
	in := supplement.Input{Name: "x", Period: "daily", Times: []string{"08:00"}, FirstDate: "2026-10-05"}

	_, _, err := svc.ListPersonal(ctx, unknown, supplement.KindSupplement, fixedNow, fixedNow.Add(time.Hour))
	require.ErrorIs(t, err, supplement.ErrAccountNotFound)
	_, err = svc.CreatePersonal(ctx, unknown, in)
	require.ErrorIs(t, err, supplement.ErrAccountNotFound)
	_, _, err = svc.ListPersonal(ctx, unknown, supplement.KindSupplement, fixedNow, fixedNow)
	var verrs supplement.ValidationErrors
	require.ErrorAs(t, err, &verrs, "an empty window is refused before asking")

	down := newService(newRepo(closedSupplementPool(t, nil)))
	_, _, err = down.ListPersonal(ctx, unknown, supplement.KindSupplement, fixedNow, fixedNow.Add(time.Hour))
	require.Error(t, err)
	require.NotErrorIs(t, err, supplement.ErrAccountNotFound)
	_, err = down.CreatePersonal(ctx, unknown, in)
	require.Error(t, err)
	require.Error(t, down.AcknowledgeNotice(ctx, unknown))
	_, err = newRepo(closedSupplementPool(t, nil)).NoticeSeen(ctx, unknown)
	require.Error(t, err)
}
