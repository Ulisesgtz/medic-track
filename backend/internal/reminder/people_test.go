package reminder_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
)

// specs/032-compartir-con-familia, US3: a dose is reminded to each person with access and an active device, once each.

// ready registers an early-activated device for the person (so the dose counts) and returns it.
func ready(t *testing.T, f family, repo *reminder.Repository, now time.Time) reminder.Device {
	t.Helper()
	d := f.device(t, repo, uniqueEndpoint())
	activatedAt(t, testPool(t), d.ID, now.Add(-time.Hour))
	return d
}

func accountsOf(due []reminder.DueDose) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(due))
	for _, d := range due {
		out = append(out, d.AccountID)
	}
	return out
}

func TestClaimDueDoses_OnePairPerPersonWithAccessAndADevice(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	tutor := owner.addMember(t, pool, "tutor", "active", nil)
	caregiver := owner.addMember(t, pool, "caregiver", "active", nil)
	kid := owner.addMember(t, pool, "child", "active", nil)
	ready(t, owner, repo, now)
	ready(t, tutor, repo, now)
	ready(t, caregiver, repo, now)
	ready(t, kid, repo, now)
	dose := owner.dose(t, pool, now.Add(-5*time.Minute), false)

	due, err := repo.ClaimDueDoses(context.Background(), now, window)
	require.NoError(t, err)
	require.ElementsMatch(t, []uuid.UUID{owner.accountID, tutor.accountID, caregiver.accountID, kid.accountID}, accountsOf(due))
	for _, d := range due {
		require.Equal(t, dose, d.DoseID)
		require.Equal(t, "Mateo", d.ChildFirstName)
	}

	// Two ticks in a row never repeat a pair.
	again, err := repo.ClaimDueDoses(context.Background(), now.Add(time.Second), window)
	require.NoError(t, err)
	require.Empty(t, again)
}

func TestClaimDueDoses_NobodyIsRemindedOfADoseAlreadyMarked(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	tutor := owner.addMember(t, pool, "tutor", "active", nil)
	ready(t, owner, repo, now)
	ready(t, tutor, repo, now)
	owner.dose(t, pool, now.Add(-5*time.Minute), true)

	due, err := repo.ClaimDueDoses(context.Background(), now, window)
	require.NoError(t, err)
	require.Empty(t, due)
}

func TestClaimDueDoses_NotThoseWithoutAccessWithoutDeviceOrWithADeviceTurnedOnLate(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	left := owner.addMember(t, pool, "tutor", "left", nil)
	removed := owner.addMember(t, pool, "caregiver", "removed", nil)
	noDevice := owner.addMember(t, pool, "caregiver", "active", nil)
	late := owner.addMember(t, pool, "caregiver", "active", nil)
	stranger := newFamily(t, pool, nil) // another family altogether
	ready(t, owner, repo, now)
	ready(t, left, repo, now)
	ready(t, removed, repo, now)
	ready(t, stranger, repo, now)
	lateDevice := late.device(t, repo, uniqueEndpoint())
	activatedAt(t, pool, lateDevice.ID, now) // after the dose
	_ = noDevice
	owner.dose(t, pool, now.Add(-5*time.Minute), false)

	due, err := repo.ClaimDueDoses(context.Background(), now, window)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{owner.accountID}, accountsOf(due))
}

func TestClaimDueDoses_AChildRoleMemberOnlyGetsTheirOwnChildsDoses(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	kid := owner.addMember(t, pool, "child", "active", nil) // their child is owner.childID
	ready(t, kid, repo, now)

	// A second child of the same family, with a dose of its own.
	var siblingChild, siblingConsultation, siblingMedication uuid.UUID
	ctx := context.Background()
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO children (account_id, first_name, last_name, birth_date) VALUES ($1, 'Sofía', 'Gómez', '2019-01-01') RETURNING id`, owner.accountID).Scan(&siblingChild))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO consultations (child_id, doctor_name, consult_date, photo) VALUES ($1, 'Dra. López', CURRENT_DATE, '\x00') RETURNING id`, siblingChild).Scan(&siblingConsultation))
	require.NoError(t, pool.QueryRow(ctx, `INSERT INTO medications (consultation_id, name, frequency_hours, duration_days, start_time) VALUES ($1, 'Ibuprofeno', 8, 1, '08:00') RETURNING id`, siblingConsultation).Scan(&siblingMedication))
	_, err := pool.Exec(ctx, `INSERT INTO doses (medication_id, scheduled_at) VALUES ($1, $2)`, siblingMedication, now.Add(-5*time.Minute))
	require.NoError(t, err)
	own := owner.dose(t, pool, now.Add(-6*time.Minute), false)

	due, err := repo.ClaimDueDoses(ctx, now, window)
	require.NoError(t, err)
	require.Len(t, due, 1, "the sibling's dose is not theirs")
	require.Equal(t, own, due[0].DoseID)
	require.Equal(t, kid.accountID, due[0].AccountID)
}

