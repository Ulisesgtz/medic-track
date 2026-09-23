// Package server builds the HTTP router: which routes are public, which need
// a verified Clerk session, and which also need the session to own what is
// being asked for (specs/008-autenticacion-cuenta). It lives here, and not in
// cmd/api, so that this security-critical wiring is covered by tests.
package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw"
	"github.com/Ulisesgtz/medic-track/backend/internal/catalog"
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/ownership"
)

// Deps is everything the router is built from.
type Deps struct {
	Responder      *httpx.Responder
	Catalog        *catalog.Handler
	Account        *account.Handler
	Consultation   *consultation.Handler
	Ownership      *ownership.Repository
	FrontendOrigin string
	// RequireSession verifies the Clerk session (authmw.RequireSession in
	// production; tests inject one that verifies against a local key).
	RequireSession func(http.Handler) http.Handler
}

// NewRouter registers every route. Only the catalog is public; everything
// else needs a session, and every route that names an account, child or
// consultation also needs the session to own it.
func NewRouter(d Deps) *chi.Mux {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{d.FrontendOrigin},
		AllowedMethods:   []string{"GET", "POST", "PATCH", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Get("/catalog/countries", d.Catalog.ListCountries)
	r.Get("/catalog/countries/{countryCode}/states", d.Catalog.ListStates)

	ownsAccount := authmw.RequireOwner(d.Responder, "accountId", d.Ownership.OwnsAccount)
	ownsChild := authmw.RequireOwner(d.Responder, "childId", d.Ownership.OwnsChild)
	ownsConsultation := authmw.RequireOwner(d.Responder, "consultationId", d.Ownership.OwnsConsultation)

	r.Group(func(r chi.Router) {
		r.Use(d.RequireSession)

		r.Get("/accounts/me", d.Account.GetMe)
		r.Post("/accounts", d.Account.CreateAccount)
		r.With(ownsAccount).Get("/accounts/{accountId}", d.Account.GetAccount)
		r.With(ownsAccount).Post("/accounts/{accountId}/children", d.Account.AddChild)

		r.With(ownsChild).Get("/children/{childId}/consultations", d.Consultation.ListConsultations)
		r.With(ownsChild).Get("/children/{childId}/overview", d.Consultation.GetChildOverview)
		r.With(ownsChild).Post("/children/{childId}/consultations", d.Consultation.CreateConsultation)
		r.With(ownsConsultation).Get("/consultations/{consultationId}", d.Consultation.GetConsultation)
		r.With(ownsConsultation).Patch("/consultations/{consultationId}/doses/{doseId}", d.Consultation.UpdateDose)
	})

	return r
}
