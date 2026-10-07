package supplement_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/supplement"
)

func TestCreate_SavesTheRoutineAndGeneratesItsFirstFortnight(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()

	id, err := repo.Create(ctx, f.childID, daily("Vitamina D"), f.accountID)
	require.NoError(t, err)

	// 08:00 from Oct 5 to Oct 19 (the clock is Oct 5 15:00; the horizon ends Oct 19 15:00): 15 doses.
	require.Equal(t, 15, countDoses(t, pool, id))

	got, err := repo.Get(ctx, id, fixedNow.Add(-15*time.Hour), fixedNow.Add(9*time.Hour))
	require.NoError(t, err)
	require.Equal(t, "Vitamina D", got.Name)
	require.Equal(t, supplement.StatusActive, got.Status)
	require.Equal(t, []string{"08:00"}, got.Times)
	require.Equal(t, "2026-10-05", got.FirstDate)
	require.Equal(t, "Ana", got.CreatedBy)
	require.True(t, got.PaidPlan)
	require.Len(t, got.Doses, 1)
	require.Equal(t, supplement.DoseDue, got.Doses[0].Status, "08:00 already came and the next one is tomorrow")
	require.Equal(t, 15, got.Progress.Total)
	require.Equal(t, 1, got.Progress.Elapsed)
	require.Equal(t, 0, got.Progress.Taken)
}

func TestCreate_EachPeriodKeepsItsOwnFields(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	wide := fixedNow.AddDate(0, 0, 30)

	weekdays := supplement.Routine{Name: "Lun y mie", Period: supplement.PeriodWeekdays, Times: []string{"09:00", "21:00"}, Weekdays: []int{0, 2}, FirstDate: "2026-10-05", Note: "con comida"}
	id, err := repo.Create(ctx, f.childID, weekdays, f.accountID)
	require.NoError(t, err)
	got, err := repo.Get(ctx, id, fixedNow.AddDate(0, 0, -1), wide)
	require.NoError(t, err)
	require.Equal(t, []int{0, 2}, got.Weekdays)
	require.Equal(t, []string{"09:00", "21:00"}, got.Times)
	require.Equal(t, "con comida", got.Note)
	require.Equal(t, 0, got.IntervalHours)

	interval := supplement.Routine{Name: "Cada 8", Period: supplement.PeriodInterval, IntervalHours: 8, FirstTime: "06:00", FirstDate: "2026-10-05", EndDate: "2026-10-06", UtcOffsetMinutes: -360}
	id, err = repo.Create(ctx, f.childID, interval, f.accountID)
	require.NoError(t, err)
	got, err = repo.Get(ctx, id, fixedNow.AddDate(0, 0, -1), wide)
	require.NoError(t, err)
	require.Equal(t, 8, got.IntervalHours)
	require.Equal(t, "06:00", got.FirstTime)
	require.Equal(t, "2026-10-06", got.EndDate)
	require.Equal(t, -360, got.UtcOffsetMinutes)
	require.Empty(t, got.Times)
	// Local 06:00 on Oct 5 is 12:00 UTC; every 8 hours until the end of local Oct 6 (06:00 UTC on Oct 7): 6 doses.
	require.Equal(t, 6, got.Progress.Total)
}

