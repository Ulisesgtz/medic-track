package supplement_test

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/supplement"
)

// specs/035: an activity is done «from one hour to another, every so often»; «Realizado» marks the earliest unmarked dose of
// the day, and supplements and activities are listed and capped apart.

func activityBody(name, start, end string, every int) string {
	return fmt.Sprintf(`{"kind":"activity","name":%q,"note":"","period":"window","windowStart":%q,"windowEnd":%q,"intervalMinutes":%d,"weekdays":[],"firstDate":%q,"utcOffsetMinutes":0}`,
		name, start, end, every, today())
}

func dayBody() string {
	from := time.Now().UTC().Truncate(24 * time.Hour)
	return fmt.Sprintf(`{"from":%q,"to":%q}`, from.Format(time.RFC3339), from.Add(24*time.Hour).Format(time.RFC3339))
}

func (e *env) createActivity(t *testing.T, name, start, end string, every int) string {
	t.Helper()
	code, got := e.do(t, e.owner, http.MethodPost, "/children/"+e.childID.String()+"/routines", activityBody(name, start, end, every))
	require.Equal(t, http.StatusCreated, code, got)
	return got["id"].(string)
}

func TestActivity_IsCreatedWithItsWholeDayAndListedApartFromSupplements(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	supp := e.createRoutine(t)
	code, got := e.do(t, e.owner, http.MethodPost, "/children/"+e.childID.String()+"/routines", activityBody("Tomar agua", "00:00", "23:00", 60))
	require.Equal(t, http.StatusCreated, code, got)
	require.Equal(t, "activity", got["kind"])
	require.Equal(t, "window", got["period"])
	require.Equal(t, "00:00", got["windowStart"])
	require.Equal(t, "23:00", got["windowEnd"])
	require.EqualValues(t, 60, got["intervalMinutes"])
	require.Len(t, got["doses"], 24, "one an hour for the whole day")
	act := got["id"].(string)

	code, list := e.do(t, e.owner, http.MethodGet, "/children/"+e.childID.String()+"/routines"+windowQuery()+"&kind=activity", "")
	require.Equal(t, http.StatusOK, code, list)
	routines := list["routines"].([]any)
	require.Len(t, routines, 1)
	require.Equal(t, act, routines[0].(map[string]any)["id"])

	code, list = e.do(t, e.owner, http.MethodGet, "/children/"+e.childID.String()+"/routines"+windowQuery(), "")
	require.Equal(t, http.StatusOK, code, list)
	routines = list["routines"].([]any)
	require.Len(t, routines, 1, "the default is supplements")
	require.Equal(t, supp, routines[0].(map[string]any)["id"])

	code, bad := e.do(t, e.owner, http.MethodGet, "/children/"+e.childID.String()+"/routines"+windowQuery()+"&kind=rutina", "")
	require.Equal(t, http.StatusBadRequest, code, bad)
}

func TestActivity_TheCapOfTenIsPerKind(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	for i := 0; i < supplement.MaxActivePerChild; i++ {
		e.createActivity(t, fmt.Sprintf("Actividad %d", i), "08:00", "09:00", 30)
	}
	code, got := e.do(t, e.owner, http.MethodPost, "/children/"+e.childID.String()+"/routines", activityBody("Una más", "08:00", "09:00", 30))
	require.Equal(t, http.StatusUnprocessableEntity, code, got)
	require.Equal(t, "routine_limit_exceeded", got["error"])

	e.createRoutine(t) // supplements are counted apart
}

func TestActivity_InvalidWindowsAreRefusedWithTheirField(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	path := "/children/" + e.childID.String() + "/routines"
	for field, body := range map[string]string{
		"windowEnd":       activityBody("x", "10:00", "09:00", 30),
		"intervalMinutes": activityBody("x", "08:00", "09:00", 3),
		"period":          fmt.Sprintf(`{"kind":"activity","name":"x","period":"interval","firstDate":%q}`, today()),
	} {
		code, got := e.do(t, e.owner, http.MethodPost, path, body)
		require.Equal(t, http.StatusBadRequest, code, got)
		require.Contains(t, fmt.Sprint(got["details"]), field)
	}
}

