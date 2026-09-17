package consultation

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// Handler exposes the consultation HTTP endpoints.
type Handler struct {
	service   *Service
	responder *httpx.Responder
}

// NewHandler creates a consultation Handler backed by the given service.
func NewHandler(service *Service, responder *httpx.Responder) *Handler {
	return &Handler{service: service, responder: responder}
}

// maxRequestBodyBytes caps the create-consultation body: the photo is
// base64-encoded in the JSON (~33% overhead over its 8MB decoded limit,
// research.md), plus room for the rest of the payload.
const maxRequestBodyBytes = 11 << 20 // 11 MiB

type doseResponse struct {
	ID          string `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	ScheduledAt string `json:"scheduledAt" example:"2026-01-15T08:00:00Z"`
	Taken       bool   `json:"taken" example:"false"`
} // @name DoseResponse

type medicationResponse struct {
	ID             string         `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	Name           string         `json:"name" example:"Amoxicilina"`
	FrequencyHours int            `json:"frequencyHours" example:"8"`
	DurationDays   int            `json:"durationDays" example:"5"`
	StartTime      *string        `json:"startTime" example:"08:00"`
	Doses          []doseResponse `json:"doses"`
} // @name MedicationResponse

type consultationSummaryResponse struct {
	ID          string `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	DoctorName  string `json:"doctorName" example:"Dra. López"`
	ConsultDate string `json:"consultDate" example:"2026-01-15"`
} // @name ConsultationSummaryResponse

type consultationListResponse struct {
	ChildID       string                        `json:"childId" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	Consultations []consultationSummaryResponse `json:"consultations"`
} // @name ConsultationListResponse

type consultationDetailResponse struct {
	ID          string               `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	ChildID     string               `json:"childId" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	DoctorName  string               `json:"doctorName" example:"Dra. López"`
	ConsultDate string               `json:"consultDate" example:"2026-01-15"`
	PhotoBase64 string               `json:"photoBase64"`
	Symptoms    string               `json:"symptoms" example:"Tos y fiebre leve"`
	Medications []medicationResponse `json:"medications"`
} // @name ConsultationDetailResponse

type childNotFoundResponseDoc struct {
	Error   string `json:"error" example:"child_not_found"`
	Message string `json:"message" example:"Child not found"`
} // @name ChildNotFoundResponse

type consultationNotFoundResponseDoc struct {
	Error   string `json:"error" example:"consultation_not_found"`
	Message string `json:"message" example:"Consultation not found"`
} // @name ConsultationNotFoundResponse

type doseNotFoundResponseDoc struct {
	Error   string `json:"error" example:"dose_not_found"`
	Message string `json:"message" example:"Dose not found"`
} // @name DoseNotFoundResponse

type validationErrorResponseDoc struct {
	Error   string          `json:"error" example:"validation_error"`
	Message string          `json:"message" example:"One or more fields are invalid"`
	Details []fieldErrorDoc `json:"details"`
} // @name ConsultationValidationErrorResponse

type fieldErrorDoc struct {
	Field   string `json:"field" example:"doctorName"`
	Message string `json:"message" example:"doctor name is required"`
} // @name ConsultationFieldError

// ListConsultations handles GET /children/{childId}/consultations
// (specs/004-detalle-consulta-hijo/contracts/get-consultations.md).
//
//	@Summary		List a child's consultations
//	@Description	Lists a child's medical consultations (date + doctor), most recent first (FR-001).
//	@Tags			consultations
//	@Produce		json
//	@Param			childId	path		string	true	"Child UUID"
//	@Success		200		{object}	consultationListResponse
//	@Failure		404		{object}	childNotFoundResponseDoc	"No child exists for this id"
//	@Router			/children/{childId}/consultations [get]
func (h *Handler) ListConsultations(w http.ResponseWriter, r *http.Request) {
	childID, err := uuid.Parse(chi.URLParam(r, "childId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, childNotFoundBody(), nil)
		return
	}

	consultations, err := h.service.ListConsultations(r.Context(), childID)
	if err != nil {
		if errors.Is(err, ErrChildNotFound) {
			h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, childNotFoundBody(), nil)
			return
		}
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not list consultations", nil)
		return
	}

	summaries := make([]consultationSummaryResponse, 0, len(consultations))
	for _, c := range consultations {
		summaries = append(summaries, consultationSummaryResponse{
			ID:          c.ID.String(),
			DoctorName:  c.DoctorName,
			ConsultDate: c.ConsultDate.Format("2006-01-02"),
		})
	}

	h.responder.WriteJSON(r.Context(), w, http.StatusOK, consultationListResponse{
		ChildID:       childID.String(),
		Consultations: summaries,
	}, nil)
}

