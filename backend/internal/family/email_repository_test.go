package family_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/family"
)

// specs/040: the state of an invitation's e-mail and the checks around it, against the real tables.

// invited creates an invitation as a paid owner and returns its id and the hash of its token.
func (e *env) invited(t *testing.T, owner person) (uuid.UUID, []byte) {
	t.Helper()
	code, out := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload("mail."+uuid.NewString()+"@example.com", "caregiver"))
	require.Equal(t, http.StatusCreated, code, out)
	return uuid.MustParse(out["id"].(string)), family.HashToken(out["token"].(string))
}

func (e *env) emailState(t *testing.T, id uuid.UUID) (status string, at *time.Time) {
	t.Helper()
	require.NoError(t, e.pool.QueryRow(context.Background(), `SELECT email_status, email_status_at FROM family_invitations WHERE id = $1`, id).Scan(&status, &at))
	return status, at
}

func TestANewInvitationHasNoEmailState(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	id, _ := e.invited(t, owner)
	status, at := e.emailState(t, id)
	require.Equal(t, "none", status)
	require.Nil(t, at)

	view, err := e.service.View(context.Background(), owner.clerkID)
	require.NoError(t, err)
	require.Len(t, view.Invitations, 1)
	require.Equal(t, family.EmailNone, view.Invitations[0].EmailStatus)
	require.Nil(t, view.Invitations[0].EmailStatusAt)
}

func TestSetEmailStatusMovesOnlyFromTheExpectedStateAndTheCurrentToken(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	id, hash := e.invited(t, owner)
	ctx := context.Background()

	// nothing to move from 'sending' while it is 'none'
	changed, err := e.repo.SetEmailStatus(ctx, id, hash, family.EmailSending, family.EmailSent)
	require.NoError(t, err)
	require.False(t, changed)

	_, err = e.pool.Exec(ctx, `UPDATE family_invitations SET email_status = 'sending', email_status_at = now() WHERE id = $1`, id)
	require.NoError(t, err)

	// an old token (a send that a resend left behind) changes nothing
	changed, err = e.repo.SetEmailStatus(ctx, id, family.HashToken("an-old-token"), family.EmailSending, family.EmailSent)
	require.NoError(t, err)
	require.False(t, changed)
	status, _ := e.emailState(t, id)
	require.Equal(t, "sending", status)

	changed, err = e.repo.SetEmailStatus(ctx, id, hash, family.EmailSending, family.EmailSent)
	require.NoError(t, err)
	require.True(t, changed)
	status, at := e.emailState(t, id)
	require.Equal(t, "sent", status)
	require.NotNil(t, at)

	// and it can't be moved twice
	changed, err = e.repo.SetEmailStatus(ctx, id, hash, family.EmailSending, family.EmailFailed)
	require.NoError(t, err)
	require.False(t, changed)
}

func TestStillCurrentFollowsResendCancelAcceptanceAndExpiry(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	ctx := context.Background()

	id, hash := e.invited(t, owner)
	sending := func(id uuid.UUID) {
		_, err := e.pool.Exec(ctx, `UPDATE family_invitations SET email_status = 'sending', email_status_at = now() WHERE id = $1`, id)
		require.NoError(t, err)
	}
	current, err := e.repo.StillCurrent(ctx, id, hash)
	require.NoError(t, err)
	require.False(t, current, "no e-mail is waiting to be sent while the state is not 'sending'")
	sending(id)
	current, err = e.repo.StillCurrent(ctx, id, hash)
	require.NoError(t, err)
	require.True(t, current)

	// the sweep closed it as failed while it waited in the queue: it is not sent afterwards
	_, err = e.pool.Exec(ctx, `UPDATE family_invitations SET email_status = 'failed' WHERE id = $1`, id)
	require.NoError(t, err)
	current, err = e.repo.StillCurrent(ctx, id, hash)
	require.NoError(t, err)
	require.False(t, current)
	sending(id)

	// a resend gives a new token: the old send is obsolete
	code, out := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations/"+id.String()+"/resend", "")
	require.Equal(t, http.StatusOK, code, out)
	current, err = e.repo.StillCurrent(ctx, id, hash)
	require.NoError(t, err)
	require.False(t, current)
	newHash := family.HashToken(out["token"].(string))
	sending(id)
	current, err = e.repo.StillCurrent(ctx, id, newHash)
	require.NoError(t, err)
	require.True(t, current)

	// expired
	_, err = e.pool.Exec(ctx, `UPDATE family_invitations SET expires_at = now() - interval '1 minute' WHERE id = $1`, id)
	require.NoError(t, err)
	current, err = e.repo.StillCurrent(ctx, id, newHash)
	require.NoError(t, err)
	require.False(t, current)

	// canceled
	id2, hash2 := e.invited(t, owner)
	sending(id2)
	code, out = e.do(t, owner.clerkID, http.MethodPost, "/family/invitations/"+id2.String()+"/cancel", "")
	require.Equal(t, http.StatusNoContent, code, out)
	current, err = e.repo.StillCurrent(ctx, id2, hash2)
	require.NoError(t, err)
	require.False(t, current)
}

func TestSweepStaleSendingClosesOnlyTheOldOnes(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	ctx := context.Background()
	oldID, _ := e.invited(t, owner)
	freshID, _ := e.invited(t, owner)
	sentID, _ := e.invited(t, owner)
	_, err := e.pool.Exec(ctx, `UPDATE family_invitations SET email_status = 'sending', email_status_at = now() - interval '10 minutes' WHERE id = $1`, oldID)
	require.NoError(t, err)
	_, err = e.pool.Exec(ctx, `UPDATE family_invitations SET email_status = 'sending', email_status_at = now() WHERE id = $1`, freshID)
	require.NoError(t, err)
	_, err = e.pool.Exec(ctx, `UPDATE family_invitations SET email_status = 'sent', email_status_at = now() - interval '10 minutes' WHERE id = $1`, sentID)
	require.NoError(t, err)

	// other tests in this database may leave stale 'sending' rows of their own: only check these three
	_, err = e.repo.SweepStaleSending(ctx, 3*time.Minute)
	require.NoError(t, err)
	status, _ := e.emailState(t, oldID)
	require.Equal(t, "failed", status)
	status, _ = e.emailState(t, freshID)
	require.Equal(t, "sending", status)
	status, _ = e.emailState(t, sentID)
	require.Equal(t, "sent", status)
}