func TestClaimDueDoses_EachPersonHasTheirOwnDetailChoice(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, strPtr("detailed"))
	caregiver := owner.addMember(t, pool, "caregiver", "active", strPtr("generic"))
	undecided := owner.addMember(t, pool, "tutor", "active", nil)
	ready(t, owner, repo, now)
	ready(t, caregiver, repo, now)
	ready(t, undecided, repo, now)
	owner.dose(t, pool, now.Add(-5*time.Minute), false)

	due, err := repo.ClaimDueDoses(context.Background(), now, window)
	require.NoError(t, err)
	byAccount := map[uuid.UUID]*reminder.DetailMode{}
	for _, d := range due {
		byAccount[d.AccountID] = d.Detail
	}
	require.Equal(t, reminder.DetailDetailed, *byAccount[owner.accountID])
	require.Equal(t, reminder.DetailGeneric, *byAccount[caregiver.accountID])
	require.Nil(t, byAccount[undecided.accountID], "not chosen yet: the service treats it as generic")
}

func TestClaimDueDoses_WhatWasRemindedBeforeThePerPersonTableIsNotSentAgain(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	caregiver := owner.addMember(t, pool, "caregiver", "active", nil)
	ready(t, owner, repo, now)
	ready(t, caregiver, repo, now)
	dose := owner.dose(t, pool, now.Add(-5*time.Minute), false)
	// As the migration leaves it: the owner was reminded, with the old column and the new table.
	_, err := pool.Exec(context.Background(), `UPDATE doses SET reminder_sent_at = $2 WHERE id = $1`, dose, now.Add(-4*time.Minute))
	require.NoError(t, err)
	_, err = pool.Exec(context.Background(), `INSERT INTO dose_reminders (dose_id, account_id, sent_at) VALUES ($1, $2, $3)`, dose, owner.accountID, now.Add(-4*time.Minute))
	require.NoError(t, err)

	due, err := repo.ClaimDueDoses(context.Background(), now, window)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{caregiver.accountID}, accountsOf(due), "the owner is not reminded twice")

	// The old column keeps its first value (compatibility): it is only a stamp now.
	var stamp time.Time
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT reminder_sent_at FROM doses WHERE id = $1`, dose).Scan(&stamp))
	require.WithinDuration(t, now.Add(-4*time.Minute), stamp, time.Second)
}

func TestClaimDueDoses_StampsTheOldColumnForCompatibility(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	ready(t, owner, repo, now)
	dose := owner.dose(t, pool, now.Add(-5*time.Minute), false)

	_, err := repo.ClaimDueDoses(context.Background(), now, window)
	require.NoError(t, err)
	var stamp *time.Time
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT reminder_sent_at FROM doses WHERE id = $1`, dose).Scan(&stamp))
	require.NotNil(t, stamp)
}

func TestClaimDueDoses_TwoInstancesAtOnceNeverShareAPair(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	ready(t, owner, repo, now)
	for i := 0; i < 3; i++ {
		m := owner.addMember(t, pool, "caregiver", "active", nil)
		ready(t, m, repo, now)
	}
	owner.dose(t, pool, now.Add(-5*time.Minute), false)

	type result struct {
		due []reminder.DueDose
		err error
	}
	results := make(chan result, 2)
	for i := 0; i < 2; i++ {
		go func() {
			due, err := repo.ClaimDueDoses(context.Background(), now, window)
			results <- result{due, err}
		}()
	}
	seen := map[uuid.UUID]int{}
	for i := 0; i < 2; i++ {
		r := <-results
		require.NoError(t, r.err)
		for _, a := range accountsOf(r.due) {
			seen[a]++
		}
	}
	require.Len(t, seen, 4)
	for account, n := range seen {
		require.Equal(t, 1, n, "the pair of %s was claimed more than once", account)
	}
}

