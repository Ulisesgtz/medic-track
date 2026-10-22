package vaccination

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// Handler serves the vaccination card's routes. Every response goes through the Responder; the free text a parent wrote (their own
// vaccine name, the lot, the place, the notes) is only ever in JSON bodies, never in an address, a message or error_logs.
type Handler struct {
	service   *Service
	responder *httpx.Responder
}

// NewHandler creates a vaccination Handler.
func NewHandler(service *Service, responder *httpx.Responder) *Handler {
	return &Handler{service: service, responder: responder}
}

const maxVaccinationBody = 16 << 10

type inputRequest struct {
	VaccineCode    *string `json:"vaccineCode" example:"hepatitis_b"`
	CustomName     *string `json:"customName" example:""`
	AppliedOn      string  `json:"appliedOn" example:"2021-03-14"`
	DoseNumber     *int    `json:"doseNumber" example:"1"`
	Lot            *string `json:"lot"`
	Place          *string `json:"place"`
	Notes          *string `json:"notes"`
	AllowDuplicate bool    `json:"allowDuplicate" example:"false"`
} // @name VaccinationInput

type vaccinationResponse struct {
	ID          string  `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	VaccineCode *string `json:"vaccineCode" example:"hepatitis_b"`
	// Name is the catalog's name (even if the vaccine was retired since) or the parent's own words.
	Name            string  `json:"name" example:"Hepatitis B"`
	CustomName      *string `json:"customName"`
	AppliedOn       string  `json:"appliedOn" example:"2021-03-14"`
	DoseNumber      *int    `json:"doseNumber" example:"1"`
	Lot             *string `json:"lot"`
	Place           *string `json:"place"`
	Notes           *string `json:"notes"`
	CreatedByName   string  `json:"createdByName" example:"Ana"`
	CreatedAt       string  `json:"createdAt" example:"2026-10-17T18:00:00Z"`
	CorrectedByName *string `json:"correctedByName" example:"Ana"`
	CorrectedAt     *string `json:"correctedAt" example:"2026-11-05T18:00:00Z"`
} // @name VaccinationResponse

type listResponse struct {
	Vaccinations []vaccinationResponse `json:"vaccinations"`
} // @name VaccinationListResponse

type errorDoc struct {
	Error   string `json:"error" example:"vaccination_not_found"`
	Message string `json:"message"`
} // @name VaccinationErrorResponse

type validationDoc struct {
	Error   string `json:"error" example:"validation_error"`
	Message string `json:"message"`
	Details []struct {
		Field   string `json:"field" example:"appliedOn"`
		Message string `json:"message"`
	} `json:"details"`
} // @name VaccinationValidationResponse

func formatTime(t time.Time) string { return t.UTC().Format(time.RFC3339) }

func toResponse(v Vaccination) vaccinationResponse {
	out := vaccinationResponse{
		ID: v.ID.String(), VaccineCode: v.VaccineCode, Name: v.Name, CustomName: v.CustomName, AppliedOn: v.AppliedOn,
		DoseNumber: v.DoseNumber, Lot: v.Lot, Place: v.Place, Notes: v.Notes, CreatedByName: v.CreatedByName,
		CreatedAt: formatTime(v.CreatedAt), CorrectedByName: v.CorrectedByName,
	}
	if v.CorrectedAt != nil {
		at := formatTime(*v.CorrectedAt)
		out.CorrectedAt = &at
	}
	return out
}

func inputOf(req inputRequest) Input {
	str := func(p *string) string {
		if p == nil {
			return ""
		}
		return *p
	}
	return Input{
		VaccineCode: str(req.VaccineCode), CustomName: str(req.CustomName), AppliedOn: req.AppliedOn, DoseNumber: req.DoseNumber,
		Lot: str(req.Lot), Place: str(req.Place), Notes: str(req.Notes), AllowDuplicate: req.AllowDuplicate,
	}
}

func actorOf(ctx context.Context) uuid.UUID {
	if a, ok := access.FromContext(ctx); ok {
		return a.ActorAccountID
	}
	return uuid.Nil
}

func actorPtr(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}

func (h *Handler) idParam(w http.ResponseWriter, r *http.Request, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, name))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, map[string]string{"error": "vaccination_not_found", "message": "Not found"}, nil)
		return uuid.Nil, false
	}
	return id, true
}

// writeError maps the domain errors to the contract's answers. The messages are fixed: none repeats what the parent wrote.
func (h *Handler) writeError(ctx context.Context, w http.ResponseWriter, err error, actor uuid.UUID, internalMessage string) {
	var verrs ValidationErrors
	switch {
	case errors.As(err, &verrs):
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, httpx.ValidationBody("Invalid vaccination", verrs), actorPtr(actor))
	case errors.Is(err, ErrDuplicate):
		h.responder.WriteJSON(ctx, w, http.StatusConflict, map[string]string{"error": "duplicate_vaccination", "message": "The dose is already recorded"}, actorPtr(actor))
	case errors.Is(err, ErrPhotoLimit):
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, map[string]string{
			"error": "photo_limit_exceeded", "message": "The child reached its limit of vaccination card photos", "reason": "vaccine_card", "limit": strconv.Itoa(MaxPhotosPerChild),
		}, actorPtr(actor))
	case errors.Is(err, ErrPhotoNotFound):
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, map[string]string{"error": "photo_not_found", "message": "Photo not found"}, actorPtr(actor))
	case errors.Is(err, ErrNotFound):
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, map[string]string{"error": "vaccination_not_found", "message": "Vaccination not found"}, actorPtr(actor))
	case errors.Is(err, ErrChildNotFound):
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, map[string]string{"error": "child_not_found", "message": "Child not found"}, actorPtr(actor))
	default:
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", internalMessage, actorPtr(actor))
	}
}

// ListVaccinations handles GET /children/{childId}/vaccinations.
//
//	@Summary		A child's vaccination card: the doses recorded
//	@Description	The most recent first. The client groups them by vaccine. The app never says what is due, late or complete.
//	@Tags			vaccinations
//	@Produce		json
//	@Param			childId	path		string	true	"Child UUID"
//	@Success		200		{object}	listResponse
//	@Failure		404		{object}	errorDoc	"No child exists for this id"
//	@Security		ClerkSession
//	@Failure		401		{object}	errorDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorDoc	"The session has no access to this child"
//	@Router			/children/{childId}/vaccinations [get]
func (h *Handler) ListVaccinations(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	childID, ok := h.idParam(w, r, "childId")
	if !ok {
		return
	}
	list, err := h.service.List(ctx, childID)
	if err != nil {
		h.writeError(ctx, w, err, actorOf(ctx), "Could not list the vaccinations")
		return
	}
	out := listResponse{Vaccinations: make([]vaccinationResponse, 0, len(list))}
	for _, v := range list {
		out.Vaccinations = append(out.Vaccinations, toResponse(v))
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, out, actorPtr(actorOf(ctx)))
}

// CreateVaccination handles POST /children/{childId}/vaccinations.
//
//	@Summary		Record a dose
//	@Description	A vaccine of the catalog (`vaccineCode`) or the parent's own words (`customName`), never both, and the date it was
//	@Description	applied (not in the future, not before the birth). 409 `duplicate_vaccination` when the same vaccine, dose and date
//	@Description	are already there; repeat with `allowDuplicate: true` if the parent confirms.
//	@Tags			vaccinations
//	@Accept			json
//	@Produce		json
//	@Param			childId	path		string			true	"Child UUID"
//	@Param			payload	body		inputRequest	true	"The dose"
//	@Success		201		{object}	vaccinationResponse
//	@Failure		400		{object}	validationDoc	"An invalid field"
//	@Failure		404		{object}	errorDoc		"No child exists for this id"
//	@Failure		409		{object}	errorDoc		"The dose is already recorded"
//	@Security		ClerkSession
//	@Failure		401		{object}	errorDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorDoc	"The session can't record doses for this child"
//	@Router			/children/{childId}/vaccinations [post]
func (h *Handler) CreateVaccination(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxVaccinationBody)
	childID, ok := h.idParam(w, r, "childId")
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
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not record the vaccination", nil)
		return
	}
	v, err := h.service.Create(ctx, childID, actor, inputOf(req))
	if err != nil {
		h.writeError(ctx, w, err, actor, "Could not record the vaccination")
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusCreated, toResponse(*v), actorPtr(actor))
}

// UpdateVaccination handles PATCH /children/{childId}/vaccinations/{vaccinationId}.
//
//	@Summary		Correct a dose
//	@Description	The whole dose is sent and replaces the one saved; it keeps who corrected it and when (`correctedByName`,
//	@Description	`correctedAt`), without the earlier values.
//	@Tags			vaccinations
//	@Accept			json
//	@Produce		json
//	@Param			childId			path		string			true	"Child UUID"
//	@Param			vaccinationId	path		string			true	"Dose UUID"
//	@Param			payload			body		inputRequest	true	"The dose"
//	@Success		200				{object}	vaccinationResponse
//	@Failure		400				{object}	validationDoc	"An invalid field"
//	@Failure		404				{object}	errorDoc		"No such dose for this child"
//	@Failure		409				{object}	errorDoc		"The dose is already recorded"
//	@Security		ClerkSession
//	@Failure		401				{object}	errorDoc	"No valid Clerk session"
//	@Failure		403				{object}	errorDoc	"The session can't correct doses of this child"
//	@Router			/children/{childId}/vaccinations/{vaccinationId} [patch]
func (h *Handler) UpdateVaccination(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxVaccinationBody)
	childID, ok := h.idParam(w, r, "childId")
	if !ok {
		return
	}
	id, ok := h.idParam(w, r, "vaccinationId")
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
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not correct the vaccination", nil)
		return
	}
	v, err := h.service.Update(ctx, childID, id, actor, inputOf(req))
	if err != nil {
		h.writeError(ctx, w, err, actor, "Could not correct the vaccination")
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, toResponse(*v), actorPtr(actor))
}

// DeleteVaccination handles DELETE /children/{childId}/vaccinations/{vaccinationId}.
//
//	@Summary		Delete a dose for good
//	@Description	No trash and no undo: the dose is removed.
//	@Tags			vaccinations
//	@Param			childId			path	string	true	"Child UUID"
//	@Param			vaccinationId	path	string	true	"Dose UUID"
//	@Success		204
//	@Failure		404	{object}	errorDoc	"No such dose for this child"
//	@Security		ClerkSession
//	@Failure		401	{object}	errorDoc	"No valid Clerk session"
//	@Failure		403	{object}	errorDoc	"The session can't delete doses of this child"
//	@Router			/children/{childId}/vaccinations/{vaccinationId} [delete]
func (h *Handler) DeleteVaccination(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	childID, ok := h.idParam(w, r, "childId")
	if !ok {
		return
	}
	id, ok := h.idParam(w, r, "vaccinationId")
	if !ok {
		return
	}
	if err := h.service.Delete(ctx, childID, id); err != nil {
		h.writeError(ctx, w, err, actorOf(ctx), "Could not delete the vaccination")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