func TestActivity_EditKeepsItsKindWhateverTheBodySays(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	id := e.createActivity(t, "Tomar agua", "08:00", "10:00", 60)

	// A body of fixed hours makes it an activity at fixed hours — never a supplement: the kind is fixed when it is created.
	code, got := e.do(t, e.owner, http.MethodPatch, "/routines/"+id, createBody("Tomar agua"))
	require.Equal(t, http.StatusOK, code, got)
	require.Equal(t, "activity", got["kind"])
	require.Equal(t, "daily", got["period"])
	require.Nil(t, got["windowStart"])

	code, got = e.do(t, e.owner, http.MethodPatch, "/routines/"+id, activityBody("Tomar mucha agua", "09:00", "11:00", 30))
	require.Equal(t, http.StatusOK, code, got)
	require.Equal(t, "activity", got["kind"])
	require.Equal(t, "Tomar mucha agua", got["name"])
	require.Equal(t, "09:00", got["windowStart"])
	require.EqualValues(t, 30, got["intervalMinutes"])

	code, _ = e.do(t, e.owner, http.MethodPatch, "/routines/"+uuid.NewString(), activityBody("x", "09:00", "11:00", 30))
	require.Equal(t, http.StatusForbidden, code)
}

func TestMarkRoutineDone_MarksTheEarliestUnmarkedOneEachTimeAndRecordsWho(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	id := e.createActivity(t, "Tomar agua", "08:00", "09:00", 30) // 08:00, 08:30, 09:00

	code, first := e.do(t, e.owner, http.MethodPost, "/routines/"+id+"/done", dayBody())
	require.Equal(t, http.StatusOK, code, first)
	require.Equal(t, true, first["taken"])
	require.Contains(t, first["scheduledAt"], "T08:00:00Z")
	require.Equal(t, "Ana", first["takenBy"].(map[string]any)["name"])
	require.Equal(t, true, first["takenBy"].(map[string]any)["mine"])

	// A Caregiver (see and mark) taps next: the next dose, theirs.
	code, second := e.do(t, e.caregiver, http.MethodPost, "/routines/"+id+"/done", dayBody())
	require.Equal(t, http.StatusOK, code, second)
	require.Contains(t, second["scheduledAt"], "T08:30:00Z")
	require.Equal(t, "Cuidadora", second["takenBy"].(map[string]any)["name"])

	code, third := e.do(t, e.owner, http.MethodPost, "/routines/"+id+"/done", dayBody())
	require.Equal(t, http.StatusOK, code, third)
	require.Contains(t, third["scheduledAt"], "T09:00:00Z")

	code, none := e.do(t, e.owner, http.MethodPost, "/routines/"+id+"/done", dayBody())
	require.Equal(t, http.StatusConflict, code, none)
	require.Equal(t, "nothing_to_mark", none["error"])
}

func TestMarkRoutineDone_NeverDependsOnThePlanAndIsOnlyForActiveActivities(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	act := e.createActivity(t, "Tomar agua", "08:00", "09:00", 30)
	supp := e.createRoutine(t)

	code, got := e.do(t, e.owner, http.MethodPost, "/routines/"+supp+"/done", dayBody())
	require.Equal(t, http.StatusConflict, code, got)
	require.Equal(t, "nothing_to_mark", got["error"], "a supplement is marked dose by dose")

	_, err := e.pool.Exec(context.Background(), `UPDATE accounts SET plan = 'free' WHERE id = $1`, e.accountID)
	require.NoError(t, err)
	code, got = e.do(t, e.caregiver, http.MethodPost, "/routines/"+act+"/done", dayBody())
	require.Equal(t, http.StatusOK, code, "a lapsed plan still lets «Realizado» through: %v", got)

	code, got = e.do(t, e.owner, http.MethodPost, "/routines/"+act+"/pause", "")
	require.Equal(t, http.StatusOK, code, got)
	code, got = e.do(t, e.owner, http.MethodPost, "/routines/"+act+"/done", dayBody())
	require.Equal(t, http.StatusConflict, code, "a paused activity can't be marked: %v", got)
}