func TestCreate_AFreeAccountIsRefusedAndNothingIsWritten(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanFree)

	_, err := repo.Create(context.Background(), f.childID, daily("Vitamina D"), f.accountID)
	var planErr *supplement.PlanLimitError
	require.ErrorAs(t, err, &planErr)
	require.Equal(t, supplement.PlanLimitSupplements, planErr.Reason)
	require.ErrorIs(t, err, supplement.ErrPlanRequired)

	var n int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM supplement_routines WHERE child_id = $1`, f.childID).Scan(&n))
	require.Zero(t, n)
}

func TestCreate_UnknownChild(t *testing.T) {
	pool := testPool(t)
	_, err := newRepo(pool).Create(context.Background(), uuid.New(), daily("x"), uuid.New())
	require.ErrorIs(t, err, supplement.ErrChildNotFound)
}

func TestCreate_TheTenthIsTheLastActiveOnePausedOnesDoNotCount(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()

	var first uuid.UUID
	for i := 0; i < supplement.MaxActivePerChild; i++ {
		id, err := repo.Create(ctx, f.childID, daily("R"), f.accountID)
		require.NoError(t, err)
		if i == 0 {
			first = id
		}
	}
	_, err := repo.Create(ctx, f.childID, daily("la once"), f.accountID)
	var limitErr *supplement.RoutineLimitError
	require.ErrorAs(t, err, &limitErr)
	require.Equal(t, 10, limitErr.Limit)
	require.ErrorIs(t, err, supplement.ErrRoutineLimit)

	_, err = pool.Exec(ctx, `UPDATE supplement_routines SET status = 'paused', paused_at = now() WHERE id = $1`, first)
	require.NoError(t, err)
	_, err = repo.Create(ctx, f.childID, daily("ahora si"), f.accountID)
	require.NoError(t, err)

	// Another child of another account has its own count.
	other := newFamily(t, pool, account.PlanPaid)
	_, err = repo.Create(ctx, other.childID, daily("otra"), other.accountID)
	require.NoError(t, err)
}

// Several creations at once with a single place left: the lock on the account lets exactly one in.
func TestCreate_TheCapHoldsUnderConcurrency(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	for i := 0; i < supplement.MaxActivePerChild-1; i++ {
		_, err := repo.Create(ctx, f.childID, daily("R"), f.accountID)
		require.NoError(t, err)
	}

	const attempts = 6
	var wg sync.WaitGroup
	results := make([]error, attempts)
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, results[i] = repo.Create(ctx, f.childID, daily("carrera"), f.accountID)
		}()
	}
	wg.Wait()
	ok := 0
	for _, err := range results {
		if err == nil {
			ok++
			continue
		}
		require.True(t, errors.Is(err, supplement.ErrRoutineLimit), "unexpected: %v", err)
	}
	require.Equal(t, 1, ok)
}

func TestUpdateDoseStatus_MarksWithAnAuthorAndTheFirstMarkWins(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	ana, beto := f.accountID, newPerson(t, pool, "Beto")
	id, err := repo.Create(ctx, f.childID, daily("Vitamina D"), ana)
	require.NoError(t, err)
	dose := dosesOf(t, repo, id)[0]

	first, err := repo.UpdateDoseStatus(ctx, id, dose.ID, true, supplement.Actor{AccountID: beto})
	require.NoError(t, err)
	require.True(t, first.Taken)
	require.Equal(t, supplement.DoseTaken, first.Status)
	require.NotNil(t, first.TakenBy)
	require.Equal(t, "Beto", first.TakenBy.Name)
	require.Equal(t, beto, first.TakenBy.AccountID)

	// A second person marking after: the dose stays as the first left it.
	second, err := repo.UpdateDoseStatus(ctx, id, dose.ID, true, supplement.Actor{AccountID: ana, Full: true})
	require.NoError(t, err)
	require.Equal(t, "Beto", second.TakenBy.Name)
}

func TestUpdateDoseStatus_UnmarkingIsForTheAuthorOrWhoCanDoEverything(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	ana, beto, carla := f.accountID, newPerson(t, pool, "Beto"), newPerson(t, pool, "Carla")
	id, err := repo.Create(ctx, f.childID, daily("Vitamina D"), ana)
	require.NoError(t, err)
	dose := dosesOf(t, repo, id)[0]
	_, err = repo.UpdateDoseStatus(ctx, id, dose.ID, true, supplement.Actor{AccountID: beto})
	require.NoError(t, err)

	_, err = repo.UpdateDoseStatus(ctx, id, dose.ID, false, supplement.Actor{AccountID: carla})
	require.ErrorIs(t, err, supplement.ErrDoseForbidden, "someone who only marks cannot take another's mark back")

	got, err := repo.UpdateDoseStatus(ctx, id, dose.ID, false, supplement.Actor{AccountID: beto})
	require.NoError(t, err, "the author can")
	require.False(t, got.Taken)
	require.Nil(t, got.TakenBy)

	_, err = repo.UpdateDoseStatus(ctx, id, dose.ID, true, supplement.Actor{AccountID: beto})
	require.NoError(t, err)
	got, err = repo.UpdateDoseStatus(ctx, id, dose.ID, false, supplement.Actor{AccountID: ana, Full: true})
	require.NoError(t, err, "someone who can do everything can")
	require.False(t, got.Taken)

	// Unmarking what is not marked is a no-op, not an error.
	got, err = repo.UpdateDoseStatus(ctx, id, dose.ID, false, supplement.Actor{AccountID: carla})
	require.NoError(t, err)
	require.False(t, got.Taken)
}

func TestUpdateDoseStatus_ADoseOfAnotherRoutineIsNotFound(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	a, err := repo.Create(ctx, f.childID, daily("A"), f.accountID)
	require.NoError(t, err)
	b, err := repo.Create(ctx, f.childID, daily("B"), f.accountID)
	require.NoError(t, err)
	doseOfB := dosesOf(t, repo, b)[0]

	for _, taken := range []bool{true, false} {
		_, err = repo.UpdateDoseStatus(ctx, a, doseOfB.ID, taken, supplement.Actor{AccountID: f.accountID, Full: true})
		require.ErrorIs(t, err, supplement.ErrDoseNotFound)
	}
	_, err = repo.UpdateDoseStatus(ctx, a, uuid.New(), true, supplement.Actor{AccountID: f.accountID})
	require.ErrorIs(t, err, supplement.ErrDoseNotFound)
}

func TestUpdateDoseStatus_NeverDependsOnThePlan(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	id, err := repo.Create(ctx, f.childID, daily("Vitamina D"), f.accountID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE accounts SET plan = 'free' WHERE id = $1`, f.accountID)
	require.NoError(t, err)

	got, err := repo.UpdateDoseStatus(ctx, id, dosesOf(t, repo, id)[0].ID, true, supplement.Actor{AccountID: f.accountID})
	require.NoError(t, err)
	require.True(t, got.Taken)
}

