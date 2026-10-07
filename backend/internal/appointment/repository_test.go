package appointment_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/appointment"
)

func TestCreate_SavesTheAppointmentWithItsDefaultNotices(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()

	id, err := repo.Create(ctx, f.consultationID, build(t, onFriday("Revisión de oído")), f.accountID)
	require.NoError(t, err)

	got, err := repo.Get(ctx, id)
	require.NoError(t, err)
	require.Equal(t, appointment.StatusScheduled, got.Status)
	require.Equal(t, "Revisión de oído", got.Note)
	require.Equal(t, "Dra. López", got.DoctorName)
	require.Equal(t, "2026-09-28", got.ConsultDate)
	require.Equal(t, "Ana", got.CreatedBy)
	require.True(t, got.PaidPlan)
	require.True(t, got.StartsAt.Equal(friday))
	require.Equal(t, offset, got.UtcOffsetMinutes)
	require.Len(t, got.Notices, 2)
	// Ordered by the instant they fire: one day before, then two hours before.
	require.Equal(t, 1440, got.Notices[0].LeadMinutes)
	require.True(t, got.Notices[0].FireAt.Equal(friday.Add(-24*time.Hour)))
	require.Equal(t, 120, got.Notices[1].LeadMinutes)
}

func TestCreate_KeepsAFixedHourNotice(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	notices := []appointment.NoticeInput{{Kind: appointment.KindAtTime, DaysBefore: ip(1), AtTime: sp("20:00")}}
	in := onFriday("")
	in.Notices = &notices
	id, err := repo.Create(context.Background(), f.consultationID, build(t, in), f.accountID)
	require.NoError(t, err)
	got, err := repo.Get(context.Background(), id)
	require.NoError(t, err)
	require.Len(t, got.Notices, 1)
	require.Equal(t, appointment.KindAtTime, got.Notices[0].Kind)
	require.Equal(t, 1, got.Notices[0].DaysBefore)
	require.Equal(t, "20:00", got.Notices[0].AtTime)
	require.True(t, got.Notices[0].FireAt.Equal(time.Date(2026, 10, 9, 2, 0, 0, 0, time.UTC)), "Thu 20:00 at -06:00")
}

