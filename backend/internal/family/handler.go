package family

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/authmw"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// maxRequestBodyBytes caps a request body: these are small JSON documents.
const maxRequestBodyBytes = 16 * 1024

// Handler serves /family/… (specs/032-compartir-con-familia, contracts/family.md). Every response is written through the
// *httpx.Responder, so a 4xx/5xx is logged to error_logs like everywhere else — and an invitation's token and the e-mail
// never reach a message: the token travels in a request body, never in an address.
type Handler struct {
	service   *Service
	responder *httpx.Responder
}

// NewHandler creates a Handler.
func NewHandler(service *Service, responder *httpx.Responder) *Handler {
	return &Handler{service: service, responder: responder}
}

type memberResponse struct {
	ID      string  `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	Name    string  `json:"name" example:"Luis"`
	Role    string  `json:"role" enums:"tutor,caregiver,child" example:"tutor"`
	ChildID *string `json:"childId"`
	Since   string  `json:"since" example:"2026-10-06T14:00:00Z"`
	// CanRemove: the session can remove this person (it can do everything and the person is not a Tutor).
	CanRemove bool `json:"canRemove" example:"false"`
} // @name FamilyMemberResponse

type invitationResponse struct {
	ID        string  `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	Email     string  `json:"email" example:"papa@ejemplo.com"`
	Role      string  `json:"role" enums:"tutor,caregiver,child" example:"tutor"`
	Status    string  `json:"status" enums:"pending,expired" example:"pending"`
	ExpiresAt string  `json:"expiresAt" example:"2026-10-13T14:00:00Z"`
	ChildID   *string `json:"childId"`
} // @name FamilyInvitationResponse

type createdInvitationResponse struct {
	ID        string `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	Email     string `json:"email" example:"papa@ejemplo.com"`
	Role      string `json:"role" enums:"tutor,caregiver,child" example:"tutor"`
	Status    string `json:"status" example:"pending"`
	ExpiresAt string `json:"expiresAt" example:"2026-10-13T14:00:00Z"`
	// Token is the secret of the link; it is returned only here (and when resent) and goes in the fragment of the link.
	Token string `json:"token" example:"3hF9…"`
} // @name CreatedFamilyInvitationResponse

type ownerResponse struct {
	ID   string `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	Name string `json:"name" example:"Ana"`
} // @name FamilyOwnerResponse

type capacityResponse struct {
	Max  int `json:"max" example:"4"`
	Used int `json:"used" example:"2"`
} // @name FamilyCapacityResponse

type familyResponse struct {
	Role        string               `json:"role" enums:"owner,tutor,caregiver,child" example:"owner"`
	Plan        string               `json:"plan" enums:"free,paid" example:"paid"`
	ReadOnly    bool                 `json:"readOnly" example:"false"`
	Owner       ownerResponse        `json:"owner"`
	Members     []memberResponse     `json:"members"`
	Invitations []invitationResponse `json:"invitations"`
	Capacity    capacityResponse     `json:"capacity"`
} // @name FamilyResponse

type inviteRequest struct {
	Email string `json:"email" example:"papa@ejemplo.com"`
	// Role is "tutor" or "caregiver" ("child" is not available yet).
	Role    string  `json:"role" enums:"tutor,caregiver" example:"tutor"`
	ChildID *string `json:"childId"`
	Consent bool    `json:"consent"`
} // @name InviteRequest

type tokenRequest struct {
	// Token is the secret of the invitation's link.
	Token string `json:"token"`
} // @name InvitationTokenRequest

type previewResponse struct {
	OwnerName      string `json:"ownerName" example:"Ana"`
	Role           string `json:"role" example:"tutor"`
	ChildFirstName string `json:"childFirstName,omitempty"`
	Email          string `json:"email" example:"papa@ejemplo.com"`
	ExpiresAt      string `json:"expiresAt" example:"2026-10-13T14:00:00Z"`
	// EmailMatches: the session's verified e-mail is the invited one (only that account can accept).
	EmailMatches bool `json:"emailMatches" example:"true"`
} // @name InvitationPreviewResponse

