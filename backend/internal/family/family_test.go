package family_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw/authmwtest"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/family"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// specs/032-compartir-con-familia: inviting and accepting, from the service down to the tables and up to the HTTP answers.

type capture struct {
	mu      sync.Mutex
	entries []errorlog.Entry
}

func (c *capture) Create(_ context.Context, e *errorlog.Entry) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = append(c.entries, *e)
	return nil
}

func (c *capture) all() []errorlog.Entry {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]errorlog.Entry(nil), c.entries...)
}

type person struct {
	clerkID, email string
	accountID      uuid.UUID
}

type env struct {
	pool     *pgxpool.Pool
	service  *family.Service
	repo     *family.Repository
	router   http.Handler
	verifier *authmwtest.Verifier
	log      *capture
	emails   map[string]string
}

func newEnv(t *testing.T) *env {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	e := &env{pool: pool, emails: map[string]string{}, log: &capture{}}
	e.repo = family.NewRepository(pool)
	e.service = family.NewService(e.repo, access.NewRepository(pool), family.EmailFunc(func(_ context.Context, clerkID string) (string, error) {
		if email, ok := e.emails[clerkID]; ok {
			return email, nil
		}
		return "", family.ErrEmailNotVerified
	}))
	responder := httpx.NewResponder(e.log)
	e.verifier = authmwtest.NewVerifier(t, responder)
	h := family.NewHandler(e.service, responder)
	r := chi.NewRouter()
	r.Use(e.verifier.Middleware)
	r.Get("/family", h.GetFamily)
	r.Post("/family/invitations", h.CreateInvitation)
	r.Post("/family/invitations/preview", h.PreviewInvitation)
	r.Post("/family/invitations/accept", h.AcceptInvitation)
	r.Post("/family/invitations/decline", h.DeclineInvitation)
	r.Post("/family/invitations/{invitationId}/resend", h.ResendInvitation)
	r.Post("/family/invitations/{invitationId}/cancel", h.CancelInvitation)
	r.Post("/family/members/{memberId}/remove", h.RemoveMember)
	r.Post("/family/leave", h.LeaveFamily)
	e.router = r
	return e
}

func (e *env) newPerson(t *testing.T, plan account.Plan, withEmailKnown bool) person {
	t.Helper()
	suffix := uuid.NewString()
	p := person{clerkID: "user_family_" + suffix, email: fmt.Sprintf("Fam.%s@Example.com", suffix)}
	acc := &account.Account{FirstName: "Ana", LastName: "Prueba", Email: p.email, Plan: plan, ClerkUserID: &p.clerkID}
	require.NoError(t, account.NewRepository(e.pool).Create(context.Background(), acc))
	p.accountID = acc.ID
	if withEmailKnown {
		e.emails[p.clerkID] = p.email
	}
	return p
}

func (e *env) do(t *testing.T, clerkID, method, path, body string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	if clerkID != "" {
		req.Header.Set("Authorization", "Bearer "+e.verifier.Token(t, clerkID))
	}
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, req)
	out := map[string]any{}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

func invitePayload(email, role string) string {
	return fmt.Sprintf(`{"email":%q,"role":%q}`, email, role)
}

func tokenPayload(token string) string { return fmt.Sprintf(`{"token":%q}`, token) }

func TestToken_IsRandomURLSafeAndHashedWithSHA256(t *testing.T) {
	a, hashA, err := family.NewToken()
	require.NoError(t, err)
	b, _, err := family.NewToken()
	require.NoError(t, err)
	require.NotEqual(t, a, b)
	require.Len(t, hashA, 32)
	require.Equal(t, hashA, family.HashToken(a))
	require.NotContains(t, a, "/")
	require.NotContains(t, a, "+")
	require.GreaterOrEqual(t, len(a), 43)
}

func TestInvite_ValidatesTheRequest(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	for name, body := range map[string]string{
		"no email":      `{"role":"tutor"}`,
		"bad email":     invitePayload("no-es-correo", "tutor"),
		"long email":    invitePayload(strings.Repeat("a", 250)+"@x.com", "tutor"),
		"bad role":      invitePayload("a@b.com", "abuelo"),
		"child role":    invitePayload("a@b.com", "child"),
		"child id sent": `{"email":"a@b.com","role":"tutor","childId":"` + uuid.NewString() + `"}`,
	} {
		code, out := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", body)
		require.Equal(t, http.StatusBadRequest, code, name+" %v", out)
		require.Equal(t, "validation_error", out["error"], name)
	}
	code, _ := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", `{nope`)
	require.Equal(t, http.StatusBadRequest, code)
	code, _ = e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", `{"email":"a@b.com","role":"tutor","childId":"x"}`)
	require.Equal(t, http.StatusBadRequest, code)
}

