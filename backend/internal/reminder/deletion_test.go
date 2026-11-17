package reminder_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
)

// specs/070: an account scheduled for deletion gets no reminder — of a medication, a supplement or an appointment — while
// the other people of the same child still do; canceling the deletion gives the reminders back.
func TestClaims_AnAccountScheduledForDeletionGetsNoReminder(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	ctx := context.Background()
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	tutor := owner.addMember(t, pool, "tutor", "active", nil)
	ready(t, owner, repo, now)
	ready(t, tutor, repo, now)
	_, err := pool.Exec(ctx, `INSERT INTO account_deletions (account_id, requested_at, scheduled_for) VALUES ($1, $2::timestamptz, $2::timestamptz + interval '30 days')`,
		owner.accountID, now)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM account_deletions WHERE account_id = $1`, owner.accountID)
	})

	owner.dose(t, pool, now.Add(-5*time.Minute), false)
	due, err := repo.ClaimDueDoses(ctx, now, window)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{tutor.accountID}, accountsOf(due), "only the Tutor")

	routine := owner.routine(t, pool, "active")
	supplementDose(t, pool, routine, now.Add(-5*time.Minute), false)
	due, err = repo.ClaimDueSupplementDoses(ctx, now, window)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{tutor.accountID}, accountsOf(due))

	appointment := owner.appointment(t, pool, now, 2*time.Hour, "scheduled")
	notice(t, pool, appointment, now.Add(-time.Minute), now.Add(-time.Hour), 60)
	due, err = repo.ClaimDueAppointmentNotices(ctx, now, window)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{tutor.accountID}, accountsOf(due))

	// Canceled: the next dose reaches the owner again.
	_, err = pool.Exec(ctx, `UPDATE account_deletions SET canceled_at = $2 WHERE account_id = $1`, owner.accountID, now)
	require.NoError(t, err)
	owner.dose(t, pool, now.Add(-2*time.Minute), false)
	due, err = repo.ClaimDueDoses(ctx, now.Add(time.Second), window)
	require.NoError(t, err)
	require.Contains(t, accountsOf(due), owner.accountID)
}
