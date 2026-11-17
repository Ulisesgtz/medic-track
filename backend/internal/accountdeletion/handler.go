package accountdeletion

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	clerk "github.com/clerk/clerk-sdk-go/v2"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// ReverificationPolicy is how recent the sign-in must be to ask for the deletion (research R4): the first factor (password
// or code) in the last 10 minutes.
var ReverificationPolicy = clerk.SessionReverificationPolicy{AfterMinutes: 10, Level: clerk.SessionReverificationLevelFirstFactor}

// Handler serves GET/POST /accounts/{accountId}/deletion and POST …/deletion/cancel. Every answer goes through the Responder.
type Handler struct {
	service   *Service
	responder *httpx.Responder
}

// NewHandler creates the Handler.
func NewHandler(service *Service, responder *httpx.Responder) *Handler {
	return &Handler{service: service, responder: responder}
}

type deletionResponse struct {
	// Status is "none" or "pending".
	Status       string     `json:"status" enums:"none,pending" example:"pending"`
	RequestedAt  *time.Time `json:"requestedAt,omitempty" example:"2026-11-12T18:00:00Z"`
	ScheduledFor *time.Time `json:"scheduledFor,omitempty" example:"2026-12-12T18:00:00Z"`
} // @name AccountDeletion

type requestResponse struct {
	deletionResponse
	SubscriptionCanceled bool `json:"subscriptionCanceled" example:"true"`
	FamilyNotified       int  `json:"familyNotified" example:"2"`
} // @name AccountDeletionRequested

type requestBody struct {
	// Confirm must be exactly "ELIMINAR".
	Confirm string `json:"confirm" example:"ELIMINAR"`
} // @name AccountDeletionRequest

type errorDoc struct {
	Error   string `json:"error" example:"account_deletion_pending"`
	Message string `json:"message" example:"This account is scheduled for deletion"`
} // @name AccountDeletionError

func toResponse(d *Deletion) deletionResponse {
	if d == nil {
		return deletionResponse{Status: "none"}
	}
	requested, scheduled := d.RequestedAt.UTC(), d.ScheduledFor.UTC()
	return deletionResponse{Status: "pending", RequestedAt: &requested, ScheduledFor: &scheduled}
}

func accountFromRoute(r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "accountId"))
	return id, err == nil
}

// GetDeletion handles GET /accounts/{accountId}/deletion.
//
//	@Summary		Whether the account is scheduled for deletion
//	@Tags			account
//	@Produce		json
//	@Param			accountId	path		string	true	"Account UUID"
//	@Success		200			{object}	deletionResponse
//	@Failure		404			{object}	errorDoc	"No account exists for this id"
//	@Security		ClerkSession
//	@Failure		401			{object}	errorDoc	"No valid Clerk session"
//	@Failure		403			{object}	errorDoc	"The account is not the session's"
//	@Router			/accounts/{accountId}/deletion [get]
func (h *Handler) GetDeletion(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	accountID, ok := accountFromRoute(r)
	if !ok {
		h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "account_not_found", "No account exists for this id", nil)
		return
	}
	d, err := h.service.Status(ctx, accountID)
	if err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not read the deletion", &accountID)
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, toResponse(d), &accountID)
}