func TestInvite_NeedsAnAccountAndTheOwnersPaidPlan(t *testing.T) {
	e := newEnv(t)
	free := e.newPerson(t, account.PlanFree, true)
	code, out := e.do(t, free.clerkID, http.MethodPost, "/family/invitations", invitePayload("a@b.com", "tutor"))
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "family", out["reason"])

	code, out = e.do(t, "user_without_account_"+uuid.NewString(), http.MethodPost, "/family/invitations", invitePayload("a@b.com", "tutor"))
	require.Equal(t, http.StatusConflict, code)
	require.Equal(t, "account_required", out["error"])
	code, _ = e.do(t, "user_without_account_"+uuid.NewString(), http.MethodGet, "/family", "")
	require.Equal(t, http.StatusConflict, code)
}

func TestInvite_RefusesTheOwnersAndAMembersEmailAndAPendingOne(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)

	code, out := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload(strings.ToUpper(owner.email), "tutor"))
	require.Equal(t, http.StatusConflict, code)
	require.Equal(t, "already_member", out["error"])

	code, out = e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload("  Nuevo@Example.com ", "caregiver"))
	require.Equal(t, http.StatusCreated, code, out)
	require.Equal(t, "nuevo@example.com", out["email"])
	code, out = e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload("nuevo@example.com", "tutor"))
	require.Equal(t, http.StatusConflict, code)
	require.Equal(t, "invitation_pending", out["error"])
}

func TestInvite_TheFamilyHasAtMostFourPeopleCountingPendingInvitations(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	for i := 0; i < family.MaxPeople-1; i++ {
		code, out := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload(fmt.Sprintf("cupo%d.%s@example.com", i, uuid.NewString()), "caregiver"))
		require.Equal(t, http.StatusCreated, code, out)
	}
	code, out := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload("uno.mas@example.com", "caregiver"))
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "family_full", out["error"])

	code, out = e.do(t, owner.clerkID, http.MethodGet, "/family", "")
	require.Equal(t, http.StatusOK, code)
	capacity := out["capacity"].(map[string]any)
	require.EqualValues(t, family.MaxPeople, capacity["used"])
	require.EqualValues(t, family.MaxPeople, capacity["max"])
}

func TestInvite_TwoRequestsAtTheLastPlaceLeaveOneInvitation(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	for i := 0; i < family.MaxPeople-2; i++ {
		code, _ := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload(fmt.Sprintf("previo%d.%s@example.com", i, uuid.NewString()), "caregiver"))
		require.Equal(t, http.StatusCreated, code)
	}
	var wg sync.WaitGroup
	codes := make([]int, 2)
	for i := range codes {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes[i], _ = e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload(fmt.Sprintf("carrera%d.%s@example.com", i, uuid.NewString()), "tutor"))
		}()
	}
	wg.Wait()
	require.ElementsMatch(t, []int{http.StatusCreated, http.StatusUnprocessableEntity}, codes)
}

