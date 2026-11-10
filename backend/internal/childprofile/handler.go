package childprofile

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/growth"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// Handler serves PUT /children/{childId}. Every response goes through the Responder; the names and the values are only ever in
// JSON bodies, never in an address, a message or error_logs.
type Handler struct {
	service   *Service
	responder *httpx.Responder
}

// NewHandler creates a Handler.
func NewHandler(service *Service, responder *httpx.Responder) *Handler {
	return &Handler{service: service, responder: responder}
}

const maxBody = 8 << 10

type measurementRequest struct {
	MeasuredOn string `json:"measuredOn" example:"2026-11-09"`
} // @name ChildCorrectionMeasurement

type updateRequest struct {
	FirstName string   `json:"firstName" example:"Sofía"`
	LastName  string   `json:"lastName" example:"Gómez"`
	BirthDate string   `json:"birthDate" example:"2021-03-14"`
	Height    *float64 `json:"height" example:"88.5"`
	Weight    *float64 `json:"weight" example:"12.4"`
	// Measurement, when set, also writes a growth measurement on that date with the non-empty height and weight.
	Measurement *measurementRequest `json:"measurement"`
} // @name ChildCorrectionInput

type errorDoc struct {
	Error   string `json:"error" example:"child_not_found"`
	Message string `json:"message"`
} // @name ChildCorrectionErrorResponse

type validationDoc struct {
	Error   string `json:"error" example:"validation_error"`
	Message string `json:"message"`
	Details []struct {
		Field   string `json:"field" example:"firstName"`
		Message string `json:"message"`
	} `json:"details"`
} // @name ChildCorrectionValidationResponse

type conflictDoc struct {
	Error            string   `json:"error" example:"birth_date_conflict"`
	Message          string   `json:"message"`
	MeasurementCount int      `json:"measurementCount" example:"2"`
	Measurements     []string `json:"measurements" example:"2022-03-03,2022-04-14"`
	VaccinationCount int      `json:"vaccinationCount" example:"1"`
	Vaccinations     []string `json:"vaccinations" example:"2022-03-10"`
} // @name ChildBirthDateConflictResponse

type planLimitDoc struct {
	Error   string `json:"error" example:"freemium_consultation_limit_exceeded"`
	Message string `json:"message"`
	Reason  string `json:"reason" example:"child_identity"`
} // @name ChildIdentityPlanLimitResponse

// UpdateChild handles PUT /children/{childId}.
//
//	@Summary		Correct a child's data
//	@Description	The whole child is sent: first name, last name, birth date, height and weight (null empties them). Height and
//	@Description	weight on every plan; a change of the names or the birth date needs the paid plan of the family (422
//	@Description	`child_identity`, nothing saved). A birth date after measurements or vaccinations already written down is 409
//	@Description	`birth_date_conflict` with their dates. With `measurement`, a growth measurement is also written on that date,
//	@Description	in the same transaction. Saving without changes doesn't count as a correction. A child is never deleted.
//	@Tags			children
//	@Accept			json
//	@Produce		json
//	@Param			childId	path		string			true	"Child UUID"
//	@Param			payload	body		updateRequest	true	"The child"
//	@Success		200		{object}	account.ChildResponse
//	@Failure		400		{object}	validationDoc	"An invalid field or a malformed body"
//	@Failure		404		{object}	errorDoc		"No child exists for this id"
//	@Failure		409		{object}	conflictDoc		"The birth date is after records already written down"
//	@Failure		422		{object}	planLimitDoc	"The identity needs the paid plan, or the measurement passes the cap (growth_limit_exceeded)"
//	@Security		ClerkSession
//	@Failure		401		{object}	errorDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorDoc	"The session can't correct this child's data"
//	@Router			/children/{childId} [put]
func (h *Handler) UpdateChild(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)
	childID, err := uuid.Parse(chi.URLParam(r, "childId"))
	if err != nil {
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, map[string]string{"error": "child_not_found", "message": "Child not found"}, nil)
		return
	}
	var req updateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	a, _ := access.FromContext(ctx)
	actor := a.ActorAccountID
	if actor == uuid.Nil {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not correct the child", nil)
		return
	}
	in := Input{FirstName: req.FirstName, LastName: req.LastName, BirthDate: req.BirthDate, Height: req.Height, Weight: req.Weight}
	if req.Measurement != nil {
		in.Measurement = &MeasurementInput{MeasuredOn: req.Measurement.MeasuredOn}
	}
	saved, err := h.service.Update(ctx, childID, actor, in)
	if err != nil {
		h.writeError(ctx, w, err, actor)
		return
	}
	// Only a full level reaches here: the owner, or a Tutor of a paid family.
	role := "tutor"
	if actor == saved.Child.AccountID {
		role = "owner"
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, account.ToChildResponse(saved.Child, role, saved.Plan, saved.Child.AccountID), &actor)
}

// writeError maps the domain errors to the contract's answers. The messages are fixed: none repeats what the parent wrote.
func (h *Handler) writeError(ctx context.Context, w http.ResponseWriter, err error, actor uuid.UUID) {
	var verrs ValidationErrors
	var conflict *ConflictError
	switch {
	case errors.As(err, &verrs):
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, httpx.ValidationBody("Invalid child", verrs), &actor)
	case errors.As(err, &conflict):
		h.responder.WriteJSON(ctx, w, http.StatusConflict, conflictDoc{
			Error: "birth_date_conflict", Message: "The birth date is after records already written down",
			MeasurementCount: conflict.MeasurementCount, Measurements: conflict.Measurements,
			VaccinationCount: conflict.VaccinationCount, Vaccinations: conflict.Vaccinations,
		}, &actor)
	case errors.Is(err, ErrPlanRequired):
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, planLimitDoc{
			Error: "freemium_consultation_limit_exceeded", Message: "Correcting the identity of a child is part of the paid plan", Reason: PlanLimitChildIdentity,
		}, &actor)
	case errors.Is(err, growth.ErrLimit):
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, map[string]string{
			"error": "growth_limit_exceeded", "message": "The child reached its limit of measurements", "limit": strconv.Itoa(growth.MaxPerChild),
		}, &actor)
	case errors.Is(err, ErrNotFound):
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, map[string]string{"error": "child_not_found", "message": "Child not found"}, &actor)
	default:
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not correct the child", &actor)
	}
}
