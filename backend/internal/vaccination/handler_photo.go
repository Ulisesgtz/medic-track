package vaccination

import (
	"encoding/base64"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
)

// maxPhotoBody is the biggest request of an upload: the 5 MiB of the photo as base64 (4/3 of it) plus a little.
const maxPhotoBody = 8 << 20

type photoMetaResponse struct {
	ID            string `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	CreatedAt     string `json:"createdAt" example:"2026-10-17T18:00:00Z"`
	CreatedByName string `json:"createdByName" example:"Ana"`
} // @name VaccineCardPhotoMeta

type photoListResponse struct {
	Photos []photoMetaResponse `json:"photos"`
	// Limit is how many photos of the card a child can keep.
	Limit int `json:"limit" example:"10"`
} // @name VaccineCardPhotoListResponse

type photoUploadRequest struct {
	PhotoBase64 string `json:"photoBase64"`
} // @name VaccineCardPhotoUpload

type photoResponse struct {
	ID          string `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	PhotoBase64 string `json:"photoBase64"`
} // @name VaccineCardPhoto

type photoLimitDoc struct {
	Error   string `json:"error" example:"photo_limit_exceeded"`
	Message string `json:"message"`
	Reason  string `json:"reason" example:"vaccine_card"`
	Limit   string `json:"limit" example:"10"`
} // @name VaccineCardPhotoLimitResponse

func toPhotoMeta(m PhotoMeta) photoMetaResponse {
	return photoMetaResponse{ID: m.ID.String(), CreatedAt: formatTime(m.CreatedAt), CreatedByName: m.CreatedByName}
}

// ListPhotos handles GET /children/{childId}/vaccine-card-photos.
//
//	@Summary		The photos of a child's paper card, without the images
//	@Description	Only who saved each one and when, oldest first; the image itself is asked for one at a time.
//	@Tags			vaccinations
//	@Produce		json
//	@Param			childId	path		string	true	"Child UUID"
//	@Success		200		{object}	photoListResponse
//	@Security		ClerkSession
//	@Failure		401		{object}	errorDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorDoc	"The session has no access to this child"
//	@Router			/children/{childId}/vaccine-card-photos [get]
func (h *Handler) ListPhotos(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	childID, ok := h.idParam(w, r, "childId")
	if !ok {
		return
	}
	list, err := h.service.ListPhotos(ctx, childID)
	if err != nil {
		h.writeError(ctx, w, err, actorOf(ctx), "Could not list the photos")
		return
	}
	out := photoListResponse{Photos: make([]photoMetaResponse, 0, len(list)), Limit: MaxPhotosPerChild}
	for _, m := range list {
		out.Photos = append(out.Photos, toPhotoMeta(m))
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, out, actorPtr(actorOf(ctx)))
}

// AddPhoto handles POST /children/{childId}/vaccine-card-photos.
//
//	@Summary		Save a photo of the paper card
//	@Description	`photoBase64` is an image (JPEG, PNG, GIF, WebP or HEIC) of up to 5 MiB. A child keeps at most 10 photos, on every plan
//	@Description	(422 `photo_limit_exceeded`, reason `vaccine_card`).
//	@Tags			vaccinations
//	@Accept			json
//	@Produce		json
//	@Param			childId	path		string				true	"Child UUID"
//	@Param			payload	body		photoUploadRequest	true	"The photo"
//	@Success		201		{object}	photoMetaResponse
//	@Failure		400		{object}	validationDoc	"Not an image, or over 5 MiB"
//	@Failure		404		{object}	errorDoc		"No child exists for this id"
//	@Failure		422		{object}	photoLimitDoc	"The child already has 10 photos"
//	@Security		ClerkSession
//	@Failure		401		{object}	errorDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorDoc	"The session can't save photos for this child"
//	@Router			/children/{childId}/vaccine-card-photos [post]
func (h *Handler) AddPhoto(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxPhotoBody)
	childID, ok := h.idParam(w, r, "childId")
	if !ok {
		return
	}
	var req photoUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	actor := actorOf(ctx)
	if actor == uuid.Nil {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not save the photo", nil)
		return
	}
	meta, err := h.service.AddPhoto(ctx, childID, actor, req.PhotoBase64)
	if err != nil {
		h.writeError(ctx, w, err, actor, "Could not save the photo")
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusCreated, toPhotoMeta(*meta), actorPtr(actor))
}

// GetPhoto handles GET /children/{childId}/vaccine-card-photos/{photoId}.
//
//	@Summary		One photo of the paper card
//	@Tags			vaccinations
//	@Produce		json
//	@Param			childId	path		string	true	"Child UUID"
//	@Param			photoId	path		string	true	"Photo UUID"
//	@Success		200		{object}	photoResponse
//	@Failure		404		{object}	errorDoc	"No such photo for this child"
//	@Security		ClerkSession
//	@Failure		401		{object}	errorDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorDoc	"The session has no access to this child"
//	@Router			/children/{childId}/vaccine-card-photos/{photoId} [get]
func (h *Handler) GetPhoto(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	childID, ok := h.idParam(w, r, "childId")
	if !ok {
		return
	}
	id, ok := h.idParam(w, r, "photoId")
	if !ok {
		return
	}
	raw, err := h.service.GetPhoto(ctx, childID, id)
	if err != nil {
		h.writeError(ctx, w, err, actorOf(ctx), "Could not read the photo")
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, photoResponse{ID: id.String(), PhotoBase64: base64.StdEncoding.EncodeToString(raw)}, actorPtr(actorOf(ctx)))
}

// DeletePhoto handles DELETE /children/{childId}/vaccine-card-photos/{photoId}.
//
//	@Summary		Delete a photo of the paper card for good
//	@Description	No trash and no undo. The doses recorded by hand are not touched.
//	@Tags			vaccinations
//	@Param			childId	path	string	true	"Child UUID"
//	@Param			photoId	path	string	true	"Photo UUID"
//	@Success		204
//	@Failure		404	{object}	errorDoc	"No such photo for this child"
//	@Security		ClerkSession
//	@Failure		401	{object}	errorDoc	"No valid Clerk session"
//	@Failure		403	{object}	errorDoc	"The session can't delete photos of this child"
//	@Router			/children/{childId}/vaccine-card-photos/{photoId} [delete]
func (h *Handler) DeletePhoto(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	childID, ok := h.idParam(w, r, "childId")
	if !ok {
		return
	}
	id, ok := h.idParam(w, r, "photoId")
	if !ok {
		return
	}
	if err := h.service.DeletePhoto(ctx, childID, id); err != nil {
		h.writeError(ctx, w, err, actorOf(ctx), "Could not delete the photo")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
