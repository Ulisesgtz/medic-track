package supplement

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type resumeRequest struct {
	UtcOffsetMinutes int `json:"utcOffsetMinutes" example:"-360"`
} // @name SupplementResumeRequest

type myRemindersRequest struct {
	Enabled bool `json:"enabled" example:"true"`
} // @name SupplementMyRemindersRequest

type myRemindersResponse struct {
	MyReminders bool `json:"myReminders" example:"true"`
} // @name SupplementMyRemindersResponse

// writeMutationError maps the errors of editing, pausing, resuming, finishing and of «Tus avisos» to the contract's answers.
func (h *Handler) writeMutationError(ctx context.Context, w http.ResponseWriter, err error, actor uuid.UUID, internalMessage string) {
	var verrs ValidationErrors
	var planErr *PlanLimitError
	var limitErr *RoutineLimitError
	switch {
	case errors.As(err, &verrs):
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationBody(verrs), actorPtr(actor))
	case errors.As(err, &planErr):
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, planLimitBody(planErr.Reason), actorPtr(actor))
	case errors.As(err, &limitErr):
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, routineLimitBody(limitErr.Limit), actorPtr(actor))
	case errors.Is(err, ErrRoutineNotFound):
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, routineNotFoundBody(), actorPtr(actor))
	case errors.Is(err, ErrRoutineEnded):
		h.responder.WriteJSON(ctx, w, http.StatusConflict, map[string]string{"error": "routine_ended", "message": "The routine has ended"}, actorPtr(actor))
	case errors.Is(err, ErrRoutineNotActive):
		h.responder.WriteJSON(ctx, w, http.StatusConflict, map[string]string{"error": "routine_not_active", "message": "The routine is not active"}, actorPtr(actor))
	default:
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", internalMessage, actorPtr(actor))
	}
}

// routineIDParam reads {routineId}; an id that is not a UUID is a 404 like an unknown routine.
func (h *Handler) routineIDParam(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "routineId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, routineNotFoundBody(), nil)
		return uuid.Nil, false
	}
	return id, true
}

func (h *Handler) writeRoutine(w http.ResponseWriter, r *http.Request, view *RoutineView) {
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, toRoutineResponse(*view, levelOf(r.Context()), actorOf(r.Context())), nil)
}

// UpdateRoutine handles PATCH /routines/{routineId}.
//
//	@Summary		Edit a supplement routine
//	@Description	Replaces the routine's form (name, note and schedule). It counts from the next dose: future unmarked doses
//	@Description	are dropped and regenerated; past and marked doses never change. Paid plan only (422 reason "supplements");
//	@Description	an ended routine cannot be edited (409 routine_ended).
//	@Tags			supplements
//	@Accept			json
//	@Produce		json
//	@Param			routineId	path		string					true	"Routine UUID"
//	@Param			payload		body		createRoutineRequest	true	"The whole routine"
//	@Success		200			{object}	routineResponse
//	@Failure		400			{object}	validationDoc	"An invalid field"
//	@Failure		404			{object}	errorDoc		"No such routine"
//	@Failure		409			{object}	errorDoc		"The routine has ended"
//	@Failure		422			{object}	planLimitDoc	"Free plan"
//	@Security		ClerkSession
//	@Failure		401			{object}	errorDoc	"No valid Clerk session"
//	@Failure		403			{object}	errorDoc	"The session can't edit this routine"
//	@Router			/routines/{routineId} [patch]
func (h *Handler) UpdateRoutine(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	id, ok := h.routineIDParam(w, r)
	if !ok {
		return
	}
	var req createRoutineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	view, err := h.service.Update(ctx, id, Input(req), actorOf(ctx))
	if err != nil {
		h.writeMutationError(ctx, w, err, actorOf(ctx), "Could not update the routine")
		return
	}
	h.writeRoutine(w, r, view)
}

// PauseRoutine handles POST /routines/{routineId}/pause.
//
//	@Summary		Pause a supplement routine
//	@Description	No more doses or reminders from now on; future unmarked doses disappear, past and marked ones stay. It
//	@Description	never needs the paid plan.
//	@Tags			supplements
//	@Produce		json
//	@Param			routineId	path		string	true	"Routine UUID"
//	@Success		200			{object}	routineResponse
//	@Failure		404			{object}	errorDoc	"No such routine"
//	@Failure		409			{object}	errorDoc	"The routine is not active"
//	@Security		ClerkSession
//	@Failure		401			{object}	errorDoc	"No valid Clerk session"
//	@Failure		403			{object}	errorDoc	"The session can't pause this routine"
//	@Router			/routines/{routineId}/pause [post]
func (h *Handler) PauseRoutine(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, ok := h.routineIDParam(w, r)
	if !ok {
		return
	}
	view, err := h.service.Pause(ctx, id, actorOf(ctx))
	if err != nil {
		h.writeMutationError(ctx, w, err, actorOf(ctx), "Could not pause the routine")
		return
	}
	h.writeRoutine(w, r, view)
}

