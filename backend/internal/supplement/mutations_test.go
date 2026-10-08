package supplement_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/supplement"
)

// specs/033, US3: pausing, resuming, editing and finishing never touch what already happened (SC-006).

func dosesTimes(t *testing.T, pool *pgxpool.Pool, routineID uuid.UUID) []time.Time {
	t.Helper()
	rows, err := pool.Query(context.Background(), `SELECT scheduled_at FROM supplement_doses WHERE routine_id = $1 ORDER BY scheduled_at`, routineID)
	require.NoError(t, err)
	defer rows.Close()
	var out []time.Time
	for rows.Next() {
		var at time.Time
		require.NoError(t, rows.Scan(&at))
		out = append(out, at.UTC())
	}
	return out
}

func statusOf(t *testing.T, pool *pgxpool.Pool, id uuid.UUID) string {
	t.Helper()
	var s string
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT status FROM supplement_routines WHERE id = $1`, id).Scan(&s))
	return s
}

// setup: a paid family and a daily 08:00 routine from Oct 5; the clock is Oct 5 15:00, so the Oct 5 dose is past.
func setup(t *testing.T) (*supplement.Repository, family, uuid.UUID, *pgxpool.Pool) {
	t.Helper()
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	id, err := repo.Create(context.Background(), f.childID, daily("Vitamina D"), f.accountID)
	require.NoError(t, err)
	return repo, f, id, pool
}

func TestPause_DropsOnlyFutureUnmarkedDosesAndKeepsHistory(t *testing.T) {
	repo, f, id, pool := setup(t)
	ctx := context.Background()
	// Mark a future dose and the past one: both must survive.
	doses := dosesOf(t, repo, id)
	_, err := repo.UpdateDoseStatus(ctx, id, doses[0].ID, true, supplement.Actor{AccountID: f.accountID})
	require.NoError(t, err)
	var futureMarked uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM supplement_doses WHERE routine_id = $1 AND scheduled_at = $2`, id, time.Date(2026, 10, 7, 8, 0, 0, 0, time.UTC)).Scan(&futureMarked))
	_, err = repo.UpdateDoseStatus(ctx, id, futureMarked, true, supplement.Actor{AccountID: f.accountID})
	require.NoError(t, err)

	require.NoError(t, repo.Pause(ctx, id))

	require.Equal(t, "paused", statusOf(t, pool, id))
	got := dosesTimes(t, pool, id)
	require.Equal(t, []time.Time{time.Date(2026, 10, 5, 8, 0, 0, 0, time.UTC), time.Date(2026, 10, 7, 8, 0, 0, 0, time.UTC)}, got)
	var pausedAt *time.Time
	require.NoError(t, pool.QueryRow(ctx, `SELECT paused_at FROM supplement_routines WHERE id = $1`, id).Scan(&pausedAt))
	require.NotNil(t, pausedAt)

	// Pausing needs no plan, and a paused routine cannot be paused again.
	require.ErrorIs(t, repo.Pause(ctx, id), supplement.ErrRoutineNotActive)
	require.ErrorIs(t, repo.Pause(ctx, uuid.New()), supplement.ErrRoutineNotFound)
}

func TestPause_NeedsNoPlan(t *testing.T) {
	repo, f, id, pool := setup(t)
	_, err := pool.Exec(context.Background(), `UPDATE accounts SET plan = 'free' WHERE id = $1`, f.accountID)
	require.NoError(t, err)
	require.NoError(t, repo.Pause(context.Background(), id))
}

