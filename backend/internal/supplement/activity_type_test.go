package supplement_test

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/supplement"
)

// specs/075: every activity has a type from the catalog; a supplement has none; changing the type never needs the plan.

func activityBodyOfType(typeJSON string) string {
	return fmt.Sprintf(`{"kind":"activity"%s,"name":"Fut","note":"","period":"daily","times":["17:00"],"weekdays":[],"firstDate":%q,"utcOffsetMinutes":0}`, typeJSON, today())
}

func fieldError(t *testing.T, got map[string]any, field, message string) {
	t.Helper()
	details, _ := got["details"].([]any)
	for _, d := range details {
		m := d.(map[string]any)
		if m["field"] == field && m["message"] == message {
			return
		}
	}
	require.Failf(t, "field error not found", "%s %s in %v", field, message, got)
}

func TestActivityType_CreateRequiresItAndAChildsSupplementRefusesIt(t *testing.T) {
	e := newPersonalEnv(t, account.PlanPaid)
	path := "/children/" + e.childID.String() + "/routines"

	code, got := e.do(t, e.owner, http.MethodPost, path, activityBodyOfType(""))
	require.Equal(t, http.StatusBadRequest, code, got)
	fieldError(t, got, "activityType", "required")

	code, got = e.do(t, e.owner, http.MethodPost, path, activityBodyOfType(`,"activityType":"nope"`))
	require.Equal(t, http.StatusBadRequest, code, got)
	fieldError(t, got, "activityType", "invalid")

	code, got = e.do(t, e.owner, http.MethodPost, path, `{"kind":"supplement","activityType":"sports","name":"Vit","period":"daily","times":["08:00"],"firstDate":"`+today()+`"}`)
	require.Equal(t, http.StatusBadRequest, code, got)
	fieldError(t, got, "activityType", "not_allowed")

	code, got = e.do(t, e.owner, http.MethodPost, path, activityBodyOfType(`,"activityType":"arts"`))
	require.Equal(t, http.StatusCreated, code, got)
	require.Equal(t, "arts", got["activityType"])

	code, got = e.do(t, e.owner, http.MethodPost, path, createBody("Vitamina D"))
	require.Equal(t, http.StatusCreated, code, got)
	require.Nil(t, got["activityType"], "a supplement has no type")
	require.Contains(t, got, "activityType")
}

func TestActivityType_PersonalActivitiesNeedItToo(t *testing.T) {
	e := newPersonalEnv(t, account.PlanPaid)
	path := e.personalPath(e.accountID)
	code, got := e.do(t, e.owner, http.MethodPost, path, activityBodyOfType(""))
	require.Equal(t, http.StatusBadRequest, code, got)
	fieldError(t, got, "activityType", "required")

	code, got = e.do(t, e.owner, http.MethodPost, path, activityBodyOfType(`,"activityType":"therapy"`))
	require.Equal(t, http.StatusCreated, code, got)
	require.Equal(t, "therapy", got["activityType"])

	code, list := e.do(t, e.owner, http.MethodGet, path+windowQuery()+"&kind=activity", "")
	require.Equal(t, http.StatusOK, code, list)
	require.Equal(t, "therapy", list["routines"].([]any)[0].(map[string]any)["activityType"])
}

