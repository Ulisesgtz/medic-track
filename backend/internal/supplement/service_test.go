package supplement_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/supplement"
)

func newService(repo *supplement.Repository) *supplement.Service {
	svc := supplement.NewService(repo)
	supplement.SetServiceNow(svc, func() time.Time { return fixedNow })
	return svc
}

func TestService_CreateValidatesBeforeTouchingTheDatabase(t *testing.T) {
	// No pool at all: an invalid form must never reach the repository.
	svc := newService(nil)
	_, err := svc.Create(context.Background(), uuid.New(), supplement.Input{Name: ""}, uuid.New())
	var verrs supplement.ValidationErrors
	require.ErrorAs(t, err, &verrs)
	require.True(t, verrs.HasErrors())
}

func TestService_CreateReturnsTheRoutineWithTheDosesOfItsLocalToday(t *testing.T) {
	pool := testPool(t)
	svc := newService(newRepo(pool))
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()

	// Clock Oct 5 15:00 UTC is Oct 5 09:00 at -360: the routine's today has both doses; one already came.
	view, err := svc.Create(ctx, f.childID, supplement.Input{
		Name: "  Hierro ", Period: "daily", Times: []string{"20:00", "08:00"}, FirstDate: "2026-10-05", UtcOffsetMinutes: -360,
	}, f.accountID)
	require.NoError(t, err)
	require.Equal(t, "Hierro", view.Name)
	require.Len(t, view.Doses, 2)
	require.Equal(t, supplement.DoseDue, view.Doses[0].Status)
	require.Equal(t, supplement.DosePending, view.Doses[1].Status)
}

func TestService_CreateKeepsThePlanAndCapErrors(t *testing.T) {
	pool := testPool(t)
	svc := newService(newRepo(pool))
	f := newFamily(t, pool, account.PlanFree)
	_, err := svc.Create(context.Background(), f.childID, supplement.Input{Name: "x", Period: "daily", Times: []string{"08:00"}, FirstDate: "2026-10-05"}, f.accountID)
	require.ErrorIs(t, err, supplement.ErrPlanRequired)
}

func TestService_WindowsAreChecked(t *testing.T) {
	svc := newService(nil)
	ctx := context.Background()
	from := fixedNow
	var verrs supplement.ValidationErrors

	_, err := svc.List(ctx, uuid.New(), from, from)
	require.ErrorAs(t, err, &verrs)
	_, err = svc.List(ctx, uuid.New(), from, from.Add(49*time.Hour))
	require.ErrorAs(t, err, &verrs)
	_, err = svc.Get(ctx, uuid.New(), from, from.Add(-time.Hour))
	require.ErrorAs(t, err, &verrs)
	_, err = svc.Get(ctx, uuid.New(), from, from.Add(63*24*time.Hour))
	require.ErrorAs(t, err, &verrs)
}

func TestService_ListGetAndMarkGoThroughTheRepository(t *testing.T) {
	pool := testPool(t)
	svc := newService(newRepo(pool))
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	view, err := svc.Create(ctx, f.childID, supplement.Input{Name: "Zinc", Period: "daily", Times: []string{"08:00"}, FirstDate: "2026-10-05"}, f.accountID)
	require.NoError(t, err)

	day := time.Date(2026, 10, 5, 0, 0, 0, 0, time.UTC)
	list, err := svc.List(ctx, f.childID, day, day.Add(24*time.Hour))
	require.NoError(t, err)
	require.Len(t, list.Routines, 1)
	got, err := svc.Get(ctx, view.ID, day, day.Add(24*time.Hour))
	require.NoError(t, err)
	require.Equal(t, "Zinc", got.Name)
	dose, err := svc.MarkDose(ctx, view.ID, got.Doses[0].ID, true, supplement.Actor{AccountID: f.accountID, Full: true})
	require.NoError(t, err)
	require.True(t, dose.Taken)
}