func TestResume_RegeneratesFromNowWithoutTheDosesOfThePause(t *testing.T) {
	repo, _, id, pool := setup(t)
	ctx := context.Background()
	require.NoError(t, repo.Pause(ctx, id))
	require.Len(t, dosesTimes(t, pool, id), 1)

	// A week later the routine is resumed: it has doses from then on, and none for the days it was paused.
	later := fixedNow.AddDate(0, 0, 7)
	supplement.SetNow(repo, func() time.Time { return later })
	require.NoError(t, repo.Resume(ctx, id, 0))

	require.Equal(t, "active", statusOf(t, pool, id))
	got := dosesTimes(t, pool, id)
	require.Equal(t, time.Date(2026, 10, 5, 8, 0, 0, 0, time.UTC), got[0])
	require.Equal(t, time.Date(2026, 10, 13, 8, 0, 0, 0, time.UTC), got[1], "from the next dose after resuming, nothing in between")
	var pausedAt *time.Time
	require.NoError(t, pool.QueryRow(ctx, `SELECT paused_at FROM supplement_routines WHERE id = $1`, id).Scan(&pausedAt))
	require.Nil(t, pausedAt)

	require.ErrorIs(t, repo.Resume(ctx, id, 0), supplement.ErrRoutineNotActive, "already active")
	require.ErrorIs(t, repo.Resume(ctx, uuid.New(), 0), supplement.ErrRoutineNotFound)
}

func TestResume_NeedsThePaidPlanAndRoomUnderTheCap(t *testing.T) {
	repo, f, id, pool := setup(t)
	ctx := context.Background()
	require.NoError(t, repo.Pause(ctx, id))

	_, err := pool.Exec(ctx, `UPDATE accounts SET plan = 'free' WHERE id = $1`, f.accountID)
	require.NoError(t, err)
	var planErr *supplement.PlanLimitError
	require.ErrorAs(t, repo.Resume(ctx, id, 0), &planErr)
	require.Equal(t, "paused", statusOf(t, pool, id))
	_, err = pool.Exec(ctx, `UPDATE accounts SET plan = 'paid' WHERE id = $1`, f.accountID)
	require.NoError(t, err)

	for i := 0; i < supplement.MaxActivePerChild; i++ {
		_, err := repo.Create(ctx, f.childID, daily("R"), f.accountID)
		require.NoError(t, err)
	}
	var limitErr *supplement.RoutineLimitError
	require.ErrorAs(t, repo.Resume(ctx, id, 0), &limitErr)
	require.Equal(t, "paused", statusOf(t, pool, id))
}

func TestResume_AnEndedRoutineStaysEnded(t *testing.T) {
	repo, _, id, _ := setup(t)
	ctx := context.Background()
	require.NoError(t, repo.Finish(ctx, id))
	require.ErrorIs(t, repo.Resume(ctx, id, 0), supplement.ErrRoutineEnded)
}

// Two resumes at once with one place left under the cap: one wins.
func TestResume_TheCapHoldsUnderConcurrency(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	var paused []uuid.UUID
	for i := 0; i < 4; i++ {
		id, err := repo.Create(ctx, f.childID, daily("P"), f.accountID)
		require.NoError(t, err)
		require.NoError(t, repo.Pause(ctx, id))
		paused = append(paused, id)
	}
	for i := 0; i < supplement.MaxActivePerChild-1; i++ {
		_, err := repo.Create(ctx, f.childID, daily("A"), f.accountID)
		require.NoError(t, err)
	}
	results := make([]error, len(paused))
	var wg sync.WaitGroup
	for i, id := range paused {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results[i] = repo.Resume(ctx, id, 0)
		}()
	}
	wg.Wait()
	ok := 0
	for _, err := range results {
		if err == nil {
			ok++
		} else {
			require.True(t, errors.Is(err, supplement.ErrRoutineLimit), "unexpected: %v", err)
		}
	}
	require.Equal(t, 1, ok)
}