func TestAccept_TheFullJourneyAndItsRefusals(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	invited := e.newPerson(t, account.PlanFree, true)
	other := e.newPerson(t, account.PlanFree, true)
	noEmail := e.newPerson(t, account.PlanFree, false)

	code, created := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload(invited.email, "tutor"))
	require.Equal(t, http.StatusCreated, code, created)
	token := created["token"].(string)
	payload := tokenPayload(token)

	code, out := e.do(t, invited.clerkID, http.MethodPost, "/family/invitations/preview", payload)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, true, out["emailMatches"])
	require.Equal(t, "Ana", out["ownerName"])
	require.Equal(t, []any{}, out["childrenFirstNames"], "the owner has no children here: an empty list, never null")
	code, out = e.do(t, noEmail.clerkID, http.MethodPost, "/family/invitations/preview", payload)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, false, out["emailMatches"])

	// Not the invited e-mail, and an e-mail that isn't verified.
	code, out = e.do(t, other.clerkID, http.MethodPost, "/family/invitations/accept", payload)
	require.Equal(t, http.StatusForbidden, code)
	require.Equal(t, "email_mismatch", out["error"])
	code, out = e.do(t, noEmail.clerkID, http.MethodPost, "/family/invitations/accept", payload)
	require.Equal(t, http.StatusForbidden, code)
	require.Equal(t, "email_not_verified", out["error"])
	code, out = e.do(t, noEmail.clerkID, http.MethodPost, "/family/invitations/decline", payload)
	require.Equal(t, http.StatusForbidden, code)
	require.Equal(t, "email_not_verified", out["error"])

	// A session with no PediTrack account yet is asked to create one first.
	ghost := "user_ghost_" + uuid.NewString()
	e.emails[ghost] = invited.email
	code, out = e.do(t, ghost, http.MethodPost, "/family/invitations/accept", payload)
	require.Equal(t, http.StatusConflict, code)
	require.Equal(t, "account_required", out["error"])

	code, out = e.do(t, invited.clerkID, http.MethodPost, "/family/invitations/accept", payload)
	require.Equal(t, http.StatusOK, code, out)
	require.Equal(t, "tutor", out["role"])
	// Again: the same membership.
	code, again := e.do(t, invited.clerkID, http.MethodPost, "/family/invitations/accept", payload)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, out["id"], again["id"])

	// The invited person's own view and the owner's.
	code, view := e.do(t, invited.clerkID, http.MethodGet, "/family", "")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, "tutor", view["role"])
	require.Equal(t, false, view["readOnly"])
	code, view = e.do(t, owner.clerkID, http.MethodGet, "/family", "")
	require.Equal(t, http.StatusOK, code)
	require.Len(t, view["members"], 1)
	require.Len(t, view["invitations"], 0)
	require.EqualValues(t, 2, view["capacity"].(map[string]any)["used"])
	require.Equal(t, false, view["members"].([]any)[0].(map[string]any)["canRemove"], "a Tutor can't be removed")
	// Each person is told which one is them.
	require.Equal(t, false, view["members"].([]any)[0].(map[string]any)["you"])
	_, mine := e.do(t, invited.clerkID, http.MethodGet, "/family", "")
	require.Equal(t, true, mine["members"].([]any)[0].(map[string]any)["you"])

	// The link is used up: nobody else gets anything from it.
	code, _ = e.do(t, other.clerkID, http.MethodPost, "/family/invitations/preview", payload)
	require.Equal(t, http.StatusNotFound, code)
	code, _ = e.do(t, invited.clerkID, http.MethodPost, "/family/invitations/decline", payload)
	require.Equal(t, http.StatusNotFound, code)
}

func TestAccept_RefusalsOfTheFamilyAndThePlan(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	otherOwner := e.newPerson(t, account.PlanPaid, true)
	invited := e.newPerson(t, account.PlanFree, true)

	_, a := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload(invited.email, "caregiver"))
	_, b := e.do(t, otherOwner.clerkID, http.MethodPost, "/family/invitations", invitePayload(invited.email, "tutor"))
	code, _ := e.do(t, invited.clerkID, http.MethodPost, "/family/invitations/accept", tokenPayload(a["token"].(string)))
	require.Equal(t, http.StatusOK, code)

	// One family at a time.
	code, out := e.do(t, invited.clerkID, http.MethodPost, "/family/invitations/accept", tokenPayload(b["token"].(string)))
	require.Equal(t, http.StatusConflict, code)
	require.Equal(t, "already_in_family", out["error"])

	// The owner stops paying before the second person accepts: joining is the paid plan's.
	late := e.newPerson(t, account.PlanFree, true)
	_, c := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload(late.email, "tutor"))
	_, err := e.pool.Exec(context.Background(), `UPDATE accounts SET plan = 'free' WHERE id = $1`, owner.accountID)
	require.NoError(t, err)
	code, out = e.do(t, late.clerkID, http.MethodPost, "/family/invitations/accept", tokenPayload(c["token"].(string)))
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "family", out["reason"])
	// ...and the one already in is read-only.
	code, view := e.do(t, invited.clerkID, http.MethodGet, "/family", "")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, true, view["readOnly"])

	// The owner can't join their own family.
	_, d := e.do(t, otherOwner.clerkID, http.MethodPost, "/family/invitations", invitePayload(strings.ToUpper(late.email), "caregiver"))
	require.Equal(t, http.StatusConflict, func() int { c, _ := e.do(t, otherOwner.clerkID, http.MethodPost, "/family/invitations", invitePayload(otherOwner.email, "caregiver")); return c }())
	_ = d
}

