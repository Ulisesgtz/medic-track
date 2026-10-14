package appointment_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/appointment"
)

// specs/043: an appointment added from the child's page, with no consultation, with its own doctor and place.

func standalone(note string) appointment.Input {
	in := onFriday(note)
	in.Doctor = "Dra. Pérez"
	in.Location = "Consultorio 302, Av. Vallarta 1234"
	in.LocationURL = "https://maps.app.goo.gl/abc123"
	return in
}

func TestCreateForChild_SavesItWithItsOwnDoctorAndPlaceAndNoConsultation(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()

	id, err := repo.CreateForChild(ctx, f.childID, build(t, standalone("Revisión")), f.accountID)
	require.NoError(t, err)

	got, err := repo.Get(ctx, id)
	require.NoError(t, err)
	require.Equal(t, uuid.Nil, got.ConsultationID)
	require.Equal(t, f.childID, got.ChildID)
	require.Equal(t, "Dra. Pérez", got.DoctorName)
	require.Equal(t, "Consultorio 302, Av. Vallarta 1234", got.Location)
	require.Equal(t, "https://maps.app.goo.gl/abc123", got.LocationURL)
	require.Equal(t, "", got.ConsultDate)
	require.Len(t, got.Notices, 2, "the default notices")
}

func TestCreateForChild_ManyScheduledAreAllowedAndTheyShowUpInTheChildsList(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()

	for i := 0; i < 2; i++ {
		_, err := repo.CreateForChild(ctx, f.childID, build(t, standalone("")), f.accountID)
		require.NoError(t, err)
	}
	// And one of a consultation, at the same time.
	_, err := repo.Create(ctx, f.consultationID, build(t, onFriday("")), f.accountID)
	require.NoError(t, err)

	next, history, _, err := repo.ForChild(ctx, f.childID)
	require.NoError(t, err)
	require.NotNil(t, next)
	require.Empty(t, history, "the other two are scheduled too, in their own place")
}

func TestCreateForChild_AFreeAccountIsRefusedAndUnknownChildNotFound(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	free := newFamily(t, pool, account.PlanFree)

	_, err := repo.CreateForChild(context.Background(), free.childID, build(t, standalone("")), free.accountID)
	var limit *appointment.PlanLimitError
	require.ErrorAs(t, err, &limit)
	require.Equal(t, appointment.PlanLimitAppointments, limit.Reason)

	_, err = repo.CreateForChild(context.Background(), uuid.New(), build(t, standalone("")), free.accountID)
	require.ErrorIs(t, err, appointment.ErrChildNotFound)
}

func TestStandalone_CanBeEditedMarkedAndTakenBackWithNoConsultationRule(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	svc := newService(repo)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()

	created, err := svc.CreateForChild(ctx, f.childID, standalone("Primera"), f.accountID)
	require.NoError(t, err)
	// Another scheduled one for the same child so «scheduled» can't clash with it when taking «done» back.
	_, err = svc.CreateForChild(ctx, f.childID, standalone("Otra"), f.accountID)
	require.NoError(t, err)

	edit := standalone("Cambiada")
	edit.Doctor = "Dr. Nuevo"
	edit.Location = "Clínica Norte"
	edit.LocationURL = ""
	updated, err := svc.Update(ctx, created.ID, edit, f.accountID)
	require.NoError(t, err)
	require.Equal(t, "Dr. Nuevo", updated.DoctorName)
	require.Equal(t, "Clínica Norte", updated.Location)
	require.Equal(t, "", updated.LocationURL)

	done, err := svc.SetStatus(ctx, created.ID, appointment.StatusDone, f.accountID)
	require.NoError(t, err)
	require.Equal(t, appointment.StatusDone, done.Derived)
	back, err := svc.SetStatus(ctx, created.ID, appointment.StatusScheduled, f.accountID)
	require.NoError(t, err)
	require.Equal(t, appointment.StatusScheduled, back.Derived)
}

func TestConsultationAppointment_KeepsTheConsultationsDoctorUnlessItHasItsOwn(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()

	plain, err := repo.Create(ctx, f.consultationID, build(t, onFriday("")), f.accountID)
	require.NoError(t, err)
	got, err := repo.Get(ctx, plain)
	require.NoError(t, err)
	require.Equal(t, "Dra. López", got.DoctorName, "the consultation's")

	withPlace := onFriday("")
	withPlace.Location = "Hospital Ángeles"
	require.NoError(t, repo.Update(ctx, plain, build(t, withPlace)))
	got, err = repo.Get(ctx, plain)
	require.NoError(t, err)
	require.Equal(t, "Hospital Ángeles", got.Location)
	require.Equal(t, "Dra. López", got.DoctorName)
}

func TestValidateInput_DoctorPlaceAndLinkRules(t *testing.T) {
	ok := func(mut func(*appointment.Input)) appointment.ValidationErrors {
		in := standalone("")
		mut(&in)
		_, errs := appointment.ValidateInput(in, "")
		return errs
	}
	require.False(t, ok(func(*appointment.Input) {}).HasErrors())
	require.False(t, ok(func(in *appointment.Input) { in.LocationURL = "" }).HasErrors(), "the link is optional")

	long := func(n int) string {
		b := make([]rune, n)
		for i := range b {
			b[i] = 'a'
		}
		return string(b)
	}
	require.True(t, ok(func(in *appointment.Input) { in.Doctor = long(201) }).HasErrors())
	require.True(t, ok(func(in *appointment.Input) { in.Location = long(301) }).HasErrors())
	for _, bad := range []string{"javascript:alert(1)", "http://maps.google.com/x", "data:text/html,hi", "https://", "https://user:pw@maps.google.com", "maps.google.com", "ftp://x.com/y", "https://" + long(500) + ".com"} {
		errs := ok(func(in *appointment.Input) { in.LocationURL = bad })
		require.True(t, errs.HasErrors(), bad)
		require.Equal(t, "locationUrl", errs[0].Field, bad)
	}
}
