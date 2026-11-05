package supplement_test

import (
	"context"
	"net/http"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/supplement"
)

// specs/060: a supplement or an activity captured by mistake is deleted, only while none of its doses is marked.

func countWhere(t *testing.T, pool *pgxpool.Pool, query string, id uuid.UUID) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(), query, id).Scan(&n))
	return n
}

// leftovers counts every row that belongs to the routine: itself, its doses, the reminders sent for them and «Tus avisos».
func leftovers(t *testing.T, pool *pgxpool.Pool, id uuid.UUID) int {
	t.Helper()
	return countWhere(t, pool, `SELECT count(*) FROM supplement_routines WHERE id = $1`, id) +
		countWhere(t, pool, `SELECT count(*) FROM supplement_doses WHERE routine_id = $1`, id) +
		countWhere(t, pool, `SELECT count(*) FROM supplement_dose_reminders WHERE dose_id IN (SELECT id FROM supplement_doses WHERE routine_id = $1)`, id) +
		countWhere(t, pool, `SELECT count(*) FROM child_supplement_dose_reminders WHERE dose_id IN (SELECT id FROM supplement_doses WHERE routine_id = $1)`, id) +
		countWhere(t, pool, `SELECT count(*) FROM supplement_muted WHERE routine_id = $1`, id)
}

