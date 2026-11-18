package family_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
)

// specs/074-unir-hijo-duplicado: who leaves a family, or is removed from it, gets the children they hid shown again, so coming
// back to a family does not hide them a second time.

// hide gives the person a child and hides it.
func (e *env) hide(t *testing.T, p person) {
	t.Helper()
	_, err := e.pool.Exec(context.Background(), `INSERT INTO children (account_id, first_name, last_name, birth_date, hidden_at) VALUES ($1, 'Mateo', 'López', '2022-03-03', now())`, p.accountID)
	require.NoError(t, err)
}

func (e *env) hiddenCount(t *testing.T, p person) int {
	t.Helper()
	var n int
	require.NoError(t, e.pool.QueryRow(context.Background(), `SELECT count(*) FROM children WHERE account_id = $1 AND hidden_at IS NOT NULL`, p.accountID).Scan(&n))
	return n
}

func TestLeave_TheChildrenThePersonHidShowAgain(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	caregiver := e.newPerson(t, account.PlanFree, true)
	e.join(t, owner, caregiver, "caregiver")
	e.hide(t, caregiver)
	e.hide(t, owner) // somebody else's children are never touched
	require.Equal(t, 1, e.hiddenCount(t, caregiver))

	code, _ := e.do(t, caregiver.clerkID, http.MethodPost, "/family/leave", "")
	require.Equal(t, http.StatusNoContent, code)

	require.Equal(t, 0, e.hiddenCount(t, caregiver))
	require.Equal(t, 1, e.hiddenCount(t, owner))
}

func TestRemove_TheChildrenOfTheRemovedPersonShowAgain(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	caregiver := e.newPerson(t, account.PlanFree, true)
	e.join(t, owner, caregiver, "caregiver")
	e.hide(t, caregiver)
	memberID := e.memberID(t, caregiver)

	code, out := e.do(t, owner.clerkID, http.MethodPost, "/family/members/"+memberID+"/remove", "")
	require.Equal(t, http.StatusNoContent, code, out)

	require.Equal(t, 0, e.hiddenCount(t, caregiver))
}

func TestLeave_ANotMemberChangesNothing(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	e.hide(t, owner)
	code, _ := e.do(t, owner.clerkID, http.MethodPost, "/family/leave", "")
	require.Equal(t, http.StatusForbidden, code, "the owner cannot leave")
	require.Equal(t, 1, e.hiddenCount(t, owner))
}