func TestDecline_ClosesTheInvitationForGood(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	invited := e.newPerson(t, account.PlanFree, true)
	_, created := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload(invited.email, "caregiver"))
	payload := tokenPayload(created["token"].(string))

	code, _ := e.do(t, invited.clerkID, http.MethodPost, "/family/invitations/decline", payload)
	require.Equal(t, http.StatusNoContent, code)
	code, _ = e.do(t, invited.clerkID, http.MethodPost, "/family/invitations/accept", payload)
	require.Equal(t, http.StatusNotFound, code)
	// The same e-mail can be invited again once it was declined.
	code, _ = e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload(invited.email, "caregiver"))
	require.Equal(t, http.StatusCreated, code)
}

func TestResendAndCancel(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	invited := e.newPerson(t, account.PlanFree, true)
	_, created := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload(invited.email, "caregiver"))
	id := created["id"].(string)
	oldToken := created["token"].(string)

	code, resent := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations/"+id+"/resend", "")
	require.Equal(t, http.StatusOK, code, resent)
	newToken := resent["token"].(string)
	require.NotEqual(t, oldToken, newToken)
	code, _ = e.do(t, invited.clerkID, http.MethodPost, "/family/invitations/preview", tokenPayload(oldToken))
	require.Equal(t, http.StatusNotFound, code)
	code, _ = e.do(t, invited.clerkID, http.MethodPost, "/family/invitations/preview", tokenPayload(newToken))
	require.Equal(t, http.StatusOK, code)

	// Nobody but who can do everything resends or cancels, and only this family's invitations.
	code, _ = e.do(t, invited.clerkID, http.MethodPost, "/family/invitations/"+id+"/cancel", "")
	require.Equal(t, http.StatusNotFound, code, "somebody with a family of their own, with no such invitation")
	code, _ = e.do(t, owner.clerkID, http.MethodPost, "/family/invitations/"+uuid.NewString()+"/cancel", "")
	require.Equal(t, http.StatusNotFound, code)
	code, _ = e.do(t, owner.clerkID, http.MethodPost, "/family/invitations/not-a-uuid/cancel", "")
	require.Equal(t, http.StatusNotFound, code)
	code, _ = e.do(t, owner.clerkID, http.MethodPost, "/family/invitations/not-a-uuid/resend", "")
	require.Equal(t, http.StatusNotFound, code)

	code, _ = e.do(t, owner.clerkID, http.MethodPost, "/family/invitations/"+id+"/cancel", "")
	require.Equal(t, http.StatusNoContent, code)
	code, _ = e.do(t, owner.clerkID, http.MethodPost, "/family/invitations/"+id+"/cancel", "")
	require.Equal(t, http.StatusNotFound, code)
	code, _ = e.do(t, owner.clerkID, http.MethodPost, "/family/invitations/"+id+"/resend", "")
	require.Equal(t, http.StatusNotFound, code)
	code, _ = e.do(t, invited.clerkID, http.MethodPost, "/family/invitations/accept", tokenPayload(newToken))
	require.Equal(t, http.StatusNotFound, code)
}

func TestResend_NeedsThePaidPlanAndAPlace(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	_, created := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload("reenvio."+uuid.NewString()+"@example.com", "caregiver"))
	id := created["id"].(string)

	// The invitation expires; meanwhile the family fills up (owner + 3 pending).
	_, err := e.pool.Exec(context.Background(), `UPDATE family_invitations SET expires_at = now() - interval '1 day' WHERE id = $1`, id)
	require.NoError(t, err)
	for i := 0; i < family.MaxPeople-1; i++ {
		code, out := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload(fmt.Sprintf("lleno%d.%s@example.com", i, uuid.NewString()), "caregiver"))
		require.Equal(t, http.StatusCreated, code, out)
	}
	code, out := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations/"+id+"/resend", "")
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "family_full", out["error"])

	// The expired one shows as expired to the owner.
	_, view := e.do(t, owner.clerkID, http.MethodGet, "/family", "")
	found := false
	for _, raw := range view["invitations"].([]any) {
		if raw.(map[string]any)["id"] == id {
			found = true
			require.Equal(t, "expired", raw.(map[string]any)["status"])
		}
	}
	require.True(t, found)

	_, err = e.pool.Exec(context.Background(), `UPDATE accounts SET plan = 'free' WHERE id = $1`, owner.accountID)
	require.NoError(t, err)
	code, out = e.do(t, owner.clerkID, http.MethodPost, "/family/invitations/"+id+"/resend", "")
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "family", out["reason"])
}