func TestUpdate_ChangesTheFutureAndNeverThePastNorTheMarked(t *testing.T) {
	repo, f, id, pool := setup(t)
	ctx := context.Background()
	var futureMarked uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM supplement_doses WHERE routine_id = $1 AND scheduled_at = $2`, id, time.Date(2026, 10, 6, 8, 0, 0, 0, time.UTC)).Scan(&futureMarked))
	_, err := repo.UpdateDoseStatus(ctx, id, futureMarked, true, supplement.Actor{AccountID: f.accountID})
	require.NoError(t, err)

	edited := supplement.Routine{Name: "Vitamina D3", Note: "con la cena", Period: supplement.PeriodDaily, Times: []string{"21:00"}, FirstDate: "2026-10-05"}
	require.NoError(t, repo.Update(ctx, id, edited))

	got := dosesTimes(t, pool, id)
	require.Equal(t, time.Date(2026, 10, 5, 8, 0, 0, 0, time.UTC), got[0], "the past dose is untouched")
	require.Equal(t, time.Date(2026, 10, 5, 21, 0, 0, 0, time.UTC), got[1], "today's later dose follows the new schedule")
	require.Equal(t, time.Date(2026, 10, 6, 8, 0, 0, 0, time.UTC), got[2], "the marked one is untouched")
	require.Equal(t, time.Date(2026, 10, 6, 21, 0, 0, 0, time.UTC), got[3], "the rest follows the new schedule")
	for _, at := range got[3:] {
		require.Equal(t, 21, at.Hour())
	}
	view, err := repo.Get(ctx, id, fixedNow, fixedNow.Add(time.Hour))
	require.NoError(t, err)
	require.Equal(t, "Vitamina D3", view.Name)
	require.Equal(t, "con la cena", view.Note)
	require.Equal(t, []string{"21:00"}, view.Times)
}

func TestUpdate_CanChangeThePeriodAndAPausedRoutineStaysPausedWithoutDoses(t *testing.T) {
	repo, _, id, pool := setup(t)
	ctx := context.Background()
	require.NoError(t, repo.Update(ctx, id, supplement.Routine{Name: "Martes y jueves", Period: supplement.PeriodWeekdays, Times: []string{"07:00"}, Weekdays: []int{1, 3}, FirstDate: "2026-10-05", EndDate: "2026-10-30"}))
	view, err := repo.Get(ctx, id, fixedNow, fixedNow.Add(time.Hour))
	require.NoError(t, err)
	require.Equal(t, supplement.PeriodWeekdays, view.Period)
	require.Equal(t, []int{1, 3}, view.Weekdays)
	require.Equal(t, []string{"07:00"}, view.Times)
	require.Equal(t, "2026-10-30", view.EndDate)

	require.NoError(t, repo.Pause(ctx, id))
	before := len(dosesTimes(t, pool, id))
	require.NoError(t, repo.Update(ctx, id, daily("Pausada editada", "09:00")))
	require.Equal(t, "paused", statusOf(t, pool, id))
	require.Len(t, dosesTimes(t, pool, id), before, "a paused routine gets no doses until resumed")
}

func TestUpdate_NeedsThePaidPlanAndNotAnEndedRoutine(t *testing.T) {
	repo, f, id, pool := setup(t)
	ctx := context.Background()
	_, err := pool.Exec(ctx, `UPDATE accounts SET plan = 'free' WHERE id = $1`, f.accountID)
	require.NoError(t, err)
	var planErr *supplement.PlanLimitError
	require.ErrorAs(t, repo.Update(ctx, id, daily("x", "10:00")), &planErr)

	_, err = pool.Exec(ctx, `UPDATE accounts SET plan = 'paid' WHERE id = $1`, f.accountID)
	require.NoError(t, err)
	require.NoError(t, repo.Finish(ctx, id))
	require.ErrorIs(t, repo.Update(ctx, id, daily("x", "10:00")), supplement.ErrRoutineEnded)
	require.ErrorIs(t, repo.Update(ctx, uuid.New(), daily("x")), supplement.ErrRoutineNotFound)
}

func TestFinish_EndsForGoodKeepsHistoryAndIsIdempotent(t *testing.T) {
	repo, f, id, pool := setup(t)
	ctx := context.Background()
	_, err := repo.UpdateDoseStatus(ctx, id, dosesOf(t, repo, id)[0].ID, true, supplement.Actor{AccountID: f.accountID})
	require.NoError(t, err)

	require.NoError(t, repo.Finish(ctx, id))
	require.Equal(t, "ended", statusOf(t, pool, id))
	require.Len(t, dosesTimes(t, pool, id), 1, "the marked past dose stays, the future ones go")

	var endedAt time.Time
	require.NoError(t, pool.QueryRow(ctx, `SELECT ended_at FROM supplement_routines WHERE id = $1`, id).Scan(&endedAt))
	supplement.SetNow(repo, func() time.Time { return fixedNow.AddDate(0, 0, 3) })
	require.NoError(t, repo.Finish(ctx, id), "idempotent")
	var again time.Time
	require.NoError(t, pool.QueryRow(ctx, `SELECT ended_at FROM supplement_routines WHERE id = $1`, id).Scan(&again))
	require.True(t, endedAt.Equal(again), "the first moment is kept")
	require.ErrorIs(t, repo.Finish(ctx, uuid.New()), supplement.ErrRoutineNotFound)
}

func TestFinish_NeedsNoPlanAndNeverDeletesADoseThatAlreadyHadAReminder(t *testing.T) {
	repo, f, id, pool := setup(t)
	ctx := context.Background()
	_, err := pool.Exec(ctx, `UPDATE accounts SET plan = 'free' WHERE id = $1`, f.accountID)
	require.NoError(t, err)
	var reminded uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM supplement_doses WHERE routine_id = $1 AND scheduled_at = $2`, id, time.Date(2026, 10, 8, 8, 0, 0, 0, time.UTC)).Scan(&reminded))
	_, err = pool.Exec(ctx, `INSERT INTO supplement_dose_reminders (dose_id, account_id) VALUES ($1, $2)`, reminded, f.accountID)
	require.NoError(t, err)

	require.NoError(t, repo.Finish(ctx, id))
	require.Equal(t, []time.Time{time.Date(2026, 10, 5, 8, 0, 0, 0, time.UTC), time.Date(2026, 10, 8, 8, 0, 0, 0, time.UTC)}[1:], dosesTimes(t, pool, id)[1:], "the dose with a reminder is kept")
}