func TestService_Tick_EachPersonGetsTheirOwnReminderOnTheirOwnDevices(t *testing.T) {
	now := uniqueNow()
	sender := &fakeSender{}
	svc, repo := newService(t, sender, now)
	pool := testPool(t)
	owner := newFamily(t, pool, strPtr("detailed"))
	caregiver := owner.addMember(t, pool, "caregiver", "active", strPtr("generic"))
	ownerPhone := ready(t, owner, repo, now)
	ownerPC := ready(t, owner, repo, now)
	caregiverPhone := ready(t, caregiver, repo, now)
	dose := owner.dose(t, pool, now.Add(-time.Minute), false)

	delivered, err := svc.Tick(context.Background())
	require.NoError(t, err)
	require.Equal(t, 3, delivered)
	require.Len(t, sender.sentTo(ownerPhone.ID), 1)
	require.Len(t, sender.sentTo(ownerPC.ID), 1)
	require.Len(t, sender.sentTo(caregiverPhone.ID), 1)

	detailed := decode(t, sender.sentTo(ownerPhone.ID)[0].payload)
	require.Equal(t, "detailed", detailed["kind"])
	require.Equal(t, "Amoxicilina", detailed["medication"])
	require.Equal(t, "Mateo", detailed["child"])

	// The Caregiver chose the generic text: nothing of the child or the medication travels to them.
	raw := string(sender.sentTo(caregiverPhone.ID)[0].payload)
	generic := decode(t, sender.sentTo(caregiverPhone.ID)[0].payload)
	require.Equal(t, "generic", generic["kind"])
	require.NotContains(t, raw, "Amoxicilina")
	require.NotContains(t, raw, "Mateo")
	require.Equal(t, dose.String(), generic["doseId"])

	// Their tokens are for their own devices.
	require.NotEqual(t, detailed["actionToken"], generic["actionToken"])
}

func TestService_Tick_TheTomadaOfOnePersonIsTheirsAndTheOthersSeeWhoMarked(t *testing.T) {
	now := uniqueNow()
	sender := &fakeSender{}
	svc, repo := newService(t, sender, now)
	pool := testPool(t)
	owner := newFamily(t, pool, strPtr("detailed"))
	tutor := owner.addMember(t, pool, "tutor", "active", strPtr("detailed"))
	ownerDevice := ready(t, owner, repo, now)
	tutorDevice := ready(t, tutor, repo, now)
	dose := owner.dose(t, pool, now.Add(-time.Minute), false)

	_, err := svc.Tick(context.Background())
	require.NoError(t, err)

	// The tutor taps "Tomada" on THEIR notification: the dose is marked in their name.
	tutorToken, _ := decode(t, sender.sentTo(tutorDevice.ID)[0].payload)["actionToken"].(string)
	require.NotEmpty(t, tutorToken)
	require.NoError(t, svc.MarkTakenWithToken(context.Background(), tutorToken))
	author, at := doseAuthor(t, pool, dose)
	require.NotNil(t, author)
	require.Equal(t, tutor.accountID, *author)
	require.NotNil(t, at)

	// The owner's own button, tapped later, changes nothing: the first mark keeps its author.
	ownerToken, _ := decode(t, sender.sentTo(ownerDevice.ID)[0].payload)["actionToken"].(string)
	require.NoError(t, svc.MarkTakenWithToken(context.Background(), ownerToken))
	author, _ = doseAuthor(t, pool, dose)
	require.Equal(t, tutor.accountID, *author)
}

func TestService_Tick_LosingTheAccessCutsTheRemindersAtOnceWithoutTouchingTheDevice(t *testing.T) {
	now := uniqueNow()
	sender := &fakeSender{}
	svc, repo := newService(t, sender, now)
	pool := testPool(t)
	owner := newFamily(t, pool, nil)
	caregiver := owner.addMember(t, pool, "caregiver", "active", nil)
	ownerDevice := ready(t, owner, repo, now)
	caregiverDevice := ready(t, caregiver, repo, now)
	owner.dose(t, pool, now.Add(-time.Minute), false)

	// They leave before the tick: the next one reminds only the owner, and their device stays as it was.
	_, err := pool.Exec(context.Background(), `
		UPDATE family_members SET status = 'left', ended_at = now(), ended_by_account_id = account_id
		WHERE family_account_id = $1 AND account_id = $2`, owner.accountID, caregiver.accountID)
	require.NoError(t, err)

	delivered, err := svc.Tick(context.Background())
	require.NoError(t, err)
	require.Equal(t, 1, delivered)
	require.Len(t, sender.sentTo(ownerDevice.ID), 1)
	require.Empty(t, sender.sentTo(caregiverDevice.ID))
	require.True(t, deviceActive(t, pool, caregiverDevice.ID))
}