func TestActivityType_ARetiredTypeIsNotOfferedButOneThatAlreadyHasItIsKept(t *testing.T) {
	e := newPersonalEnv(t, account.PlanPaid)
	code := "test_retired_" + uuid.NewString()[:8]
	_, err := e.pool.Exec(context.Background(), `INSERT INTO activity_types (code, name, sort_order, active) VALUES ($1, 'Retirada', 2000000000 - floor(random()*1000000)::int, true)`, code)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = e.pool.Exec(context.Background(), `DELETE FROM supplement_routines WHERE activity_type = $1`, code)
		_, _ = e.pool.Exec(context.Background(), `DELETE FROM activity_types WHERE code = $1`, code)
	})
	path := "/children/" + e.childID.String() + "/routines"
	status, got := e.do(t, e.owner, http.MethodPost, path, activityBodyOfType(`,"activityType":"`+code+`"`))
	require.Equal(t, http.StatusCreated, status, got)
	id := got["id"].(string)

	_, err = e.pool.Exec(context.Background(), `UPDATE activity_types SET active = false WHERE code = $1`, code)
	require.NoError(t, err)

	status, got = e.do(t, e.owner, http.MethodPost, path, activityBodyOfType(`,"activityType":"`+code+`"`))
	require.Equal(t, http.StatusBadRequest, status, got)
	fieldError(t, got, "activityType", "invalid")

	// Edit: the saved retired type may come back unchanged; leaving it out keeps it; an unknown one is refused.
	status, got = e.do(t, e.owner, http.MethodPatch, "/routines/"+id, activityBodyOfType(`,"activityType":"`+code+`"`))
	require.Equal(t, http.StatusOK, status, got)
	status, got = e.do(t, e.owner, http.MethodPatch, "/routines/"+id, activityBodyOfType(""))
	require.Equal(t, http.StatusOK, status, got)
	require.Equal(t, code, got["activityType"])
	status, got = e.do(t, e.owner, http.MethodPatch, "/routines/"+id, activityBodyOfType(`,"activityType":"nope"`))
	require.Equal(t, http.StatusBadRequest, status, got)

	// The change route accepts the one it already has (idempotent) but not a retired one it does not have.
	status, got = e.do(t, e.owner, http.MethodPut, "/routines/"+id+"/activity-type", `{"activityType":"`+code+`"}`)
	require.Equal(t, http.StatusOK, status, got)
	status, got = e.do(t, e.owner, http.MethodPut, "/routines/"+id+"/activity-type", `{"activityType":"sports"}`)
	require.Equal(t, http.StatusOK, status, got)
	status, got = e.do(t, e.owner, http.MethodPut, "/routines/"+id+"/activity-type", `{"activityType":"`+code+`"}`)
	require.Equal(t, http.StatusBadRequest, status, got)
}

func TestActivityType_EditChangesItWithTheScheduleAndKeepsItWhenLeftOut(t *testing.T) {
	e := newPersonalEnv(t, account.PlanPaid)
	status, got := e.do(t, e.owner, http.MethodPost, "/children/"+e.childID.String()+"/routines", activityBodyOfType(`,"activityType":"school"`))
	require.Equal(t, http.StatusCreated, status, got)
	id := got["id"].(string)

	status, got = e.do(t, e.owner, http.MethodPatch, "/routines/"+id, activityBodyOfType(`,"activityType":"sports"`))
	require.Equal(t, http.StatusOK, status, got)
	require.Equal(t, "sports", got["activityType"])
	status, got = e.do(t, e.owner, http.MethodPatch, "/routines/"+id, activityBodyOfType(`,"activityType":null`))
	require.Equal(t, http.StatusOK, status, got)
	require.Equal(t, "sports", got["activityType"], "null keeps the saved type")

	routine := e.createRoutine(t)
	status, got = e.do(t, e.owner, http.MethodPatch, "/routines/"+routine, `{"name":"x","period":"daily","times":["08:00"],"firstDate":"`+today()+`","activityType":"sports"}`)
	require.Equal(t, http.StatusBadRequest, status, got)
	fieldError(t, got, "activityType", "not_allowed")
}

func (e *personalEnv) doseSnapshot(t *testing.T, routineID string) string {
	t.Helper()
	var out string
	require.NoError(t, e.pool.QueryRow(context.Background(), `
		SELECT coalesce(string_agg(scheduled_at::text || taken::text || coalesce(taken_by_account_id::text, ''), ',' ORDER BY scheduled_at), '')
		FROM supplement_doses WHERE routine_id = $1`, routineID).Scan(&out))
	return out
}

