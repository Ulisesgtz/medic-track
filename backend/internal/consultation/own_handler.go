package consultation

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// A person's own consultations (specs/058-consultas-del-titular): the routes that name the person by {accountId}. Their
// consultations are then reached through the ordinary /consultations/{consultationId} routes.

type accountNotFoundResponseDoc struct {
	Error   string `json:"error" example:"account_not_found"`
	Message string `json:"message" example:"Account not found"`
} // @name AccountNotFoundResponse

func accountNotFoundBody() map[string]string {
	return map[string]string{"error": "account_not_found", "message": "Account not found"}
}

type ownConsultationListResponse struct {
	AccountID     string                        `json:"accountId" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	Consultations []consultationSummaryResponse `json:"consultations"`
} // @name OwnConsultationListResponse

type ownOverviewResponse struct {
	AccountID       string                   `json:"accountId" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	Doses           []overviewDoseResponse   `json:"doses"`
	ActiveTreatment *activeTreatmentResponse `json:"activeTreatment"`
} // @name OwnOverviewResponse

// accountParam reads {accountId}; a malformed one is answered 404 here (the same as a missing account).
func (h *Handler) accountParam(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "accountId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, accountNotFoundBody(), nil)
		return uuid.Nil, false
	}
	return id, true
}

// ListOwnConsultations handles GET /accounts/{accountId}/consultations (specs/058).
//
//	@Summary		List a person's own consultations
//	@Description	The consultations of the person themself (no child), most recent first, in the shape of a child's list. The person
//	@Description	sees theirs; a Tutor of their family sees them only while the person shares them.
//	@Tags			consultations
//	@Produce		json
//	@Param			accountId	path		string	true	"Account UUID of the person"
//	@Success		200			{object}	ownConsultationListResponse
//	@Failure		404			{object}	accountNotFoundResponseDoc	"No account exists for this id"
//	@Security		ClerkSession
//	@Failure		401			{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Failure		403			{object}	sessionErrorResponseDoc	"The session cannot see this person's consultations"
//	@Router			/accounts/{accountId}/consultations [get]
func (h *Handler) ListOwnConsultations(w http.ResponseWriter, r *http.Request) {
	accountID, ok := h.accountParam(w, r)
	if !ok {
		return
	}
	list, err := h.service.ListOwnConsultations(r.Context(), accountID)
	if err != nil {
		if errors.Is(err, ErrAccountNotFound) {
			h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, accountNotFoundBody(), nil)
			return
		}
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not list consultations", nil)
		return
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, ownConsultationListResponse{
		AccountID:     accountID.String(),
		Consultations: toSummaries(list),
	}, nil)
}

// CreateOwnConsultation handles POST /accounts/{accountId}/consultations (specs/058).
//
//	@Summary		Register a person's own consultation
//	@Description	The body and rules of a child's consultation. Only the person themself, and only on the paid plan (their own
//	@Description	account's or a paying family's): otherwise 422 "freemium_consultation_limit_exceeded" with reason
//	@Description	"own_consultations". The free plan's rules of a child's consultation don't apply; the photo counts in the account's cap.
//	@Tags			consultations
//	@Accept			json
//	@Produce		json
//	@Param			accountId	path		string						true	"Account UUID of the person"
//	@Param			payload		body		createConsultationRequest	true	"Consultation to register"
//	@Success		201			{object}	consultationDetailResponse
//	@Failure		400			{object}	validationErrorResponseDoc	"Missing/invalid field"
//	@Failure		404			{object}	accountNotFoundResponseDoc	"No account exists for this id"
//	@Failure		422			{object}	planLimitResponseDoc		"Not on the paid plan (own_consultations), or the photo cap"
//	@Security		ClerkSession
//	@Failure		401			{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Failure		403			{object}	sessionErrorResponseDoc	"The session is not this person"
//	@Router			/accounts/{accountId}/consultations [post]
func (h *Handler) CreateOwnConsultation(w http.ResponseWriter, r *http.Request) {
	accountID, ok := h.accountParam(w, r)
	if !ok {
		return
	}
	input, ok := h.decodeCreate(w, r)
	if !ok {
		return
	}
	c, err := h.service.CreateOwnConsultation(r.Context(), accountID, input)
	if err != nil {
		h.writeCreateConsultationError(r.Context(), w, err)
		return
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusCreated, toConsultationDetailResponse(c, actorOf(r.Context())), nil)
}

// GetOwnOverview handles GET /accounts/{accountId}/overview (specs/058).
//
//	@Summary		A person's own doses in a window and their running treatment
//	@Description	GET /children/{childId}/overview for the person's own consultations: the medication doses of [from, to) and the
//	@Description	treatment still running. No supplements (a person's own routines keep their routes). The window may not exceed 48 hours.
//	@Tags			consultations
//	@Produce		json
//	@Param			accountId	path		string	true	"Account UUID of the person"
//	@Param			from		query		string	true	"Window start, RFC 3339"				example(2026-01-15T00:00:00-06:00)
//	@Param			to			query		string	true	"Window end (exclusive), RFC 3339"	example(2026-01-16T00:00:00-06:00)
//	@Success		200			{object}	ownOverviewResponse
//	@Failure		400			{object}	validationErrorResponseDoc	"Missing/invalid window"
//	@Failure		404			{object}	accountNotFoundResponseDoc	"No account exists for this id"
//	@Security		ClerkSession
//	@Failure		401			{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Failure		403			{object}	sessionErrorResponseDoc	"The session cannot see this person's consultations"
//	@Router			/accounts/{accountId}/overview [get]
func (h *Handler) GetOwnOverview(w http.ResponseWriter, r *http.Request) {
	accountID, ok := h.accountParam(w, r)
	if !ok {
		return
	}
	from, to, ok := h.parseWindow(w, r)
	if !ok {
		return
	}
	overview, err := h.service.GetOwnOverview(r.Context(), accountID, from, to)
	if err != nil {
		var validationErrs ValidationErrors
		switch {
		case errors.Is(err, ErrAccountNotFound):
			h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, accountNotFoundBody(), nil)
		case errors.As(err, &validationErrs):
			h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationErrorBody(validationErrs, "One or more fields are invalid"), nil)
		default:
			h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not read the overview", nil)
		}
		return
	}
	doses, treatment := toOverviewParts(overview, actorOf(r.Context()))
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, ownOverviewResponse{AccountID: accountID.String(), Doses: doses, ActiveTreatment: treatment}, nil)
}