// ResumeRoutine handles POST /routines/{routineId}/resume.
//
//	@Summary		Resume a paused supplement routine
//	@Description	Active again from now, without the doses of the time it was paused. Paid plan only (422 reason
//	@Description	"supplements") and it counts toward the 10 active routines (422 routine_limit_exceeded).
//	@Tags			supplements
//	@Accept			json
//	@Produce		json
//	@Param			routineId	path		string			true	"Routine UUID"
//	@Param			payload		body		resumeRequest	true	"The device's UTC offset"
//	@Success		200			{object}	routineResponse
//	@Failure		400			{object}	validationDoc	"An invalid offset"
//	@Failure		404			{object}	errorDoc		"No such routine"
//	@Failure		409			{object}	errorDoc		"The routine ended or is already active"
//	@Failure		422			{object}	planLimitDoc	"Free plan, or the cap of active routines (routineLimitDoc)"
//	@Security		ClerkSession
//	@Failure		401			{object}	errorDoc	"No valid Clerk session"
//	@Failure		403			{object}	errorDoc	"The session can't resume this routine"
//	@Router			/routines/{routineId}/resume [post]
func (h *Handler) ResumeRoutine(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	id, ok := h.routineIDParam(w, r)
	if !ok {
		return
	}
	var req resumeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	view, err := h.service.Resume(ctx, id, req.UtcOffsetMinutes, actorOf(ctx))
	if err != nil {
		h.writeMutationError(ctx, w, err, actorOf(ctx), "Could not resume the routine")
		return
	}
	h.writeRoutine(w, r, view)
}

// FinishRoutine handles POST /routines/{routineId}/finish.
//
//	@Summary		Finish a supplement routine
//	@Description	Ends it for good: no more doses or reminders; future unmarked doses disappear, the history stays. It never
//	@Description	needs the paid plan. Idempotent.
//	@Tags			supplements
//	@Produce		json
//	@Param			routineId	path		string	true	"Routine UUID"
//	@Success		200			{object}	routineResponse
//	@Failure		404			{object}	errorDoc	"No such routine"
//	@Security		ClerkSession
//	@Failure		401			{object}	errorDoc	"No valid Clerk session"
//	@Failure		403			{object}	errorDoc	"The session can't finish this routine"
//	@Router			/routines/{routineId}/finish [post]
func (h *Handler) FinishRoutine(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, ok := h.routineIDParam(w, r)
	if !ok {
		return
	}
	view, err := h.service.Finish(ctx, id, actorOf(ctx))
	if err != nil {
		h.writeMutationError(ctx, w, err, actorOf(ctx), "Could not finish the routine")
		return
	}
	h.writeRoutine(w, r, view)
}

// SetMyReminders handles PUT /routines/{routineId}/my-reminders.
//
//	@Summary		Turn the session's own reminders of a routine on or off
//	@Description	«Tus avisos»: only for the person who asks, never for the rest of the family. Idempotent; a Caregiver can too.
//	@Description	Only an active routine has reminders (409 routine_not_active).
//	@Tags			supplements
//	@Accept			json
//	@Produce		json
//	@Param			routineId	path		string				true	"Routine UUID"
//	@Param			payload		body		myRemindersRequest	true	"enabled"
//	@Success		200			{object}	myRemindersResponse
//	@Failure		404			{object}	errorDoc	"No such routine"
//	@Failure		409			{object}	errorDoc	"The routine is not active"
//	@Security		ClerkSession
//	@Failure		401			{object}	errorDoc	"No valid Clerk session"
//	@Failure		403			{object}	errorDoc	"No access to this routine"
//	@Router			/routines/{routineId}/my-reminders [put]
func (h *Handler) SetMyReminders(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	id, ok := h.routineIDParam(w, r)
	if !ok {
		return
	}
	var req myRemindersRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	actor := actorOf(ctx)
	if actor == uuid.Nil {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not save the reminder choice", nil)
		return
	}
	if err := h.service.SetMyReminders(ctx, id, actor, req.Enabled); err != nil {
		h.writeMutationError(ctx, w, err, actor, "Could not save the reminder choice")
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, myRemindersResponse{MyReminders: req.Enabled}, nil)
}
