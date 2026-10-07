package reminder_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
)

// specs/033, part 3: a person's own routine (no child) reminds only its owner, with no child name, and its «Tomada» works only from
// the owner's own device.

// personalRoutine inserts a routine of f's own account (child_id NULL) and returns its id.
func (f family) personalRoutine(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO supplement_routines (account_id, child_id, name, period, times, first_date, utc_offset_minutes, status, generated_until, created_by_account_id)
		VALUES ($1, NULL, 'Omega 3', 'daily', ARRAY['08:00']::time[], current_date - 2, 0, 'active', now() + interval '14 days', $1)
		RETURNING id`, f.accountID).Scan(&id))
	return id
}

func TestClaimDueSupplementDoses_APersonalRoutineRemindsOnlyItsOwner(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	tutor := owner.addMember(t, pool, "tutor", "active", nil)
	caregiver := owner.addMember(t, pool, "caregiver", "active", nil)
	for _, p := range []family{owner, tutor, caregiver} {
		ready(t, p, repo, now)
	}
	routine := owner.personalRoutine(t, pool)
	dose := supplementDose(t, pool, routine, now.Add(-5*time.Minute), false)

	due, err := repo.ClaimDueSupplementDoses(context.Background(), now, window)
	require.NoError(t, err)
	require.Len(t, due, 1, "nobody else in the family is reminded of what is the owner's own")
	require.Equal(t, owner.accountID, due[0].AccountID)
	require.Equal(t, dose, due[0].DoseID)
	require.Equal(t, routine, due[0].RoutineID)
	require.Equal(t, "Omega 3", due[0].MedicationName)
	require.Empty(t, due[0].ChildFirstName, "a personal reminder names no child")

	// The payload (detailed or generic) carries no child either.
	p := reminder.BuildPayload(due[0], "tok")
	require.Empty(t, p.Child)
	require.Equal(t, routine.String(), p.RoutineID)

	// Once is enough.
	again, err := repo.ClaimDueSupplementDoses(context.Background(), now, window)
	require.NoError(t, err)
	require.Empty(t, again)
}

func TestClaimDueSupplementDoses_APersonalRoutineOfSomeoneWhoMutedItOrHasNoDeviceIsNotClaimed(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	muted := newFamily(t, pool, nil)
	ready(t, muted, repo, now)
	mutedRoutine := muted.personalRoutine(t, pool)
	supplementDose(t, pool, mutedRoutine, now.Add(-time.Minute), false)
	mute(t, pool, mutedRoutine, muted.accountID)
	noDevice := newFamily(t, pool, nil)
	supplementDose(t, pool, noDevice.personalRoutine(t, pool), now.Add(-time.Minute), false)

	due, err := repo.ClaimDueSupplementDoses(context.Background(), now, window)
	require.NoError(t, err)
	for _, d := range due {
		require.NotEqual(t, muted.accountID, d.AccountID)
		require.NotEqual(t, noDevice.accountID, d.AccountID)
	}
}

func TestMarkTakenByAction_APersonalDoseIsMarkedOnlyFromTheOwnersDevice(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	ctx := context.Background()
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	tutor := owner.addMember(t, pool, "tutor", "active", nil)
	ownerDevice := ready(t, owner, repo, now)
	tutorDevice := ready(t, tutor, repo, now)
	dose := supplementDose(t, pool, owner.personalRoutine(t, pool), now.Add(-time.Minute), false)

	// A person of the same family has no part in it.
	require.ErrorIs(t, repo.MarkTakenByAction(ctx, dose, tutorDevice.ID), reminder.ErrInvalidActionToken)
	taken, _ := supplementTaken(t, pool, dose)
	require.False(t, taken)

	require.NoError(t, repo.MarkTakenByAction(ctx, dose, ownerDevice.ID))
	taken, by := supplementTaken(t, pool, dose)
	require.True(t, taken)
	require.NotNil(t, by)
	require.Equal(t, owner.accountID, *by)
	require.NoError(t, repo.MarkTakenByAction(ctx, dose, ownerDevice.ID), "idempotent")

	// An off device and an unknown dose are refused like anywhere else.
	other := supplementDose(t, pool, owner.personalRoutine(t, pool), now, false)
	require.NoError(t, repo.DeactivateByID(ctx, ownerDevice.ID))
	require.ErrorIs(t, repo.MarkTakenByAction(ctx, other, ownerDevice.ID), reminder.ErrInvalidActionToken)
	require.ErrorIs(t, repo.MarkTakenByAction(ctx, uuid.New(), tutorDevice.ID), reminder.ErrInvalidActionToken)
}
