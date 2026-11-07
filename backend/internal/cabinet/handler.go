package cabinet

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
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// Handler serves the medicine cabinet's routes (specs/062). Every response goes through the Responder; the name, strength and
// note a parent wrote are only ever in JSON bodies, never in an address, a message or error_logs.
type Handler struct {
	service   *Service
	responder *httpx.Responder
}

// NewHandler creates a cabinet Handler.
func NewHandler(service *Service, responder *httpx.Responder) *Handler {
	return &Handler{service: service, responder: responder}
}

// The photo (≤ 5 MiB) travels as base64 in the body: 8 MiB leaves room for it and the rest.
const maxBody = 8 << 20

type expiresJSON struct {
	Year  int  `json:"year" example:"2027"`
	Month int  `json:"month" example:"3"`
	Day   *int `json:"day" example:"12"`
} // @name CabinetExpires

type inputRequest struct {
	Name     string      `json:"name" example:"Paracetamol infantil"`
	Strength string      `json:"strength" example:"160 mg/5 ml"`
	Quantity *int        `json:"quantity" example:"2"`
	Unit     string      `json:"unit" example:"bottle" enums:"box,tablet,bottle,ml"`
	Expires  expiresJSON `json:"expires"`
	Note     string      `json:"note"`
	// PhotoBase64 when creating: absent or "" = no photo. When editing: absent = unchanged, "" = removed.
	PhotoBase64 *string `json:"photoBase64"`
} // @name CabinetItemInput

