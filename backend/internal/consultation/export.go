package consultation

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// What the history's PDF (specs/050) needs from this package: the paid plan's rule under its own reason, the consultation read
// without its photo (the document asks for each photo apart), the photo alone, and the history's criteria rules.

// PlanLimitPDFExport is the reason the API sends when a free family asks for the history's PDF (specs/050).
const PlanLimitPDFExport = "pdf_export"

// RequirePaid refuses with a *PlanLimitError{reason} unless the account that owns the child is on the paid plan.
// ErrChildNotFound if there is no such child.
func (r *Repository) RequirePaid(ctx context.Context, childID uuid.UUID, reason string) error {
	_, plan, err := accountPlanOf(ctx, r.pool, childID, false)
	if err != nil {
		return err
	}
	if plan != planPaid {
		return &PlanLimitError{Reason: reason}
	}
	return nil
}

// ValidateHistorySearch is the history's criteria rules (specs/031), for the PDF's «Usar los filtros del historial».
func ValidateHistorySearch(in HistorySearch) (HistorySearch, ValidationErrors) {
	return validateHistorySearch(in)
}

// ParseDay reads a "YYYY-MM-DD" day; empty is nil.
func ParseDay(value string) (*time.Time, error) { return parseSearchDate(value) }

// GetByIDWithoutPhoto is GetByID without reading the prescription photo (which can weigh megabytes).
func (r *Repository) GetByIDWithoutPhoto(ctx context.Context, id uuid.UUID) (*Consultation, error) {
	return r.getByID(ctx, id, false)
}

// Photo is the consultation's prescription photo; empty if it was saved without one. ErrConsultationNotFound if it doesn't exist.
func (r *Repository) Photo(ctx context.Context, id uuid.UUID) ([]byte, error) {
	var photo []byte
	err := r.pool.QueryRow(ctx, `SELECT photo FROM consultations WHERE id = $1`, id).Scan(&photo)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrConsultationNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("reading the prescription photo: %w", err)
	}
	return photo, nil
}

type photoResponse struct {
	// PhotoBase64 is the prescription photo; empty when the consultation was saved without one.
	PhotoBase64 string `json:"photoBase64"`
} // @name ConsultationPhotoResponse

// GetPhoto handles GET /consultations/{consultationId}/photo (specs/050).
//
//	@Summary		The prescription photo of a consultation
//	@Description	Only the photo, for the history's PDF, which asks for each photo apart instead of all of them in one answer.
//	@Tags			consultations
//	@Produce		json
//	@Param			consultationId	path		string	true	"Consultation UUID"
//	@Success		200				{object}	photoResponse
//	@Failure		404				{object}	consultationNotFoundResponseDoc	"No consultation exists for this id"
//	@Security		ClerkSession
//	@Failure		401				{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Failure		403				{object}	sessionErrorResponseDoc	"The session does not own this resource"
//	@Router			/consultations/{consultationId}/photo [get]
func (h *Handler) GetPhoto(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "consultationId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, consultationNotFoundBody(), nil)
		return
	}
	photo, err := h.service.repo.Photo(r.Context(), id)
	if errors.Is(err, ErrConsultationNotFound) {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, consultationNotFoundBody(), nil)
		return
	}
	if err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not read the photo", nil)
		return
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, photoResponse{PhotoBase64: base64.StdEncoding.EncodeToString(photo)}, nil)
}
