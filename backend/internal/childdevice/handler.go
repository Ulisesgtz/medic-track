package childdevice

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

// Handler serves the routes of the child devices (specs/047, contracts/api.md). Every response goes through the Responder. Nothing
// secret (the link's token, the credential) and nothing the parent typed (the device's name) is ever in a message or an address.
type Handler struct {
	service   *Service
	responder *httpx.Responder
}

// NewHandler creates a child-device Handler.
func NewHandler(service *Service, responder *httpx.Responder) *Handler {
	return &Handler{service: service, responder: responder}
}

const maxBodyBytes = 4 << 10

type errorDoc struct {
	Error   string `json:"error" example:"not_found"`
	Message string `json:"message" example:"This link is no longer valid"`
} // @name ChildDeviceErrorResponse

type validationDoc struct {
	Error   string `json:"error" example:"validation_error"`
	Message string `json:"message"`
	Details []struct {
		Field   string `json:"field" example:"name"`
		Message string `json:"message"`
	} `json:"details"`
} // @name ChildDeviceValidationResponse

type createLinkRequest struct {
	// Name is what the parent calls the phone. 1 to 40 characters.
	Name string `json:"name" example:"Teléfono de Mateo"`
} // @name CreateChildDeviceLinkRequest

type createLinkResponse struct {
	ID     string `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	Name   string `json:"name" example:"Teléfono de Mateo"`
	Status string `json:"status" enums:"pending" example:"pending"`
	// Token is the link's secret. It exists in the clear only in this answer; the app puts it in the `#` of the link.
	Token     string `json:"token"`
	ExpiresAt string `json:"expiresAt" example:"2026-10-23T14:00:00Z"`
} // @name ChildDeviceLinkCreatedResponse

type redeemRequest struct {
	Token string `json:"token"`
} // @name RedeemChildDeviceLinkRequest

type redeemResponse struct {
	// Credential is what the phone sends from now on as `Authorization: Device <credential>`. It is shown only here.
	Credential     string `json:"credential"`
	ChildID        string `json:"childId" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	ChildFirstName string `json:"childFirstName" example:"Mateo"`
	RotateAfter    string `json:"rotateAfter" example:"2026-10-30T14:00:00Z"`
} // @name RedeemedChildDeviceLinkResponse

// Auth is the middleware of the phone's own routes: `Authorization: Device …`, resolved against the database on every request.
func (h *Handler) Auth() func(http.Handler) http.Handler {
	return RequireChildDevice(h.responder, h.service.Repository(), h.service.Now)
}

// SameChild lets through only the route whose {childId} is the phone's own child.
func (h *Handler) SameChild() func(http.Handler) http.Handler {
	return SameChild(h.responder, "childId")
}

// RoutineOfChild lets through only a routine of the phone's own child.
func (h *Handler) RoutineOfChild() func(http.Handler) http.Handler {
	return RoutineOfChild(h.responder, h.service.Repository())
}

// ConsultationOfChild lets through only a consultation of the phone's own child.
func (h *Handler) ConsultationOfChild() func(http.Handler) http.Handler {
	return ConsultationOfChild(h.responder, h.service.Repository())
}

type meResponse struct {
	ChildID        string `json:"childId" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	ChildFirstName string `json:"childFirstName" example:"Mateo"`
	DeviceName     string `json:"deviceName" example:"Teléfono de Mateo"`
	// RotateAfter is when the phone should ask for a new credential.
	RotateAfter    string `json:"rotateAfter" example:"2026-10-30T14:00:00Z"`
	ReminderDetail string `json:"reminderDetail" enums:"generic,detailed" example:"generic"`
} // @name ChildDeviceMeResponse

// Me handles GET /child-device/me.
//
//	@Summary		Who this phone is
//	@Description	The child the phone belongs to and when to renew its credential. Only the first name the app already has of the child.
//	@Tags			child-device
//	@Produce		json
//	@Success		200	{object}	meResponse
//	@Security		DeviceCredential
//	@Failure		401	{object}	errorDoc	"The credential does not work"
//	@Router			/child-device/me [get]
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	p, ok := PrincipalFromContext(r.Context())
	if !ok {
		h.responder.WriteJSONErrorUnlogged(w, http.StatusUnauthorized, "unauthorized", "This access is not active")
		return
	}
	detail := "generic"
	if p.ReminderDetail != nil {
		detail = *p.ReminderDetail
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, meResponse{
		ChildID: p.ChildID.String(), ChildFirstName: p.ChildFirstName, DeviceName: p.DeviceName,
		RotateAfter: formatTime(p.RotateAfter), ReminderDetail: detail,
	}, nil)
}

