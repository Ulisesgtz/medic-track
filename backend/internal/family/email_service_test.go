package family_test

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/family"
)

// specs/040: creating and resending an invitation asks for its e-mail (or not), within the limits, and never waits for it.

type mailRig struct {
	*env
	d *family.EmailDispatcher
}

func newMailRig(t *testing.T, perInvitation, perFamily int) *mailRig {
	t.Helper()
	e := newEnv(t)
	d := family.NewEmailDispatcher(e.repo, &fakeProvider{}, &fakeQuota{}, nil) // never started: the jobs stay in the queue
	e.service.SetEmail(family.EmailSettings{Dispatcher: d, From: "PediTrack <alertas@pedi-track.com>", Origin: "https://dev.pedi-track.com", PerInvitation: perInvitation, PerFamily: perFamily})
	return &mailRig{env: e, d: d}
}

func (m *mailRig) invite(t *testing.T, owner person) *family.Invitation {
	t.Helper()
	inv, err := m.service.Invite(context.Background(), owner.clerkID, family.InviteInput{Email: "mail." + uuid.NewString() + "@example.com", Role: family.RoleCaregiver})
	require.NoError(t, err)
	return inv
}

func TestInviteQueuesTheEmailWithTheLinkAndDoesNotWaitForIt(t *testing.T) {
	m := newMailRig(t, 3, 10)
	owner := m.newPerson(t, account.PlanPaid, true)

	inv := m.invite(t, owner)
	require.Equal(t, family.EmailSending, inv.EmailStatus)
	require.NotNil(t, inv.EmailStatusAt)

	job, ok := m.d.Take()
	require.True(t, ok)
	require.Equal(t, inv.ID, job.InvitationID)
	require.Equal(t, family.HashToken(inv.Token), job.TokenHash)
	require.Equal(t, inv.Email, job.Message.To)
	require.Equal(t, "PediTrack <alertas@pedi-track.com>", job.Message.From)
	require.Equal(t, "Ana te invitó a PediTrack", job.Message.Subject, "only the first name of the inviter")
	link := "https://dev.pedi-track.com/familia/invitacion#" + inv.Token
	require.Contains(t, job.Message.Text, link)
	require.Contains(t, job.Message.HTML, `href="`+link+`"`)
	require.NotContains(t, job.Message.Text+job.Message.HTML, "Prueba", "never the inviter's last name")
	require.NotContains(t, job.Message.Text+job.Message.HTML, owner.email)
	require.Equal(t, "family-invitation-"+inv.ID.String()+"-1", job.Message.IdempotencyKey)
	_, more := m.d.Take()
	require.False(t, more, "one e-mail per invitation")

	status, _ := m.emailState(t, inv.ID)
	require.Equal(t, "sending", status)
}

func TestResendQueuesTheEmailOfTheNewLinkAndCancelQueuesNothing(t *testing.T) {
	m := newMailRig(t, 3, 10)
	owner := m.newPerson(t, account.PlanPaid, true)
	inv := m.invite(t, owner)
	first, _ := m.d.Take()

	again, err := m.service.Resend(context.Background(), owner.clerkID, inv.ID)
	require.NoError(t, err)
	require.Equal(t, family.EmailSending, again.EmailStatus)
	second, ok := m.d.Take()
	require.True(t, ok)
	require.NotEqual(t, first.TokenHash, second.TokenHash)
	require.Contains(t, second.Message.Text, again.Token)
	require.NotContains(t, second.Message.Text, inv.Token, "the old link is not in the new e-mail")
	require.Equal(t, "family-invitation-"+inv.ID.String()+"-2", second.Message.IdempotencyKey)

	require.NoError(t, m.service.Cancel(context.Background(), owner.clerkID, inv.ID))
	_, any := m.d.Take()
	require.False(t, any, "canceling sends nothing")
}

func TestWithoutADispatcherOrAnOriginNothingIsEmailed(t *testing.T) {
	e := newEnv(t) // no SetEmail
	owner := e.newPerson(t, account.PlanPaid, true)
	inv, err := e.service.Invite(context.Background(), owner.clerkID, family.InviteInput{Email: "a." + uuid.NewString() + "@example.com", Role: family.RoleTutor})
	require.NoError(t, err)
	require.Equal(t, family.EmailNone, inv.EmailStatus)
	require.Nil(t, inv.EmailStatusAt)

	d := family.NewEmailDispatcher(e.repo, &fakeProvider{}, &fakeQuota{}, nil)
	e.service.SetEmail(family.EmailSettings{Dispatcher: d, PerInvitation: 3, PerFamily: 10}) // no origin: no link to build
	owner2 := e.newPerson(t, account.PlanPaid, true)
	inv2, err := e.service.Invite(context.Background(), owner2.clerkID, family.InviteInput{Email: "b." + uuid.NewString() + "@example.com", Role: family.RoleTutor})
	require.NoError(t, err)
	require.Equal(t, family.EmailNone, inv2.EmailStatus)
	_, queued := d.Take()
	require.False(t, queued)
}

func TestAFamilyWithoutThePaidPlanQueuesNothing(t *testing.T) {
	m := newMailRig(t, 3, 10)
	free := m.newPerson(t, account.PlanFree, true)
	_, err := m.service.Invite(context.Background(), free.clerkID, family.InviteInput{Email: "f." + uuid.NewString() + "@example.com", Role: family.RoleTutor})
	require.ErrorIs(t, err, family.ErrPlanRequired)
	_, queued := m.d.Take()
	require.False(t, queued)
}

