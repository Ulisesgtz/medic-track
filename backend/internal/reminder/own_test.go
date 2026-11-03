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

// specs/058-consultas-del-titular: the reminders of a person's own consultation (no child).

// ownDose saves a consultation of the family's account itself, with one medication, and a dose of it at `at`.
func (f family) ownDose(t *testing.T, pool *pgxpool.Pool, at time.Time) (consultationID, doseID uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO consultations (account_id, doctor_name, consult_date, photo) VALUES ($1, 'Dr. Paz', CURRENT_DATE, '') RETURNING id
	`, f.accountID).Scan(&consultationID))
	var medicationID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO medications (consultation_id, name, frequency_hours, duration_days, start_time) VALUES ($1, 'Losartán', 8, 1, '08:00') RETURNING id
	`, consultationID).Scan(&medicationID))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO doses (medication_id, scheduled_at) VALUES ($1, $2) RETURNING id
	`, medicationID, at).Scan(&doseID))
	return consultationID, doseID
}

func TestOwn_AChildPhoneIsNeverRemindedNorMarksTheParentsOwnDose(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	f := newFamily(t, pool, nil)
	_, device := phone(t, pool, repo, f, now, nil)
	_, own := f.ownDose(t, pool, now.Add(-5*time.Minute))

	due, err := repo.ClaimDueChildDevices(ctx, now, window)
	require.NoError(t, err)
	for _, d := range due {
		require.NotEqual(t, own, d.DoseID, "a phone of a child reminded of the parent's own dose")
	}

	err = repo.MarkTakenByAction(ctx, own, device.ID)
	require.ErrorIs(t, err, reminder.ErrInvalidActionToken)
	require.False(t, doseTaken(t, pool, own))
}

func optIn(t *testing.T, pool *pgxpool.Pool, consultationID, accountID uuid.UUID) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `INSERT INTO own_consultation_reminder_optins (consultation_id, account_id) VALUES ($1, $2)`, consultationID, accountID)
	require.NoError(t, err)
}

func shareOwn(t *testing.T, pool *pgxpool.Pool, accountID uuid.UUID, on bool) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `
		INSERT INTO own_consultation_sharing (account_id, shared) VALUES ($1, $2)
		ON CONFLICT (account_id) DO UPDATE SET shared = EXCLUDED.shared`, accountID, on)
	require.NoError(t, err)
}

func TestOwn_TheOwnerIsRemindedWithoutTheirNameAndNobodyElseUnlessTheyAsked(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	f := newFamily(t, pool, nil)
	ready(t, f, repo, now)
	tutor := f.addMember(t, pool, "tutor", "active", nil)
	ready(t, tutor, repo, now)
	caregiver := f.addMember(t, pool, "caregiver", "active", nil)
	ready(t, caregiver, repo, now)
	k, dose := f.ownDose(t, pool, now.Add(-5*time.Minute))

	// Not shared: only the owner, and the reminder carries no name (it is their own).
	due, err := repo.ClaimDueDoses(ctx, now, window)
	require.NoError(t, err)
	mine := map[uuid.UUID]reminder.DueDose{}
	for _, d := range due {
		if d.DoseID == dose {
			mine[d.AccountID] = d
		}
	}
	require.Len(t, mine, 1)
	require.Equal(t, "", mine[f.accountID].ChildFirstName)
	require.Equal(t, k, mine[f.accountID].ConsultationID)

	// Shared, and the Tutor and the Caregiver asked for the reminders: only the Tutor, with the owner's name.
	_, dose2 := f.ownDose(t, pool, now.Add(-4*time.Minute))
	k2 := consultationOfDose(t, pool, dose2)
	shareOwn(t, pool, f.accountID, true)
	optIn(t, pool, k2, tutor.accountID)
	optIn(t, pool, k2, caregiver.accountID)
	due, err = repo.ClaimDueDoses(ctx, now.Add(time.Second), window)
	require.NoError(t, err)
	got := map[uuid.UUID]reminder.DueDose{}
	for _, d := range due {
		if d.DoseID == dose2 {
			got[d.AccountID] = d
		}
	}
	require.Len(t, got, 2)
	require.Equal(t, "", got[f.accountID].ChildFirstName)
	require.Equal(t, "Ana", got[tutor.accountID].ChildFirstName)
	_, caregiverGot := got[caregiver.accountID]
	require.False(t, caregiverGot, "a Caregiver never sees the parent's own consultations")

	// Sharing turned off: a Tutor who asked gets nothing from the next tick on.
	_, dose3 := f.ownDose(t, pool, now.Add(-3*time.Minute))
	optIn(t, pool, consultationOfDose(t, pool, dose3), tutor.accountID)
	shareOwn(t, pool, f.accountID, false)
	due, err = repo.ClaimDueDoses(ctx, now.Add(2*time.Second), window)
	require.NoError(t, err)
	for _, d := range due {
		if d.DoseID == dose3 {
			require.Equal(t, f.accountID, d.AccountID)
		}
	}
}

func consultationOfDose(t *testing.T, pool *pgxpool.Pool, doseID uuid.UUID) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		SELECT m.consultation_id FROM doses d JOIN medications m ON m.id = d.medication_id WHERE d.id = $1`, doseID).Scan(&id))
	return id
}