func TestMarkRoutineDone_RequestErrors(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	id := e.createActivity(t, "Tomar agua", "08:00", "09:00", 30)

	code, got := e.do(t, e.owner, http.MethodPost, "/routines/"+id+"/done", `{"from":"ayer"}`)
	require.Equal(t, http.StatusBadRequest, code, got)
	code, got = e.do(t, e.owner, http.MethodPost, "/routines/"+id+"/done", `no json`)
	require.Equal(t, http.StatusBadRequest, code, got)
	from := time.Now().UTC().Truncate(24 * time.Hour)
	code, got = e.do(t, e.owner, http.MethodPost, "/routines/"+id+"/done",
		fmt.Sprintf(`{"from":%q,"to":%q}`, from.Format(time.RFC3339), from.Add(72*time.Hour).Format(time.RFC3339)))
	require.Equal(t, http.StatusBadRequest, code, "a window of more than 48 hours: %v", got)
	code, _ = e.do(t, e.owner, http.MethodPost, "/routines/no-es-uuid/done", dayBody())
	require.Equal(t, http.StatusNotFound, code)
	code, _ = e.do(t, "", http.MethodPost, "/routines/"+id+"/done", dayBody())
	require.Equal(t, http.StatusUnauthorized, code)
}

func TestMarkNext_TwoPeopleAtOnceMarkTwoDifferentDoses(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	id, err := repo.Create(ctx, f.childID, supplement.Routine{Kind: supplement.KindActivity, Name: "Estirar", Period: supplement.PeriodWindow,
		WindowStart: "08:00", WindowEnd: "08:10", IntervalMinutes: 5, FirstDate: "2026-10-05"}, f.accountID) // 08:00, 08:05, 08:10
	require.NoError(t, err)

	day := time.Date(2026, 10, 5, 0, 0, 0, 0, time.UTC)
	var wg sync.WaitGroup
	results := make([]*supplement.Dose, 3)
	errs := make([]error, 3)
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i], errs[i] = repo.MarkNext(ctx, id, day, day.Add(24*time.Hour), supplement.Actor{AccountID: f.accountID, Full: true})
		}(i)
	}
	wg.Wait()
	seen := map[uuid.UUID]bool{}
	for i := range results {
		require.NoError(t, errs[i])
		seen[results[i].ID] = true
	}
	require.Len(t, seen, 3, "three taps, three different doses")
	_, err = repo.MarkNext(ctx, id, day, day.Add(24*time.Hour), supplement.Actor{AccountID: f.accountID, Full: true})
	require.ErrorIs(t, err, supplement.ErrNothingToMark)

	// Only the window asked for counts.
	other, err := repo.Create(ctx, f.childID, supplement.Routine{Kind: supplement.KindActivity, Name: "Caminar", Period: supplement.PeriodWindow,
		WindowStart: "08:00", WindowEnd: "08:10", IntervalMinutes: 5, FirstDate: "2026-10-05"}, f.accountID)
	require.NoError(t, err)
	_, err = repo.MarkNext(ctx, other, day.AddDate(0, 0, 30), day.AddDate(0, 0, 31), supplement.Actor{AccountID: f.accountID})
	require.ErrorIs(t, err, supplement.ErrNothingToMark)
}

