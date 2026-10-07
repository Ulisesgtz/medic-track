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

// specs/033, part 2: a notice of the next appointment is reminded to each person with access and an active device, once each,
// unless that person turned the appointment's reminders off; never late, never for a done or canceled appointment.

// appointment inserts a scheduled appointment of f's consultation that starts `startsIn` from now and returns its id.
func (f family) appointment(t *testing.T, pool *pgxpool.Pool, now time.Time, startsIn time.Duration, status string) uuid.UUID {
	t.Helper()
	// One scheduled appointment per consultation: each one gets its own.
	var consultationID uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO consultations (child_id, doctor_name, consult_date, photo) VALUES ($1, 'Dra. López', CURRENT_DATE, 'x'::bytea) RETURNING id`, f.childID).Scan(&consultationID))
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO consultation_appointments (consultation_id, child_id, account_id, starts_at, utc_offset_minutes, note, status,
		                                       status_by_account_id, status_at, created_by_account_id)
		VALUES ($1, $2, $3::uuid, $4, 0, 'Nota privada', $5::text, CASE WHEN $5::text = 'scheduled' THEN NULL ELSE $3::uuid END,
		        CASE WHEN $5::text = 'scheduled' THEN NULL ELSE now() END, $3::uuid)
		RETURNING id`, consultationID, f.childID, f.accountID, now.Add(startsIn), status).Scan(&id))
	return id
}

