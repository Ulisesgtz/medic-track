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
