package reminder

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// Handler exposes the reminder endpoints (specs/011-recordatorios-push/contracts/reminders-api.md).
// None of its messages ever includes a device endpoint, its keys or an action token (FR-019).
type Handler struct {
	service   *Service
	responder *httpx.Responder
}

// NewHandler creates a reminder Handler backed by the given service.
func NewHandler(service *Service, responder *httpx.Responder) *Handler {
	return &Handler{service: service, responder: responder}
}

// maxRequestBodyBytes: a push subscription is well under 1 KiB.
const maxRequestBodyBytes = 16 << 10 // 16 KiB

type configResponse struct {
	Available      bool    `json:"available" example:"true"`
	VAPIDPublicKey *string `json:"vapidPublicKey" example:"BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U"`
}

type deviceKeysRequest struct {
	P256dh string `json:"p256dh" example:"BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM"`
	Auth   string `json:"auth" example:"tBHItJI5svbpez7KI4CCXg"`
}

type registerDeviceRequest struct {
	Endpoint string            `json:"endpoint" example:"https://fcm.googleapis.com/fcm/send/abc123"`
	Keys     deviceKeysRequest `json:"keys"`
}

type deviceResponse struct {
	ID          string `json:"id" example:"5f0c2e7a-0000-0000-0000-000000000000"`
	Active      bool   `json:"active" example:"true"`
	ActivatedAt string `json:"activatedAt" example:"2026-09-27T18:04:05Z"`
}

type removeDeviceRequest struct {
	Endpoint string `json:"endpoint" example:"https://fcm.googleapis.com/fcm/send/abc123"`
}

type actionRequest struct {
	Token string `json:"token" example:"ZG9zZS4uLg.c2lnbmF0dXJl"`
}

type fieldErrorDoc struct {
	Field   string `json:"field" example:"endpoint"`
	Message string `json:"message" example:"is required"`
}

type validationErrorDoc struct {
	Error   string          `json:"error" example:"validation_error"`
	Message string          `json:"message" example:"One or more fields are invalid"`
	Details []fieldErrorDoc `json:"details"`
}

type errorDoc struct {
	Error   string `json:"error" example:"reminders_unavailable"`
	Message string `json:"message" example:"Reminders are not available on this server"`
}

// GetConfig handles GET /reminders/config.
//
//	@Summary		What a browser needs to turn reminders on
//	@Description	Whether this server can send reminders and the VAPID public key to subscribe with
//	@Description	(null when it can't).
//	@Tags			reminders
//	@Produce		json
//	@Success		200	{object}	configResponse
//	@Failure		401	{object}	errorDoc	"No valid Clerk session"
//	@Security		ClerkSession
//	@Router			/reminders/config [get]
func (h *Handler) GetConfig(w http.ResponseWriter, r *http.Request) {
	resp := configResponse{Available: h.service.Available()}
	if key := h.service.VAPIDPublicKey(); key != "" {
		resp.VAPIDPublicKey = &key
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, resp, nil)
}

// RegisterDevice handles POST /accounts/{accountId}/reminder-devices.
//
//	@Summary		Turn reminders on for this browser
//	@Description	Stores this browser's push subscription for the account. Idempotent by endpoint: an
//	@Description	endpoint already known (for this or another account) is updated and moved to this
//	@Description	account — a browser reminds one account at a time.
//	@Tags			reminders
//	@Accept			json
//	@Produce		json
//	@Param			accountId	path		string					true	"Account UUID"
//	@Param			payload		body		registerDeviceRequest	true	"The browser's PushSubscription (toJSON())"
//	@Success		201			{object}	deviceResponse			"Created"
//	@Success		200			{object}	deviceResponse			"Already known, reactivated"
//	@Failure		400			{object}	validationErrorDoc		"Missing keys, malformed JSON, or not a supported push service"
//	@Failure		401			{object}	errorDoc				"No valid Clerk session"
//	@Failure		403			{object}	errorDoc				"The session does not own this account"
//	@Failure		404			{object}	errorDoc				"Malformed account id"
//	@Failure		503			{object}	errorDoc				"The server has no VAPID keys"
//	@Security		ClerkSession
//	@Router			/accounts/{accountId}/reminder-devices [post]
func (h *Handler) RegisterDevice(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	accountID, ok := h.accountID(w, r)
	if !ok {
		return
	}
	var req registerDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "validation_error", "Malformed JSON body", &accountID)
		return
	}

	device, created, err := h.service.ActivateDevice(r.Context(), accountID, req.Endpoint, req.Keys.P256dh, req.Keys.Auth)
	if errs, isValidation := IsValidationError(err); isValidation {
		h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationBody(errs), &accountID)
		return
	}
	switch {
	case errors.Is(err, ErrRemindersUnavailable):
		h.responder.WriteJSONError(r.Context(), w, http.StatusServiceUnavailable, "reminders_unavailable", "Reminders are not available on this server", &accountID)
		return
	case err != nil:
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not turn reminders on", &accountID)
		return
	}

	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	h.responder.WriteJSON(r.Context(), w, status, deviceResponse{
		ID:          device.ID.String(),
		Active:      device.Active,
		ActivatedAt: device.ActivatedAt.UTC().Format(time.RFC3339),
	}, &accountID)
}

