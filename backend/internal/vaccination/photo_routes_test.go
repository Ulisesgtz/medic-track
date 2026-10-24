package vaccination_test

import (
	"github.com/go-chi/chi/v5"

	"github.com/Ulisesgtz/medic-track/backend/internal/vaccination"
)

// registerPhotoRoutes adds the photo routes of the card to a test router.
func registerPhotoRoutes(r chi.Router, h *vaccination.Handler) {
	r.Get("/children/{childId}/vaccine-card-photos", h.ListPhotos)
	r.Post("/children/{childId}/vaccine-card-photos", h.AddPhoto)
	r.Get("/children/{childId}/vaccine-card-photos/{photoId}", h.GetPhoto)
	r.Delete("/children/{childId}/vaccine-card-photos/{photoId}", h.DeletePhoto)
}
