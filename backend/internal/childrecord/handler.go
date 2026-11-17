package childrecord

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// Handler serves GET and PUT /children/{childId}/record. Every response goes through the Responder; what the parent wrote
// is only ever in JSON bodies, never in an address, a message or error_logs.
type Handler struct {
	repo      *Repository
	responder *httpx.Responder
}

// NewHandler creates a Handler.
func NewHandler(repo *Repository, responder *httpx.Responder) *Handler {
	return &Handler{repo: repo, responder: responder}
}

const maxBody = 64 << 10

type pediatricianBody struct {
	Name   *string `json:"name" example:"Dra. Ruiz"`
	Phone  *string `json:"phone" example:"+52 33 1234 5678"`
	Office *string `json:"office" example:"Torre Médica, piso 4"`
} // @name ChildRecordPediatrician

type allergyBody struct {
	Name string  `json:"name" example:"Penicilina"`
	Kind *string `json:"kind" enums:"medication,food,other" example:"medication"`
	Note *string `json:"note" example:"le salen ronchas"`
} // @name ChildRecordAllergy

type conditionBody struct {
	Name string  `json:"name" example:"Asma"`
	Note *string `json:"note" example:"usa inhalador en crisis"`
} // @name ChildRecordCondition

type updatedBody struct {
	At string  `json:"at" example:"2026-11-17T18:05:00Z"`
	By *string `json:"by" example:"Ana"`
} // @name ChildRecordUpdated

// Response is the sheet as the app receives it.
type Response struct {
	Exists       bool              `json:"exists"`
	Version      int               `json:"version" example:"3"`
	CanEdit      bool              `json:"canEdit"`
	BloodType    *string           `json:"bloodType" enums:"O+,O-,A+,A-,B+,B-,AB+,AB-,unknown" example:"O+"`
	GeneralNote  *string           `json:"generalNote"`
	Pediatrician *pediatricianBody `json:"pediatrician"`
	Allergies    []allergyBody     `json:"allergies"`
	Conditions   []conditionBody   `json:"conditions"`
	Updated      *updatedBody      `json:"updated"`
} // @name ChildRecordResponse

type updateRequest struct {
	ExpectedVersion *int              `json:"expectedVersion" example:"3"`
	BloodType       *string           `json:"bloodType" example:"O+"`
	GeneralNote     *string           `json:"generalNote"`
	Pediatrician    *pediatricianBody `json:"pediatrician"`
	Allergies       []allergyBody     `json:"allergies"`
	Conditions      []conditionBody   `json:"conditions"`
} // @name ChildRecordInput

type errorDoc struct {
	Error   string `json:"error" example:"child_not_found"`
	Message string `json:"message"`
} // @name ChildRecordErrorResponse

type validationDoc struct {
	Error   string `json:"error" example:"validation_error"`
	Message string `json:"message"`
	Details []struct {
		Field   string `json:"field" example:"allergies[2].name"`
		Message string `json:"message"`
	} `json:"details"`
} // @name ChildRecordValidationResponse

type conflictDoc struct {
	Error   string   `json:"error" example:"record_conflict"`
	Message string   `json:"message"`
	Current Response `json:"current"`
} // @name ChildRecordConflictResponse

// ToResponse is the sheet as the API answers it.
func ToResponse(rec *Record, canEdit bool) Response {
	out := Response{
		Exists: rec.Exists, Version: rec.Version, CanEdit: canEdit, BloodType: rec.BloodType, GeneralNote: rec.GeneralNote,
		Allergies: make([]allergyBody, 0, len(rec.Allergies)), Conditions: make([]conditionBody, 0, len(rec.Conditions)),
	}
	if p := rec.Pediatrician; p != nil {
		out.Pediatrician = &pediatricianBody{Name: p.Name, Phone: p.Phone, Office: p.Office}
	}
	for _, a := range rec.Allergies {
		out.Allergies = append(out.Allergies, allergyBody{Name: a.Name, Kind: a.Kind, Note: a.Note})
	}
	for _, c := range rec.Conditions {
		out.Conditions = append(out.Conditions, conditionBody{Name: c.Name, Note: c.Note})
	}
	if rec.UpdatedAt != nil {
		out.Updated = &updatedBody{At: rec.UpdatedAt.UTC().Format(time.RFC3339), By: rec.UpdatedBy}
	}
	return out
}

func actorOf(ctx context.Context) *uuid.UUID {
	if a, ok := access.FromContext(ctx); ok && a.ActorAccountID != uuid.Nil {
		id := a.ActorAccountID
		return &id
	}
	return nil
}