func formatTime(t time.Time) string { return t.UTC().Format(time.RFC3339) }

// decode reads a small JSON body; false means it wasn't one.
func decode(w http.ResponseWriter, r *http.Request, into any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	return json.NewDecoder(r.Body).Decode(into) == nil
}

func actorOf(ctx context.Context) uuid.UUID {
	if a, ok := access.FromContext(ctx); ok {
		return a.ActorAccountID
	}
	return uuid.Nil
}

// CreateLink handles POST /children/{childId}/device-links.
//
//	@Summary		Make the one-use link of a child's phone
//	@Description	Part of the paid plan (the server decides, under the owner account's lock): a free account gets 422
//	@Description	"freemium_consultation_limit_exceeded" with reason "child_device". A child keeps at most 3 phones plus
//	@Description	pending links (422 "child_device_limit_exceeded"). The token is returned once.
//	@Tags			child-device
//	@Accept			json
//	@Produce		json
//	@Param			childId	path		string				true	"Child UUID"
//	@Param			payload	body		createLinkRequest	true	"The phone's name"
//	@Success		201		{object}	createLinkResponse
//	@Failure		400		{object}	validationDoc	"Invalid name"
//	@Failure		404		{object}	errorDoc		"No child exists for this id"
//	@Failure		422		{object}	errorDoc		"The plan or the cap of phones"
//	@Security		ClerkSession
//	@Failure		401		{object}	errorDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorDoc	"The session can't manage this child"
//	@Router			/children/{childId}/device-links [post]
func (h *Handler) CreateLink(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	childID, err := uuid.Parse(chi.URLParam(r, "childId"))
	actor := actorOf(ctx)
	if err != nil || actor == uuid.Nil {
		h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "child_not_found", "No child exists for this id", nil)
		return
	}
	var req createLinkRequest
	if !decode(w, r, &req) {
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, httpx.ValidationBody("Invalid request body", []httpx.FieldError{{Field: "name", Message: "Escribe un nombre para el teléfono."}}), &actor)
		return
	}
	link, token, err := h.service.CreateLink(ctx, childID, actor, req.Name)
	if err != nil {
		var limit ErrLimit
		switch {
		case errors.Is(err, ErrInvalidName):
			h.responder.WriteJSON(ctx, w, http.StatusBadRequest, httpx.ValidationBody("Invalid request body", []httpx.FieldError{{Field: "name", Message: "El nombre debe tener de 1 a 40 caracteres."}}), &actor)
		case errors.Is(err, ErrChildNotFound):
			h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "child_not_found", "No child exists for this id", &actor)
		case errors.As(err, &limit):
			h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, map[string]any{
				"error": "child_device_limit_exceeded", "message": "The child already has the most phones", "limit": limit.Limit,
			}, &actor)
		case errors.As(err, new(ErrPlanRequired)):
			h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, map[string]string{
				"error": "freemium_consultation_limit_exceeded", "message": "The child's phone is part of the paid plan", "reason": "child_device",
			}, &actor)
		default:
			h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not make the link", &actor)
		}
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusCreated, createLinkResponse{
		ID: link.ID.String(), Name: link.Name, Status: link.Status, Token: token, ExpiresAt: formatTime(link.ExpiresAt),
	}, &actor)
}