func TestSetMuted_EachPersonDecidesForThemselvesOnlyWhileActive(t *testing.T) {
	repo, f, id, pool := setup(t)
	ctx := context.Background()
	beto := newPerson(t, pool, "Beto")

	require.NoError(t, repo.SetMuted(ctx, id, beto, true))
	require.NoError(t, repo.SetMuted(ctx, id, beto, true), "idempotent")
	muted, err := repo.MutedAmong(ctx, beto, []uuid.UUID{id})
	require.NoError(t, err)
	require.True(t, muted[id])
	others, err := repo.MutedAmong(ctx, f.accountID, []uuid.UUID{id})
	require.NoError(t, err)
	require.False(t, others[id], "nobody else is muted")

	require.NoError(t, repo.SetMuted(ctx, id, beto, false))
	require.NoError(t, repo.SetMuted(ctx, id, beto, false), "idempotent")
	muted, err = repo.MutedAmong(ctx, beto, []uuid.UUID{id})
	require.NoError(t, err)
	require.False(t, muted[id])

	empty, err := repo.MutedAmong(ctx, beto, nil)
	require.NoError(t, err)
	require.Empty(t, empty)

	require.NoError(t, repo.Pause(ctx, id))
	require.ErrorIs(t, repo.SetMuted(ctx, id, beto, true), supplement.ErrRoutineNotActive)
	require.ErrorIs(t, repo.SetMuted(ctx, uuid.New(), beto, true), supplement.ErrRoutineNotFound)
}

