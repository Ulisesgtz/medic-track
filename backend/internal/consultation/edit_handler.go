package consultation

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
)

type updateMedicationRequest struct {
	// ID is an existing medication of this consultation; omit it for a new one. A medication left out is removed.
	ID             *string `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	Name           string  `json:"name" example:"Amoxicilina"`
	FrequencyHours int     `json:"frequencyHours" example:"8"`
	DurationDays   int     `json:"durationDays" example:"7"`
	StartTime      *string `json:"startTime" example:"08:00"`
} // @name UpdateMedicationRequest

type updateConsultationRequest struct {
	// ExpectedVersion is the detail's edited.at, or its createdAt if it was never edited (specs/051).
	ExpectedVersion string `json:"expectedVersion" example:"2026-10-18T15:20:00.123456Z"`
	DoctorName      string `json:"doctorName" example:"Dra. López"`
	ConsultDate     string `json:"consultDate" example:"2026-10-18"`
	// PhotoBase64 replaces the prescription photo; empty or omitted leaves it as it is.
	PhotoBase64      string                    `json:"photoBase64"`
	Notes            string                    `json:"notes" example:"La fiebre empezó el domingo"`
	SymptomCodes     []string                  `json:"symptomCodes" example:"fever,cough"`
	Medications      []updateMedicationRequest `json:"medications"`
	// UTCOffsetMinutes is the editing device's UTC offset. It is only used for a consultation that has no zone of its own
	// yet; one that has keeps reading its start times in its own zone.
	UTCOffsetMinutes int `json:"utcOffsetMinutes" example:"-360"`
} // @name UpdateConsultationRequest

// UpdateConsultation handles PUT /consultations/{consultationId} (specs/051-editar-consultas/contracts/api.md).
//
//	@Summary		Edit a saved consultation
//	@Description	The whole consultation as the parent left it: doctor, date, notes, symptoms, photo (optional: empty keeps it) and
//	@Description	the medications (with id = an existing one, without = a new one; one left out is removed, only if none of its
//	@Description	doses is marked). A changed schedule (frequency, duration, first dose or the consultation's date) only drops
//	@Description	the doses still ahead and unmarked and adds the new schedule's doses still ahead; a marked dose or one whose
//	@Description	time passed never changes. An ended treatment keeps its schedule. Any plan; the free plan's rule of one
//	@Description	active treatment at a time still applies. The kind (record only) never changes.
//	@Tags			consultations
//	@Accept			json
//	@Produce		json
//	@Param			consultationId	path		string						true	"Consultation UUID"
//	@Param			payload			body		updateConsultationRequest	true	"The consultation as edited"
//	@Success		200				{object}	consultationDetailResponse
//	@Failure		400				{object}	validationErrorResponseDoc		"Missing/invalid field, medication_not_found, treatment_ended or symptom_not_available"
//	@Failure		404				{object}	consultationNotFoundResponseDoc	"No consultation exists for this id"
//	@Failure		409				{object}	editConflictResponseDoc			"edit_conflict (another edit was saved) or medication_has_marks"
//	@Failure		422				{object}	planLimitResponseDoc			"Free plan: another treatment is active, or the photo limit (photo_limit_exceeded)"
//	@Security		ClerkSession
//	@Failure		401				{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Failure		403				{object}	sessionErrorResponseDoc	"The session can't edit this consultation"
//	@Router			/consultations/{consultationId} [put]
func (h *Handler) UpdateConsultation(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)

	id, err := uuid.Parse(chi.URLParam(r, "consultationId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, consultationNotFoundBody(), nil)
		return
	}
	var req updateConsultationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	in, errs := updateInputOf(req)
	if errs.HasErrors() {
		h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationErrorBody(errs, "One or more fields are invalid"), nil)
		return
	}

	var editor uuid.UUID
	if a, ok := access.FromContext(r.Context()); ok {
		editor = a.ActorAccountID
	}
	c, err := h.service.UpdateConsultation(r.Context(), id, in, editor)
	if err != nil {
		h.writeUpdateConsultationError(r.Context(), w, err)
		return
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, toConsultationDetailResponse(c, actorOf(r.Context())), nil)
}

// updateInputOf turns the request into the service's input; field errors name the field, never its value.
func updateInputOf(req updateConsultationRequest) (UpdateConsultationInput, ValidationErrors) {
	var errs ValidationErrors
	in := UpdateConsultationInput{
		DoctorName: req.DoctorName, Notes: req.Notes, SymptomCodes: req.SymptomCodes, UTCOffsetMinutes: req.UTCOffsetMinutes,
	}
	if req.ExpectedVersion != "" {
		v, err := time.Parse(time.RFC3339Nano, req.ExpectedVersion)
		if err != nil {
			errs = append(errs, ValidationError{Field: "expectedVersion", Message: "must be the RFC 3339 time the detail gave"})
		}
		in.ExpectedVersion = v
	}
	if req.ConsultDate != "" {
		d, err := time.Parse("2006-01-02", req.ConsultDate)
		if err != nil {
			errs = append(errs, ValidationError{Field: "consultDate", Message: "consult date must be an ISO-8601 date (YYYY-MM-DD)"})
		}
		in.ConsultDate = d
	}
	if req.PhotoBase64 != "" {
		photo, err := base64.StdEncoding.DecodeString(req.PhotoBase64)
		switch {
		case err != nil:
			errs = append(errs, ValidationError{Field: "photoBase64", Message: "photo must be valid base64"})
		case !looksLikeImage(photo):
			errs = append(errs, ValidationError{Field: "photoBase64", Message: "photo must be a JPEG, PNG, GIF, WebP or HEIC image"})
		default:
			in.Photo = photo
		}
	}
	for i, m := range req.Medications {
		med := UpdateMedicationInput{Name: m.Name, FrequencyHours: m.FrequencyHours, DurationDays: m.DurationDays, StartTime: m.StartTime}
		if m.ID != nil {
			medID, err := uuid.Parse(*m.ID)
			if err != nil {
				errs = append(errs, ValidationError{Field: fieldIndex("medications", i, "id"), Message: "medication_not_found"})
			}
			med.ID = &medID
		}
		in.Medications = append(in.Medications, med)
	}
	return in, errs
}

// writeUpdateConsultationError maps the edit's errors, each from its own line (the Responder records file and line).
func (h *Handler) writeUpdateConsultationError(ctx context.Context, w http.ResponseWriter, err error) {
	var validationErrs ValidationErrors
	var planErr *PlanLimitError
	switch {
	case errors.As(err, &validationErrs):
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationErrorBody(validationErrs, "One or more fields are invalid"), nil)
	case errors.Is(err, ErrSymptomNotAvailable):
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationErrorBody(ValidationErrors{{
			Field:   "symptomCodes",
			Message: "symptom_not_available",
		}}, "One or more fields are invalid"), nil)
	case errors.Is(err, ErrConsultationNotFound):
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, consultationNotFoundBody(), nil)
	case errors.Is(err, ErrEditConflict):
		h.responder.WriteJSON(ctx, w, http.StatusConflict, map[string]string{
			"error":   "edit_conflict",
			"message": "Another edit of this consultation was saved after it was opened",
		}, nil)
	case errors.Is(err, ErrMedicationHasMarks):
		h.responder.WriteJSON(ctx, w, http.StatusConflict, map[string]string{
			"error":   "medication_has_marks",
			"message": "A medication with marked doses can't be removed",
		}, nil)
	case errors.As(err, &planErr):
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, planLimitBody(planErr.Reason), nil)
	case errors.Is(err, ErrPhotoLimit):
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, map[string]string{
			"error":   "photo_limit_exceeded",
			"message": "The account keeps the most prescription photos it can",
			"limit":   strconv.Itoa(MaxPhotosPerAccount),
		}, nil)
	default:
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not edit the consultation", nil)
	}
}

// editConflictResponseDoc documents the 409 bodies of an edit (specs/051).
type editConflictResponseDoc struct {
	Error   string `json:"error" example:"edit_conflict" enums:"edit_conflict,medication_has_marks"`
	Message string `json:"message" example:"Another edit of this consultation was saved after it was opened"`
} // @name EditConflictResponse