func TestKindOf_AndParseKind(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	supp, err := repo.Create(ctx, f.childID, daily("Zinc"), f.accountID)
	require.NoError(t, err)
	kind, err := repo.KindOf(ctx, supp)
	require.NoError(t, err)
	require.Equal(t, supplement.KindSupplement, kind)
	_, err = repo.KindOf(ctx, uuid.New())
	require.ErrorIs(t, err, supplement.ErrRoutineNotFound)
	_, err = newRepo(closedSupplementPool(t, pool)).KindOf(ctx, supp)
	require.Error(t, err)

	for in, want := range map[string]supplement.Kind{"": supplement.KindSupplement, "supplement": supplement.KindSupplement, "activity": supplement.KindActivity} {
		got, err := supplement.ParseKind(in)
		require.NoError(t, err)
		require.Equal(t, want, got)
	}
	_, err = supplement.ParseKind("rutina")
	require.Error(t, err)
}

func TestMarkNext_DatabaseDown(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(closedSupplementPool(t, pool))
	day := time.Date(2026, 10, 5, 0, 0, 0, 0, time.UTC)
	_, err := repo.MarkNext(context.Background(), uuid.New(), day, day.Add(24*time.Hour), supplement.Actor{})
	require.Error(t, err)
	require.NotErrorIs(t, err, supplement.ErrNothingToMark)
}

func TestPersonalActivities_AreCappedAndListedApartFromPersonalSupplements(t *testing.T) {
	pe := newPersonalEnv(t, account.PlanPaid)
	path := "/accounts/" + pe.accountID.String() + "/routines"
	for i := 0; i < supplement.MaxActivePerChild; i++ {
		code, got := pe.do(t, pe.owner, http.MethodPost, path, activityBody(fmt.Sprintf("Mía %d", i), "08:00", "09:00", 30))
		require.Equal(t, http.StatusCreated, code, got)
	}
	code, got := pe.do(t, pe.owner, http.MethodPost, path, activityBody("Una más", "08:00", "09:00", 30))
	require.Equal(t, http.StatusUnprocessableEntity, code, got)
	require.Equal(t, "routine_limit_exceeded", got["error"])

	code, got = pe.do(t, pe.owner, http.MethodPost, path, createBody("Zinc propio"))
	require.Equal(t, http.StatusCreated, code, "personal supplements are counted apart: %v", got)

	code, list := pe.do(t, pe.owner, http.MethodGet, path+windowQuery()+"&kind=activity", "")
	require.Equal(t, http.StatusOK, code, list)
	require.Len(t, list["routines"], supplement.MaxActivePerChild)
	code, list = pe.do(t, pe.owner, http.MethodGet, path+windowQuery(), "")
	require.Equal(t, http.StatusOK, code, list)
	require.Len(t, list["routines"], 1)
	code, _ = pe.do(t, pe.owner, http.MethodGet, path+windowQuery()+"&kind=nope", "")
	require.Equal(t, http.StatusBadRequest, code)
}

func TestActivity_AtFixedHoursIsCreatedAndMarkedWithRealizado(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	body := fmt.Sprintf(`{"kind":"activity","name":"Práctica de fut","note":"","period":"daily","times":["00:00","23:30"],"weekdays":[],"firstDate":%q,"utcOffsetMinutes":0}`, today())
	code, got := e.do(t, e.owner, http.MethodPost, "/children/"+e.childID.String()+"/routines", body)
	require.Equal(t, http.StatusCreated, code, got)
	require.Equal(t, "activity", got["kind"])
	require.Equal(t, "daily", got["period"])
	require.Equal(t, []any{"00:00", "23:30"}, got["times"])
	require.Nil(t, got["windowStart"])
	require.Len(t, got["doses"], 2)

	code, first := e.do(t, e.owner, http.MethodPost, "/routines/"+got["id"].(string)+"/done", dayBody())
	require.Equal(t, http.StatusOK, code, first)
	require.Contains(t, first["scheduledAt"], "T00:00:00Z")

	// A supplement can't be a window, and an activity can be neither «cada N horas» nor hourless.
	bad := fmt.Sprintf(`{"kind":"activity","name":"x","period":"daily","times":[],"firstDate":%q}`, today())
	code, _ = e.do(t, e.owner, http.MethodPost, "/children/"+e.childID.String()+"/routines", bad)
	require.Equal(t, http.StatusBadRequest, code)
}