func TestAFullQueueLeavesTheInvitationWithAFailedEmail(t *testing.T) {
	m := newMailRig(t, 3, 10)
	for i := 0; i < family.QueueSize; i++ {
		require.True(t, m.d.Enqueue(family.EmailJob{}))
	}
	owner := m.newPerson(t, account.PlanPaid, true)
	inv := m.invite(t, owner)
	require.Equal(t, family.EmailFailed, inv.EmailStatus)
	require.NotNil(t, inv.EmailStatusAt)
	status, _ := m.emailState(t, inv.ID)
	require.Equal(t, "failed", status)
	require.Equal(t, family.InvitationStatus("pending"), inv.Status, "the invitation is intact")
}

func TestAnInvitationAsksForAtMostThreeEmailsADayAndTheNewLinkIsMadeAnyway(t *testing.T) {
	m := newMailRig(t, 3, 10)
	owner := m.newPerson(t, account.PlanPaid, true)
	inv := m.invite(t, owner) // 1
	statuses := []family.EmailStatus{inv.EmailStatus}
	hashes := [][]byte{family.HashToken(inv.Token)}
	for i := 0; i < 3; i++ { // 2, 3 and the one over the limit
		again, err := m.service.Resend(context.Background(), owner.clerkID, inv.ID)
		require.NoError(t, err, "a limit is never an error")
		statuses = append(statuses, again.EmailStatus)
		hashes = append(hashes, family.HashToken(again.Token))
	}
	require.Equal(t, []family.EmailStatus{family.EmailSending, family.EmailSending, family.EmailSending, family.EmailFailed}, statuses)
	require.NotEqual(t, hashes[2], hashes[3], "the link of the over-the-limit resend is a new one that can be copied")
	var linkWorks bool
	require.NoError(t, m.pool.QueryRow(context.Background(), `SELECT token_hash = $2 AND status = 'pending' FROM family_invitations WHERE id = $1`, inv.ID, hashes[3]).Scan(&linkWorks))
	require.True(t, linkWorks, "the link that was not e-mailed is the one that works")

	var count int
	require.NoError(t, m.pool.QueryRow(context.Background(), `SELECT email_sends_count FROM family_invitations WHERE id = $1`, inv.ID).Scan(&count))
	require.Equal(t, 3, count, "a refused e-mail does not count")

	// the next day it starts again
	_, err := m.pool.Exec(context.Background(), `UPDATE family_invitations SET email_sends_day = email_sends_day - 1 WHERE id = $1`, inv.ID)
	require.NoError(t, err)
	next, err := m.service.Resend(context.Background(), owner.clerkID, inv.ID)
	require.NoError(t, err)
	require.Equal(t, family.EmailSending, next.EmailStatus)
	require.NoError(t, m.pool.QueryRow(context.Background(), `SELECT email_sends_count FROM family_invitations WHERE id = $1`, inv.ID).Scan(&count))
	require.Equal(t, 1, count)
}

func TestAFamilyAsksForAtMostItsLimitOfEmailsADay(t *testing.T) {
	m := newMailRig(t, 3, 4)
	owner := m.newPerson(t, account.PlanPaid, true)
	a, b := m.invite(t, owner), m.invite(t, owner) // 2 e-mails
	_, err := m.service.Resend(context.Background(), owner.clerkID, a.ID)
	require.NoError(t, err) // 3
	third, err := m.service.Resend(context.Background(), owner.clerkID, b.ID)
	require.NoError(t, err) // 4
	require.Equal(t, family.EmailSending, third.EmailStatus)
	over, err := m.service.Resend(context.Background(), owner.clerkID, a.ID)
	require.NoError(t, err)
	require.Equal(t, family.EmailFailed, over.EmailStatus, "the family reached its limit although this invitation has room")

	other := m.newPerson(t, account.PlanPaid, true)
	fresh := m.invite(t, other)
	require.Equal(t, family.EmailSending, fresh.EmailStatus, "another family is not affected")
}

func TestLimitsComeFromTheSettings(t *testing.T) {
	m := newMailRig(t, 1, 10)
	owner := m.newPerson(t, account.PlanPaid, true)
	inv := m.invite(t, owner)
	again, err := m.service.Resend(context.Background(), owner.clerkID, inv.ID)
	require.NoError(t, err)
	require.Equal(t, family.EmailFailed, again.EmailStatus)
}

func TestTheEmailStateIsInTheResponsesOfTheAPI(t *testing.T) {
	m := newMailRig(t, 3, 10)
	owner := m.newPerson(t, account.PlanPaid, true)
	code, out := m.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload("api."+uuid.NewString()+"@example.com", "tutor"))
	require.Equal(t, http.StatusCreated, code, out)
	require.Equal(t, "sending", out["emailStatus"])
	require.NotEmpty(t, out["emailStatusAt"])
	id := out["id"].(string)

	code, out = m.do(t, owner.clerkID, http.MethodPost, "/family/invitations/"+id+"/resend", "")
	require.Equal(t, http.StatusOK, code, out)
	require.Equal(t, "sending", out["emailStatus"])

	code, out = m.do(t, owner.clerkID, http.MethodGet, "/family", "")
	require.Equal(t, http.StatusOK, code, out)
	list := out["invitations"].([]any)
	require.Len(t, list, 1)
	item := list[0].(map[string]any)
	require.Equal(t, "sending", item["emailStatus"])
	require.NotEmpty(t, item["emailStatusAt"])
	require.NotContains(t, strings.ToLower(toJSON(t, out)), "token", "the list never shows a token")
}

func TestWithoutEmailTheResponsesSayNoneAndNoTime(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	code, out := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload("n."+uuid.NewString()+"@example.com", "tutor"))
	require.Equal(t, http.StatusCreated, code, out)
	require.Equal(t, "none", out["emailStatus"])
	require.Nil(t, out["emailStatusAt"])
}

func toJSON(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	require.NoError(t, err)
	return string(b)
}