// notice adds a notice to the appointment that fires at fireAt and was created at createdAt.
func notice(t *testing.T, pool *pgxpool.Pool, appointmentID uuid.UUID, fireAt, createdAt time.Time, leadMinutes int) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO appointment_notices (appointment_id, kind, lead_minutes, fire_at, created_at) VALUES ($1, 'before', $2, $3, $4) RETURNING id`,
		appointmentID, leadMinutes, fireAt, createdAt).Scan(&id))
	return id
}

func muteAppointment(t *testing.T, pool *pgxpool.Pool, appointmentID, accountID uuid.UUID) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `INSERT INTO appointment_muted (appointment_id, account_id) VALUES ($1, $2)`, appointmentID, accountID)
	require.NoError(t, err)
}

func TestClaimDueAppointmentNotices_OnePairPerPersonWithAccessAndADevice(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	tutor := owner.addMember(t, pool, "tutor", "active", nil)
	caregiver := owner.addMember(t, pool, "caregiver", "active", nil)
	left := owner.addMember(t, pool, "caregiver", "left", nil)
	for _, p := range []family{owner, tutor, caregiver, left} {
		ready(t, p, repo, now)
	}
	ap := owner.appointment(t, pool, now, 2*time.Hour, "scheduled")
	n := notice(t, pool, ap, now.Add(-2*time.Minute), now.Add(-time.Hour), 122)

	due, err := repo.ClaimDueAppointmentNotices(context.Background(), now, window)
	require.NoError(t, err)
	require.ElementsMatch(t, []uuid.UUID{owner.accountID, tutor.accountID, caregiver.accountID}, accountsOf(due))
	for _, d := range due {
		require.Equal(t, n, d.DoseID, "the notice")
		require.Equal(t, ap, d.AppointmentID)
		require.Equal(t, reminder.SourceAppointment, d.Source)
		require.Equal(t, 122, d.LeadMinutes)
		require.Equal(t, "Dra. López", d.DoctorName)
		require.Equal(t, "Nota privada", d.Note)
		require.Equal(t, "Mateo", d.ChildFirstName)
		require.True(t, d.StartsAt.Equal(now.Add(2*time.Hour)))
	}

	again, err := repo.ClaimDueAppointmentNotices(context.Background(), now.Add(time.Second), window)
	require.NoError(t, err)
	require.Empty(t, again, "two ticks in a row never repeat a pair")
}

func TestClaimDueAppointmentNotices_NeverLateNeverWhenClosedNorAfterTheStart(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	ready(t, owner, repo, now)

	// Already past when it was saved (created after it should have fired): never sent late.
	late := owner.appointment(t, pool, now, 3*time.Hour, "scheduled")
	notice(t, pool, late, now.Add(-10*time.Minute), now.Add(-5*time.Minute), 190)
	// Not yet due, and older than the window.
	soon := owner.appointment(t, pool, now, 5*time.Hour, "scheduled")
	notice(t, pool, soon, now.Add(10*time.Minute), now.Add(-time.Hour), 290)
	notice(t, pool, soon, now.Add(-3*time.Hour), now.Add(-5*time.Hour), 480)
	// Done and canceled appointments stop reminding.
	for _, status := range []string{"done", "canceled"} {
		closed := owner.appointment(t, pool, now, 4*time.Hour, status)
		notice(t, pool, closed, now.Add(-2*time.Minute), now.Add(-time.Hour), 242)
	}
	// The appointment already started.
	started := owner.appointment(t, pool, now, -10*time.Minute, "scheduled")
	notice(t, pool, started, now.Add(-2*time.Minute), now.Add(-time.Hour), 60)

	due, err := repo.ClaimDueAppointmentNotices(context.Background(), now, window)
	require.NoError(t, err)
	require.Empty(t, due)
}

func TestClaimDueAppointmentNotices_ADeviceTurnedOnLateAndWhoMutedAreLeftOut(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	caregiver := owner.addMember(t, pool, "caregiver", "active", nil)
	ready(t, owner, repo, now)
	ready(t, caregiver, repo, now)
	late := owner.addMember(t, pool, "tutor", "active", nil)
	d := late.device(t, repo, uniqueEndpoint())
	activatedAt(t, pool, d.ID, now.Add(-time.Minute)) // after the notice fired

	ap := owner.appointment(t, pool, now, 2*time.Hour, "scheduled")
	notice(t, pool, ap, now.Add(-2*time.Minute), now.Add(-time.Hour), 122)
	muteAppointment(t, pool, ap, caregiver.accountID)

	due, err := repo.ClaimDueAppointmentNotices(context.Background(), now, window)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{owner.accountID}, accountsOf(due))
}

// FR-020: an appointment created while the plan was paid keeps reminding when the plan lapses.
func TestClaimDueAppointmentNotices_AFreeOwnerStillGetsHerReminders(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	_, err := pool.Exec(context.Background(), `UPDATE accounts SET plan = 'free' WHERE id = $1`, owner.accountID)
	require.NoError(t, err)
	ready(t, owner, repo, now)
	notice(t, pool, owner.appointment(t, pool, now, 2*time.Hour, "scheduled"), now.Add(-2*time.Minute), now.Add(-time.Hour), 122)

	due, err := repo.ClaimDueAppointmentNotices(context.Background(), now, window)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{owner.accountID}, accountsOf(due))
}

func TestClaimDueAppointmentNotices_ConcurrentClaimsNeverShareAPair(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	owner := newFamily(t, pool, nil)
	tutor := owner.addMember(t, pool, "tutor", "active", nil)
	ready(t, owner, repo, now)
	ready(t, tutor, repo, now)
	notice(t, pool, owner.appointment(t, pool, now, 2*time.Hour, "scheduled"), now.Add(-2*time.Minute), now.Add(-time.Hour), 122)

	const claimers = 5
	results := make(chan int, claimers)
	for i := 0; i < claimers; i++ {
		go func() {
			due, err := repo.ClaimDueAppointmentNotices(context.Background(), now, window)
			if err != nil {
				due = nil
			}
			results <- len(due)
		}()
	}
	total := 0
	for i := 0; i < claimers; i++ {
		total += <-results
	}
	require.Equal(t, 2, total)
}

func TestClaimDueAppointmentNotices_DatabaseError(t *testing.T) {
	_, err := reminder.NewRepository(closedPool(t)).ClaimDueAppointmentNotices(context.Background(), time.Now(), window)
	require.Error(t, err)
}

// The service sends each person's reminder with their own detail, and an appointment's carries no token and no dose.
func TestService_Tick_AppointmentRemindersPerPersonWithTheirOwnDetail(t *testing.T) {
	now := uniqueNow()
	sender := &fakeSender{}
	svc, repo := newService(t, sender, now)
	pool := testPool(t)
	owner := newFamily(t, pool, strPtr("detailed"))
	caregiver := owner.addMember(t, pool, "caregiver", "active", nil) // has not chosen: generic
	ownerDevice, caregiverDevice := ready(t, owner, repo, now), ready(t, caregiver, repo, now)
	ap := owner.appointment(t, pool, now, 2*time.Hour, "scheduled")
	notice(t, pool, ap, now.Add(-time.Minute), now.Add(-time.Hour), 121)

	delivered, err := svc.Tick(context.Background())
	require.NoError(t, err)
	require.Equal(t, 2, delivered)

	detailed := decode(t, sender.sentTo(ownerDevice.ID)[0].payload)
	require.Equal(t, "detailed", detailed["kind"])
	require.Equal(t, "appointment", detailed["source"])
	require.Equal(t, ap.String(), detailed["appointmentId"])
	require.EqualValues(t, 121, detailed["leadMinutes"])
	require.Equal(t, "Mateo", detailed["child"])
	require.Equal(t, "Dra. López", detailed["doctor"])
	require.Equal(t, "Nota privada", detailed["note"])
	require.NotContains(t, detailed, "doseId")
	require.NotContains(t, detailed, "actionToken", "an appointment has no «Tomada»")
	require.NotContains(t, detailed, "consultationId")

	generic := decode(t, sender.sentTo(caregiverDevice.ID)[0].payload)
	require.Equal(t, "generic", generic["kind"])
	require.Equal(t, "appointment", generic["source"])
	require.EqualValues(t, 121, generic["leadMinutes"])
	for _, key := range []string{"child", "doctor", "note", "medication"} {
		require.NotContains(t, generic, key, "a generic reminder carries no health data")
	}

	delivered, err = svc.Tick(context.Background())
	require.NoError(t, err)
	require.Zero(t, delivered)
}