type linkResponse struct {
	ID             string  `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	Name           string  `json:"name" example:"Teléfono de Mateo"`
	Status         string  `json:"status" enums:"pending,active,revoked,expired" example:"active"`
	CreatedAt      string  `json:"createdAt" example:"2026-10-22T14:00:00Z"`
	RedeemedAt     *string `json:"redeemedAt"`
	LastSeenAt     *string `json:"lastSeenAt"`
	ExpiresAt      string  `json:"expiresAt" example:"2026-10-23T14:00:00Z"`
	ReminderDetail string  `json:"reminderDetail" enums:"generic,detailed" example:"generic"`
} // @name ChildDeviceLinkResponse

type linkListResponse struct {
	Links []linkResponse `json:"links"`
	Limit int            `json:"limit" example:"3"`
	// CanManage: the session can make and remove phones; a caregiver only sees the list.
	CanManage bool `json:"canManage"`
} // @name ChildDeviceLinkListResponse

type updateLinkRequest struct {
	ReminderDetail string `json:"reminderDetail" enums:"generic,detailed" example:"detailed"`
} // @name UpdateChildDeviceLinkRequest

type rotateResponse struct {
	Credential  string `json:"credential"`
	RotateAfter string `json:"rotateAfter" example:"2026-10-30T14:00:00Z"`
} // @name RotatedChildDeviceCredentialResponse

func toLinkResponse(l Link, now time.Time) linkResponse {
	out := linkResponse{ID: l.ID.String(), Name: l.Name, Status: l.StatusAt(now), CreatedAt: formatTime(l.CreatedAt), ExpiresAt: formatTime(l.ExpiresAt), ReminderDetail: "generic"}
	if l.RedeemedAt != nil {
		s := formatTime(*l.RedeemedAt)
		out.RedeemedAt = &s
	}
	if l.LastSeenAt != nil {
		s := formatTime(*l.LastSeenAt)
		out.LastSeenAt = &s
	}
	if l.ReminderDetail != nil {
		out.ReminderDetail = *l.ReminderDetail
	}
	return out
}

// List handles GET /children/{childId}/device-links.
//
//	@Summary		A child's phones
//	@Description	Names, when each was linked, when it was last used and its state. Never a secret or a hash. A caregiver can see it
//	@Description	(`canManage` false) but not change it.
//	@Tags			child-device
//	@Produce		json
//	@Param			childId	path		string	true	"Child UUID"
//	@Success		200		{object}	linkListResponse
//	@Failure		404		{object}	errorDoc	"No child exists for this id"
//	@Security		ClerkSession
//	@Failure		401		{object}	errorDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorDoc	"The session has no access to this child"
//	@Router			/children/{childId}/device-links [get]
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	childID, err := uuid.Parse(chi.URLParam(r, "childId"))
	if err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "child_not_found", "No child exists for this id", nil)
		return
	}
	links, err := h.service.List(ctx, childID)
	if err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not list the phones", nil)
		return
	}
	got, _ := access.FromContext(ctx)
	now := h.service.Now()
	resp := linkListResponse{Links: make([]linkResponse, 0, len(links)), Limit: MaxLinksPerChild, CanManage: got.Level == access.Full}
	for _, l := range links {
		resp.Links = append(resp.Links, toLinkResponse(l, now))
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, resp, nil)
}

// Revoke handles POST /children/{childId}/device-links/{linkId}/revoke.
//
//	@Summary		Remove a phone
//	@Description	At once: the phone's next request is refused. Also cancels a link nobody opened. Idempotent. What the phone already
//	@Description	marked stays, still under the child's name.
//	@Tags			child-device
//	@Param			childId	path	string	true	"Child UUID"
//	@Param			linkId	path	string	true	"Link UUID"
//	@Success		204
//	@Failure		404	{object}	errorDoc	"No such phone for this child"
//	@Security		ClerkSession
//	@Failure		401	{object}	errorDoc	"No valid Clerk session"
//	@Failure		403	{object}	errorDoc	"The session can't manage this child"
//	@Router			/children/{childId}/device-links/{linkId}/revoke [post]
func (h *Handler) Revoke(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	childID, errChild := uuid.Parse(chi.URLParam(r, "childId"))
	linkID, errLink := uuid.Parse(chi.URLParam(r, "linkId"))
	actor := actorOf(ctx)
	if errChild != nil || errLink != nil || actor == uuid.Nil {
		h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "not_found", "No such phone", nil)
		return
	}
	if err := h.service.Revoke(ctx, childID, linkID, actor); err != nil {
		if errors.Is(err, ErrNotFound) {
			h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "not_found", "No such phone", &actor)
			return
		}
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not remove the phone", &actor)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Update handles PATCH /children/{childId}/device-links/{linkId}.
//
//	@Summary		What a phone's reminders say
//	@Description	«generic» (no medication, no child) or «detailed». Generic by default.
//	@Tags			child-device
//	@Accept			json
//	@Produce		json
//	@Param			childId	path		string				true	"Child UUID"
//	@Param			linkId	path		string				true	"Link UUID"
//	@Param			payload	body		updateLinkRequest	true	"The choice"
//	@Success		200		{object}	linkResponse
//	@Failure		400		{object}	validationDoc	"Not generic or detailed"
//	@Failure		404		{object}	errorDoc		"No such phone for this child"
//	@Security		ClerkSession
//	@Failure		401		{object}	errorDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorDoc	"The session can't manage this child"
//	@Router			/children/{childId}/device-links/{linkId} [patch]
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	childID, errChild := uuid.Parse(chi.URLParam(r, "childId"))
	linkID, errLink := uuid.Parse(chi.URLParam(r, "linkId"))
	if errChild != nil || errLink != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "not_found", "No such phone", nil)
		return
	}
	invalid := httpx.ValidationBody("Invalid request body", []httpx.FieldError{{Field: "reminderDetail", Message: "Elige texto genérico o con detalle."}})
	var req updateLinkRequest
	if !decode(w, r, &req) {
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, invalid, nil)
		return
	}
	link, err := h.service.SetReminderDetail(ctx, childID, linkID, req.ReminderDetail)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidDetail):
			h.responder.WriteJSON(ctx, w, http.StatusBadRequest, invalid, nil)
		case errors.Is(err, ErrNotFound):
			h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "not_found", "No such phone", nil)
		default:
			h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not save the choice", nil)
		}
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, toLinkResponse(*link, h.service.Now()), nil)
}

// Rotate handles POST /child-device/rotate.
//
//	@Summary		Renew the phone's credential
//	@Description	The new credential is returned once; the previous one keeps working for 24 hours and then stops.
//	@Tags			child-device
//	@Produce		json
//	@Success		200	{object}	rotateResponse
//	@Security		DeviceCredential
//	@Failure		401	{object}	errorDoc	"The credential does not work"
//	@Router			/child-device/rotate [post]
func (h *Handler) Rotate(w http.ResponseWriter, r *http.Request) {
	p, ok := PrincipalFromContext(r.Context())
	if !ok {
		h.responder.WriteJSONErrorUnlogged(w, http.StatusUnauthorized, "unauthorized", "This access is not active")
		return
	}
	credential, after, err := h.service.Rotate(r.Context(), p.LinkID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			h.responder.WriteJSONErrorUnlogged(w, http.StatusUnauthorized, "unauthorized", "This access is not active")
			return
		}
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not renew the access", nil)
		return
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, rotateResponse{Credential: credential, RotateAfter: formatTime(after)}, nil)
}

// Redeem handles POST /child-device/redeem.
//
//	@Summary		Open a child's link
//	@Description	Public: the secret in the body is the only thing it takes. A link that is unknown, used, expired or canceled
//	@Description	gets the same 404, which is not written to error_logs. Strictly rate limited.
//	@Tags			child-device
//	@Accept			json
//	@Produce		json
//	@Param			payload	body		redeemRequest	true	"The link's token"
//	@Success		200		{object}	redeemResponse
//	@Failure		404		{object}	errorDoc	"The link no longer works"
//	@Failure		429		{object}	errorDoc	"Too many requests"
//	@Router			/child-device/redeem [post]
func (h *Handler) Redeem(w http.ResponseWriter, r *http.Request) {
	var req redeemRequest
	notFound := func() {
		h.responder.WriteJSONErrorUnlogged(w, http.StatusNotFound, "not_found", "This link is no longer valid")
	}
	if !decode(w, r, &req) {
		notFound()
		return
	}
	got, err := h.service.Redeem(r.Context(), req.Token)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			notFound()
			return
		}
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not open the link", nil)
		return
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, redeemResponse{
		Credential: got.Credential, ChildID: got.ChildID.String(), ChildFirstName: got.ChildFirstName, RotateAfter: formatTime(got.RotateAfter),
	}, nil)
}