// RequestDeletion handles POST /accounts/{accountId}/deletion (specs/070, contracts/api.md).
//
//	@Summary		Ask to delete the account in 30 days
//	@Description	Needs the word "ELIMINAR" and a sign-in verified in the last 10 minutes (otherwise 403 with Clerk's
//	@Description	"reverification-error", which the app's Clerk component answers by asking for the password or code). Cancels the open
//	@Description	subscription first — if the provider fails, nothing is saved (502). Then the account is paused until the date: it can
//	@Description	only read its deletion, download its data and cancel. Its pending invitations and child-phone links stop working.
//	@Tags			account
//	@Accept			json
//	@Produce		json
//	@Param			accountId	path		string		true	"Account UUID"
//	@Param			payload		body		requestBody	true	"The confirmation word"
//	@Success		201			{object}	requestResponse
//	@Failure		400			{object}	errorDoc	"The confirmation word is not ELIMINAR"
//	@Failure		409			{object}	errorDoc	"The account is already scheduled for deletion"
//	@Failure		502			{object}	errorDoc	"The subscription could not be canceled; nothing was saved"
//	@Security		ClerkSession
//	@Failure		401			{object}	errorDoc	"No valid Clerk session"
//	@Failure		403			{object}	errorDoc	"Not the session's account, or the sign-in is not recent"
//	@Router			/accounts/{accountId}/deletion [post]
func (h *Handler) RequestDeletion(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	accountID, ok := accountFromRoute(r)
	if !ok {
		h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "account_not_found", "No account exists for this id", nil)
		return
	}
	var body requestBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&body); err != nil {
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, httpx.ValidationBody("Invalid request",
			[]httpx.FieldError{{Field: "confirm", Message: "required"}}), &accountID)
		return
	}
	claims, _ := clerk.SessionClaimsFromContext(ctx)
	recent := claims != nil && !claims.NeedsReverification(ReverificationPolicy)

	result, err := h.service.Request(ctx, accountID, body.Confirm, recent)
	switch {
	case errors.Is(err, ErrConfirm):
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, httpx.ValidationBody("Invalid request",
			[]httpx.FieldError{{Field: "confirm", Message: "must be ELIMINAR"}}), &accountID)
	case errors.Is(err, ErrReverification):
		// Clerk's own answer, which useReverification knows how to handle. Not an error of the service: not logged.
		h.responder.WriteJSONUnlogged(w, http.StatusForbidden, map[string]any{
			"clerk_error": map[string]any{
				"type":   "forbidden",
				"reason": "reverification-error",
				"metadata": map[string]any{"reverification": map[string]any{
					"level": ReverificationPolicy.Level, "afterMinutes": ReverificationPolicy.AfterMinutes,
				}},
			},
		})
	case errors.Is(err, ErrAlreadyPending):
		h.responder.WriteJSON(ctx, w, http.StatusConflict, map[string]any{
			"error": "account_deletion_pending", "message": "This account is already scheduled for deletion",
			"scheduledFor": toResponse(result.Deletion).ScheduledFor,
		}, &accountID)
	case errors.Is(err, ErrSubscriptionCancel):
		h.responder.WriteJSONError(ctx, w, http.StatusBadGateway, "subscription_cancel_failed",
			"The subscription could not be canceled; nothing was changed", &accountID)
	case errors.Is(err, ErrAccountNotFound):
		h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "account_not_found", "No account exists for this id", nil)
	case err != nil:
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not save the deletion request", &accountID)
	default:
		h.responder.WriteJSON(ctx, w, http.StatusCreated, requestResponse{
			deletionResponse: toResponse(result.Deletion), SubscriptionCanceled: result.SubscriptionCanceled,
			FamilyNotified: result.FamilyNotified,
		}, &accountID)
	}
}

// CancelDeletion handles POST /accounts/{accountId}/deletion/cancel.
//
//	@Summary		Cancel the account's deletion
//	@Description	Idempotent: without an open request it answers the same. A subscription canceled when the deletion was asked for
//	@Description	stays canceled.
//	@Tags			account
//	@Produce		json
//	@Param			accountId	path		string	true	"Account UUID"
//	@Success		200			{object}	deletionResponse
//	@Failure		404			{object}	errorDoc	"No account exists for this id"
//	@Security		ClerkSession
//	@Failure		401			{object}	errorDoc	"No valid Clerk session"
//	@Failure		403			{object}	errorDoc	"The account is not the session's"
//	@Router			/accounts/{accountId}/deletion/cancel [post]
func (h *Handler) CancelDeletion(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	accountID, ok := accountFromRoute(r)
	if !ok {
		h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "account_not_found", "No account exists for this id", nil)
		return
	}
	if err := h.service.Cancel(ctx, accountID); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not cancel the deletion", &accountID)
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, toResponse(nil), &accountID)
}