func TestAnExpiredInvitationNeitherPreviewsNorAcceptsNorBlocksANewOne(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	invited := e.newPerson(t, account.PlanFree, true)
	_, created := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload(invited.email, "tutor"))
	payload := tokenPayload(created["token"].(string))
	_, err := e.pool.Exec(context.Background(), `UPDATE family_invitations SET expires_at = now() - interval '1 minute' WHERE id = $1`, created["id"])
	require.NoError(t, err)

	code, _ := e.do(t, invited.clerkID, http.MethodPost, "/family/invitations/preview", payload)
	require.Equal(t, http.StatusNotFound, code)
	code, _ = e.do(t, invited.clerkID, http.MethodPost, "/family/invitations/accept", payload)
	require.Equal(t, http.StatusNotFound, code)
	code, _ = e.do(t, invited.clerkID, http.MethodPost, "/family/invitations/decline", payload)
	require.Equal(t, http.StatusNotFound, code)
	code, _ = e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload(invited.email, "tutor"))
	require.Equal(t, http.StatusCreated, code)
}

func TestTwoAcceptancesOfOneInvitationAddOnePerson(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	invited := e.newPerson(t, account.PlanFree, true)
	_, created := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload(invited.email, "tutor"))
	payload := tokenPayload(created["token"].(string))

	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			e.do(t, invited.clerkID, http.MethodPost, "/family/invitations/accept", payload)
		}()
	}
	wg.Wait()
	var n int
	require.NoError(t, e.pool.QueryRow(context.Background(), `SELECT count(*) FROM family_members WHERE family_account_id = $1 AND status = 'active'`, owner.accountID).Scan(&n))
	require.Equal(t, 1, n)
}

func TestAnInvitationOnlyKeepsTheHashOfItsToken(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	_, created := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload("hash."+uuid.NewString()+"@example.com", "tutor"))
	token := created["token"].(string)

	var stored []byte
	require.NoError(t, e.pool.QueryRow(context.Background(), `SELECT token_hash FROM family_invitations WHERE id = $1`, created["id"]).Scan(&stored))
	require.Equal(t, family.HashToken(token), stored)
	require.NotContains(t, string(stored), token)
}

// The error log never learns an invitation's token or the e-mail that was invited (Principio II).
func TestErrorLogsNeverCarryTheTokenNorTheEmail(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	secretEmail := "secreto." + uuid.NewString() + "@example.com"
	_, created := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload(secretEmail, "tutor"))
	token := created["token"].(string)

	stranger := e.newPerson(t, account.PlanFree, true)
	e.do(t, stranger.clerkID, http.MethodPost, "/family/invitations/accept", tokenPayload(token))
	e.do(t, stranger.clerkID, http.MethodPost, "/family/invitations/accept", tokenPayload("desconocido"))
	e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload(secretEmail, "tutor"))
	e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload("mal", "tutor"))

	require.Eventually(t, func() bool { return len(e.log.all()) >= 3 }, 3*time.Second, 20*time.Millisecond)
	for _, entry := range e.log.all() {
		text := fmt.Sprintf("%+v", entry)
		require.NotContains(t, text, token)
		require.NotContains(t, text, secretEmail)
		require.NotContains(t, text, strings.ToLower(secretEmail))
	}
}

