package appointment_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/appointment"
)

// specs/058: a person's own appointments — with no child, with or without one of their own consultations.

func ownConsultation(t *testing.T, e *env) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, e.pool.QueryRow(context.Background(), `
		INSERT INTO consultations (account_id, doctor_name, consult_date, photo) VALUES ($1, 'Dr. Propio', '2026-09-28', '') RETURNING id`,
		e.accountID).Scan(&id))
	return id
}

func TestOwnAppointments_CreateAndListThePersonsOwn(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	base := "/accounts/" + e.accountID.String() + "/appointments"

	code, got := e.do(t, e.owner, http.MethodPost, base, apptBody("Revisión"))
	require.Equal(t, http.StatusCreated, code, got)
	require.Nil(t, got["consultationId"])
	require.Nil(t, got["childId"])

	// One of an own consultation, through the consultation's route.
	k := ownConsultation(t, e)
	code, got = e.do(t, e.owner, http.MethodPost, "/consultations/"+k.String()+"/appointments", apptBody("Control"))
	require.Equal(t, http.StatusCreated, code, got)
	require.Equal(t, k.String(), got["consultationId"])

	code, got = e.do(t, e.owner, http.MethodGet, base, "")
	require.Equal(t, http.StatusOK, code, got)
	require.NotNil(t, got["next"])
	require.Equal(t, true, got["paidPlan"])

	// None of them is the child's.
	code, got = e.do(t, e.owner, http.MethodGet, "/children/"+e.childID.String()+"/appointments", "")
	require.Equal(t, http.StatusOK, code)
	require.Nil(t, got["next"])

	// A Caregiver of the family sees none of it, even shared.
	_, err := e.pool.Exec(context.Background(), `INSERT INTO own_consultation_sharing (account_id, shared) VALUES ($1, true)`, e.accountID)
	require.NoError(t, err)
	code, _ = e.do(t, e.caregiver, http.MethodGet, base, "")
	require.Equal(t, http.StatusForbidden, code)
	code, _ = e.do(t, e.caregiver, http.MethodPost, base, apptBody(""))
	require.Equal(t, http.StatusForbidden, code)
}

func TestOwnAppointments_ThePlanOfTheirOwnThings(t *testing.T) {
	e := newEnv(t, account.PlanFree)
	base := "/accounts/" + e.accountID.String() + "/appointments"
	code, got := e.do(t, e.owner, http.MethodPost, base, apptBody(""))
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "appointments", got["reason"])

	k := ownConsultation(t, e)
	code, got = e.do(t, e.owner, http.MethodPost, "/consultations/"+k.String()+"/appointments", apptBody(""))
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "appointments", got["reason"])

	code, got = e.do(t, e.owner, http.MethodGet, base, "")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, false, got["paidPlan"])

	code, _ = e.do(t, e.owner, http.MethodPost, base, `{`)
	require.Equal(t, http.StatusBadRequest, code)
	code, _ = e.do(t, e.owner, http.MethodGet, "/accounts/not-a-uuid/appointments", "")
	require.Equal(t, http.StatusNotFound, code)
}

func TestOwnAppointments_NoSuchAccount(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	svc := newService(newRepo(e.pool))
	_, err := svc.CreateOwn(context.Background(), uuid.New(), appointment.Input{StartsAt: friday, UtcOffsetMinutes: offset}, e.accountID)
	require.Error(t, err)
	_, _, _, err = svc.ForPerson(context.Background(), uuid.New(), e.accountID)
	require.Error(t, err)
}
