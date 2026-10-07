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

// specs/033-recordatorios-suplementos-citas: a supplement routine's doses are reminded to each person with access and an
// active device, once each, unless that person turned the routine's reminders off.

// routine inserts a supplement routine of f's child (status active unless told otherwise) and returns its id.
func (f family) routine(t *testing.T, pool *pgxpool.Pool, status string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO supplement_routines (account_id, child_id, name, period, times, first_date, utc_offset_minutes, status, paused_at, generated_until, created_by_account_id)
		VALUES ($1, $2, 'Vitamina D', 'daily', ARRAY['08:00']::time[], current_date - 2, 0, $3, CASE WHEN $3 = 'paused' THEN now() END, now() + interval '14 days', $1)
		RETURNING id`, f.accountID, f.childID, status).Scan(&id))
	return id
}

func supplementDose(t *testing.T, pool *pgxpool.Pool, routineID uuid.UUID, at time.Time, taken bool) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO supplement_doses (routine_id, scheduled_at, taken) VALUES ($1, $2, $3) RETURNING id`, routineID, at, taken).Scan(&id))
	return id
}

func mute(t *testing.T, pool *pgxpool.Pool, routineID, accountID uuid.UUID) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `INSERT INTO supplement_muted (routine_id, account_id) VALUES ($1, $2)`, routineID, accountID)
	require.NoError(t, err)
}