func TestExtendHorizon_AddsDosesOnlyToActiveRoutinesRunningLowAndNeverRegeneratesTheHistory(t *testing.T) {
	repo, f, id, pool := setup(t)
	ctx := context.Background()
	// Mark the first dose: it must stay as it is however many times the horizon moves.
	first := dosesOf(t, repo, id)[0]
	_, err := repo.UpdateDoseStatus(ctx, id, first.ID, true, supplement.Actor{AccountID: f.accountID})
	require.NoError(t, err)
	paused, err := repo.Create(ctx, f.childID, daily("Pausada"), f.accountID)
	require.NoError(t, err)
	require.NoError(t, repo.Pause(ctx, paused))
	pausedBefore := len(dosesTimes(t, pool, paused))

	// Today (Oct 5) the horizon is Oct 19: far enough, nothing to extend for this family's routines.
	n, err := repo.ExtendHorizon(ctx)
	require.NoError(t, err)
	_ = n
	require.Len(t, dosesTimes(t, pool, id), 15)

	// Twelve days later less than a week of doses remains ahead: the routine is extended to 14 days from then.
	supplement.SetNow(repo, func() time.Time { return fixedNow.AddDate(0, 0, 12) })
	n, err = repo.ExtendHorizon(ctx)
	require.NoError(t, err)
	require.GreaterOrEqual(t, n, 1)
	got := dosesTimes(t, pool, id)
	require.Equal(t, time.Date(2026, 10, 31, 8, 0, 0, 0, time.UTC), got[len(got)-1], "daily 08:00 up to the new horizon (Oct 31 15:00)")
	require.Len(t, dosesTimes(t, pool, paused), pausedBefore, "paused routines are never extended")

	// Running it again right away has nothing to do, and the doses are not duplicated.
	again, err := repo.ExtendHorizon(ctx)
	require.NoError(t, err)
	_ = again
	require.Equal(t, len(got), len(dosesTimes(t, pool, id)))
	taken, _ := supplementDoseTaken(t, pool, first.ID)
	require.True(t, taken)
}

func supplementDoseTaken(t *testing.T, pool *pgxpool.Pool, id uuid.UUID) (bool, error) {
	t.Helper()
	var taken bool
	err := pool.QueryRow(context.Background(), `SELECT taken FROM supplement_doses WHERE id = $1`, id).Scan(&taken)
	return taken, err
}

func TestExtendHorizon_StopsAtTheEndDate(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	r := daily("Corta")
	r.EndDate = "2026-10-30"
	id, err := repo.Create(ctx, f.childID, r, f.accountID)
	require.NoError(t, err)

	supplement.SetNow(repo, func() time.Time { return fixedNow.AddDate(0, 0, 12) })
	_, err = repo.ExtendHorizon(ctx)
	require.NoError(t, err)
	got := dosesTimes(t, pool, id)
	require.Equal(t, time.Date(2026, 10, 30, 8, 0, 0, 0, time.UTC), got[len(got)-1])
}

func TestExtendHorizon_DatabaseError(t *testing.T) {
	pool := testPool(t)
	closed := newRepo(closedSupplementPool(t, pool))
	_, err := closed.ExtendHorizon(context.Background())
	require.Error(t, err)
}

type fakePlanner struct {
	mu    sync.Mutex
	calls int
	err   error
}

func (f *fakePlanner) ExtendHorizon(context.Context) (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	return 0, f.err
}

type fakeReporter struct {
	mu                sync.Mutex
	reports, recovers int
}

func (f *fakeReporter) Report(string, string, *uuid.UUID) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.reports++
}

func (f *fakeReporter) Recovered(string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.recovers++
}

