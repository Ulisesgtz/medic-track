package server_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

// Specs/032, US4 and US5 through the real router: the removal rules and the plan that stops and comes back.

// A Tutor is never removed, a Caregiver can be by whoever can do everything.
func TestRouter_OnlyAFullSessionRemovesAndNeverATutor(t *testing.T) {
	w := newWorld(t)
	w.setOwnerPlan(t, "paid")
	var tutorMember, caregiverMember string
	require.NoError(t, w.pool.QueryRow(context.Background(), `SELECT id::text FROM family_members WHERE family_account_id = $1 AND role = 'tutor' AND status = 'active'`, w.accountA).Scan(&tutorMember))
	require.NoError(t, w.pool.QueryRow(context.Background(), `SELECT id::text FROM family_members WHERE family_account_id = $1 AND role = 'caregiver' AND status = 'active'`, w.accountA).Scan(&caregiverMember))

	// The owner, by a direct call, can't remove the Tutor.
	rec := w.do(t, http.MethodPost, "/family/members/"+tutorMember+"/remove", w.verifier.Token(t, w.clerkA), "")
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "cannot_remove_tutor")
	// The Caregiver can't remove anyone.
	rec = w.do(t, http.MethodPost, "/family/members/"+caregiverMember+"/remove", w.verifier.Token(t, w.clerkCaregiver), "")
	require.Equal(t, http.StatusForbidden, rec.Code)
	// A Tutor of a family that stopped paying is capped at Mark and can't either.
	w.setOwnerPlan(t, "free")
	rec = w.do(t, http.MethodPost, "/family/members/"+caregiverMember+"/remove", w.verifier.Token(t, w.clerkTutor), "")
	require.Equal(t, http.StatusForbidden, rec.Code)
	w.setOwnerPlan(t, "paid")
	// The Tutor of a paid family removes the Caregiver, who is then out of everything at once.
	childPath := "/children/" + w.childA.String() + "/consultations"
	require.Equal(t, http.StatusOK, w.do(t, http.MethodGet, childPath, w.verifier.Token(t, w.clerkCaregiver), "").Code)
	rec = w.do(t, http.MethodPost, "/family/members/"+caregiverMember+"/remove", w.verifier.Token(t, w.clerkTutor), "")
	require.Equal(t, http.StatusNoContent, rec.Code)
	require.Equal(t, http.StatusForbidden, w.do(t, http.MethodGet, childPath, w.verifier.Token(t, w.clerkCaregiver), "").Code)
}

func TestRouter_LeavingCutsTheAccessAtOnceAndTheOwnerCannotLeave(t *testing.T) {
	w := newWorld(t)
	childPath := "/children/" + w.childA.String() + "/consultations"
	token := w.verifier.Token(t, w.clerkTutor)
	require.Equal(t, http.StatusOK, w.do(t, http.MethodGet, childPath, token, "").Code)

	require.Equal(t, http.StatusNoContent, w.do(t, http.MethodPost, "/family/leave", token, "").Code)
	require.Equal(t, http.StatusForbidden, w.do(t, http.MethodGet, childPath, token, "").Code)

	rec := w.do(t, http.MethodPost, "/family/leave", w.verifier.Token(t, w.clerkA), "")
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "owner_cannot_leave")
}

// The family's plan being canceled and paid again: the invited person keeps seeing and marking, can't add, and gets their
// role back without a new invitation.
func TestRouter_APlanThatStopsAndComesBackWorksOutForAnInvitedTutorWithoutANewInvitation(t *testing.T) {
	w := newWorld(t)
	token := w.verifier.Token(t, w.clerkTutor)
	childPath := "/children/" + w.childA.String() + "/consultations"
	mark := func() int {
		return w.do(t, http.MethodPatch, "/consultations/"+w.consultationA.String()+"/doses/"+w.doseA.String(), token, `{"taken":true}`).Code
	}

	w.setOwnerPlan(t, "paid")
	require.Equal(t, http.StatusBadRequest, w.do(t, http.MethodPost, childPath, token, `{}`).Code, "a paid family: the Tutor reaches the handler")

	w.setOwnerPlan(t, "free")
	require.Equal(t, http.StatusOK, w.do(t, http.MethodGet, childPath, token, "").Code, "nothing is hidden")
	require.Equal(t, http.StatusForbidden, w.do(t, http.MethodPost, childPath, token, `{}`).Code, "nothing can be added")
	require.Equal(t, http.StatusOK, mark(), "doses can still be marked")
	rec := w.do(t, http.MethodGet, "/family", token, "")
	require.Contains(t, rec.Body.String(), `"readOnly":true`)

	w.setOwnerPlan(t, "paid")
	require.Equal(t, http.StatusBadRequest, w.do(t, http.MethodPost, childPath, token, `{}`).Code, "the role is back, with no new invitation")
	rec = w.do(t, http.MethodGet, "/family", token, "")
	require.Contains(t, rec.Body.String(), `"readOnly":false`)
}