type membershipResponse struct {
	ID   string `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	Role string `json:"role" example:"tutor"`
	Name string `json:"name" example:"Luis"`
} // @name FamilyMembershipResponse

type errorResponseDoc struct {
	Error   string `json:"error" example:"invitation_not_found"`
	Message string `json:"message" example:"Invitation not found"`
} // @name FamilyErrorResponse

type planLimitResponseDoc struct {
	Error   string `json:"error" example:"freemium_consultation_limit_exceeded"`
	Message string `json:"message" example:"Sharing with the family is part of the paid plan"`
	Reason  string `json:"reason" example:"family"`
} // @name FamilyPlanLimitResponse

type sessionErrorResponseDoc struct {
	Error   string `json:"error" example:"unauthorized"`
	Message string `json:"message" example:"A valid session is required"`
} // @name FamilySessionErrorResponse

type validationErrorResponseDoc struct {
	Error   string `json:"error" example:"validation_error"`
	Message string `json:"message" example:"One or more fields are invalid"`
	Details []struct {
		Field   string `json:"field" example:"email"`
		Message string `json:"message" example:"must be a valid e-mail address"`
	} `json:"details"`
} // @name FamilyValidationErrorResponse

func timeText(t time.Time) string { return t.Format(time.RFC3339) }

func idText(id *uuid.UUID) *string {
	if id == nil {
		return nil
	}
	s := id.String()
	return &s
}

func toInvitationResponse(inv Invitation) invitationResponse {
	return invitationResponse{ID: inv.ID.String(), Email: inv.Email, Role: string(inv.Role), Status: string(inv.Status), ExpiresAt: timeText(inv.ExpiresAt), ChildID: idText(inv.ChildID)}
}

func toCreatedResponse(inv *Invitation) createdInvitationResponse {
	return createdInvitationResponse{ID: inv.ID.String(), Email: inv.Email, Role: string(inv.Role), Status: string(inv.Status), ExpiresAt: timeText(inv.ExpiresAt), Token: inv.Token}
}

func toFamilyResponse(v *View) familyResponse {
	members := make([]memberResponse, 0, len(v.Members))
	for _, m := range v.Members {
		members = append(members, memberResponse{ID: m.ID.String(), Name: m.Name, Role: string(m.Role), ChildID: idText(m.ChildID), Since: timeText(m.Since), CanRemove: m.CanRemove})
	}
	invitations := make([]invitationResponse, 0, len(v.Invitations))
	for _, inv := range v.Invitations {
		invitations = append(invitations, toInvitationResponse(inv))
	}
	return familyResponse{
		Role: v.Role, Plan: v.Plan, ReadOnly: v.ReadOnly,
		Owner:   ownerResponse{ID: v.OwnerAccountID.String(), Name: v.OwnerName},
		Members: members, Invitations: invitations,
		Capacity: capacityResponse{Max: v.Max, Used: v.Used},
	}
}

func validationBody(errs ValidationErrors) map[string]any {
	details := make([]map[string]string, 0, len(errs))
	for _, e := range errs {
		details = append(details, map[string]string{"field": e.Field, "message": e.Message})
	}
	return map[string]any{"error": "validation_error", "message": "One or more fields are invalid", "details": details}
}

func planBody() map[string]string {
	return map[string]string{
		"error":   "freemium_consultation_limit_exceeded",
		"message": "Sharing with the family is part of the paid plan",
		"reason":  "family",
	}
}

func errorBody(code, message string) map[string]string { return map[string]string{"error": code, "message": message} }

// clerkUser returns the session's Clerk user id; the route is behind RequireSession, this only guards against it being
// wired without.
func (h *Handler) clerkUser(w http.ResponseWriter, r *http.Request) (string, bool) {
	id, ok := authmw.ClerkUserIDFromContext(r.Context())
	if !ok {
		h.responder.WriteJSONError(r.Context(), w, http.StatusUnauthorized, "unauthorized", "A valid session is required", nil)
	}
	return id, ok
}

// writeError maps the family's domain errors. Every case calls the responder from its own line, so error_logs keeps
// telling them apart (backend/CLAUDE.md); the messages never carry an e-mail or a token.
func (h *Handler) writeError(ctx context.Context, w http.ResponseWriter, err error, internalMessage string) {
	var validationErrs ValidationErrors
	switch {
	case errors.As(err, &validationErrs):
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationBody(validationErrs), nil)
	case errors.Is(err, ErrNotAllowed):
		h.responder.WriteJSON(ctx, w, http.StatusForbidden, errorBody("forbidden", "This is not allowed for the current session"), nil)
	case errors.Is(err, ErrPlanRequired):
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, planBody(), nil)
	case errors.Is(err, ErrFamilyFull):
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, errorBody("family_full", "The family has its maximum of people"), nil)
	case errors.Is(err, ErrAlreadyMember):
		h.responder.WriteJSON(ctx, w, http.StatusConflict, errorBody("already_member", "This person already has access"), nil)
	case errors.Is(err, ErrInvitationPending):
		h.responder.WriteJSON(ctx, w, http.StatusConflict, errorBody("invitation_pending", "An invitation is already pending"), nil)
	case errors.Is(err, ErrAccountRequired):
		h.responder.WriteJSON(ctx, w, http.StatusConflict, errorBody("account_required", "A PediTrack account is required"), nil)
	case errors.Is(err, ErrAlreadyInFamily):
		h.responder.WriteJSON(ctx, w, http.StatusConflict, errorBody("already_in_family", "This person already belongs to a family"), nil)
	case errors.Is(err, ErrEmailMismatch):
		h.responder.WriteJSON(ctx, w, http.StatusForbidden, errorBody("email_mismatch", "The session's e-mail is not the invited one"), nil)
	case errors.Is(err, ErrEmailNotVerified):
		h.responder.WriteJSON(ctx, w, http.StatusForbidden, errorBody("email_not_verified", "The session's e-mail is not verified"), nil)
	case errors.Is(err, ErrInvitationNotFound):
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, errorBody("invitation_not_found", "Invitation not found"), nil)
	case errors.Is(err, ErrMemberNotFound):
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, errorBody("member_not_found", "Member not found"), nil)
	case errors.Is(err, ErrCannotRemoveTutor):
		h.responder.WriteJSON(ctx, w, http.StatusForbidden, errorBody("cannot_remove_tutor", "A Tutor can't be removed"), nil)
	case errors.Is(err, ErrOwnerCannotLeave):
		h.responder.WriteJSON(ctx, w, http.StatusForbidden, errorBody("owner_cannot_leave", "The owner of the family can't leave it"), nil)
	default:
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", internalMessage, nil)
	}
}

// GetFamily handles GET /family.
//
//	@Summary		The session's family
//	@Description	The session's role in its family (owner for the owner account and for someone who shares nothing), the
//	@Description	family's plan, whether the session is read-only because that plan is no longer paid, the people, and — to
//	@Description	who can do everything — the invitations waiting and the places taken (specs/032-compartir-con-familia).
//	@Tags			family
//	@Produce		json
//	@Success		200	{object}	familyResponse
//	@Failure		409	{object}	errorResponseDoc	"The session has no PediTrack account yet"
//	@Security		ClerkSession
//	@Failure		401	{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Router			/family [get]
func (h *Handler) GetFamily(w http.ResponseWriter, r *http.Request) {
	clerkID, ok := h.clerkUser(w, r)
	if !ok {
		return
	}
	view, err := h.service.View(r.Context(), clerkID)
	if err != nil {
		h.writeError(r.Context(), w, err, "Could not read the family")
		return
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, toFamilyResponse(view), nil)
}

// CreateInvitation handles POST /family/invitations.
//
//	@Summary		Invite someone to the family
//	@Description	Invites an e-mail as a Tutor or a Caregiver. Only who can do everything (the owner or a Tutor) and only when the
//	@Description	owner is on the paid plan. The invitation expires in 7 days; the token of its link is returned here, once.
//	@Description	Only the account whose verified e-mail is the invited one can accept it.
//	@Tags			family
//	@Accept			json
//	@Produce		json
//	@Param			payload	body		inviteRequest	true	"Who to invite and as what"
//	@Success		201		{object}	createdInvitationResponse
//	@Failure		400		{object}	validationErrorResponseDoc	"Invalid e-mail or role"
//	@Failure		403		{object}	errorResponseDoc			"The session can't invite"
//	@Failure		409		{object}	errorResponseDoc			"Already a member, or an invitation is pending"
//	@Failure		422		{object}	planLimitResponseDoc		"The family is not on the paid plan, or it is full (family_full)"
//	@Security		ClerkSession
//	@Failure		401	{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Router			/family/invitations [post]
func (h *Handler) CreateInvitation(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	clerkID, ok := h.clerkUser(w, r)
	if !ok {
		return
	}
	var req inviteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	in := InviteInput{Email: req.Email, Role: Role(req.Role), Consent: req.Consent}
	if req.ChildID != nil {
		childID, err := uuid.Parse(*req.ChildID)
		if err != nil {
			h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationBody(ValidationErrors{{Field: "childId", Message: "must be a valid id"}}), nil)
			return
		}
		in.ChildID = &childID
	}
	inv, err := h.service.Invite(r.Context(), clerkID, in)
	if err != nil {
		h.writeError(r.Context(), w, err, "Could not create the invitation")
		return
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusCreated, toCreatedResponse(inv), nil)
}

func (h *Handler) invitationID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "invitationId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, errorBody("invitation_not_found", "Invitation not found"), nil)
		return uuid.Nil, false
	}
	return id, true
}

// ResendInvitation handles POST /family/invitations/{invitationId}/resend.
//
//	@Summary		Send an invitation again
//	@Description	Gives a pending invitation a new token and a new date; the old link stops working.
//	@Tags			family
//	@Produce		json
//	@Param			invitationId	path		string	true	"Invitation UUID"
//	@Success		200				{object}	createdInvitationResponse
//	@Failure		403				{object}	errorResponseDoc		"The session can't invite"
//	@Failure		404				{object}	errorResponseDoc		"Not a pending invitation of this family"
//	@Failure		422				{object}	planLimitResponseDoc	"Not paid, or the family is full"
//	@Security		ClerkSession
//	@Failure		401	{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Router			/family/invitations/{invitationId}/resend [post]
func (h *Handler) ResendInvitation(w http.ResponseWriter, r *http.Request) {
	clerkID, ok := h.clerkUser(w, r)
	if !ok {
		return
	}
	id, ok := h.invitationID(w, r)
	if !ok {
		return
	}
	inv, err := h.service.Resend(r.Context(), clerkID, id)
	if err != nil {
		h.writeError(r.Context(), w, err, "Could not send the invitation again")
		return
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, toCreatedResponse(inv), nil)
}

// CancelInvitation handles POST /family/invitations/{invitationId}/cancel.
//
//	@Summary		Cancel a pending invitation
//	@Tags			family
//	@Produce		json
//	@Param			invitationId	path	string	true	"Invitation UUID"
//	@Success		204
//	@Failure		403	{object}	errorResponseDoc	"The session can't invite"
//	@Failure		404	{object}	errorResponseDoc	"Not a pending invitation of this family"
//	@Security		ClerkSession
//	@Failure		401	{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Router			/family/invitations/{invitationId}/cancel [post]
func (h *Handler) CancelInvitation(w http.ResponseWriter, r *http.Request) {
	clerkID, ok := h.clerkUser(w, r)
	if !ok {
		return
	}
	id, ok := h.invitationID(w, r)
	if !ok {
		return
	}
	if err := h.service.Cancel(r.Context(), clerkID, id); err != nil {
		h.writeError(r.Context(), w, err, "Could not cancel the invitation")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// readToken decodes the body {"token": "..."} of preview, accept and decline.
func (h *Handler) readToken(w http.ResponseWriter, r *http.Request) (string, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	var req tokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, errorBody("invitation_not_found", "Invitation not found"), nil)
		return "", false
	}
	return req.Token, true
}

// PreviewInvitation handles POST /family/invitations/preview.
//
//	@Summary		What an invitation offers, before accepting it
//	@Description	Only what a person needs to decide: who invites, the role, the invited e-mail, when it expires and whether the
//	@Description	session's verified e-mail is that one. The token goes in the body (never in an address). An unknown, used,
//	@Description	expired or canceled token is one 404, with nothing about the family.
//	@Tags			family
//	@Accept			json
//	@Produce		json
//	@Param			payload	body		tokenRequest	true	"The invitation's token"
//	@Success		200		{object}	previewResponse
//	@Failure		404		{object}	errorResponseDoc	"Invitation not found"
//	@Security		ClerkSession
//	@Failure		401	{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Router			/family/invitations/preview [post]
func (h *Handler) PreviewInvitation(w http.ResponseWriter, r *http.Request) {
	clerkID, ok := h.clerkUser(w, r)
	if !ok {
		return
	}
	token, ok := h.readToken(w, r)
	if !ok {
		return
	}
	p, err := h.service.Preview(r.Context(), clerkID, token)
	if err != nil {
		h.writeError(r.Context(), w, err, "Could not read the invitation")
		return
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, previewResponse{
		OwnerName: p.OwnerName, Role: string(p.Role), ChildFirstName: p.ChildFirstName, Email: p.Email,
		ExpiresAt: timeText(p.ExpiresAt), EmailMatches: p.EmailMatches,
	}, nil)
}

// AcceptInvitation handles POST /family/invitations/accept.
//
//	@Summary		Accept an invitation
//	@Description	Makes the session's person a member of the family. Only the account whose verified e-mail is the invited one
//	@Description	(403 email_mismatch), with a PediTrack account (409 account_required), not already in a family (409
//	@Description	already_in_family), and while the family's owner is on the paid plan (422). The same person accepting again
//	@Description	gets their membership back.
//	@Tags			family
//	@Accept			json
//	@Produce		json
//	@Param			payload	body		tokenRequest	true	"The invitation's token"
//	@Success		200		{object}	membershipResponse
//	@Failure		403		{object}	errorResponseDoc		"The e-mail is not the invited one, or is not verified"
//	@Failure		404		{object}	errorResponseDoc		"Invitation not found"
//	@Failure		409		{object}	errorResponseDoc		"No account yet, or already in a family"
//	@Failure		422		{object}	planLimitResponseDoc	"The family's owner is no longer on the paid plan"
//	@Security		ClerkSession
//	@Failure		401	{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Router			/family/invitations/accept [post]
func (h *Handler) AcceptInvitation(w http.ResponseWriter, r *http.Request) {
	clerkID, ok := h.clerkUser(w, r)
	if !ok {
		return
	}
	token, ok := h.readToken(w, r)
	if !ok {
		return
	}
	m, err := h.service.Accept(r.Context(), clerkID, token)
	if err != nil {
		h.writeError(r.Context(), w, err, "Could not accept the invitation")
		return
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, membershipResponse{ID: m.ID.String(), Role: string(m.Role), Name: m.Name}, nil)
}

// DeclineInvitation handles POST /family/invitations/decline.
//
//	@Summary		Decline an invitation
//	@Tags			family
//	@Accept			json
//	@Param			payload	body	tokenRequest	true	"The invitation's token"
//	@Success		204
//	@Failure		403	{object}	errorResponseDoc	"The e-mail is not the invited one"
//	@Failure		404	{object}	errorResponseDoc	"Invitation not found"
//	@Security		ClerkSession
//	@Failure		401	{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Router			/family/invitations/decline [post]
func (h *Handler) DeclineInvitation(w http.ResponseWriter, r *http.Request) {
	clerkID, ok := h.clerkUser(w, r)
	if !ok {
		return
	}
	token, ok := h.readToken(w, r)
	if !ok {
		return
	}
	if err := h.service.Decline(r.Context(), clerkID, token); err != nil {
		h.writeError(r.Context(), w, err, "Could not decline the invitation")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// RemoveMember handles POST /family/members/{memberId}/remove.
//
//	@Summary		Remove a Caregiver or a Child-role member
//	@Description	Only who can do everything in the family (the owner or a Tutor of a paid family). A Tutor can't be removed by
//	@Description	anybody — not even by the owner —; the only way to cut a Tutor's access is for the owner to stop paying.
//	@Description	What the person registered stays. Takes effect at once.
//	@Tags			family
//	@Param			memberId	path	string	true	"Member UUID (from GET /family)"
//	@Success		204
//	@Failure		403	{object}	errorResponseDoc	"The session can't remove, or the member is a Tutor (cannot_remove_tutor)"
//	@Failure		404	{object}	errorResponseDoc	"Not an active member of this family"
//	@Security		ClerkSession
//	@Failure		401	{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Router			/family/members/{memberId}/remove [post]
func (h *Handler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	clerkID, ok := h.clerkUser(w, r)
	if !ok {
		return
	}
	memberID, err := uuid.Parse(chi.URLParam(r, "memberId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, errorBody("member_not_found", "Member not found"), nil)
		return
	}
	if err := h.service.RemoveMember(r.Context(), clerkID, memberID); err != nil {
		h.writeError(r.Context(), w, err, "Could not remove the member")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// LeaveFamily handles POST /family/leave.
//
//	@Summary		Leave the family
//	@Description	The invited person leaves their family: immediate, no approval. What they registered stays in the family's
//	@Description	account. The owner can't leave their own family.
//	@Tags			family
//	@Success		204
//	@Failure		403	{object}	errorResponseDoc	"The owner can't leave (owner_cannot_leave)"
//	@Failure		404	{object}	errorResponseDoc	"The session belongs to no family as an invited person"
//	@Security		ClerkSession
//	@Failure		401	{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Router			/family/leave [post]
func (h *Handler) LeaveFamily(w http.ResponseWriter, r *http.Request) {
	clerkID, ok := h.clerkUser(w, r)
	if !ok {
		return
	}
	if err := h.service.Leave(r.Context(), clerkID); err != nil {
		h.writeError(r.Context(), w, err, "Could not leave the family")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
