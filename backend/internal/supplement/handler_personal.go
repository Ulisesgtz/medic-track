package supplement

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
)

// The person's own routines (specs/033, part 3). The routes name the person's own account (`ownsAccount`), so everything here is
// that person's: they are the owner, Full over what they made, and the actor of every mark.

type personalListResponse struct {
	Routines    []routineResponse `json:"routines"`
	ActiveCount int               `json:"activeCount" example:"3"`
	Limit       int               `json:"limit" example:"10"`
	// PaidPlan: their own plan is paid or they belong to a family whose owner's is (the server decides).
	PaidPlan bool `json:"paidPlan" example:"true"`
	// NoticeSeen: the person already pressed «Entendido» on the section's first-time notice (on any device).
	NoticeSeen bool `json:"noticeSeen" example:"false"`
} // @name SupplementPersonalListResponse

func accountNotFoundBody() map[string]string {
	return map[string]string{"error": "account_not_found", "message": "Account not found"}
}

// ListPersonalRoutines handles GET /accounts/{accountId}/routines.
//
//	@Summary		The person's own supplement routines
//	@Description	Lists the routines the person made for themselves — active first, then paused and ended — each with only the
//	@Description	doses of [from, to) (their local day, at most 48 hours), its progress and its next dose. Nobody else in the
//	@Description	family sees them. Reading never depends on the plan.
//	@Tags			supplements
//	@Produce		json
//	@Param			accountId	path		string	true	"Account UUID"
//	@Param			from		query		string	true	"Window start, RFC 3339"
//	@Param			to			query		string	true	"Window end (exclusive), RFC 3339"
//	@Success		200			{object}	personalListResponse
//	@Failure		400			{object}	validationDoc	"Missing or invalid window"
//	@Failure		404			{object}	errorDoc		"No account exists for this id"
//	@Security		ClerkSession
//	@Failure		401			{object}	errorDoc	"No valid Clerk session"
//	@Failure		403			{object}	errorDoc	"The account is not the session's own"
//	@Router			/accounts/{accountId}/routines [get]
func (h *Handler) ListPersonalRoutines(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	accountID, err := uuid.Parse(chi.URLParam(r, "accountId"))
	if err != nil {
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, accountNotFoundBody(), nil)
		return
	}
	from, to, errs := parseWindow(r)
	if errs.HasErrors() {
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationBody(errs), nil)
		return
	}
	list, seen, err := h.service.ListPersonal(ctx, accountID, from, to)
	if err != nil {
		var verrs ValidationErrors
		switch {
		case errors.Is(err, ErrAccountNotFound):
			h.responder.WriteJSON(ctx, w, http.StatusNotFound, accountNotFoundBody(), nil)
		case errors.As(err, &verrs):
			h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationBody(verrs), nil)
		default:
			h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not list routines", &accountID)
		}
		return
	}
	resp := personalListResponse{Routines: make([]routineResponse, 0, len(list.Routines)), ActiveCount: list.ActiveCount, Limit: MaxActivePerChild, PaidPlan: list.PaidPlan, NoticeSeen: seen}
	for _, v := range list.Routines {
		resp.Routines = append(resp.Routines, toRoutineResponse(v, access.Full, accountID))
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, resp, nil)
}

// CreatePersonalRoutine handles POST /accounts/{accountId}/routines.
//
//	@Summary		Create a supplement routine for the person themselves
//	@Description	Saves the routine the person wrote, exactly as written, and generates its first doses. It is the person's own:
//	@Description	nobody else in the family sees it or is reminded of it. Part of the paid plan (their own, or the one of a paid
//	@Description	family they belong to; the server decides): otherwise 422 "freemium_consultation_limit_exceeded" with reason
//	@Description	"supplements"; with 10 active personal routines, 422 "routine_limit_exceeded".
//	@Tags			supplements
//	@Accept			json
//	@Produce		json
//	@Param			accountId	path		string					true	"Account UUID"
//	@Param			payload		body		createRoutineRequest	true	"The routine"
//	@Success		201			{object}	routineResponse
//	@Failure		400			{object}	validationDoc		"An invalid field"
//	@Failure		404			{object}	errorDoc			"No account exists for this id"
//	@Failure		422			{object}	planLimitDoc		"No paid plan, or the person has the maximum of active routines (routineLimitDoc)"
//	@Security		ClerkSession
//	@Failure		401			{object}	errorDoc	"No valid Clerk session"
//	@Failure		403			{object}	errorDoc	"The account is not the session's own"
//	@Router			/accounts/{accountId}/routines [post]
func (h *Handler) CreatePersonalRoutine(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	accountID, err := uuid.Parse(chi.URLParam(r, "accountId"))
	if err != nil {
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, accountNotFoundBody(), nil)
		return
	}
	var req createRoutineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusBadRequest, "validation_error", "Malformed JSON body", &accountID)
		return
	}
	view, err := h.service.CreatePersonal(ctx, accountID, Input(req))
	if err != nil {
		var verrs ValidationErrors
		var planErr *PlanLimitError
		var limitErr *RoutineLimitError
		switch {
		case errors.As(err, &verrs):
			h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationBody(verrs), &accountID)
		case errors.As(err, &planErr):
			h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, planLimitBody(planErr.Reason), &accountID)
		case errors.As(err, &limitErr):
			h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, routineLimitBody(limitErr.Limit), &accountID)
		case errors.Is(err, ErrAccountNotFound):
			h.responder.WriteJSON(ctx, w, http.StatusNotFound, accountNotFoundBody(), nil)
		default:
			h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not create routine", &accountID)
		}
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusCreated, toRoutineResponse(*view, access.Full, accountID), &accountID)
}

// AcknowledgePersonalNotice handles POST /accounts/{accountId}/routines/notice-seen.
//
//	@Summary		«Entendido» on the first-time notice of the personal section
//	@Description	Records, for the account (every device), that the person read it. Idempotent.
//	@Tags			supplements
//	@Success		204
//	@Failure		404	{object}	errorDoc	"No account exists for this id"
//	@Security		ClerkSession
//	@Failure		401	{object}	errorDoc	"No valid Clerk session"
//	@Failure		403	{object}	errorDoc	"The account is not the session's own"
//	@Router			/accounts/{accountId}/routines/notice-seen [post]
func (h *Handler) AcknowledgePersonalNotice(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	accountID, err := uuid.Parse(chi.URLParam(r, "accountId"))
	if err != nil {
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, accountNotFoundBody(), nil)
		return
	}
	if err := h.service.AcknowledgeNotice(ctx, accountID); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not save the notice", &accountID)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