type createMedicationRequest struct {
	Name           string  `json:"name" example:"Amoxicilina"`
	FrequencyHours int     `json:"frequencyHours" example:"8"`
	DurationDays   int     `json:"durationDays" example:"5"`
	StartTime      *string `json:"startTime" example:"08:00"`
}

type createConsultationRequest struct {
	DoctorName  string                    `json:"doctorName" example:"Dra. López"`
	ConsultDate string                    `json:"consultDate" example:"2026-01-15"`
	PhotoBase64 string                    `json:"photoBase64"`
	Symptoms    string                    `json:"symptoms" example:"Tos y fiebre leve"`
	Medications []createMedicationRequest `json:"medications"`
}

// CreateConsultation handles POST /children/{childId}/consultations
// (specs/004-detalle-consulta-hijo/contracts/post-consultations.md).
//
//	@Summary		Register a new medical consultation
//	@Description	Registers a consultation with its prescription photo, medications and symptoms
//	@Description	(FR-003, FR-004). At least one medication is required (FR-015). Doses for any
//	@Description	medication with a startTime are generated all at once (research.md).
//	@Tags			consultations
//	@Accept			json
//	@Produce		json
//	@Param			childId	path		string						true	"Child UUID"
//	@Param			payload	body		createConsultationRequest	true	"Consultation to register"
//	@Success		201		{object}	consultationDetailResponse
//	@Failure		400		{object}	validationErrorResponseDoc	"Missing/invalid field"
//	@Failure		404		{object}	childNotFoundResponseDoc	"No child exists for this id"
//	@Router			/children/{childId}/consultations [post]
func (h *Handler) CreateConsultation(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)

	childID, err := uuid.Parse(chi.URLParam(r, "childId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, childNotFoundBody(), nil)
		return
	}

	var req createConsultationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}

	var consultDate time.Time
	if req.ConsultDate != "" {
		parsed, err := time.Parse("2006-01-02", req.ConsultDate)
		if err != nil {
			h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationErrorBody([]ValidationError{{
				Field:   "consultDate",
				Message: "consult date must be an ISO-8601 date (YYYY-MM-DD)",
			}}, "One or more fields are invalid"), nil)
			return
		}
		consultDate = parsed
	}

	var photo []byte
	if req.PhotoBase64 != "" {
		decoded, err := base64.StdEncoding.DecodeString(req.PhotoBase64)
		if err != nil {
			h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationErrorBody([]ValidationError{{
				Field:   "photoBase64",
				Message: "photo must be valid base64",
			}}, "One or more fields are invalid"), nil)
			return
		}
		photo = decoded
	}

	input := CreateConsultationInput{
		DoctorName:  req.DoctorName,
		ConsultDate: consultDate,
		Photo:       photo,
		Symptoms:    req.Symptoms,
	}
	for _, m := range req.Medications {
		input.Medications = append(input.Medications, CreateMedicationInput{
			Name:           m.Name,
			FrequencyHours: m.FrequencyHours,
			DurationDays:   m.DurationDays,
			StartTime:      m.StartTime,
		})
	}

	c, err := h.service.CreateConsultation(r.Context(), childID, input)
	if err != nil {
		h.writeCreateConsultationError(r.Context(), w, err)
		return
	}

	h.responder.WriteJSON(r.Context(), w, http.StatusCreated, toConsultationDetailResponse(c), nil)
}

func (h *Handler) writeCreateConsultationError(ctx context.Context, w http.ResponseWriter, err error) {
	var validationErrs ValidationErrors
	switch {
	case errors.As(err, &validationErrs):
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationErrorBody(validationErrs, "One or more fields are invalid"), nil)
	case errors.Is(err, ErrChildNotFound):
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, childNotFoundBody(), nil)
	default:
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not create consultation", nil)
	}
}

// GetConsultation handles GET /consultations/{consultationId}
// (specs/004-detalle-consulta-hijo/contracts/get-consultation-detail.md).
//
//	@Summary		Get a consultation's full detail
//	@Description	Retrieves the prescription photo, doctor, date, medications (with their doses,
//	@Description	if any), and symptoms of a consultation (FR-013).
//	@Tags			consultations
//	@Produce		json
//	@Param			consultationId	path		string	true	"Consultation UUID"
//	@Success		200				{object}	consultationDetailResponse
//	@Failure		404				{object}	consultationNotFoundResponseDoc	"No consultation exists for this id"
//	@Router			/consultations/{consultationId} [get]
func (h *Handler) GetConsultation(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "consultationId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, consultationNotFoundBody(), nil)
		return
	}

	c, err := h.service.GetConsultation(r.Context(), id)
	if err != nil {
		if errors.Is(err, ErrConsultationNotFound) {
			h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, consultationNotFoundBody(), nil)
			return
		}
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not fetch consultation", nil)
		return
	}

	h.responder.WriteJSON(r.Context(), w, http.StatusOK, toConsultationDetailResponse(c), nil)
}

