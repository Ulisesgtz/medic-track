package family_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
)

// specs/032-compartir-con-familia, US4: leaving and removing.

// join makes `invited` a member of owner's family with the role, through the real invitation flow.
func (e *env) join(t *testing.T, inviter, invited person, role string) {
	t.Helper()
	code, created := e.do(t, inviter.clerkID, http.MethodPost, "/family/invitations", invitePayload(invited.email, role))
	require.Equal(t, http.StatusCreated, code, created)
	code, out := e.do(t, invited.clerkID, http.MethodPost, "/family/invitations/accept", tokenPayload(created["token"].(string)))
	require.Equal(t, http.StatusOK, code, out)
}

func (e *env) memberID(t *testing.T, of person) string {
	t.Helper()
	var id string
	require.NoError(t, e.pool.QueryRow(context.Background(), `SELECT id::text FROM family_members WHERE account_id = $1 AND status = 'active'`, of.accountID).Scan(&id))
	return id
}

func TestLeave_TheInvitedPersonLeavesAtOnceAndKeepsNothingOfTheFamily(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	caregiver := e.newPerson(t, account.PlanFree, true)
	e.join(t, owner, caregiver, "caregiver")

	code, view := e.do(t, caregiver.clerkID, http.MethodGet, "/family", "")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, "caregiver", view["role"])

	code, _ = e.do(t, caregiver.clerkID, http.MethodPost, "/family/leave", "")
	require.Equal(t, http.StatusNoContent, code)

	// Back to a family of their own, with nobody in it.
	code, view = e.do(t, caregiver.clerkID, http.MethodGet, "/family", "")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, "owner", view["role"])
	require.Len(t, view["members"], 0)
	// Leaving again: they belong to no family any more, so they are the owner of their own and have nothing to leave.
	code, out := e.do(t, caregiver.clerkID, http.MethodPost, "/family/leave", "")
	require.Equal(t, http.StatusForbidden, code)
	require.Equal(t, "owner_cannot_leave", out["error"])

	// The owner's family shows nobody, and the place is free again.
	_, view = e.do(t, owner.clerkID, http.MethodGet, "/family", "")
	require.Len(t, view["members"], 0)
	var status string
	require.NoError(t, e.pool.QueryRow(context.Background(), `SELECT status FROM family_members WHERE account_id = $1`, caregiver.accountID).Scan(&status))
	require.Equal(t, "left", status)

	// They can be invited again: a new invitation and a new membership.
	e.join(t, owner, caregiver, "tutor")
}

func TestLeave_TheOwnerCannotLeaveTheirOwnFamily(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	code, out := e.do(t, owner.clerkID, http.MethodPost, "/family/leave", "")
	require.Equal(t, http.StatusForbidden, code)
	require.Equal(t, "owner_cannot_leave", out["error"])
	code, _ = e.do(t, "user_none_"+uuid.NewString(), http.MethodPost, "/family/leave", "")
	require.Equal(t, http.StatusConflict, code)
}

func TestRemove_AnyoneWhoCanDoEverythingRemovesACaregiverButNobodyRemovesATutor(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	tutor := e.newPerson(t, account.PlanFree, true)
	otherTutor := e.newPerson(t, account.PlanFree, true)
	caregiver := e.newPerson(t, account.PlanFree, true)
	e.join(t, owner, tutor, "tutor")
	e.join(t, tutor, caregiver, "caregiver") // a Tutor invites too
	e.join(t, owner, otherTutor, "tutor")

	// Nobody removes a Tutor: not the owner, not another Tutor.
	for _, actor := range []person{owner, tutor, otherTutor} {
		for _, target := range []person{tutor, otherTutor} {
			if actor.accountID == target.accountID {
				continue
			}
			code, out := e.do(t, actor.clerkID, http.MethodPost, "/family/members/"+e.memberID(t, target)+"/remove", "")
			require.Equal(t, http.StatusForbidden, code)
			require.Equal(t, "cannot_remove_tutor", out["error"])
		}
	}

	// A Caregiver can't remove anyone.
	code, out := e.do(t, caregiver.clerkID, http.MethodPost, "/family/members/"+e.memberID(t, tutor)+"/remove", "")
	require.Equal(t, http.StatusForbidden, code, out)
	require.Equal(t, "forbidden", out["error"])

	// A Tutor removes the Caregiver, at once; the membership is only ended (what they registered stays).
	memberID := e.memberID(t, caregiver)
	code, _ = e.do(t, tutor.clerkID, http.MethodPost, "/family/members/"+memberID+"/remove", "")
	require.Equal(t, http.StatusNoContent, code)
	_, view := e.do(t, caregiver.clerkID, http.MethodGet, "/family", "")
	require.Equal(t, "owner", view["role"], "no longer a member")
	var by uuid.UUID
	require.NoError(t, e.pool.QueryRow(context.Background(), `SELECT ended_by_account_id FROM family_members WHERE id = $1`, memberID).Scan(&by))
	require.Equal(t, tutor.accountID, by)

	// Removing again, an unknown id and a malformed one are all "no such member".
	code, out = e.do(t, tutor.clerkID, http.MethodPost, "/family/members/"+memberID+"/remove", "")
	require.Equal(t, http.StatusNotFound, code)
	require.Equal(t, "member_not_found", out["error"])
	code, _ = e.do(t, tutor.clerkID, http.MethodPost, "/family/members/not-a-uuid/remove", "")
	require.Equal(t, http.StatusNotFound, code)
}

func TestRemove_OnlyMembersOfTheirOwnFamily(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	other := e.newPerson(t, account.PlanPaid, true)
	caregiver := e.newPerson(t, account.PlanFree, true)
	e.join(t, owner, caregiver, "caregiver")

	// Another family's owner can't remove a member that isn't in their family.
	code, out := e.do(t, other.clerkID, http.MethodPost, "/family/members/"+e.memberID(t, caregiver)+"/remove", "")
	require.Equal(t, http.StatusNotFound, code, out)
	_, view := e.do(t, caregiver.clerkID, http.MethodGet, "/family", "")
	require.Equal(t, "caregiver", view["role"])
}

func TestMembersAreListedWithCanRemoveOnlyForWhoCanRemoveThem(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	tutor := e.newPerson(t, account.PlanFree, true)
	caregiver := e.newPerson(t, account.PlanFree, true)
	e.join(t, owner, tutor, "tutor")
	e.join(t, owner, caregiver, "caregiver")

	_, view := e.do(t, owner.clerkID, http.MethodGet, "/family", "")
	for _, raw := range view["members"].([]any) {
		m := raw.(map[string]any)
		require.Equal(t, m["role"] == "caregiver", m["canRemove"], "%v", m)
	}
}

func TestLeaveAndRemoveFailPlainlyWithoutTheDatabase(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	e.pool.Close()
	code, _ := e.do(t, owner.clerkID, http.MethodPost, "/family/leave", "")
	require.Equal(t, http.StatusInternalServerError, code)
	code, _ = e.do(t, owner.clerkID, http.MethodPost, "/family/members/"+uuid.NewString()+"/remove", "")
	require.Equal(t, http.StatusInternalServerError, code)
}