func TestViewHidesInvitationsFromWhoCannotInviteAndMembersFromNobody(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	caregiver := e.newPerson(t, account.PlanFree, true)
	_, created := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload(caregiver.email, "caregiver"))
	e.do(t, caregiver.clerkID, http.MethodPost, "/family/invitations/accept", tokenPayload(created["token"].(string)))
	e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload("pendiente."+uuid.NewString()+"@example.com", "tutor"))

	code, view := e.do(t, caregiver.clerkID, http.MethodGet, "/family", "")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, "caregiver", view["role"])
	require.Len(t, view["invitations"], 0)
	require.Len(t, view["members"], 1)
	require.Equal(t, false, view["members"].([]any)[0].(map[string]any)["canRemove"])

	code, view = e.do(t, owner.clerkID, http.MethodGet, "/family", "")
	require.Equal(t, http.StatusOK, code)
	require.Len(t, view["invitations"], 1)
	require.Equal(t, true, view["members"].([]any)[0].(map[string]any)["canRemove"], "a Caregiver can be removed by who does everything")

	// A caregiver can't invite.
	code, _ = e.do(t, caregiver.clerkID, http.MethodPost, "/family/invitations", invitePayload("x@example.com", "tutor"))
	require.Equal(t, http.StatusForbidden, code)
	code, _ = e.do(t, caregiver.clerkID, http.MethodPost, "/family/invitations/"+uuid.NewString()+"/resend", "")
	require.Equal(t, http.StatusForbidden, code)
	code, _ = e.do(t, caregiver.clerkID, http.MethodPost, "/family/invitations/"+uuid.NewString()+"/cancel", "")
	require.Equal(t, http.StatusForbidden, code)
}

func TestIsNotFound(t *testing.T) {
	require.True(t, family.IsNotFound(family.ErrInvitationNotFound))
	require.False(t, family.IsNotFound(family.ErrFamilyFull))
	require.Contains(t, family.ValidationErrors{{Field: "email", Message: "is required"}}.Error(), "email")
	require.Equal(t, "validation error", family.ValidationErrors{}.Error())
}

func TestHandlerWithoutASessionIsUnauthorizedAndMalformedBodiesAreNotFound(t *testing.T) {
	e := newEnv(t)
	person := e.newPerson(t, account.PlanFree, true)
	code, _ := e.do(t, "", http.MethodGet, "/family", "")
	require.Equal(t, http.StatusUnauthorized, code)
	for _, body := range []string{`{`, `{}`, `{"token":""}`} {
		code, _ = e.do(t, person.clerkID, http.MethodPost, "/family/invitations/accept", body)
		require.Equal(t, http.StatusNotFound, code, body)
	}
}

// With the database gone every answer is a plain 500 — never the driver's text — and nothing panics.
func TestADatabaseFailureIsAPlain500(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	_, created := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload("cae."+uuid.NewString()+"@example.com", "tutor"))
	token := created["token"].(string)
	id := created["id"].(string)

	e.pool.Close()
	for _, rt := range []struct{ method, path, body string }{
		{http.MethodGet, "/family", ""},
		{http.MethodPost, "/family/invitations", invitePayload("a@b.com", "tutor")},
		{http.MethodPost, "/family/invitations/" + id + "/resend", ""},
		{http.MethodPost, "/family/invitations/" + id + "/cancel", ""},
		{http.MethodPost, "/family/invitations/preview", tokenPayload(token)},
		{http.MethodPost, "/family/invitations/accept", tokenPayload(token)},
		{http.MethodPost, "/family/invitations/decline", tokenPayload(token)},
	} {
		code, out := e.do(t, owner.clerkID, rt.method, rt.path, rt.body)
		require.Equal(t, http.StatusInternalServerError, code, rt.path)
		require.Equal(t, "internal_error", out["error"], rt.path)
		require.NotContains(t, fmt.Sprint(out), "pool")
	}
}

func TestABrokenTokenSourceIsAPlain500(t *testing.T) {
	e := newEnv(t)
	owner := e.newPerson(t, account.PlanPaid, true)
	_, created := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload("rota."+uuid.NewString()+"@example.com", "tutor"))
	e.service.FailTokens(fmt.Errorf("no randomness"))
	code, _ := e.do(t, owner.clerkID, http.MethodPost, "/family/invitations", invitePayload("rota2."+uuid.NewString()+"@example.com", "tutor"))
	require.Equal(t, http.StatusInternalServerError, code)
	code, _ = e.do(t, owner.clerkID, http.MethodPost, "/family/invitations/"+created["id"].(string)+"/resend", "")
	require.Equal(t, http.StatusInternalServerError, code)
}