func supplementTaken(t *testing.T, pool *pgxpool.Pool, id uuid.UUID) (bool, *uuid.UUID) {
	t.Helper()
	var taken bool
	var by *uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT taken, taken_by_account_id FROM supplement_doses WHERE id = $1`, id).Scan(&taken, &by))
	return taken, by
}

func TestClaimDueSupplementDoses_OnePairPerPersonWithAccessAndADevice(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	tutor := owner.addMember(t, pool, "tutor", "active", nil)
	caregiver := owner.addMember(t, pool, "caregiver", "active", nil)
	kid := owner.addMember(t, pool, "child", "active", nil)
	left := owner.addMember(t, pool, "caregiver", "left", nil)
	noDevice := owner.addMember(t, pool, "caregiver", "active", nil)
	_ = noDevice
	for _, p := range []family{owner, tutor, caregiver, kid, left} {
		ready(t, p, repo, now)
	}
	routine := owner.routine(t, pool, "active")
	dose := supplementDose(t, pool, routine, now.Add(-5*time.Minute), false)

	due, err := repo.ClaimDueSupplementDoses(context.Background(), now, window)
	require.NoError(t, err)
	require.ElementsMatch(t, []uuid.UUID{owner.accountID, tutor.accountID, caregiver.accountID, kid.accountID}, accountsOf(due))
	for _, d := range due {
		require.Equal(t, dose, d.DoseID)
		require.Equal(t, routine, d.RoutineID)
		require.Equal(t, reminder.SourceSupplement, d.Source)
		require.Equal(t, "Vitamina D", d.MedicationName)
		require.Equal(t, "Mateo", d.ChildFirstName)
		require.Equal(t, uuid.Nil, d.ConsultationID)
	}

	// Two ticks in a row never repeat a pair.
	again, err := repo.ClaimDueSupplementDoses(context.Background(), now.Add(time.Second), window)
	require.NoError(t, err)
	require.Empty(t, again)
}

func TestClaimDueSupplementDoses_NobodyIsRemindedOfADoseAlreadyMarked(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	tutor := owner.addMember(t, pool, "tutor", "active", nil)
	ready(t, owner, repo, now)
	ready(t, tutor, repo, now)
	supplementDose(t, pool, owner.routine(t, pool, "active"), now.Add(-5*time.Minute), true)

	due, err := repo.ClaimDueSupplementDoses(context.Background(), now, window)
	require.NoError(t, err)
	require.Empty(t, due)
}

func TestClaimDueSupplementDoses_TimingWindowAndDeviceActivation(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	ready(t, owner, repo, now)
	routine := owner.routine(t, pool, "active")
	supplementDose(t, pool, routine, now.Add(10*time.Minute), false) // not yet
	supplementDose(t, pool, routine, now.Add(-2*time.Hour), false)   // older than the window

	due, err := repo.ClaimDueSupplementDoses(context.Background(), now, window)
	require.NoError(t, err)
	require.Empty(t, due)

	// A device turned on after the dose does not count for it.
	late := newFamily(t, pool, nil)
	d := late.device(t, repo, uniqueEndpoint())
	activatedAt(t, pool, d.ID, now.Add(-time.Minute))
	supplementDose(t, pool, late.routine(t, pool, "active"), now.Add(-5*time.Minute), false)
	due, err = repo.ClaimDueSupplementDoses(context.Background(), now, window)
	require.NoError(t, err)
	require.Empty(t, due)
}

func TestClaimDueSupplementDoses_NotForPausedOrEndedRoutinesNorOnesAlreadyUnregistered(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	ready(t, owner, repo, now)
	for _, status := range []string{"paused", "ended"} {
		r := owner.routine(t, pool, "active")
		supplementDose(t, pool, r, now.Add(-5*time.Minute), false)
		_, err := pool.Exec(context.Background(), `UPDATE supplement_routines SET status = $2, paused_at = now(), ended_at = now() WHERE id = $1`, r, status)
		require.NoError(t, err)
	}
	// "Sin registrar": the routine's next dose already came.
	r := owner.routine(t, pool, "active")
	supplementDose(t, pool, r, now.Add(-30*time.Minute), false)
	supplementDose(t, pool, r, now.Add(-10*time.Minute), true)

	due, err := repo.ClaimDueSupplementDoses(context.Background(), now, window)
	require.NoError(t, err)
	require.Empty(t, due)
}

func TestClaimDueSupplementDoses_ThePersonWhoMutedTheRoutineIsLeftOutAndNobodyElse(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	caregiver := owner.addMember(t, pool, "caregiver", "active", nil)
	ready(t, owner, repo, now)
	ready(t, caregiver, repo, now)
	routine := owner.routine(t, pool, "active")
	supplementDose(t, pool, routine, now.Add(-5*time.Minute), false)
	mute(t, pool, routine, caregiver.accountID)

	due, err := repo.ClaimDueSupplementDoses(context.Background(), now, window)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{owner.accountID}, accountsOf(due))
}

// FR-020: a routine created while the plan was paid keeps reminding when the plan lapses.
func TestClaimDueSupplementDoses_AFreeOwnerStillGetsHerReminders(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	_, err := pool.Exec(context.Background(), `UPDATE accounts SET plan = 'free' WHERE id = $1`, owner.accountID)
	require.NoError(t, err)
	ready(t, owner, repo, now)
	supplementDose(t, pool, owner.routine(t, pool, "active"), now.Add(-5*time.Minute), false)

	due, err := repo.ClaimDueSupplementDoses(context.Background(), now, window)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{owner.accountID}, accountsOf(due))
}

func TestClaimDueSupplementDoses_ConcurrentClaimsNeverShareAPair(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	tutor := owner.addMember(t, pool, "tutor", "active", nil)
	ready(t, owner, repo, now)
	ready(t, tutor, repo, now)
	supplementDose(t, pool, owner.routine(t, pool, "active"), now.Add(-5*time.Minute), false)

	const claimers = 5
	results := make(chan []reminder.DueDose, claimers)
	for i := 0; i < claimers; i++ {
		go func() {
			due, err := repo.ClaimDueSupplementDoses(context.Background(), now, window)
			if err != nil {
				due = nil
			}
			results <- due
		}()
	}
	total := 0
	for i := 0; i < claimers; i++ {
		total += len(<-results)
	}
	require.Equal(t, 2, total, "one reminder for each of the two people, whoever claimed it")
}

func TestClaimDueSupplementDoses_DatabaseError(t *testing.T) {
	_, err := reminder.NewRepository(closedPool(t)).ClaimDueSupplementDoses(context.Background(), time.Now(), window)
	require.Error(t, err)
}

// The service sends each person's reminder, generic or detailed by their own choice, and a supplement's carries the routine.
func TestService_Tick_SupplementRemindersPerPersonWithTheirOwnDetail(t *testing.T) {
	now := uniqueNow()
	sender := &fakeSender{}
	svc, repo := newService(t, sender, now)
	pool := testPool(t)
	owner := newFamily(t, pool, strPtr("detailed"))
	caregiver := owner.addMember(t, pool, "caregiver", "active", nil) // has not chosen: generic
	ownerDevice, caregiverDevice := ready(t, owner, repo, now), ready(t, caregiver, repo, now)
	routine := owner.routine(t, pool, "active")
	dose := supplementDose(t, pool, routine, now.Add(-time.Minute), false)

	delivered, err := svc.Tick(context.Background())
	require.NoError(t, err)
	require.Equal(t, 2, delivered)

	detailed := decode(t, sender.sentTo(ownerDevice.ID)[0].payload)
	require.Equal(t, "detailed", detailed["kind"])
	require.Equal(t, "supplement", detailed["source"])
	require.Equal(t, routine.String(), detailed["routineId"])
	require.Equal(t, dose.String(), detailed["doseId"])
	require.Equal(t, "Vitamina D", detailed["medication"])
	require.Equal(t, "Mateo", detailed["child"])
	require.NotContains(t, detailed, "consultationId")
	require.NotEmpty(t, detailed["actionToken"])

	generic := decode(t, sender.sentTo(caregiverDevice.ID)[0].payload)
	require.Equal(t, "generic", generic["kind"])
	require.Equal(t, "supplement", generic["source"])
	require.Equal(t, routine.String(), generic["routineId"])
	require.NotContains(t, generic, "medication", "a generic reminder carries no name")
	require.NotContains(t, generic, "child")

	delivered, err = svc.Tick(context.Background())
	require.NoError(t, err)
	require.Zero(t, delivered)
}

func TestBuildPayload_AMedicationKeepsItsShape(t *testing.T) {
	p := reminder.BuildPayload(reminder.DueDose{DoseID: uuid.New(), Source: reminder.SourceMedication, ConsultationID: uuid.New(), ScheduledAt: time.Now()}, "tok")
	require.NotEmpty(t, p.ConsultationID)
	require.Empty(t, p.RoutineID)
	require.Empty(t, p.Source)
}

func TestMarkTakenByAction_ASupplementDoseIsMarkedInTheNameOfTheDevicesAccount(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	ctx := context.Background()
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	caregiver := owner.addMember(t, pool, "caregiver", "active", nil)
	device := ready(t, caregiver, repo, now)
	dose := supplementDose(t, pool, owner.routine(t, pool, "active"), now.Add(-time.Minute), false)

	require.NoError(t, repo.MarkTakenByAction(ctx, dose, device.ID))
	taken, by := supplementTaken(t, pool, dose)
	require.True(t, taken)
	require.NotNil(t, by)
	require.Equal(t, caregiver.accountID, *by)
	require.NoError(t, repo.MarkTakenByAction(ctx, dose, device.ID), "idempotent")

	// A device of someone with no access, one that is off and an unknown dose are all refused.
	stranger := newFamily(t, pool, nil)
	strangerDevice := ready(t, stranger, repo, now)
	other := supplementDose(t, pool, owner.routine(t, pool, "active"), now, false)
	require.ErrorIs(t, repo.MarkTakenByAction(ctx, other, strangerDevice.ID), reminder.ErrInvalidActionToken)
	require.NoError(t, repo.DeactivateByID(ctx, device.ID))
	require.ErrorIs(t, repo.MarkTakenByAction(ctx, other, device.ID), reminder.ErrInvalidActionToken)
	require.ErrorIs(t, repo.MarkTakenByAction(ctx, uuid.New(), strangerDevice.ID), reminder.ErrInvalidActionToken)
	taken, _ = supplementTaken(t, pool, other)
	require.False(t, taken)
}