func TestOwn_TomadaFromTheOwnersOrASharedTutorsDevice(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	f := newFamily(t, pool, nil)
	owner := ready(t, f, repo, now)
	tutor := f.addMember(t, pool, "tutor", "active", nil)
	tutorDevice := ready(t, tutor, repo, now)

	_, dose := f.ownDose(t, pool, now.Add(-5*time.Minute))
	// Not shared: the Tutor's device can't.
	require.ErrorIs(t, repo.MarkTakenByAction(ctx, dose, tutorDevice.ID), reminder.ErrInvalidActionToken)
	require.False(t, doseTaken(t, pool, dose))
	// The owner's can, as the owner.
	require.NoError(t, repo.MarkTakenByAction(ctx, dose, owner.ID))
	author, _ := doseAuthor(t, pool, dose)
	require.Equal(t, f.accountID, *author)

	// Shared: the Tutor's can, as the Tutor.
	shareOwn(t, pool, f.accountID, true)
	_, dose2 := f.ownDose(t, pool, now.Add(-4*time.Minute))
	require.NoError(t, repo.MarkTakenByAction(ctx, dose2, tutorDevice.ID))
	author, _ = doseAuthor(t, pool, dose2)
	require.Equal(t, tutor.accountID, *author)
}

func TestOwn_AnAppointmentOfThePersonRemindsThemAndATutorOnlyWhoAskedForItsConsultation(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	f := newFamily(t, pool, nil)
	ready(t, f, repo, now)
	tutor := f.addMember(t, pool, "tutor", "active", nil)
	ready(t, tutor, repo, now)
	shareOwn(t, pool, f.accountID, true)
	k, _ := f.ownDose(t, pool, now.Add(-time.Hour*30))

	insert := func(consultationID *uuid.UUID) uuid.UUID {
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, `
			INSERT INTO consultation_appointments (consultation_id, account_id, starts_at, utc_offset_minutes, created_by_account_id, created_at)
			VALUES ($1, $2, $3, -360, $2, $4) RETURNING id`, consultationID, f.accountID, now.Add(2*time.Hour), now.Add(-24*time.Hour)).Scan(&id))
		notice(t, pool, id, now.Add(-time.Minute), now.Add(-24*time.Hour), 121)
		return id
	}
	standalone := insert(nil)
	ofConsultation := insert(&k)
	optIn(t, pool, k, tutor.accountID)

	due, err := repo.ClaimDueAppointmentNotices(ctx, now, window)
	require.NoError(t, err)
	got := map[uuid.UUID][]reminder.DueDose{}
	for _, d := range due {
		got[d.AppointmentID] = append(got[d.AppointmentID], d)
	}
	require.Len(t, got[standalone], 1)
	require.Equal(t, f.accountID, got[standalone][0].AccountID)
	require.Equal(t, "", got[standalone][0].ChildFirstName)
	require.Len(t, got[ofConsultation], 2)
	for _, d := range got[ofConsultation] {
		if d.AccountID == tutor.accountID {
			require.Equal(t, "Ana", d.ChildFirstName)
		} else {
			require.Equal(t, f.accountID, d.AccountID)
		}
	}
}