// withEverything gives the routine a reminder to a person, one to the child's phone and a muted «Tus avisos».
func withEverything(t *testing.T, pool *pgxpool.Pool, repo *supplement.Repository, f family, id uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	doses := dosesOf(t, repo, id)
	require.NotEmpty(t, doses)
	_, err := pool.Exec(ctx, `INSERT INTO supplement_dose_reminders (dose_id, account_id) VALUES ($1, $2)`, doses[0].ID, f.accountID)
	require.NoError(t, err)
	var link uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO child_device_links (child_id, account_id, name, created_by_account_id, status, expires_at, redeemed_at, credential_hash, rotated_at)
		SELECT c.id, c.account_id, 'Teléfono', c.account_id, 'active', now(), now(), decode(md5(random()::text) || md5(random()::text), 'hex'), now()
		FROM children c WHERE c.id = $1 RETURNING id`, f.childID).Scan(&link))
	_, err = pool.Exec(ctx, `INSERT INTO child_supplement_dose_reminders (dose_id, link_id) VALUES ($1, $2)`, doses[0].ID, link)
	require.NoError(t, err)
	require.NoError(t, repo.SetMuted(ctx, id, f.accountID, true))
}

func TestDelete_WithoutMarksRemovesTheRoutineAndEverythingOfIt(t *testing.T) {
	repo, f, id, pool := setup(t)
	withEverything(t, pool, repo, f, id)
	require.Greater(t, leftovers(t, pool, id), 4)

	view, err := repo.Get(context.Background(), id, fixedNow, fixedNow.AddDate(0, 0, 1))
	require.NoError(t, err)
	require.False(t, view.HasMarks)

	require.NoError(t, repo.Delete(context.Background(), id))
	require.Zero(t, leftovers(t, pool, id))
	_, err = repo.Get(context.Background(), id, fixedNow, fixedNow.AddDate(0, 0, 1))
	require.ErrorIs(t, err, supplement.ErrRoutineNotFound)
	// Gone is gone: a second delete finds nothing.
	require.ErrorIs(t, repo.Delete(context.Background(), id), supplement.ErrRoutineNotFound)
}

func TestDelete_AMarkedDoseKeepsEverything(t *testing.T) {
	repo, f, id, pool := setup(t)
	ctx := context.Background()
	withEverything(t, pool, repo, f, id)
	doses := dosesOf(t, repo, id)
	_, err := repo.UpdateDoseStatus(ctx, id, doses[0].ID, true, supplement.Actor{AccountID: f.accountID})
	require.NoError(t, err)
	before := leftovers(t, pool, id)

	view, err := repo.Get(ctx, id, fixedNow, fixedNow.AddDate(0, 0, 1))
	require.NoError(t, err)
	require.True(t, view.HasMarks)

	require.ErrorIs(t, repo.Delete(ctx, id), supplement.ErrRoutineHasMarks)
	require.Equal(t, before, leftovers(t, pool, id), "a refused delete changes nothing")

	// The rule looks at the marks there are now: unmarked again, it can go.
	_, err = repo.UpdateDoseStatus(ctx, id, doses[0].ID, false, supplement.Actor{AccountID: f.accountID})
	require.NoError(t, err)
	require.NoError(t, repo.Delete(ctx, id))
	require.Zero(t, leftovers(t, pool, id))
}

func TestDelete_AnyStatusAnyPlanAndPersonal(t *testing.T) {
	ctx := context.Background()
	t.Run("unknown", func(t *testing.T) {
		repo := newRepo(testPool(t))
		require.ErrorIs(t, repo.Delete(ctx, uuid.New()), supplement.ErrRoutineNotFound)
	})
	t.Run("paused", func(t *testing.T) {
		repo, _, id, pool := setup(t)
		require.NoError(t, repo.Pause(ctx, id))
		require.NoError(t, repo.Delete(ctx, id))
		require.Zero(t, leftovers(t, pool, id))
	})
	t.Run("finished", func(t *testing.T) {
		repo, _, id, pool := setup(t)
		require.NoError(t, repo.Finish(ctx, id))
		require.NoError(t, repo.Delete(ctx, id))
		require.Zero(t, leftovers(t, pool, id))
	})
	t.Run("free plan", func(t *testing.T) {
		repo, f, id, pool := setup(t)
		_, err := pool.Exec(ctx, `UPDATE accounts SET plan = 'free' WHERE id = $1`, f.accountID)
		require.NoError(t, err)
		require.NoError(t, repo.Delete(ctx, id))
		require.Zero(t, leftovers(t, pool, id))
	})
	t.Run("personal", func(t *testing.T) {
		pool := testPool(t)
		repo := newRepo(pool)
		f := newFamily(t, pool, account.PlanPaid)
		id, err := repo.CreatePersonal(ctx, f.accountID, daily("Omega 3"))
		require.NoError(t, err)
		require.NoError(t, repo.Delete(ctx, id))
		require.Zero(t, leftovers(t, pool, id))
	})
}

// A mark and a delete at the same moment: either the mark lands first (and the delete is refused) or the delete wins and the mark
// finds no dose. Never both, never a lost mark.
func TestDelete_RacesWithAMark(t *testing.T) {
	for range 5 {
		repo, f, id, pool := setup(t)
		dose := dosesOf(t, repo, id)[0].ID
		var wg sync.WaitGroup
		var markErr, deleteErr error
		wg.Add(2)
		go func() {
			defer wg.Done()
			_, markErr = repo.UpdateDoseStatus(context.Background(), id, dose, true, supplement.Actor{AccountID: f.accountID})
		}()
		go func() {
			defer wg.Done()
			deleteErr = repo.Delete(context.Background(), id)
		}()
		wg.Wait()
		if deleteErr == nil {
			require.Error(t, markErr)
			require.Zero(t, leftovers(t, pool, id))
		} else {
			require.ErrorIs(t, deleteErr, supplement.ErrRoutineHasMarks)
			require.NoError(t, markErr)
			require.Equal(t, 1, countWhere(t, pool, `SELECT count(*) FROM supplement_doses WHERE routine_id = $1 AND taken`, id))
		}
	}
}

func TestDeleteHandler(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	id := e.createRoutine(t)

	// hasMarks travels with the routine.
	code, got := e.do(t, e.owner, http.MethodGet, "/routines/"+id+windowQuery(), "")
	require.Equal(t, http.StatusOK, code, got)
	require.Equal(t, false, got["hasMarks"])

	// A caregiver can see it but never delete it.
	code, _ = e.do(t, e.caregiver, http.MethodDelete, "/routines/"+id, "")
	require.Equal(t, http.StatusForbidden, code)

	code, _ = e.do(t, e.owner, http.MethodDelete, "/routines/"+id, "")
	require.Equal(t, http.StatusNoContent, code)
	code, _ = e.do(t, e.owner, http.MethodGet, "/routines/"+id+windowQuery(), "")
	require.Contains(t, []int{http.StatusNotFound, http.StatusForbidden}, code)

	code, _ = e.do(t, e.owner, http.MethodDelete, "/routines/not-a-uuid", "")
	require.Contains(t, []int{http.StatusNotFound, http.StatusForbidden}, code)

	// With a marked dose: 409 routine_has_marks, and it is still there.
	marked := e.createRoutine(t)
	_, routine := e.do(t, e.owner, http.MethodGet, "/routines/"+marked+windowQuery(), "")
	dose := routine["doses"].([]any)[0].(map[string]any)["id"].(string)
	code, got = e.do(t, e.owner, http.MethodPatch, "/routines/"+marked+"/doses/"+dose, `{"taken":true}`)
	require.Equal(t, http.StatusOK, code, got)
	code, got = e.do(t, e.owner, http.MethodGet, "/routines/"+marked+windowQuery(), "")
	require.Equal(t, http.StatusOK, code, got)
	require.Equal(t, true, got["hasMarks"])
	code, got = e.do(t, e.owner, http.MethodDelete, "/routines/"+marked, "")
	require.Equal(t, http.StatusConflict, code, got)
	require.Equal(t, "routine_has_marks", got["error"])
	code, _ = e.do(t, e.owner, http.MethodGet, "/routines/"+marked+windowQuery(), "")
	require.Equal(t, http.StatusOK, code)
}

func TestDeleteHandler_APersonalOneIsOnlyItsOwners(t *testing.T) {
	e := newPersonalEnv(t, account.PlanPaid)
	id := e.createPersonal(t, e.owner, e.accountID, "Omega 3")

	code, _ := e.do(t, e.caregiver, http.MethodDelete, "/routines/"+id, "")
	require.Equal(t, http.StatusForbidden, code)

	code, _ = e.do(t, e.owner, http.MethodDelete, "/routines/"+id, "")
	require.Equal(t, http.StatusNoContent, code)
}
