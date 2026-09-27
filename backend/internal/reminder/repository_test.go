package reminder_test

import (
	"context"
	"math/rand/v2"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
)

// uniqueNow is a clock far from any real dose and from every other test's clock, so a claim only
// ever sees the doses the test itself created (the dev database is shared).
func uniqueNow() time.Time {
	return time.Date(2090, 1, 1, 12, 0, 0, 0, time.UTC).Add(time.Duration(rand.IntN(3_000_000)) * time.Hour)
}

const window = 60 * time.Minute

func claimedIDs(due []reminder.DueDose) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(due))
	for _, d := range due {
		ids = append(ids, d.DoseID)
	}
	return ids
}

func TestRepository_UpsertDevice_CreatesThenReactivatesAndMovesAccounts(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	ctx := context.Background()
	a := newFamily(t, pool, nil)
	b := newFamily(t, pool, nil)
	endpoint := uniqueEndpoint()

	first, created, err := repo.UpsertDevice(ctx, a.accountID, endpoint, "k1", "s1")
	require.NoError(t, err)
	require.True(t, created)
	require.True(t, first.Active)

	require.NoError(t, repo.DeactivateDevice(ctx, a.accountID, endpoint))
	require.False(t, deviceActive(t, pool, first.ID))

	again, created, err := repo.UpsertDevice(ctx, a.accountID, endpoint, "k2", "s2")
	require.NoError(t, err)
	require.False(t, created, "same endpoint: the row is reused")
	require.Equal(t, first.ID, again.ID)
	require.True(t, deviceActive(t, pool, first.ID))

	// Another tutor turns reminders on in the same browser: it now reminds only them.
	moved, _, err := repo.UpsertDevice(ctx, b.accountID, endpoint, "k3", "s3")
	require.NoError(t, err)
	require.Equal(t, first.ID, moved.ID)
	var owner uuid.UUID
	var p256dh string
	require.NoError(t, pool.QueryRow(ctx, `SELECT account_id, p256dh FROM reminder_devices WHERE id = $1`, first.ID).Scan(&owner, &p256dh))
	require.Equal(t, b.accountID, owner)
	require.Equal(t, "k3", p256dh)
}

func TestRepository_DeactivateDevice_OnlyTheAccountsOwn(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	a := newFamily(t, pool, nil)
	b := newFamily(t, pool, nil)
	device := a.device(t, repo, uniqueEndpoint())

	require.NoError(t, repo.DeactivateDevice(context.Background(), b.accountID, device.Endpoint))
	require.True(t, deviceActive(t, pool, device.ID), "another account can't turn it off")

	require.NoError(t, repo.DeactivateDevice(context.Background(), a.accountID, device.Endpoint))
	require.False(t, deviceActive(t, pool, device.ID))
	require.NoError(t, repo.DeactivateDevice(context.Background(), a.accountID, device.Endpoint), "idempotent")
}

func TestRepository_ClaimDueDoses_OnlyTheDueOnesAndOnlyOnce(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	f := newFamily(t, pool, strPtr("detailed"))
	device := f.device(t, repo, uniqueEndpoint())
	activatedAt(t, pool, device.ID, now.Add(-3*time.Hour))

	due := f.dose(t, pool, now.Add(-5*time.Minute), false)
	_ = f.dose(t, pool, now.Add(-2*time.Minute), true)   // already taken
	_ = f.dose(t, pool, now.Add(-90*time.Minute), false) // more than an hour late
	_ = f.dose(t, pool, now.Add(10*time.Minute), false)  // not yet

	claimed, err := repo.ClaimDueDoses(context.Background(), now, window)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{due}, claimedIDs(claimed))
	got := claimed[0]
	require.Equal(t, f.accountID, got.AccountID)
	require.Equal(t, f.consultationID, got.ConsultationID)
	require.Equal(t, "Amoxicilina", got.MedicationName)
	require.Equal(t, "Mateo", got.ChildFirstName)
	require.NotNil(t, got.Detail)
	require.Equal(t, reminder.DetailDetailed, *got.Detail)

	again, err := repo.ClaimDueDoses(context.Background(), now.Add(time.Minute), window)
	require.NoError(t, err)
	require.Empty(t, again, "a claimed dose is never claimed again")
}