func TestStatusRuleOnReadingDoses(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	id, err := repo.Create(ctx, f.childID, daily("Dos al dia", "08:00", "20:00"), f.accountID)
	require.NoError(t, err)
	day := time.Date(2026, 10, 5, 0, 0, 0, 0, time.UTC)

	// Clock Oct 5 15:00: 08:00 came and the next one (20:00) has not -> due; 20:00 -> pending.
	got, err := repo.Get(ctx, id, day, day.Add(24*time.Hour))
	require.NoError(t, err)
	require.Len(t, got.Doses, 2)
	require.Equal(t, supplement.DoseDue, got.Doses[0].Status)
	require.Equal(t, supplement.DosePending, got.Doses[1].Status)

	// Same data read at 21:00: 08:00 is now "sin registrar" (its next dose came), 20:00 is due.
	supplement.SetNow(repo, func() time.Time { return time.Date(2026, 10, 5, 21, 0, 0, 0, time.UTC) })
	got, err = repo.Get(ctx, id, day, day.Add(24*time.Hour))
	require.NoError(t, err)
	require.Equal(t, supplement.DoseUnregistered, got.Doses[0].Status)
	require.Equal(t, supplement.DoseDue, got.Doses[1].Status)
}

func TestGet_UnknownRoutine(t *testing.T) {
	pool := testPool(t)
	_, err := newRepo(pool).Get(context.Background(), uuid.New(), fixedNow, fixedNow.Add(time.Hour))
	require.ErrorIs(t, err, supplement.ErrRoutineNotFound)
}