// RemoveDevice handles POST /accounts/{accountId}/reminder-devices/remove.
//
//	@Summary		Turn reminders off for this browser
//	@Description	Idempotent. An endpoint that isn't this account's is left untouched and not reported.
//	@Tags			reminders
//	@Accept			json
//	@Param			accountId	path	string				true	"Account UUID"
//	@Param			payload		body	removeDeviceRequest	true	"The browser's endpoint"
//	@Success		204
//	@Failure		400	{object}	validationErrorDoc	"Missing endpoint or malformed JSON"
//	@Failure		401	{object}	errorDoc			"No valid Clerk session"
//	@Failure		403	{object}	errorDoc			"The session does not own this account"
//	@Failure		404	{object}	errorDoc			"Malformed account id"
//	@Security		ClerkSession
//	@Router			/accounts/{accountId}/reminder-devices/remove [post]
func (h *Handler) RemoveDevice(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	accountID, ok := h.accountID(w, r)
	if !ok {
		return
	}
	var req removeDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "validation_error", "Malformed JSON body", &accountID)
		return
	}
	err := h.service.DeactivateDevice(r.Context(), accountID, req.Endpoint)
	if errs, isValidation := IsValidationError(err); isValidation {
		h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationBody(errs), &accountID)
		return
	}
	if err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not turn reminders off", &accountID)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// MarkTaken handles POST /reminders/actions/taken — public, no session: the "Tomada" button of a
// reminder, sent by the service worker with the token that came in that reminder.
//
//	@Summary		Mark a dose as taken from its reminder
//	@Description	Public (no session). The token names one dose and the device that received it; it
//	@Description	only works while that device is on and belongs to the dose's account, and for 24 h.
//	@Tags			reminders
//	@Accept			json
//	@Param			payload	body	actionRequest	true	"The reminder's action token"
//	@Success		204
//	@Failure		400	{object}	validationErrorDoc	"Missing token or malformed JSON"
//	@Failure		403	{object}	errorDoc			"Invalid, expired or no longer valid token"
//	@Router			/reminders/actions/taken [post]
func (h *Handler) MarkTaken(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	var req actionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	err := h.service.MarkTakenWithToken(r.Context(), req.Token)
	if errs, isValidation := IsValidationError(err); isValidation {
		h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationBody(errs), nil)
		return
	}
	switch {
	case errors.Is(err, ErrInvalidActionToken):
		h.responder.WriteJSONError(r.Context(), w, http.StatusForbidden, "invalid_action_token", "This reminder can no longer mark the dose", nil)
		return
	case err != nil:
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not mark the dose", nil)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// accountID parses {accountId}; a malformed one is answered as 404, like the account endpoints.
func (h *Handler) accountID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "accountId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, map[string]string{
			"error":   "account_not_found",
			"message": "Account not found",
		}, nil)
		return uuid.Nil, false
	}
	return id, true
}

func validationBody(errs ValidationErrors) map[string]any {
	return httpx.ValidationBody("One or more fields are invalid", errs)
}