type itemResponse struct {
	ID        string      `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	Name      string      `json:"name" example:"Paracetamol infantil"`
	Strength  string      `json:"strength" example:"160 mg/5 ml"`
	Quantity  int         `json:"quantity" example:"2"`
	Unit      string      `json:"unit" example:"bottle"`
	Expires   expiresJSON `json:"expires"`
	Note      string      `json:"note"`
	HasPhoto  bool        `json:"hasPhoto" example:"true"`
	CreatedBy string      `json:"createdBy" example:"Ana"`
	CreatedAt string      `json:"createdAt" example:"2026-11-06T18:00:00Z"`
	UpdatedBy *string     `json:"updatedBy" example:"Luis"`
	UpdatedAt *string     `json:"updatedAt" example:"2026-11-07T18:00:00Z"`
	// CanEdit: the session may edit and remove (owner or Tutor of a paid family).
	CanEdit bool `json:"canEdit" example:"true"`
} // @name CabinetItem

type listResponse struct {
	Items []itemResponse `json:"items"`
	// CanEdit: the session may edit and remove; CanAdd: it may also add (and the family owner is on the paid plan).
	CanEdit bool `json:"canEdit" example:"true"`
	CanAdd  bool `json:"canAdd" example:"true"`
	Limit   int  `json:"limit" example:"200"`
} // @name CabinetList

type photoResponse struct {
	PhotoBase64 string `json:"photoBase64"`
} // @name CabinetPhoto

type errorDoc struct {
	Error   string `json:"error" example:"item_not_found"`
	Message string `json:"message"`
} // @name CabinetErrorResponse

func toResponse(it Item, canEdit bool) itemResponse {
	out := itemResponse{
		ID: it.ID.String(), Name: it.Name, Strength: it.Strength, Quantity: it.Quantity, Unit: it.Unit,
		Expires: expiresJSON{Year: it.Expires.Year, Month: it.Expires.Month, Day: it.Expires.Day}, Note: it.Note,
		HasPhoto: it.HasPhoto, CreatedBy: it.CreatedBy, CreatedAt: it.CreatedAt.UTC().Format(time.RFC3339), UpdatedBy: it.UpdatedBy,
		CanEdit: canEdit,
	}
	if it.UpdatedAt != nil {
		at := it.UpdatedAt.UTC().Format(time.RFC3339)
		out.UpdatedAt = &at
	}
	return out
}

func inputOf(req inputRequest) (Input, ValidationErrors) {
	in := Input{Name: req.Name, Strength: req.Strength, Unit: req.Unit, Note: req.Note,
		Expires: Expires{Year: req.Expires.Year, Month: req.Expires.Month, Day: req.Expires.Day}}
	if req.Quantity == nil {
		return in, ValidationErrors{{Field: "quantity", Message: "Escribe la cantidad."}}
	}
	in.Quantity = *req.Quantity
	return in, nil
}

func levelOf(ctx context.Context) (uuid.UUID, bool) {
	a, ok := access.FromContext(ctx)
	if !ok {
		return uuid.Nil, false
	}
	return a.ActorAccountID, a.Level >= access.Full
}

func actorPtr(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}

func (h *Handler) ids(w http.ResponseWriter, r *http.Request, withItem bool) (uuid.UUID, uuid.UUID, bool) {
	account, err := uuid.Parse(chi.URLParam(r, "accountId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, map[string]string{"error": "account_not_found", "message": "Not found"}, nil)
		return uuid.Nil, uuid.Nil, false
	}
	if !withItem {
		return account, uuid.Nil, true
	}
	item, err := uuid.Parse(chi.URLParam(r, "itemId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, map[string]string{"error": "item_not_found", "message": "Medicine not found"}, nil)
		return uuid.Nil, uuid.Nil, false
	}
	return account, item, true
}

func (h *Handler) decode(w http.ResponseWriter, r *http.Request, actor uuid.UUID) (inputRequest, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)
	var req inputRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "validation_error", "Malformed JSON body", actorPtr(actor))
		return req, false
	}
	return req, true
}

// writeError maps the domain errors to the contract's answers, with fixed messages.
func (h *Handler) writeError(ctx context.Context, w http.ResponseWriter, err error, actor uuid.UUID, internal string) {
	var verrs ValidationErrors
	switch {
	case errors.As(err, &verrs):
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, httpx.ValidationBody("Invalid medicine", verrs), actorPtr(actor))
	case errors.Is(err, ErrItemNotFound):
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, map[string]string{"error": "item_not_found", "message": "Medicine not found"}, actorPtr(actor))
	case errors.Is(err, ErrPlanRequired):
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, map[string]string{
			"error": "freemium_consultation_limit_exceeded", "message": "The medicine cabinet is part of the paid plan", "reason": "medicine_cabinet",
		}, actorPtr(actor))
	case errors.Is(err, ErrLimit):
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, map[string]string{
			"error": "cabinet_limit_exceeded", "message": "The family reached its limit of medicines", "limit": strconv.Itoa(MaxItems),
		}, actorPtr(actor))
	default:
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", internal, actorPtr(actor))
	}
}

// ListItems handles GET /accounts/{accountId}/medicine-cabinet.
//
//	@Summary		The family's medicine cabinet
//	@Description	Alphabetical by name, never by the expiry date (which is only a datum). `accountId` is the family owner's.
//	@Tags			cabinet
//	@Produce		json
//	@Param			accountId	path		string	true	"The family owner's account UUID"
//	@Success		200			{object}	listResponse
//	@Security		ClerkSession
//	@Failure		401	{object}	errorDoc	"No valid Clerk session"
//	@Failure		403	{object}	errorDoc	"The session is not in this family"
//	@Router			/accounts/{accountId}/medicine-cabinet [get]
func (h *Handler) ListItems(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	accountID, _, ok := h.ids(w, r, false)
	if !ok {
		return
	}
	actor, full := levelOf(ctx)
	items, paid, err := h.service.List(ctx, accountID)
	if err != nil {
		h.writeError(ctx, w, err, actor, "Could not list the cabinet")
		return
	}
	out := listResponse{Items: make([]itemResponse, 0, len(items)), CanEdit: full, CanAdd: full && paid, Limit: MaxItems}
	for _, it := range items {
		out.Items = append(out.Items, toResponse(it, full))
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, out, actorPtr(actor))
}

// CreateItem handles POST /accounts/{accountId}/medicine-cabinet.
//
//	@Summary		Add a medicine to the family's cabinet
//	@Description	The paid plan (the family owner's) and at most 200 medicines per family.
//	@Tags			cabinet
//	@Accept			json
//	@Produce		json
//	@Param			accountId	path		string			true	"The family owner's account UUID"
//	@Param			payload		body		inputRequest	true	"The medicine"
//	@Success		201			{object}	itemResponse
//	@Failure		400			{object}	errorDoc	"An invalid field"
//	@Failure		422			{object}	errorDoc	"Free plan (reason medicine_cabinet) or cabinet_limit_exceeded"
//	@Security		ClerkSession
//	@Failure		401	{object}	errorDoc	"No valid Clerk session"
//	@Failure		403	{object}	errorDoc	"The session can't change this cabinet"
//	@Router			/accounts/{accountId}/medicine-cabinet [post]
func (h *Handler) CreateItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	accountID, _, ok := h.ids(w, r, false)
	if !ok {
		return
	}
	actor, _ := levelOf(ctx)
	req, ok := h.decode(w, r, actor)
	if !ok {
		return
	}
	in, verrs := inputOf(req)
	if verrs != nil {
		_, more := Validate(in)
		h.writeError(ctx, w, append(more, verrs...), actor, "")
		return
	}
	photo := ""
	if req.PhotoBase64 != nil {
		photo = *req.PhotoBase64
	}
	it, err := h.service.Create(ctx, accountID, actor, in, photo)
	if err != nil {
		h.writeError(ctx, w, err, actor, "Could not add the medicine")
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusCreated, toResponse(it, true), actorPtr(actor))
}

// GetItem handles GET /accounts/{accountId}/medicine-cabinet/{itemId}.
//
//	@Summary		One medicine of the family's cabinet
//	@Tags			cabinet
//	@Produce		json
//	@Param			accountId	path		string	true	"The family owner's account UUID"
//	@Param			itemId		path		string	true	"Medicine UUID"
//	@Success		200			{object}	itemResponse
//	@Failure		404			{object}	errorDoc	"No such medicine in this cabinet"
//	@Security		ClerkSession
//	@Failure		401	{object}	errorDoc	"No valid Clerk session"
//	@Failure		403	{object}	errorDoc	"The session is not in this family"
//	@Router			/accounts/{accountId}/medicine-cabinet/{itemId} [get]
func (h *Handler) GetItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	accountID, itemID, ok := h.ids(w, r, true)
	if !ok {
		return
	}
	actor, full := levelOf(ctx)
	it, _, err := h.service.Get(ctx, accountID, itemID)
	if err != nil {
		h.writeError(ctx, w, err, actor, "Could not read the medicine")
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, toResponse(it, full), actorPtr(actor))
}

// UpdateItem handles PUT /accounts/{accountId}/medicine-cabinet/{itemId}.
//
//	@Summary		Correct a medicine
//	@Description	Any plan. `photoBase64` absent keeps the photo, "" removes it. Stamps who edited it and when.
//	@Tags			cabinet
//	@Accept			json
//	@Produce		json
//	@Param			accountId	path		string			true	"The family owner's account UUID"
//	@Param			itemId		path		string			true	"Medicine UUID"
//	@Param			payload		body		inputRequest	true	"The medicine"
//	@Success		200			{object}	itemResponse
//	@Failure		400			{object}	errorDoc	"An invalid field"
//	@Failure		404			{object}	errorDoc	"No such medicine in this cabinet"
//	@Security		ClerkSession
//	@Failure		401	{object}	errorDoc	"No valid Clerk session"
//	@Failure		403	{object}	errorDoc	"The session can't change this cabinet"
//	@Router			/accounts/{accountId}/medicine-cabinet/{itemId} [put]
func (h *Handler) UpdateItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	accountID, itemID, ok := h.ids(w, r, true)
	if !ok {
		return
	}
	actor, _ := levelOf(ctx)
	req, ok := h.decode(w, r, actor)
	if !ok {
		return
	}
	in, verrs := inputOf(req)
	if verrs != nil {
		_, more := Validate(in)
		h.writeError(ctx, w, append(more, verrs...), actor, "")
		return
	}
	it, err := h.service.Update(ctx, accountID, itemID, actor, in, req.PhotoBase64)
	if err != nil {
		h.writeError(ctx, w, err, actor, "Could not edit the medicine")
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, toResponse(it, true), actorPtr(actor))
}

// DeleteItem handles DELETE /accounts/{accountId}/medicine-cabinet/{itemId}.
//
//	@Summary		Remove a medicine from the cabinet
//	@Description	For good, with its photo. Any plan.
//	@Tags			cabinet
//	@Param			accountId	path	string	true	"The family owner's account UUID"
//	@Param			itemId		path	string	true	"Medicine UUID"
//	@Success		204
//	@Failure		404	{object}	errorDoc	"No such medicine in this cabinet"
//	@Security		ClerkSession
//	@Failure		401	{object}	errorDoc	"No valid Clerk session"
//	@Failure		403	{object}	errorDoc	"The session can't change this cabinet"
//	@Router			/accounts/{accountId}/medicine-cabinet/{itemId} [delete]
func (h *Handler) DeleteItem(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	accountID, itemID, ok := h.ids(w, r, true)
	if !ok {
		return
	}
	actor, _ := levelOf(ctx)
	if err := h.service.Delete(ctx, accountID, itemID); err != nil {
		h.writeError(ctx, w, err, actor, "Could not remove the medicine")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetPhoto handles GET /accounts/{accountId}/medicine-cabinet/{itemId}/photo.
//
//	@Summary		The photo of a medicine's box
//	@Tags			cabinet
//	@Produce		json
//	@Param			accountId	path		string	true	"The family owner's account UUID"
//	@Param			itemId		path		string	true	"Medicine UUID"
//	@Success		200			{object}	photoResponse
//	@Failure		404			{object}	errorDoc	"No such medicine or it has no photo"
//	@Security		ClerkSession
//	@Failure		401	{object}	errorDoc	"No valid Clerk session"
//	@Failure		403	{object}	errorDoc	"The session is not in this family"
//	@Router			/accounts/{accountId}/medicine-cabinet/{itemId}/photo [get]
func (h *Handler) GetPhoto(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	accountID, itemID, ok := h.ids(w, r, true)
	if !ok {
		return
	}
	actor, _ := levelOf(ctx)
	photo, err := h.service.Photo(ctx, accountID, itemID)
	if err != nil {
		h.writeError(ctx, w, err, actor, "Could not read the photo")
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, photoResponse{PhotoBase64: base64.StdEncoding.EncodeToString(photo)}, actorPtr(actor))
}