func canEdit(ctx context.Context) bool {
	a, ok := access.FromContext(ctx)
	return ok && a.Level.AtLeast(access.Full)
}

// GetRecord handles GET /children/{childId}/record.
//
//	@Summary		A child's record sheet
//	@Description	The allergies, blood type, permanent conditions, pediatrician and general note the family wrote, as they wrote
//	@Description	them and in their order. A child without a sheet answers `exists: false` and empty lists. `canEdit` is true for
//	@Description	the full level (the owner, a Tutor of a paid family). Any plan. Never reachable from a child's own phone.
//	@Tags			child-record
//	@Produce		json
//	@Param			childId	path		string	true	"Child UUID"
//	@Success		200		{object}	Response
//	@Failure		404		{object}	errorDoc	"Malformed child id"
//	@Security		ClerkSession
//	@Failure		401		{object}	errorDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorDoc	"The session has no access to this child"
//	@Router			/children/{childId}/record [get]
func (h *Handler) GetRecord(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	childID, err := uuid.Parse(chi.URLParam(r, "childId"))
	if err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "child_not_found", "Child not found", nil)
		return
	}
	rec, err := h.repo.Get(ctx, childID)
	if err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not read the record", actorOf(ctx))
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, ToResponse(rec, canEdit(ctx)), actorOf(ctx))
}

// PutRecord handles PUT /children/{childId}/record.
//
//	@Summary		Save a child's record sheet
//	@Description	Replaces the whole sheet. `expectedVersion` is the version the form was opened with (0 when there was none); if
//	@Description	someone saved meanwhile the answer is 409 `record_conflict` with the stored sheet as `current` and nothing is
//	@Description	written. Saving without changes writes nothing (version, author and date stay). Any plan; the full level only.
//	@Description	An invalid field is 400 with its name and never its value.
//	@Tags			child-record
//	@Accept			json
//	@Produce		json
//	@Param			childId	path		string			true	"Child UUID"
//	@Param			payload	body		updateRequest	true	"The whole sheet"
//	@Success		200		{object}	Response
//	@Failure		400		{object}	validationDoc	"An invalid field, a malformed body or no expectedVersion"
//	@Failure		404		{object}	errorDoc		"No child exists for this id"
//	@Failure		409		{object}	conflictDoc		"Someone saved the sheet after it was opened"
//	@Security		ClerkSession
//	@Failure		401		{object}	errorDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorDoc	"The session can't change this child's sheet"
//	@Router			/children/{childId}/record [put]
func (h *Handler) PutRecord(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)
	childID, err := uuid.Parse(chi.URLParam(r, "childId"))
	if err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "child_not_found", "Child not found", nil)
		return
	}
	var req updateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ExpectedVersion == nil || *req.ExpectedVersion < 0 {
		h.responder.WriteJSONError(ctx, w, http.StatusBadRequest, "invalid_request", "Malformed JSON body or missing expectedVersion", actorOf(ctx))
		return
	}
	actor := actorOf(ctx)
	if actor == nil {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not save the record", nil)
		return
	}
	in := Content{BloodType: req.BloodType, GeneralNote: req.GeneralNote}
	if p := req.Pediatrician; p != nil {
		in.Pediatrician = &Pediatrician{Name: p.Name, Phone: p.Phone, Office: p.Office}
	}
	for _, a := range req.Allergies {
		in.Allergies = append(in.Allergies, Allergy{Name: a.Name, Kind: a.Kind, Note: a.Note})
	}
	for _, c := range req.Conditions {
		in.Conditions = append(in.Conditions, Condition{Name: c.Name, Note: c.Note})
	}
	cleaned, verrs := Validate(in)
	if len(verrs) > 0 {
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, httpx.ValidationBody("Invalid record", verrs), actor)
		return
	}
	saved, err := h.repo.Save(ctx, childID, *actor, cleaned, *req.ExpectedVersion)
	var conflict *ConflictError
	switch {
	case errors.As(err, &conflict):
		// An expected state (two people editing), not a failure: it isn't written to error_logs.
		h.responder.WriteJSONUnlogged(w, http.StatusConflict, conflictDoc{
			Error: "record_conflict", Message: "The record was saved by someone else after it was opened", Current: ToResponse(conflict.Current, canEdit(ctx)),
		})
	case errors.Is(err, ErrNotFound):
		h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "child_not_found", "Child not found", actor)
	case err != nil:
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not save the record", actor)
	default:
		h.responder.WriteJSON(ctx, w, http.StatusOK, ToResponse(saved, canEdit(ctx)), actor)
	}
}