func TestCreate_AFreeAccountIsRefusedAndNothingIsWritten(t *testing.T) {
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanFree)
	_, err := newRepo(pool).Create(context.Background(), f.consultationID, build(t, onFriday("")), f.accountID)
	var planErr *appointment.PlanLimitError
	require.ErrorAs(t, err, &planErr)
	require.Equal(t, appointment.PlanLimitAppointments, planErr.Reason)
	var n int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM consultation_appointments WHERE consultation_id = $1`, f.consultationID).Scan(&n))
	require.Zero(t, n)
}

func TestCreate_UnknownConsultation(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	_, err := repo.Create(context.Background(), uuid.New(), build(t, onFriday("")), uuid.New())
	require.ErrorIs(t, err, appointment.ErrConsultationNotFound)
	_, _, err = repo.ConsultDate(context.Background(), uuid.New())
	require.ErrorIs(t, err, appointment.ErrConsultationNotFound)
	date, child, err := repo.ConsultDate(context.Background(), newFamily(t, pool, account.PlanPaid).consultationID)
	require.NoError(t, err)
	require.Equal(t, "2026-09-28", date)
	require.NotEqual(t, uuid.Nil, child)
}

func TestCreate_OneScheduledPerConsultationAndAnotherAfterCancelingOrMarking(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	first, err := repo.Create(ctx, f.consultationID, build(t, onFriday("")), f.accountID)
	require.NoError(t, err)

	_, err = repo.Create(ctx, f.consultationID, build(t, onFriday("otra")), f.accountID)
	require.ErrorIs(t, err, appointment.ErrExists)

	require.NoError(t, repo.SetStatus(ctx, first, appointment.StatusCanceled, f.accountID))
	_, err = repo.Create(ctx, f.consultationID, build(t, onFriday("nueva fecha")), f.accountID)
	require.NoError(t, err, "a canceled one stays in the history and another can be made")
}

func TestCreate_ConcurrentRequestsLeaveOneScheduled(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	const attempts = 5
	results := make([]error, attempts)
	var wg sync.WaitGroup
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, results[i] = repo.Create(ctx, f.consultationID, build(t, onFriday("carrera")), f.accountID)
		}()
	}
	wg.Wait()
	ok := 0
	for _, err := range results {
		if err == nil {
			ok++
		} else {
			require.True(t, errors.Is(err, appointment.ErrExists), "unexpected: %v", err)
		}
	}
	require.Equal(t, 1, ok)
}

func TestUpdate_ANoteChangeKeepsTheNoticesAndWhatWasSentForThem(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	id, err := repo.Create(ctx, f.consultationID, build(t, onFriday("antes")), f.accountID)
	require.NoError(t, err)
	before, err := repo.Get(ctx, id)
	require.NoError(t, err)
	// A reminder was already sent for the first notice.
	_, err = pool.Exec(ctx, `INSERT INTO appointment_notice_reminders (notice_id, account_id) VALUES ($1, $2)`, before.Notices[0].ID, f.accountID)
	require.NoError(t, err)

	// Same date, a new note, the two-hours notice swapped for three hours.
	notices := []appointment.NoticeInput{{Kind: appointment.KindBefore, LeadMinutes: ip(1440)}, {Kind: appointment.KindBefore, LeadMinutes: ip(180)}}
	in := onFriday("después")
	in.Notices = &notices
	require.NoError(t, repo.Update(ctx, id, build(t, in)))

	after, err := repo.Get(ctx, id)
	require.NoError(t, err)
	require.Equal(t, "después", after.Note)
	require.Len(t, after.Notices, 2)
	require.Contains(t, noticeIDs(after), before.Notices[0].ID, "the unchanged notice is the same row")
	require.NotContains(t, noticeIDs(after), before.Notices[1].ID, "the dropped one is gone")
	var sent int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM appointment_notice_reminders WHERE notice_id = $1`, before.Notices[0].ID).Scan(&sent))
	require.Equal(t, 1, sent, "what was already sent is not forgotten, so it is not sent again")
}

func TestUpdate_MovingTheDateMakesAllNoticesAgain(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	id, err := repo.Create(ctx, f.consultationID, build(t, onFriday("")), f.accountID)
	require.NoError(t, err)
	before, err := repo.Get(ctx, id)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO appointment_notice_reminders (notice_id, account_id) VALUES ($1, $2)`, before.Notices[0].ID, f.accountID)
	require.NoError(t, err)

	moved := onFriday("")
	moved.StartsAt = friday.Add(24 * time.Hour)
	require.NoError(t, repo.Update(ctx, id, build(t, moved)))

	after, err := repo.Get(ctx, id)
	require.NoError(t, err)
	require.Len(t, after.Notices, 2)
	for _, n := range after.Notices {
		require.NotContains(t, noticeIDs(before), n.ID)
	}
	require.True(t, after.StartsAt.Equal(moved.StartsAt))
	var orphans int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM appointment_notice_reminders WHERE notice_id = $1`, before.Notices[0].ID).Scan(&orphans))
	require.Zero(t, orphans)
}

func TestUpdate_OnlyAScheduledOneAndOnlyWithThePaidPlan(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	id, err := repo.Create(ctx, f.consultationID, build(t, onFriday("")), f.accountID)
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `UPDATE accounts SET plan = 'free' WHERE id = $1`, f.accountID)
	require.NoError(t, err)
	var planErr *appointment.PlanLimitError
	require.ErrorAs(t, repo.Update(ctx, id, build(t, onFriday("x"))), &planErr)
	// Marking it never needs the plan.
	require.NoError(t, repo.SetStatus(ctx, id, appointment.StatusDone, f.accountID))
	require.ErrorIs(t, repo.Update(ctx, id, build(t, onFriday("x"))), appointment.ErrClosed)
	require.ErrorIs(t, repo.Update(ctx, uuid.New(), build(t, onFriday("x"))), appointment.ErrNotFound)
}

