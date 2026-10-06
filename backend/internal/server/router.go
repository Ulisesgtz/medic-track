// Package server builds the HTTP router: which routes are public, which need
// a verified Clerk session, and which also need the session to own — or, since
// specs/032-compartir-con-familia, to have a level of access over — what is
// being asked for (specs/008-autenticacion-cuenta). It lives here, and not in
// cmd/api, so that this security-critical wiring is covered by tests.
package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw"
	"github.com/Ulisesgtz/medic-track/backend/internal/catalog"
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
	"github.com/Ulisesgtz/medic-track/backend/internal/family"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/ops"
	"github.com/Ulisesgtz/medic-track/backend/internal/ownership"
	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
)

// Deps is everything the router is built from.
type Deps struct {
	Responder      *httpx.Responder
	Catalog        *catalog.Handler
	Account        *account.Handler
	Consultation   *consultation.Handler
	Reminder       *reminder.Handler
	Family         *family.Handler
	// Ops and OpsKey: the read-only queries over error_logs for the team that runs the service (specs/021). Without
	// both the routes are not registered at all: there is no open door by default.
	Ops            *ops.Handler
	OpsKey         string
	// Ownership answers "is this account the session's own?" (the person's own notice, reminder settings and devices).
	Ownership *ownership.Repository
	// Access answers "what can the session do with this child, consultation or family?" (specs/032-compartir-con-familia).
	Access         *access.Repository
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
	r.Get("/catalog/symptoms", d.Catalog.ListSymptoms)

	// Operation queries: not for parents, so no Clerk session — a single key held by the server (ops.RequireKey), and
	// only if the server has one. A wrong key gets the same 404 as any unknown route.
	if d.Ops != nil && d.OpsKey != "" {
		requireKey := ops.RequireKey(d.OpsKey)
		r.With(requireKey).Get("/ops/error-logs", d.Ops.ListErrorLogs)
		r.With(requireKey).Get("/ops/error-logs/summary", d.Ops.ErrorLogSummary)
	}

	// The "Tomada" button of a reminder, sent by the service worker, which has no session: the
	// signed action token is the only thing it accepts, and it names a single dose (specs/011).
	r.Post("/reminders/actions/taken", d.Reminder.MarkTaken)

	// The person's own account: their notice, reminder settings and devices stay theirs, never a family's.
	ownsAccount := authmw.RequireOwner(d.Responder, "accountId", d.Ownership.OwnsAccount)
	// Children, consultations and doses are reached through a level of access: Mark = see everything and mark doses (a
	// Caregiver, a Child-role member for their own child, or anyone invited once the owner's plan is no longer paid), Full =
	// everything (the owner and a Tutor). The server asks on every request, so quitting someone or a plan change is at once.
	seesChild := authmw.RequireAccess(d.Responder, "childId", access.Mark, d.Access.OnChild)
	fullChild := authmw.RequireAccess(d.Responder, "childId", access.Full, d.Access.OnChild)
	seesConsultation := authmw.RequireAccess(d.Responder, "consultationId", access.Mark, d.Access.OnConsultation)
	fullConsultation := authmw.RequireAccess(d.Responder, "consultationId", access.Full, d.Access.OnConsultation)
	// Adding a child to a family (its owner account): the owner or one of its Tutors.
	fullAccount := authmw.RequireAccess(d.Responder, "accountId", access.Full, d.Access.OnAccount)

	r.Group(func(r chi.Router) {
		r.Use(d.RequireSession)

		r.Get("/accounts/me", d.Account.GetMe)
		r.Post("/accounts", d.Account.CreateAccount)
		r.With(ownsAccount).Get("/accounts/{accountId}", d.Account.GetAccount)
		r.With(fullAccount).Post("/accounts/{accountId}/children", d.Account.AddChild)
		r.With(ownsAccount).Post("/accounts/{accountId}/disclaimer-acceptance", d.Account.AcceptDisclaimer)
		r.With(ownsAccount).Patch("/accounts/{accountId}/reminder-settings", d.Account.UpdateReminderSettings)
		r.With(ownsAccount).Post("/accounts/{accountId}/reminder-devices", d.Reminder.RegisterDevice)
		r.With(ownsAccount).Post("/accounts/{accountId}/reminder-devices/remove", d.Reminder.RemoveDevice)

		// Sharing with the family (specs/032): no id in the route names a resource; the family's rules (who can invite, whose
		// e-mail can accept) are enforced by the service from the session itself.
		r.Get("/family", d.Family.GetFamily)
		r.Post("/family/invitations", d.Family.CreateInvitation)
		r.Post("/family/invitations/preview", d.Family.PreviewInvitation)
		r.Post("/family/invitations/accept", d.Family.AcceptInvitation)
		r.Post("/family/invitations/decline", d.Family.DeclineInvitation)
		r.Post("/family/invitations/{invitationId}/resend", d.Family.ResendInvitation)
		r.Post("/family/invitations/{invitationId}/cancel", d.Family.CancelInvitation)
		r.Post("/family/members/{memberId}/remove", d.Family.RemoveMember)
		r.Post("/family/leave", d.Family.LeaveFamily)

		r.Get("/reminders/config", d.Reminder.GetConfig)

		r.With(seesChild).Get("/children/{childId}/consultations", d.Consultation.ListConsultations)
		r.With(seesChild).Get("/children/{childId}/overview", d.Consultation.GetChildOverview)
		// Specs/031: the paid plan's history. Search is a POST so the typed text stays out of the address (and the logs).
		r.With(seesChild).Post("/children/{childId}/consultations/search", d.Consultation.SearchConsultations)
		r.With(seesChild).Get("/children/{childId}/history-options", d.Consultation.HistoryOptions)
		r.With(fullChild).Post("/children/{childId}/consultations", d.Consultation.CreateConsultation)
		r.With(seesConsultation).Get("/consultations/{consultationId}", d.Consultation.GetConsultation)
		r.With(seesConsultation).Patch("/consultations/{consultationId}/doses/{doseId}", d.Consultation.UpdateDose)
		r.With(fullConsultation).Post("/consultations/{consultationId}/medications/{medicationId}/end", d.Consultation.EndTreatment)
		r.With(fullConsultation).Post("/consultations/{consultationId}/medications/{medicationId}/extend", d.Consultation.ExtendTreatment)
	})

	return r
}