type updateDoseRequest struct {
	Taken bool `json:"taken" example:"true"`
}

// UpdateDose handles PATCH /consultations/{consultationId}/doses/{doseId}
// (specs/004-detalle-consulta-hijo/contracts/patch-dose.md).
//
//	@Summary		Mark or unmark a dose as taken
//	@Description	Sets a dose's taken status. No validation of scheduled date or treatment
//	@Description	status — a dose can be marked/unmarked at any time (FR-011, FR-016).
//	@Tags			consultations
//	@Accept			json
//	@Produce		json
//	@Param			consultationId	path		string				true	"Consultation UUID"
//	@Param			doseId			path		string				true	"Dose UUID"
//	@Param			payload			body		updateDoseRequest	true	"New taken status"
//	@Success		200				{object}	doseResponse
//	@Failure		404				{object}	doseNotFoundResponseDoc	"No dose exists for this id"
//	@Router			/consultations/{consultationId}/doses/{doseId} [patch]
func (h *Handler) UpdateDose(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)

	consultationID, err := uuid.Parse(chi.URLParam(r, "consultationId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, doseNotFoundBody(), nil)
		return
	}

	doseID, err := uuid.Parse(chi.URLParam(r, "doseId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, doseNotFoundBody(), nil)
		return
	}

	var req updateDoseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}

	// Scoping the update to consultationID (not just doseID) is what makes
	// a dose from a different consultation correctly 404 instead of
	// silently succeeding — see repository.go's UpdateDoseStatus.
	dose, err := h.service.MarkDose(r.Context(), consultationID, doseID, req.Taken)
	if err != nil {
		if errors.Is(err, ErrDoseNotFound) {
			h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, doseNotFoundBody(), nil)
			return
		}
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not update dose", nil)
		return
	}

	h.responder.WriteJSON(r.Context(), w, http.StatusOK, toDoseResponse(dose), nil)
}

func childNotFoundBody() map[string]string {
	return map[string]string{"error": "child_not_found", "message": "Child not found"}
}

func consultationNotFoundBody() map[string]string {
	return map[string]string{"error": "consultation_not_found", "message": "Consultation not found"}
}

func doseNotFoundBody() map[string]string {
	return map[string]string{"error": "dose_not_found", "message": "Dose not found"}
}

// validationErrorBody builds the 400 response body shape. Pure data
// shaping only — same rationale as internal/account's validationErrorBody.
func validationErrorBody(errs []ValidationError, message string) map[string]any {
	details := make([]map[string]string, 0, len(errs))
	for _, e := range errs {
		details = append(details, map[string]string{"field": e.Field, "message": e.Message})
	}
	return map[string]any{
		"error":   "validation_error",
		"message": message,
		"details": details,
	}
}

func toDoseResponse(d *Dose) doseResponse {
	return doseResponse{
		ID:          d.ID.String(),
		ScheduledAt: d.ScheduledAt.Format(time.RFC3339),
		Taken:       d.Taken,
	}
}

func toConsultationDetailResponse(c *Consultation) consultationDetailResponse {
	medications := make([]medicationResponse, 0, len(c.Medications))
	for _, m := range c.Medications {
		doses := make([]doseResponse, 0, len(m.Doses))
		for _, d := range m.Doses {
			doses = append(doses, toDoseResponse(&d))
		}
		medications = append(medications, medicationResponse{
			ID:             m.ID.String(),
			Name:           m.Name,
			FrequencyHours: m.FrequencyHours,
			DurationDays:   m.DurationDays,
			StartTime:      m.StartTime,
			Doses:          doses,
		})
	}
	return consultationDetailResponse{
		ID:          c.ID.String(),
		ChildID:     c.ChildID.String(),
		DoctorName:  c.DoctorName,
		ConsultDate: c.ConsultDate.Format("2006-01-02"),
		PhotoBase64: base64.StdEncoding.EncodeToString(c.Photo),
		Symptoms:    c.Symptoms,
		Medications: medications,
	}
}