func TestActivityType_ChangeNeedsNoPlanAndWorksInAnyStateWithoutTouchingTheRest(t *testing.T) {
	e := newPersonalEnv(t, account.PlanPaid)
	status, got := e.do(t, e.owner, http.MethodPost, "/children/"+e.childID.String()+"/routines", activityBodyOfType(`,"activityType":"school"`))
	require.Equal(t, http.StatusCreated, status, got)
	id := got["id"].(string)
	path := "/routines/" + id + "/activity-type"

	// Mark a dose so there is something that must stay.
	_, dose := e.firstDose(t, id)
	status, got = e.do(t, e.owner, http.MethodPatch, "/routines/"+id+"/doses/"+dose, `{"taken":true}`)
	require.Equal(t, http.StatusOK, status, got)
	before := e.doseSnapshot(t, id)

	_, err := e.pool.Exec(context.Background(), `UPDATE accounts SET plan = 'free' WHERE id = $1`, e.accountID)
	require.NoError(t, err)

	status, got = e.do(t, e.owner, http.MethodPut, path, `{"activityType":"arts"}`)
	require.Equal(t, http.StatusOK, status, "an expired plan does not stop it: "+fmt.Sprint(got))
	require.Equal(t, "arts", got["activityType"])
	require.Equal(t, before, e.doseSnapshot(t, id), "doses, marks and reminders stay as they were")

	status, _ = e.do(t, e.owner, http.MethodPost, "/routines/"+id+"/pause", "")
	require.Equal(t, http.StatusOK, status)
	status, got = e.do(t, e.owner, http.MethodPut, path, `{"activityType":"therapy"}`)
	require.Equal(t, http.StatusOK, status, got)
	require.Equal(t, "therapy", got["activityType"])

	status, _ = e.do(t, e.owner, http.MethodPost, "/routines/"+id+"/finish", "")
	require.Equal(t, http.StatusOK, status)
	status, got = e.do(t, e.owner, http.MethodPut, path, `{"activityType":"other"}`)
	require.Equal(t, http.StatusOK, status, got)
	require.Equal(t, "other", got["activityType"])
	require.Equal(t, "ended", got["status"])

	status, got = e.do(t, e.owner, http.MethodPut, path, `{"activityType":""}`)
	require.Equal(t, http.StatusBadRequest, status, got)
	fieldError(t, got, "activityType", "required")
	status, got = e.do(t, e.owner, http.MethodPut, path, `{"activityType":"nope"}`)
	require.Equal(t, http.StatusBadRequest, status, got)
	fieldError(t, got, "activityType", "invalid")
	status, _ = e.do(t, e.owner, http.MethodPut, path, `nope`)
	require.Equal(t, http.StatusBadRequest, status)
	status, _ = e.do(t, e.owner, http.MethodPut, "/routines/not-a-uuid/activity-type", `{}`)
	require.Equal(t, http.StatusNotFound, status)
}

func TestActivityType_ASupplementHasNoTypeToChangeAndACaregiverCannotChangeOne(t *testing.T) {
	e := newPersonalEnv(t, account.PlanPaid)
	supp := e.createRoutine(t)
	status, got := e.do(t, e.owner, http.MethodPut, "/routines/"+supp+"/activity-type", `{"activityType":"sports"}`)
	require.Equal(t, http.StatusBadRequest, status, got)
	fieldError(t, got, "activityType", "not_allowed")

	status, got = e.do(t, e.owner, http.MethodPost, "/children/"+e.childID.String()+"/routines", activityBodyOfType(`,"activityType":"school"`))
	require.Equal(t, http.StatusCreated, status, got)
	status, got = e.do(t, e.caregiver, http.MethodPut, "/routines/"+got["id"].(string)+"/activity-type", `{"activityType":"arts"}`)
	require.Equal(t, http.StatusForbidden, status, got)

	status, got = e.do(t, e.owner, http.MethodPut, "/routines/"+uuid.NewString()+"/activity-type", `{"activityType":"arts"}`)
	require.Equal(t, http.StatusForbidden, status, got, "an unknown routine is the same 403 as somebody else's")
}

