package appointment_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/appointment"
)

func TestService_CreateValidatesAgainstTheConsultationDate(t *testing.T) {
	pool := testPool(t)
	svc := newService(newRepo(pool))
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()

	before := appointment.Input{StartsAt: time.Date(2026, 9, 20, 10, 0, 0, 0, time.UTC), UtcOffsetMinutes: offset}
	var verrs appointment.ValidationErrors
	_, err := svc.Create(ctx, f.consultationID, before, f.accountID)
	require.ErrorAs(t, err, &verrs)

	_, err = svc.Create(ctx, uuid.New(), onFriday(""), f.accountID)
	require.ErrorIs(t, err, appointment.ErrConsultationNotFound)

	got, err := svc.Create(ctx, f.consultationID, onFriday("nota"), f.accountID)
	require.NoError(t, err)
	require.Equal(t, appointment.StatusScheduled, got.Derived)
	require.True(t, got.MyReminders)
}

func TestService_TheDerivedStatusFollowsTheClockAndTheReminderChoiceTheSession(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	svc := newService(repo)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	beto := newPerson(t, pool, "Beto")
	created, err := svc.Create(ctx, f.consultationID, onFriday(""), f.accountID)
	require.NoError(t, err)

	require.NoError(t, svc.SetMyReminders(ctx, created.ID, beto, false))
	mine, err := svc.Get(ctx, created.ID, beto)
	require.NoError(t, err)
	require.False(t, mine.MyReminders)
	owners, err := svc.Get(ctx, created.ID, f.accountID)
	require.NoError(t, err)
	require.True(t, owners.MyReminders)

	// A week later (Friday's local day is over): «Pasó sin marcar», everywhere it is read.
	later := func() time.Time { return fixedNow.AddDate(0, 0, 4) }
	appointment.SetServiceNow(svc, later)
	appointment.SetNow(repo, later)
	late, err := svc.Get(ctx, created.ID, f.accountID)
	require.NoError(t, err)
	require.Equal(t, appointment.StatusUnmarked, late.Derived)
	require.Equal(t, appointment.StatusScheduled, late.Status)
	next, history, _, err := svc.ForChild(ctx, f.childID, f.accountID)
	require.NoError(t, err)
	require.Nil(t, next)
	require.Len(t, history, 1)
	require.Equal(t, appointment.StatusUnmarked, history[0].Derived)
	fromConsultation, paid, err := svc.ForConsultation(ctx, f.consultationID, f.accountID)
	require.NoError(t, err)
	require.True(t, paid)
	require.Equal(t, appointment.StatusUnmarked, fromConsultation.Derived)

	// A Tutor can still mark it, with a status the service checks first.
	_, err = svc.SetStatus(ctx, created.ID, appointment.Status("weird"), f.accountID)
	var verrs appointment.ValidationErrors
	require.ErrorAs(t, err, &verrs)
	marked, err := svc.SetStatus(ctx, created.ID, appointment.StatusDone, f.accountID)
	require.NoError(t, err)
	require.Equal(t, appointment.StatusDone, marked.Derived)
}

func TestService_UpdateChecksTheNoticesAndTheDate(t *testing.T) {
	pool := testPool(t)
	svc := newService(newRepo(pool))
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	created, err := svc.Create(ctx, f.consultationID, onFriday(""), f.accountID)
	require.NoError(t, err)

	after := onFriday("")
	after.Notices = &[]appointment.NoticeInput{{Kind: appointment.KindBefore, LeadMinutes: ip(0)}}
	var verrs appointment.ValidationErrors
	_, err = svc.Update(ctx, created.ID, after, f.accountID)
	require.ErrorAs(t, err, &verrs)
	_, err = svc.Update(ctx, uuid.New(), onFriday(""), f.accountID)
	require.ErrorIs(t, err, appointment.ErrNotFound)

	moved := onFriday("nueva")
	moved.StartsAt = friday.Add(48 * time.Hour)
	updated, err := svc.Update(ctx, created.ID, moved, f.accountID)
	require.NoError(t, err)
	require.Equal(t, "nueva", updated.Note)
	require.True(t, updated.StartsAt.Equal(moved.StartsAt))
}

func TestService_DatabaseUnavailable(t *testing.T) {
	svc := newService(appointment.NewRepository(closedPool(t)))
	ctx := context.Background()
	id := uuid.New()
	_, err := svc.Create(ctx, id, onFriday(""), id)
	require.Error(t, err)
	_, err = svc.Update(ctx, id, onFriday(""), id)
	require.Error(t, err)
	_, err = svc.Get(ctx, id, id)
	require.Error(t, err)
	_, err = svc.SetStatus(ctx, id, appointment.StatusDone, id)
	require.Error(t, err)
	require.Error(t, svc.SetMyReminders(ctx, id, id, true))
	_, _, err = svc.ForConsultation(ctx, id, id)
	require.Error(t, err)
	_, _, _, err = svc.ForChild(ctx, id, id)
	require.Error(t, err)
}