func TestSetStatus_DoneCanceledAndTheUndo(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	beto := newPerson(t, pool, "Beto")
	id, err := repo.Create(ctx, f.consultationID, build(t, onFriday("")), f.accountID)
	require.NoError(t, err)

	require.NoError(t, repo.SetStatus(ctx, id, appointment.StatusDone, beto))
	got, err := repo.Get(ctx, id)
	require.NoError(t, err)
	require.Equal(t, appointment.StatusDone, got.Status)
	require.Equal(t, "Beto", got.StatusBy)
	require.NotNil(t, got.StatusAt)

	require.ErrorIs(t, repo.SetStatus(ctx, id, appointment.StatusCanceled, beto), appointment.ErrClosed, "a done one is not canceled")
	require.NoError(t, repo.SetStatus(ctx, id, appointment.StatusScheduled, beto), "the mark is taken back")
	got, err = repo.Get(ctx, id)
	require.NoError(t, err)
	require.Equal(t, appointment.StatusScheduled, got.Status)
	require.Empty(t, got.StatusBy)
	require.Nil(t, got.StatusAt)

	require.ErrorIs(t, repo.SetStatus(ctx, id, appointment.StatusScheduled, beto), appointment.ErrClosed, "already scheduled")
	require.NoError(t, repo.SetStatus(ctx, id, appointment.StatusCanceled, beto))
	require.ErrorIs(t, repo.SetStatus(ctx, id, appointment.StatusScheduled, beto), appointment.ErrClosed, "canceled is final")
	require.ErrorIs(t, repo.SetStatus(ctx, id, appointment.StatusDone, beto), appointment.ErrClosed)
	require.ErrorIs(t, repo.SetStatus(ctx, uuid.New(), appointment.StatusDone, beto), appointment.ErrNotFound)
}

func TestSetStatus_TheUndoNeedsNoOtherScheduledOne(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	first, err := repo.Create(ctx, f.consultationID, build(t, onFriday("")), f.accountID)
	require.NoError(t, err)
	require.NoError(t, repo.SetStatus(ctx, first, appointment.StatusDone, f.accountID))
	_, err = repo.Create(ctx, f.consultationID, build(t, onFriday("otra")), f.accountID)
	require.NoError(t, err)
	require.ErrorIs(t, repo.SetStatus(ctx, first, appointment.StatusScheduled, f.accountID), appointment.ErrExists)
}

func TestForConsultation(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()

	none, paid, err := repo.ForConsultation(ctx, f.consultationID)
	require.NoError(t, err)
	require.Nil(t, none)
	require.True(t, paid)

	id, err := repo.Create(ctx, f.consultationID, build(t, onFriday("")), f.accountID)
	require.NoError(t, err)
	got, _, err := repo.ForConsultation(ctx, f.consultationID)
	require.NoError(t, err)
	require.Equal(t, id, got.ID)
	require.Len(t, got.Notices, 2)

	require.NoError(t, repo.SetStatus(ctx, id, appointment.StatusCanceled, f.accountID))
	got, _, err = repo.ForConsultation(ctx, f.consultationID)
	require.NoError(t, err)
	require.Nil(t, got, "a canceled one is history, not the consultation's appointment")

	_, _, err = repo.ForConsultation(ctx, uuid.New())
	require.ErrorIs(t, err, appointment.ErrConsultationNotFound)
}