func TestRunPlanner_TicksUntilTheContextEndsAndReportsFailures(t *testing.T) {
	planner := &fakePlanner{err: errors.New("boom")}
	reporter := &fakeReporter{}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		supplement.RunPlanner(ctx, planner, reporter, 10*time.Millisecond)
		close(done)
	}()
	require.Eventually(t, func() bool {
		planner.mu.Lock()
		defer planner.mu.Unlock()
		return planner.calls >= 3
	}, 2*time.Second, 5*time.Millisecond)
	cancel()
	<-done
	reporter.mu.Lock()
	defer reporter.mu.Unlock()
	require.GreaterOrEqual(t, reporter.reports, 3)
	require.Zero(t, reporter.recovers)

	// A healthy planner reports recovery; shutting down is not a failure.
	healthy := &fakePlanner{}
	healthyReporter := &fakeReporter{}
	ctx2, cancel2 := context.WithCancel(context.Background())
	done2 := make(chan struct{})
	go func() {
		supplement.RunPlanner(ctx2, healthy, healthyReporter, 10*time.Millisecond)
		close(done2)
	}()
	require.Eventually(t, func() bool {
		healthyReporter.mu.Lock()
		defer healthyReporter.mu.Unlock()
		return healthyReporter.recovers >= 1
	}, 2*time.Second, 5*time.Millisecond)
	cancel2()
	<-done2
	require.Zero(t, healthyReporter.reports)

	// Without a reporter it still runs (console only).
	ctx3, cancel3 := context.WithCancel(context.Background())
	done3 := make(chan struct{})
	go func() {
		supplement.RunPlanner(ctx3, &fakePlanner{err: errors.New("x")}, nil, 10*time.Millisecond)
		close(done3)
	}()
	time.Sleep(30 * time.Millisecond)
	cancel3()
	<-done3
}

func TestResumeAndFinishAnswerWithTheRoutineThroughTheService(t *testing.T) {
	pool := testPool(t)
	svc := newService(newRepo(pool))
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	view, err := svc.Create(ctx, f.childID, supplement.Input{Name: "Zinc", Period: "daily", Times: []string{"08:00"}, FirstDate: "2026-10-05"}, f.accountID)
	require.NoError(t, err)

	paused, err := svc.Pause(ctx, view.ID, f.accountID)
	require.NoError(t, err)
	require.Equal(t, supplement.StatusPaused, paused.Status)
	require.NotNil(t, paused.PausedAt)

	var verrs supplement.ValidationErrors
	_, err = svc.Resume(ctx, view.ID, 900, f.accountID)
	require.ErrorAs(t, err, &verrs)
	resumed, err := svc.Resume(ctx, view.ID, 0, f.accountID)
	require.NoError(t, err)
	require.Equal(t, supplement.StatusActive, resumed.Status)
	require.True(t, resumed.MyReminders)

	edited, err := svc.Update(ctx, view.ID, supplement.Input{Name: " Zinc 2 ", Period: "daily", Times: []string{"09:00"}, FirstDate: "2026-09-01"}, f.accountID)
	require.NoError(t, err, "an edit may keep a first day long past")
	require.Equal(t, "Zinc 2", edited.Name)
	_, err = svc.Update(ctx, view.ID, supplement.Input{Name: ""}, f.accountID)
	require.ErrorAs(t, err, &verrs)

	require.NoError(t, svc.SetMyReminders(ctx, view.ID, f.accountID, false))
	got, err := svc.Get(ctx, view.ID, fixedNow.Add(-time.Hour), fixedNow.Add(time.Hour), f.accountID)
	require.NoError(t, err)
	require.False(t, got.MyReminders)
	list, err := svc.List(ctx, f.childID, supplement.KindSupplement, fixedNow.Add(-time.Hour), fixedNow.Add(time.Hour), f.accountID)
	require.NoError(t, err)
	require.False(t, list.Routines[0].MyReminders)

	finished, err := svc.Finish(ctx, view.ID, f.accountID)
	require.NoError(t, err)
	require.Equal(t, supplement.StatusEnded, finished.Status)
	require.NotNil(t, finished.EndedAt)
}