func TestActivityType_RepositoryErrorsAndTheUnavailableDatabase(t *testing.T) {
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanPaid)
	repo := newRepo(pool)
	ctx := context.Background()
	_, err := repo.SetActivityType(ctx, uuid.New(), "arts")
	require.ErrorIs(t, err, supplement.ErrRoutineNotFound)

	id, err := repo.Create(ctx, f.childID, supplement.Routine{Kind: supplement.KindActivity, ActivityType: activityTypeHabits(), Name: "Fut", Period: supplement.PeriodDaily, Times: []string{"17:00"}, FirstDate: "2026-10-05"}, f.accountID)
	require.NoError(t, err)
	offset, err := repo.SetActivityType(ctx, id, "arts")
	require.NoError(t, err)
	require.Zero(t, offset)

	missing := "nope"
	_, err = repo.Create(ctx, f.childID, supplement.Routine{Kind: supplement.KindActivity, ActivityType: &missing, Name: "Fut", Period: supplement.PeriodDaily, Times: []string{"17:00"}, FirstDate: "2026-10-05"}, f.accountID)
	require.Error(t, err)
	_, err = repo.SetActivityType(ctx, id, "nope")
	require.Error(t, err)

	closed := supplement.NewRepository(closedSupplementPool(t, pool))
	_, err = closed.SetActivityType(ctx, id, "arts")
	require.Error(t, err)
}

// The migration (specs/075): an activity with no type or a supplement with one breaks the CHECK, and a type in use can't be deleted.
func TestActivityType_TheDatabaseKeepsTheRules(t *testing.T) {
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	insert := func(kind, activityType string) error {
		_, err := pool.Exec(ctx, `
			INSERT INTO supplement_routines (account_id, child_id, kind, name, period, times, first_date, utc_offset_minutes, generated_until, created_by_account_id, activity_type)
			VALUES ($1, $2, $3, 'x', 'daily', '{08:00}', current_date, 0, now(), $1, NULLIF($4, ''))`, f.accountID, f.childID, kind, activityType)
		return err
	}
	require.Error(t, insert("activity", ""), "an activity with no type")
	require.Error(t, insert("supplement", "sports"), "a supplement with a type")
	require.Error(t, insert("activity", "nope"), "a type outside the catalog")
	require.NoError(t, insert("activity", "sports"))
	require.NoError(t, insert("supplement", ""))

	_, err := pool.Exec(ctx, `DELETE FROM activity_types WHERE code = 'sports'`)
	require.Error(t, err, "a type in use is retired, never deleted")

	var n int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM supplement_routines WHERE kind = 'activity' AND activity_type IS NULL`).Scan(&n))
	require.Zero(t, n, "the migration gave every existing activity a type")
}

// Changing the type locks only the routine: it does not wait for somebody holding the owner account row (a creation, an edit).
func TestActivityType_DoesNotWaitForTheAccountLock(t *testing.T) {
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanPaid)
	repo := newRepo(pool)
	ctx := context.Background()
	id, err := repo.Create(ctx, f.childID, supplement.Routine{Kind: supplement.KindActivity, ActivityType: activityTypeHabits(), Name: "Fut", Period: supplement.PeriodDaily, Times: []string{"17:00"}, FirstDate: "2026-10-05"}, f.accountID)
	require.NoError(t, err)

	holder, err := pool.Begin(ctx)
	require.NoError(t, err)
	t.Cleanup(func() { _ = holder.Rollback(context.Background()) })
	_, err = holder.Exec(ctx, `SELECT 1 FROM accounts WHERE id = $1 FOR UPDATE`, f.accountID)
	require.NoError(t, err)

	short, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	_, err = repo.SetActivityType(short, id, "arts")
	require.NoError(t, err, "it must not block on the account row")
}