func TestForChild_NextHistoryAndTheOrder(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool) // now = Wed 7 Oct 12:00 UTC
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	mk := func(consultDate string, starts time.Time, status appointment.Status) uuid.UUID {
		cid := newConsultation(t, pool, f.childID, consultDate)
		id, err := repo.Create(ctx, cid, build(t, appointment.Input{StartsAt: starts, UtcOffsetMinutes: offset}), f.accountID)
		require.NoError(t, err)
		if status != appointment.StatusScheduled {
			require.NoError(t, repo.SetStatus(ctx, id, status, f.accountID))
		}
		return id
	}
	later := mk("2026-09-01", time.Date(2026, 10, 20, 16, 0, 0, 0, time.UTC), appointment.StatusScheduled)
	nearest := mk("2026-09-02", friday, appointment.StatusScheduled)
	unmarked := mk("2026-08-01", time.Date(2026, 8, 20, 15, 30, 0, 0, time.UTC), appointment.StatusScheduled)
	done := mk("2026-08-02", time.Date(2026, 9, 15, 23, 0, 0, 0, time.UTC), appointment.StatusDone)
	canceled := mk("2026-07-01", time.Date(2026, 8, 3, 18, 0, 0, 0, time.UTC), appointment.StatusCanceled)

	next, history, paid, err := repo.ForChild(ctx, f.childID)
	require.NoError(t, err)
	require.True(t, paid)
	require.Equal(t, nearest, next.ID)
	require.Len(t, next.Notices, 2)
	ids := []uuid.UUID{}
	for _, h := range history {
		ids = append(ids, h.ID)
	}
	require.Equal(t, []uuid.UUID{done, unmarked, canceled}, ids, "most recent first; the scheduled one further ahead is in its consultation")
	require.NotContains(t, ids, later)

	_, _, _, err = repo.ForChild(ctx, uuid.New())
	require.ErrorIs(t, err, appointment.ErrChildNotFound)

	empty := newFamily(t, pool, account.PlanFree)
	next, history, paid, err = repo.ForChild(ctx, empty.childID)
	require.NoError(t, err)
	require.Nil(t, next)
	require.Empty(t, history)
	require.False(t, paid)
}

func TestGet_Unknown(t *testing.T) {
	_, err := newRepo(testPool(t)).Get(context.Background(), uuid.New())
	require.ErrorIs(t, err, appointment.ErrNotFound)
}

func TestSetMuted_EachPersonDecidesOnlyWhileScheduled(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	beto := newPerson(t, pool, "Beto")
	id, err := repo.Create(ctx, f.consultationID, build(t, onFriday("")), f.accountID)
	require.NoError(t, err)

	require.NoError(t, repo.SetMuted(ctx, id, beto, true))
	require.NoError(t, repo.SetMuted(ctx, id, beto, true), "idempotent")
	muted, err := repo.MutedAmong(ctx, beto, []uuid.UUID{id})
	require.NoError(t, err)
	require.True(t, muted[id])
	others, err := repo.MutedAmong(ctx, f.accountID, []uuid.UUID{id})
	require.NoError(t, err)
	require.False(t, others[id])
	require.NoError(t, repo.SetMuted(ctx, id, beto, false))
	muted, err = repo.MutedAmong(ctx, beto, []uuid.UUID{id})
	require.NoError(t, err)
	require.False(t, muted[id])
	empty, err := repo.MutedAmong(ctx, beto, nil)
	require.NoError(t, err)
	require.Empty(t, empty)

	require.NoError(t, repo.SetStatus(ctx, id, appointment.StatusDone, f.accountID))
	require.ErrorIs(t, repo.SetMuted(ctx, id, beto, true), appointment.ErrNotScheduled)
	require.ErrorIs(t, repo.SetMuted(ctx, uuid.New(), beto, true), appointment.ErrNotFound)
}

func TestRepository_DatabaseUnavailable(t *testing.T) {
	repo := appointment.NewRepository(closedPool(t))
	ctx := context.Background()
	id := uuid.New()
	n := build(t, onFriday(""))
	_, err := repo.Create(ctx, id, n, id)
	require.Error(t, err)
	_, err = repo.Get(ctx, id)
	require.Error(t, err)
	_, _, err = repo.ForConsultation(ctx, id)
	require.Error(t, err)
	_, _, _, err = repo.ForChild(ctx, id)
	require.Error(t, err)
	require.Error(t, repo.Update(ctx, id, n))
	require.Error(t, repo.SetStatus(ctx, id, appointment.StatusDone, id))
	require.Error(t, repo.SetMuted(ctx, id, id, true))
	_, err = repo.MutedAmong(ctx, id, []uuid.UUID{id})
	require.Error(t, err)
	_, _, err = repo.ConsultDate(ctx, id)
	require.Error(t, err)
}
