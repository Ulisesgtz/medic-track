package server_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

// Specs/032: the /family routes name no resource, so they are not in routes(); what protects them is the session and the
// family's own rules, checked here through the real router.

func TestRouter_EveryFamilyRouteNeedsASession(t *testing.T) {
	w := newWorld(t)
	for _, rt := range []struct{ method, path string }{
		{http.MethodGet, "/family"},
		{http.MethodPost, "/family/invitations"},
		{http.MethodPost, "/family/invitations/preview"},
		{http.MethodPost, "/family/invitations/accept"},
		{http.MethodPost, "/family/invitations/decline"},
		{http.MethodPost, "/family/invitations/" + w.accountA.String() + "/resend"},
		{http.MethodPost, "/family/invitations/" + w.accountA.String() + "/cancel"},
		{http.MethodPost, "/family/members/" + w.accountA.String() + "/remove"},
		{http.MethodPost, "/family/leave"},
	} {
		require.Equal(t, http.StatusUnauthorized, w.do(t, rt.method, rt.path, "", `{}`).Code, rt.path)
		require.Equal(t, http.StatusUnauthorized, w.do(t, rt.method, rt.path, "not-a-real-jwt", `{}`).Code, rt.path)
	}
}

// freeASeat makes room: the world already has the owner, a Tutor, a Caregiver and a Child-role member, which is the maximum.
func (w *world) freeASeat(t *testing.T) {
	t.Helper()
	_, err := w.pool.Exec(context.Background(), `
		UPDATE family_members SET status = 'left', ended_at = now(), ended_by_account_id = account_id
		WHERE family_account_id = $1 AND role = 'child' AND status = 'active'`, w.accountA)
	require.NoError(t, err)
}

func (w *world) invite(t *testing.T, clerkID, email, role string) (int, map[string]any) {
	t.Helper()
	rec := w.do(t, http.MethodPost, "/family/invitations", w.verifier.Token(t, clerkID), `{"email":"`+email+`","role":"`+role+`"}`)
	body := map[string]any{}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	return rec.Code, body
}

func TestRouter_OnlyThoseWhoCanDoEverythingInviteAndOnlyWithThePaidPlan(t *testing.T) {
	w := newWorld(t)
	invited := w.emails[w.clerkB]

	// The free plan can't share: even the owner is told so.
	code, body := w.invite(t, w.clerkA, invited, "tutor")
	require.Equal(t, http.StatusUnprocessableEntity, code, body)
	require.Equal(t, "family", body["reason"])

	w.setOwnerPlan(t, "paid")
	w.freeASeat(t)
	// A Caregiver sees and marks, nothing more.
	code, _ = w.invite(t, w.clerkCaregiver, invited, "tutor")
	require.Equal(t, http.StatusForbidden, code)
	// Somebody who is not in the family has a family of their own, with nobody in it: they can invite there, not here.
	code, body = w.invite(t, w.clerkB, w.emails[w.clerkA], "tutor")
	require.Equal(t, http.StatusUnprocessableEntity, code, body) // B's own plan is free

	code, body = w.invite(t, w.clerkA, invited, "tutor")
	require.Equal(t, http.StatusCreated, code, body)
	require.NotEmpty(t, body["token"])
}

func TestRouter_AnInvitationIsAcceptedOnlyByTheInvitedEmailAndGivesTheTutorsAccess(t *testing.T) {
	w := newWorld(t)
	w.setOwnerPlan(t, "paid")
	w.freeASeat(t)
	code, created := w.invite(t, w.clerkA, w.emails[w.clerkB], "tutor")
	require.Equal(t, http.StatusCreated, code, created)
	token, _ := created["token"].(string)
	payload := `{"token":"` + token + `"}`

	// The preview says what it offers and whether this session's e-mail is the invited one.
	rec := w.do(t, http.MethodPost, "/family/invitations/preview", w.verifier.Token(t, w.clerkB), payload)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"emailMatches":true`)
	rec = w.do(t, http.MethodPost, "/family/invitations/preview", w.verifier.Token(t, w.clerkCaregiver), payload)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"emailMatches":false`)

	// Somebody else can't accept it, nor decline it.
	rec = w.do(t, http.MethodPost, "/family/invitations/accept", w.verifier.Token(t, w.clerkCaregiver), payload)
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "email_mismatch")
	rec = w.do(t, http.MethodPost, "/family/invitations/decline", w.verifier.Token(t, w.clerkCaregiver), payload)
	require.Equal(t, http.StatusForbidden, rec.Code)

	// Before accepting, B can't see A's child.
	tokenB := w.verifier.Token(t, w.clerkB)
	childPath := "/children/" + w.childA.String() + "/consultations"
	require.Equal(t, http.StatusForbidden, w.do(t, http.MethodGet, childPath, tokenB, "").Code)

	rec = w.do(t, http.MethodPost, "/family/invitations/accept", tokenB, payload)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	// Accepting again is the same answer, not an error.
	require.Equal(t, http.StatusOK, w.do(t, http.MethodPost, "/family/invitations/accept", tokenB, payload).Code)

	// Now B reaches what a Tutor reaches, and GET /family tells them so.
	require.Equal(t, http.StatusOK, w.do(t, http.MethodGet, childPath, tokenB, "").Code)
	rec = w.do(t, http.MethodGet, "/family", tokenB, "")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"role":"tutor"`)

	// The token is single use: it no longer previews, and an unknown one looks the same.
	require.Equal(t, http.StatusNotFound, w.do(t, http.MethodPost, "/family/invitations/preview", w.verifier.Token(t, w.clerkCaregiver), payload).Code)
	require.Equal(t, http.StatusNotFound, w.do(t, http.MethodPost, "/family/invitations/preview", tokenB, `{"token":"nope"}`).Code)
	require.Equal(t, http.StatusNotFound, w.do(t, http.MethodPost, "/family/invitations/preview", tokenB, `{}`).Code)
}

func TestRouter_TheFamilyOfAnOwnerListsItsPeopleAndOnlyFullAccessSeesInvitations(t *testing.T) {
	w := newWorld(t)
	w.setOwnerPlan(t, "paid")
	w.freeASeat(t)
	code, _ := w.invite(t, w.clerkA, "pendiente@example.com", "caregiver")
	require.Equal(t, http.StatusCreated, code)

	rec := w.do(t, http.MethodGet, "/family", w.verifier.Token(t, w.clerkA), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "pendiente@example.com")
	require.Contains(t, rec.Body.String(), `"role":"owner"`)

	rec = w.do(t, http.MethodGet, "/family", w.verifier.Token(t, w.clerkCaregiver), "")
	require.Equal(t, http.StatusOK, rec.Code)
	require.NotContains(t, rec.Body.String(), "pendiente@example.com")
	require.Contains(t, rec.Body.String(), `"role":"caregiver"`)
}
