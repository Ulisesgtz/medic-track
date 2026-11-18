package account

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// SetHiddenChildren replaces the set of hidden children of the account and returns the account as GET /accounts/me does.
func (s *Service) SetHiddenChildren(ctx context.Context, accountID uuid.UUID, ids []uuid.UUID) (*Account, error) {
	if err := s.repo.SetHiddenChildren(ctx, accountID, ids); err != nil {
		return nil, err
	}
	return s.repo.GetByID(ctx, accountID)
}

// SetHiddenChildren handles PUT /accounts/{accountId}/hidden-children (specs/074-unir-hijo-duplicado, contracts/api.md).
//
//	@Summary		Hide or show the person's own children
//	@Description	Replaces the set of hidden children: the ids in `childIds` are hidden (those already hidden keep their date) and the rest
//	@Description	show again. Hiding only has effect while the person is an active Tutor or Caregiver of a family; with no family a
//	@Description	non-empty list is a 409 `no_family`. Nothing is deleted: the children still count for the plan's limit, show up in
//	@Description	the data download and keep their data; their reminders are not sent to the person's devices while hidden. Any plan.
//	@Tags			accounts
//	@Accept			json
//	@Produce		json
//	@Param			accountId	path		string					true	"Account UUID"
//	@Param			payload		body		hiddenChildrenRequest	true	"The ids of the children to hide (an empty list shows them all)"
//	@Success		200			{object}	accountResponse
//	@Failure		400			{object}	errorResponseDoc			"Malformed JSON, no childIds, or an id that is not one of the account's children (childIds)"
//	@Failure		404			{object}	accountNotFoundResponseDoc	"No account exists for this id"
//	@Failure		409			{object}	errorResponseDoc			"no_family: the account is not an active member of a family"
//	@Security		ClerkSession
//	@Failure		401		{object}	errorResponseDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorResponseDoc	"The session does not own this resource"
//	@Router			/accounts/{accountId}/hidden-children [put]
func (h *Handler) SetHiddenChildren(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)

	id, err := uuid.Parse(chi.URLParam(r, "accountId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, accountNotFoundBody(), nil)
		return
	}
	var req hiddenChildrenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ChildIDs == nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "invalid_request", "A list childIds is required", &id)
		return
	}
	ids := make([]uuid.UUID, 0, len(*req.ChildIDs))
	for _, s := range *req.ChildIDs {
		cid, err := uuid.Parse(s)
		if err != nil {
			h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "childIds", "childIds must be ids of the account's children", &id)
			return
		}
		ids = append(ids, cid)
	}

	acc, err := h.service.SetHiddenChildren(r.Context(), id, ids)
	switch {
	case errors.Is(err, ErrAccountNotFound):
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, accountNotFoundBody(), nil)
	case errors.Is(err, ErrInvalidChildIDs):
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "childIds", "childIds must be ids of the account's children", &id)
	case errors.Is(err, ErrNoFamilyToHideIn):
		h.responder.WriteJSONUnlogged(w, http.StatusConflict, map[string]string{"error": "no_family", "message": "Children can only be hidden by a member of a family"})
	case err != nil:
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not update the hidden children", &id)
	default:
		h.responder.WriteJSON(r.Context(), w, http.StatusOK, toAccountResponse(acc), &id)
	}
}
