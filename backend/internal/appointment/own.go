package appointment

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"
)

// A person's own appointments (specs/058-consultas-del-titular): no child, with or without one of their own consultations.
// The ones of an own consultation are created through POST /consultations/{consultationId}/appointments as any other.

// CreateOwn saves an appointment of the person, with no consultation (no consultation date to check against).
func (s *Service) CreateOwn(ctx context.Context, accountID uuid.UUID, in Input, createdBy uuid.UUID) (*Appointment, error) {
	norm, errs := ValidateInput(in, "")
	if errs.HasErrors() {
		return nil, errs
	}
	id, err := s.repo.CreateOwn(ctx, accountID, norm, createdBy)
	if err != nil {
		return nil, err
	}
	return s.get(ctx, id, createdBy)
}

// ForPerson is the person's next appointment and the history of the rest.
func (s *Service) ForPerson(ctx context.Context, accountID, actor uuid.UUID) (*Appointment, []Appointment, bool, error) {
	next, history, paid, err := s.repo.ForPerson(ctx, accountID)
	if err != nil {
		return nil, nil, false, err
	}
	all := make([]*Appointment, 0, len(history)+1)
	if next != nil {
		all = append(all, next)
	}
	for i := range history {
		all = append(all, &history[i])
	}
	return next, history, paid, s.decorate(ctx, actor, all...)
}

// ForPerson handles GET /accounts/{accountId}/appointments.
//
//	@Summary		A person's own next appointment and the history of the rest
//	@Description	GET /children/{childId}/appointments for the person themself (specs/058). Reading never depends on the plan.
//	@Tags			appointments
//	@Produce		json
//	@Param			accountId	path		string	true	"Account UUID of the person"
//	@Success		200			{object}	forChildResponse
//	@Failure		404			{object}	errorDoc	"No account exists for this id"
//	@Security		ClerkSession
//	@Failure		401			{object}	errorDoc	"No valid Clerk session"
//	@Failure		403			{object}	errorDoc	"The session cannot see this person's appointments"
//	@Router			/accounts/{accountId}/appointments [get]
func (h *Handler) ForPerson(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	accountID, ok := h.idParam(w, r, "accountId")
	if !ok {
		return
	}
	next, history, paid, err := h.service.ForPerson(ctx, accountID, actorOf(ctx))
	if err != nil {
		h.writeOwnError(ctx, w, err, "Could not list the appointments")
		return
	}
	level, now := levelOf(ctx), h.service.now()
	resp := forChildResponse{History: make([]appointmentResponse, 0, len(history)), PaidPlan: paid}
	if next != nil {
		n := toResponse(*next, level, now)
		resp.Next = &n
	}
	for _, a := range history {
		resp.History = append(resp.History, toResponse(a, level, now))
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, resp, nil)
}

// CreateOwn handles POST /accounts/{accountId}/appointments.
//
//	@Summary		Add an appointment of the person themself, with no consultation
//	@Description	POST /children/{childId}/appointments for the person (specs/058): the plan is that of their own things (their
//	@Description	account's or a paying family's; 422 reason "appointments" otherwise). Only the person themself.
//	@Tags			appointments
//	@Accept			json
//	@Produce		json
//	@Param			accountId	path		string			true	"Account UUID of the person"
//	@Param			payload		body		inputRequest	true	"The appointment"
//	@Success		201			{object}	appointmentResponse
//	@Failure		400			{object}	validationDoc	"An invalid field"
//	@Failure		404			{object}	errorDoc		"No account exists for this id"
//	@Failure		422			{object}	planLimitDoc	"Not on the paid plan"
//	@Security		ClerkSession
//	@Failure		401			{object}	errorDoc	"No valid Clerk session"
//	@Failure		403			{object}	errorDoc	"The session is not this person"
//	@Router			/accounts/{accountId}/appointments [post]
func (h *Handler) CreateOwn(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	accountID, ok := h.idParam(w, r, "accountId")
	if !ok {
		return
	}
	var req inputRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	actor := actorOf(ctx)
	if actor == uuid.Nil {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not create the appointment", nil)
		return
	}
	a, err := h.service.CreateOwn(ctx, accountID, Input(req), actor)
	if err != nil {
		h.writeOwnError(ctx, w, err, "Could not create the appointment")
		return
	}
	h.writeOne(w, r, http.StatusCreated, a)
}

// writeOwnError is writeError with the missing account answered as such.
func (h *Handler) writeOwnError(ctx context.Context, w http.ResponseWriter, err error, internalMessage string) {
	if errors.Is(err, ErrAccountNotFound) {
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, map[string]string{"error": "account_not_found", "message": "Account not found"}, actorPtr(actorOf(ctx)))
		return
	}
	h.writeError(ctx, w, err, actorOf(ctx), internalMessage)
}