func TestListByChild_OrdersCountsAndNeverHidesByPlan(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()

	late, err := repo.Create(ctx, f.childID, daily("Tarde", "20:00"), f.accountID)
	require.NoError(t, err)
	early, err := repo.Create(ctx, f.childID, daily("Temprano", "07:00"), f.accountID)
	require.NoError(t, err)
	// Only on Tuesdays and Thursdays: nothing on Monday, so its next dose is shown instead.
	notToday, err := repo.Create(ctx, f.childID, supplement.Routine{Name: "Martes", Period: supplement.PeriodWeekdays, Times: []string{"09:00"}, Weekdays: []int{1, 3}, FirstDate: "2026-10-05"}, f.accountID)
	require.NoError(t, err)
	paused, err := repo.Create(ctx, f.childID, daily("Pausada"), f.accountID)
	require.NoError(t, err)
	ended, err := repo.Create(ctx, f.childID, daily("Terminada"), f.accountID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE supplement_routines SET status = 'paused', paused_at = now() WHERE id = $1`, paused)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE supplement_routines SET status = 'ended', ended_at = now() WHERE id = $1`, ended)
	require.NoError(t, err)
	// A lapsed plan hides nothing.
	_, err = pool.Exec(ctx, `UPDATE accounts SET plan = 'free' WHERE id = $1`, f.accountID)
	require.NoError(t, err)

	from := time.Date(2026, 10, 5, 0, 0, 0, 0, time.UTC)
	list, err := repo.ListByChild(ctx, f.childID, from, from.Add(24*time.Hour))
	require.NoError(t, err)
	require.False(t, list.PaidPlan)
	require.Equal(t, 3, list.ActiveCount, "the paused and the ended one are not active")
	require.Len(t, list.Routines, 5)

	names := []string{}
	for _, r := range list.Routines {
		names = append(names, r.Name)
	}
	// Active by the hour of their first dose today (a routine with none today after), then the paused ones, then the ended,
	// the most recently created first.
	require.Equal(t, []string{"Temprano", "Tarde", "Martes", "Pausada", "Terminada"}, names)

	byID := map[uuid.UUID]supplement.RoutineView{}
	for _, r := range list.Routines {
		byID[r.ID] = r
	}
	require.Len(t, byID[early].Doses, 1)
	require.Len(t, byID[late].Doses, 1)
	require.Empty(t, byID[notToday].Doses)
	require.NotNil(t, byID[notToday].NextDose, "an active routine with nothing today shows its next dose")
	require.True(t, time.Date(2026, 10, 6, 9, 0, 0, 0, time.UTC).Equal(byID[notToday].NextDose.ScheduledAt))
	require.Nil(t, byID[early].NextDose)
}

func TestListByChild_NoRoutinesIsAnEmptyListAndUnknownChildIsNotFound(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)

	list, err := repo.ListByChild(context.Background(), f.childID, fixedNow, fixedNow.Add(time.Hour))
	require.NoError(t, err)
	require.NotNil(t, list.Routines)
	require.Empty(t, list.Routines)
	require.True(t, list.PaidPlan)

	_, err = repo.ListByChild(context.Background(), uuid.New(), fixedNow, fixedNow.Add(time.Hour))
	require.ErrorIs(t, err, supplement.ErrChildNotFound)
}

func TestProgress_WithAnEndDateCountsTheDosesStillToBeGenerated(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	// Daily 08:00 from Oct 5 to Oct 31 (27 days): only the first fortnight is generated, but the total is the whole course.
	r := daily("Larga")
	r.EndDate = "2026-10-31"
	id, err := repo.Create(ctx, f.childID, r, f.accountID)
	require.NoError(t, err)
	require.Equal(t, 15, countDoses(t, pool, id))

	got, err := repo.Get(ctx, id, fixedNow, fixedNow.Add(time.Hour))
	require.NoError(t, err)
	require.Equal(t, 27, got.Progress.Total)
}

func dosesOf(t *testing.T, repo *supplement.Repository, routineID uuid.UUID) []supplement.Dose {
	t.Helper()
	got, err := repo.Get(context.Background(), routineID, time.Date(2026, 10, 5, 0, 0, 0, 0, time.UTC), time.Date(2026, 10, 7, 0, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	require.NotEmpty(t, got.Doses)
	return got.Doses
}