func TestRepository_ClaimDueDoses_NeedsADeviceActivatedBeforeTheDose(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()

	noDevice := newFamily(t, pool, nil)
	_ = noDevice.dose(t, pool, now.Add(-time.Minute), false)

	late := newFamily(t, pool, nil)
	_ = late.dose(t, pool, now.Add(-10*time.Minute), false)
	d := late.device(t, repo, uniqueEndpoint())
	activatedAt(t, pool, d.ID, now.Add(-5*time.Minute)) // turned on after the dose was due

	off := newFamily(t, pool, nil)
	_ = off.dose(t, pool, now.Add(-time.Minute), false)
	od := off.device(t, repo, uniqueEndpoint())
	activatedAt(t, pool, od.ID, now.Add(-time.Hour))
	require.NoError(t, repo.DeactivateDevice(context.Background(), off.accountID, od.Endpoint))

	claimed, err := repo.ClaimDueDoses(context.Background(), now, window)
	require.NoError(t, err)
	require.Empty(t, claimed)
}

func TestRepository_ClaimDueDoses_TwoClaimsAtOnceNeverShareADose(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	f := newFamily(t, pool, nil)
	d := f.device(t, repo, uniqueEndpoint())
	activatedAt(t, pool, d.ID, now.Add(-time.Hour))
	var want []uuid.UUID
	for i := range 20 {
		want = append(want, f.dose(t, pool, now.Add(-time.Duration(i+1)*time.Minute), false))
	}

	var (
		wg  sync.WaitGroup
		mu  sync.Mutex
		all []uuid.UUID
	)
	for range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			claimed, err := repo.ClaimDueDoses(context.Background(), now, window)
			require.NoError(t, err)
			mu.Lock()
			all = append(all, claimedIDs(claimed)...)
			mu.Unlock()
		}()
	}
	wg.Wait()
	require.ElementsMatch(t, want, all, "every dose claimed exactly once")
}

func TestRepository_ActiveDevicesFor(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	f := newFamily(t, pool, nil)
	early := f.device(t, repo, uniqueEndpoint())
	activatedAt(t, pool, early.ID, now.Add(-time.Hour))
	after := f.device(t, repo, uniqueEndpoint())
	activatedAt(t, pool, after.ID, now.Add(time.Hour))
	off := f.device(t, repo, uniqueEndpoint())
	activatedAt(t, pool, off.ID, now.Add(-time.Hour))
	require.NoError(t, repo.DeactivateByID(context.Background(), off.ID))

	devices, err := repo.ActiveDevicesFor(context.Background(), f.accountID, now)
	require.NoError(t, err)
	require.Len(t, devices, 1)
	require.Equal(t, early.ID, devices[0].ID)
	require.Equal(t, early.Endpoint, devices[0].Endpoint)
}

func TestRepository_MarkTakenByAction(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	ctx := context.Background()
	f := newFamily(t, pool, nil)
	other := newFamily(t, pool, nil)
	dose := f.dose(t, pool, time.Now(), false)
	device := f.device(t, repo, uniqueEndpoint())
	otherDevice := other.device(t, repo, uniqueEndpoint())

	require.ErrorIs(t, repo.MarkTakenByAction(ctx, dose, otherDevice.ID), reminder.ErrInvalidActionToken, "a device of another account")
	require.False(t, doseTaken(t, pool, dose))

	require.NoError(t, repo.MarkTakenByAction(ctx, dose, device.ID))
	require.True(t, doseTaken(t, pool, dose))
	require.NoError(t, repo.MarkTakenByAction(ctx, dose, device.ID), "idempotent")

	require.NoError(t, repo.DeactivateByID(ctx, device.ID))
	require.ErrorIs(t, repo.MarkTakenByAction(ctx, dose, device.ID), reminder.ErrInvalidActionToken, "device turned off")
	require.ErrorIs(t, repo.MarkTakenByAction(ctx, uuid.New(), device.ID), reminder.ErrInvalidActionToken)
}

func TestRepository_ConnectionErrors(t *testing.T) {
	repo := reminder.NewRepository(closedPool(t))
	ctx := context.Background()
	_, _, err := repo.UpsertDevice(ctx, uuid.New(), "e", "k", "a")
	require.Error(t, err)
	require.Error(t, repo.DeactivateDevice(ctx, uuid.New(), "e"))
	require.Error(t, repo.DeactivateByID(ctx, uuid.New()))
	_, err = repo.ClaimDueDoses(ctx, time.Now(), window)
	require.Error(t, err)
	_, err = repo.ActiveDevicesFor(ctx, uuid.New(), time.Now())
	require.Error(t, err)
	err = repo.MarkTakenByAction(ctx, uuid.New(), uuid.New())
	require.Error(t, err)
	require.NotErrorIs(t, err, reminder.ErrInvalidActionToken)
}
