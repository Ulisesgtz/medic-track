package reminder_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
)

// specs/074-unir-hijo-duplicado, US2: the reminders of a child the person hid are not sent to the person's devices — the doses,
// the supplements and the appointments — but the child's own phone still gets them. Hiding only counts while the person is in a
// family; showing the child again starts the reminders again, from that moment (the claim only looks at its window).

func hideChild(t *testing.T, f family, hidden bool) {
	t.Helper()
	_, err := testPool(t).Exec(context.Background(), `UPDATE children SET hidden_at = CASE WHEN $2 THEN now() ELSE NULL END WHERE id = $1`, f.childID, hidden)
	require.NoError(t, err)
}

func TestClaim_ANoticeOfAHiddenChildIsNotSentToItsOwnerButThePhoneStillGetsIt(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	ctx := context.Background()

	// Laura owns Mateo and is a Tutor of Ana's family (so hiding him has effect).
	laura := newFamily(t, pool, nil)
	ana := newFamily(t, pool, nil)
	_, err := pool.Exec(ctx, `INSERT INTO family_members (family_account_id, account_id, role) VALUES ($1, $2, 'tutor')`, ana.accountID, laura.accountID)
	require.NoError(t, err)
	ready(t, laura, repo, now)
	link, _ := phone(t, pool, repo, laura, now, nil)

	hideChild(t, laura, true)
	med := laura.dose(t, pool, now.Add(-5*time.Minute), false)
	routine := laura.routine(t, pool, "active")
	sup := supplementDose(t, pool, routine, now.Add(-4*time.Minute), false)
	appt := laura.appointment(t, pool, now, time.Hour, "scheduled")
	notice(t, pool, appt, now.Add(-2*time.Minute), now.Add(-time.Hour), 60)

	doses, err := repo.ClaimDueDoses(ctx, now, window)
	require.NoError(t, err)
	require.Empty(t, doses, "the medication reminder is not sent to Laura")
	sups, err := repo.ClaimDueSupplementDoses(ctx, now, window)
	require.NoError(t, err)
	require.Empty(t, sups)
	notices, err := repo.ClaimDueAppointmentNotices(ctx, now, window)
	require.NoError(t, err)
	require.Empty(t, notices)

	// the child's phone is unaffected
	child, err := repo.ClaimDueChildDevices(ctx, now, window)
	require.NoError(t, err)
	got := map[reminder.Source]bool{}
	for _, d := range child {
		require.Equal(t, link, d.ChildLinkID)
		got[d.Source] = true
	}
	require.True(t, got[reminder.SourceMedication], "the phone still gets the medication")
	require.True(t, got[reminder.SourceSupplement], "and the supplement")

	// showing the child again: the next tick reminds what is still inside the window
	hideChild(t, laura, false)
	doses, err = repo.ClaimDueDoses(ctx, now.Add(time.Second), window)
	require.NoError(t, err)
	require.Contains(t, claimedIDs(doses), med)
	sups, err = repo.ClaimDueSupplementDoses(ctx, now.Add(time.Second), window)
	require.NoError(t, err)
	require.Len(t, sups, 1)
	require.Equal(t, sup, sups[0].DoseID)
	notices, err = repo.ClaimDueAppointmentNotices(ctx, now.Add(time.Second), window)
	require.NoError(t, err)
	require.Len(t, notices, 1)
}

func TestClaim_HidingMeansNothingWithoutAFamily(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	laura := newFamily(t, pool, nil)
	ready(t, laura, repo, now)
	hideChild(t, laura, true) // no family: the column is ignored
	laura.dose(t, pool, now.Add(-5*time.Minute), false)

	doses, err := repo.ClaimDueDoses(context.Background(), now, window)
	require.NoError(t, err)
	require.Len(t, doses, 1)
}

func TestClaim_ThePeopleOfAFamilyStillGetTheRemindersOfAChildNobodyHid(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	ana := newFamily(t, pool, nil)
	laura := ana.addMember(t, pool, "tutor", "active", nil)
	ready(t, ana, repo, now)
	ready(t, laura, repo, now)
	ana.dose(t, pool, now.Add(-5*time.Minute), false)

	doses, err := repo.ClaimDueDoses(context.Background(), now, window)
	require.NoError(t, err)
	require.ElementsMatch(t, []uuid.UUID{ana.accountID, laura.accountID}, accountsOf(doses))
}
