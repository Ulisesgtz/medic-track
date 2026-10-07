package appointment

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

// Handler serves the appointments' routes (parte2/plan.md). Every response goes through the Responder; the note, the doctor
// and the date a parent typed are only ever in JSON bodies, never in an address or in a message.
type Handler struct {
	service   *Service
	responder *httpx.Responder
}

// NewHandler creates an appointments Handler.
func NewHandler(service *Service, responder *httpx.Responder) *Handler {
	return &Handler{service: service, responder: responder}
}

const maxBodyBytes = 64 << 10

type noticeResponse struct {
	ID          string  `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	Kind        string  `json:"kind" enums:"before,at_time" example:"before"`
	LeadMinutes *int    `json:"leadMinutes" example:"120"`
	DaysBefore  *int    `json:"daysBefore" example:"1"`
	AtTime      *string `json:"atTime" example:"20:00"`
	Label       string  `json:"label" example:"2 horas antes"`
	FireAt      string  `json:"fireAt" example:"2026-10-09T14:30:00Z"`
	// Past: it was due before the appointment was saved or has already gone off; it never fires.
	Past bool `json:"past" example:"false"`
} // @name AppointmentNoticeResponse

type appointmentResponse struct {
	ID               string           `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	ConsultationID   string           `json:"consultationId" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	ChildID          string           `json:"childId" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	DoctorName       string           `json:"doctorName" example:"Dra. Laura López"`
	ConsultDate      string           `json:"consultDate" example:"2026-09-28"`
	StartsAt         string           `json:"startsAt" example:"2026-10-09T16:30:00Z"`
	UtcOffsetMinutes int              `json:"utcOffsetMinutes" example:"-360"`
	Note             string           `json:"note" example:""`
	Status           string           `json:"status" enums:"scheduled,done,canceled,unmarked" example:"scheduled"`
	StatusBy         *string          `json:"statusBy" example:"Ana"`
	StatusAt         *string          `json:"statusAt"`
	CreatedBy        string           `json:"createdBy" example:"Ana"`
	Notices          []noticeResponse `json:"notices"`
	MyReminders      bool             `json:"myReminders" example:"true"`
	// CanEdit: the session can do everything AND the owner's plan is paid.
	CanEdit bool `json:"canEdit" example:"true"`
	// CanMark: the session can do everything (marking a state never needs the plan).
	CanMark bool `json:"canMark" example:"true"`
} // @name AppointmentResponse

type forChildResponse struct {
	Next     *appointmentResponse  `json:"next"`
	History  []appointmentResponse `json:"history"`
	PaidPlan bool                  `json:"paidPlan" example:"true"`
} // @name AppointmentsOfChildResponse

type forConsultationResponse struct {
	Appointment *appointmentResponse `json:"appointment"`
	PaidPlan    bool                 `json:"paidPlan" example:"true"`
} // @name AppointmentOfConsultationResponse

type inputRequest struct {
	StartsAt         time.Time      `json:"startsAt" example:"2026-10-09T10:30:00-06:00"`
	UtcOffsetMinutes int            `json:"utcOffsetMinutes" example:"-360"`
	Note             string         `json:"note" example:""`
	Notices          *[]NoticeInput `json:"notices"`
} // @name AppointmentRequest

type statusRequest struct {
	Status string `json:"status" enums:"done,canceled,scheduled" example:"done"`
} // @name AppointmentStatusRequest

type myRemindersRequest struct {
	Enabled bool `json:"enabled" example:"true"`
} // @name AppointmentMyRemindersRequest

type myRemindersResponse struct {
	MyReminders bool `json:"myReminders" example:"true"`
} // @name AppointmentMyRemindersResponse

type errorDoc struct {
	Error   string `json:"error" example:"forbidden"`
	Message string `json:"message"`
} // @name AppointmentErrorResponse

type validationDoc struct {
	Error   string `json:"error" example:"validation_error"`
	Message string `json:"message"`
	Details []struct {
		Field   string `json:"field" example:"startsAt"`
		Message string `json:"message"`
	} `json:"details"`
} // @name AppointmentValidationResponse

type planLimitDoc struct {
	Error   string `json:"error" example:"freemium_consultation_limit_exceeded"`
	Message string `json:"message"`
	// Reason is "appointments" (creating and editing appointments are the paid plan's).
	Reason string `json:"reason" example:"appointments"`
} // @name AppointmentPlanLimitResponse

func formatTime(t time.Time) string { return t.UTC().Format(time.RFC3339) }

func optTime(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := formatTime(*t)
	return &s
}

func actorOf(ctx context.Context) uuid.UUID {
	if a, ok := access.FromContext(ctx); ok {
		return a.ActorAccountID
	}
	return uuid.Nil
}

func levelOf(ctx context.Context) access.Level {
	if a, ok := access.FromContext(ctx); ok {
		return a.Level
	}
	return access.None
}

func actorPtr(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}

func toResponse(a Appointment, level access.Level, now time.Time) appointmentResponse {
	out := appointmentResponse{
		ID: a.ID.String(), ConsultationID: a.ConsultationID.String(), ChildID: a.ChildID.String(), DoctorName: a.DoctorName,
		ConsultDate: a.ConsultDate, StartsAt: formatTime(a.StartsAt), UtcOffsetMinutes: a.UtcOffsetMinutes, Note: a.Note,
		Status: string(a.Derived), StatusAt: optTime(a.StatusAt), CreatedBy: a.CreatedBy, MyReminders: a.MyReminders,
		CanEdit: level == access.Full && a.PaidPlan, CanMark: level == access.Full,
		Notices: make([]noticeResponse, 0, len(a.Notices)),
	}
	if a.StatusBy != "" {
		by := a.StatusBy
		out.StatusBy = &by
	}
	for _, n := range a.Notices {
		nr := noticeResponse{ID: n.ID.String(), Kind: string(n.Kind), Label: Label(n.Kind, n.LeadMinutes, n.DaysBefore, n.AtTime), FireAt: formatTime(n.FireAt), Past: !n.FireAt.After(n.CreatedAt) || !n.FireAt.After(now)}
		if n.Kind == KindBefore {
			lead := n.LeadMinutes
			nr.LeadMinutes = &lead
		} else {
			days, at := n.DaysBefore, n.AtTime
			nr.DaysBefore, nr.AtTime = &days, &at
		}
		out.Notices = append(out.Notices, nr)
	}
	return out
}

func notFoundBody() map[string]string {
	return map[string]string{"error": "appointment_not_found", "message": "Appointment not found"}
}

func validationBody(errs ValidationErrors) map[string]any {
	fields := make([]httpx.FieldError, 0, len(errs))
	for _, e := range errs {
		fields = append(fields, httpx.FieldError{Field: e.Field, Message: e.Message})
	}
	return httpx.ValidationBody("One or more fields are invalid", fields)
}

func planLimitBody(reason string) map[string]string {
	return map[string]string{"error": "freemium_consultation_limit_exceeded", "message": "Appointments are part of the paid plan", "reason": reason}
}

// writeError maps the domain errors to the contract's answers.
func (h *Handler) writeError(ctx context.Context, w http.ResponseWriter, err error, actor uuid.UUID, internalMessage string) {
	var verrs ValidationErrors
	var planErr *PlanLimitError
	switch {
	case errors.As(err, &verrs):
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationBody(verrs), actorPtr(actor))
	case errors.As(err, &planErr):
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, planLimitBody(planErr.Reason), actorPtr(actor))
	case errors.Is(err, ErrNotFound), errors.Is(err, ErrConsultationNotFound):
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, notFoundBody(), actorPtr(actor))
	case errors.Is(err, ErrChildNotFound):
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, map[string]string{"error": "child_not_found", "message": "Child not found"}, actorPtr(actor))
	case errors.Is(err, ErrExists):
		h.responder.WriteJSON(ctx, w, http.StatusConflict, map[string]string{"error": "appointment_exists", "message": "The consultation already has a scheduled appointment"}, actorPtr(actor))
	case errors.Is(err, ErrClosed):
		h.responder.WriteJSON(ctx, w, http.StatusConflict, map[string]string{"error": "appointment_closed", "message": "The appointment is closed"}, actorPtr(actor))
	case errors.Is(err, ErrNotScheduled):
		h.responder.WriteJSON(ctx, w, http.StatusConflict, map[string]string{"error": "appointment_not_scheduled", "message": "The appointment is not scheduled"}, actorPtr(actor))
	default:
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", internalMessage, actorPtr(actor))
	}
}

func (h *Handler) idParam(w http.ResponseWriter, r *http.Request, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, name))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, notFoundBody(), nil)
		return uuid.Nil, false
	}
	return id, true
}

func (h *Handler) writeOne(w http.ResponseWriter, r *http.Request, status int, a *Appointment) {
	h.responder.WriteJSON(r.Context(), w, status, toResponse(*a, levelOf(r.Context()), h.service.now()), nil)
}

// ForChild handles GET /children/{childId}/appointments.
//
//	@Summary		A child's next appointment and the history of the rest
//	@Description	`next` is the nearest scheduled appointment that has not passed, across the child's consultations; `history`
//	@Description	has the done, canceled and «Pasó sin marcar» ones, most recent first. Reading never depends on the plan.
//	@Tags			appointments
//	@Produce		json
//	@Param			childId	path		string	true	"Child UUID"
//	@Success		200		{object}	forChildResponse
//	@Failure		404		{object}	errorDoc	"No child exists for this id"
//	@Security		ClerkSession
//	@Failure		401		{object}	errorDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorDoc	"The session has no access to this child"
//	@Router			/children/{childId}/appointments [get]
func (h *Handler) ForChild(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	childID, ok := h.idParam(w, r, "childId")
	if !ok {
		return
	}
	next, history, paid, err := h.service.ForChild(ctx, childID, actorOf(ctx))
	if err != nil {
		h.writeError(ctx, w, err, actorOf(ctx), "Could not list the appointments")
		return
	}
	level, now := levelOf(ctx), h.service.now()
	resp := forChildResponse{History: make([]appointmentResponse, 0, len(history)), PaidPlan: paid}
	if next != nil {
		n := toResponse(*next, level, now)
		resp.Next = &n
	}
	for _, a := range history {
		resp.History = append(resp.History, toResponse(a, level, now))
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, resp, nil)
}

// ForConsultation handles GET /consultations/{consultationId}/appointment.
//
//	@Summary		A consultation's scheduled appointment
//	@Description	The appointment that is still scheduled (it may read «unmarked» once its day ended), or null.
//	@Tags			appointments
//	@Produce		json
//	@Param			consultationId	path		string	true	"Consultation UUID"
//	@Success		200				{object}	forConsultationResponse
//	@Failure		404				{object}	errorDoc	"No consultation exists for this id"
//	@Security		ClerkSession
//	@Failure		401				{object}	errorDoc	"No valid Clerk session"
//	@Failure		403				{object}	errorDoc	"The session has no access to this consultation"
//	@Router			/consultations/{consultationId}/appointment [get]
func (h *Handler) ForConsultation(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	consultationID, ok := h.idParam(w, r, "consultationId")
	if !ok {
		return
	}
	a, paid, err := h.service.ForConsultation(ctx, consultationID, actorOf(ctx))
	if err != nil {
		h.writeError(ctx, w, err, actorOf(ctx), "Could not load the appointment")
		return
	}
	resp := forConsultationResponse{PaidPlan: paid}
	if a != nil {
		one := toResponse(*a, levelOf(ctx), h.service.now())
		resp.Appointment = &one
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, resp, nil)
}

// Get handles GET /appointments/{appointmentId}.
//
//	@Summary		One appointment
//	@Tags			appointments
//	@Produce		json
//	@Param			appointmentId	path		string	true	"Appointment UUID"
//	@Success		200				{object}	appointmentResponse
//	@Failure		404				{object}	errorDoc	"No such appointment"
//	@Security		ClerkSession
//	@Failure		401				{object}	errorDoc	"No valid Clerk session"
//	@Failure		403				{object}	errorDoc	"The session has no access to this appointment"
//	@Router			/appointments/{appointmentId} [get]
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, ok := h.idParam(w, r, "appointmentId")
	if !ok {
		return
	}
	a, err := h.service.Get(ctx, id, actorOf(ctx))
	if err != nil {
		h.writeError(ctx, w, err, actorOf(ctx), "Could not load the appointment")
		return
	}
	h.writeOne(w, r, http.StatusOK, a)
}

// Create handles POST /consultations/{consultationId}/appointments.
//
//	@Summary		Add a next appointment to a consultation
//	@Description	Saves the appointment exactly as written; nothing else of the consultation changes. Paid plan only (422 reason
//	@Description	"appointments"). Without `notices` it gets one day before and two hours before; a notice already past is saved
//	@Description	but never fires. A consultation has at most one scheduled appointment (409).
//	@Tags			appointments
//	@Accept			json
//	@Produce		json
//	@Param			consultationId	path		string			true	"Consultation UUID"
//	@Param			payload			body		inputRequest	true	"The appointment"
//	@Success		201				{object}	appointmentResponse
//	@Failure		400				{object}	validationDoc	"An invalid field"
//	@Failure		404				{object}	errorDoc		"No consultation exists for this id"
//	@Failure		409				{object}	errorDoc		"Already has a scheduled appointment"
//	@Failure		422				{object}	planLimitDoc	"Free plan"
//	@Security		ClerkSession
//	@Failure		401				{object}	errorDoc	"No valid Clerk session"
//	@Failure		403				{object}	errorDoc	"The session can't add appointments here"
//	@Router			/consultations/{consultationId}/appointments [post]
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	consultationID, ok := h.idParam(w, r, "consultationId")
	if !ok {
		return
	}
	var req inputRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	actor := actorOf(ctx)
	if actor == uuid.Nil {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not create the appointment", nil)
		return
	}
	a, err := h.service.Create(ctx, consultationID, Input(req), actor)
	if err != nil {
		h.writeError(ctx, w, err, actor, "Could not create the appointment")
		return
	}
	h.writeOne(w, r, http.StatusCreated, a)
}

// Update handles PATCH /appointments/{appointmentId}.
//
//	@Summary		Edit an appointment's date, note and notices
//	@Description	The whole appointment is sent. Notices that stay the same keep their already-sent reminders; moving the date makes
//	@Description	them all again. Only a scheduled one can be edited (409). Paid plan only (422 reason "appointments").
//	@Tags			appointments
//	@Accept			json
//	@Produce		json
//	@Param			appointmentId	path		string			true	"Appointment UUID"
//	@Param			payload			body		inputRequest	true	"The appointment"
//	@Success		200				{object}	appointmentResponse
//	@Failure		400				{object}	validationDoc	"An invalid field"
//	@Failure		404				{object}	errorDoc		"No such appointment"
//	@Failure		409				{object}	errorDoc		"The appointment is closed"
//	@Failure		422				{object}	planLimitDoc	"Free plan"
//	@Security		ClerkSession
//	@Failure		401				{object}	errorDoc	"No valid Clerk session"
//	@Failure		403				{object}	errorDoc	"The session can't edit this appointment"
//	@Router			/appointments/{appointmentId} [patch]
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	id, ok := h.idParam(w, r, "appointmentId")
	if !ok {
		return
	}
	var req inputRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	a, err := h.service.Update(ctx, id, Input(req), actorOf(ctx))
	if err != nil {
		h.writeError(ctx, w, err, actorOf(ctx), "Could not update the appointment")
		return
	}
	h.writeOne(w, r, http.StatusOK, a)
}

// SetStatus handles POST /appointments/{appointmentId}/status.
//
//	@Summary		Mark an appointment done or canceled
//	@Description	`done` and `canceled` stop its reminders for everybody and keep it in the history with who and when; `scheduled`
//	@Description	takes a `done` back. A canceled one is final. It never needs the paid plan.
//	@Tags			appointments
//	@Accept			json
//	@Produce		json
//	@Param			appointmentId	path		string			true	"Appointment UUID"
//	@Param			payload			body		statusRequest	true	"The new status"
//	@Success		200				{object}	appointmentResponse
//	@Failure		400				{object}	validationDoc	"An unknown status"
//	@Failure		404				{object}	errorDoc		"No such appointment"
//	@Failure		409				{object}	errorDoc		"The change is not possible from its status"
//	@Security		ClerkSession
//	@Failure		401				{object}	errorDoc	"No valid Clerk session"
//	@Failure		403				{object}	errorDoc	"The session can't change this appointment"
//	@Router			/appointments/{appointmentId}/status [post]
func (h *Handler) SetStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	id, ok := h.idParam(w, r, "appointmentId")
	if !ok {
		return
	}
	var req statusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	a, err := h.service.SetStatus(ctx, id, Status(req.Status), actorOf(ctx))
	if err != nil {
		h.writeError(ctx, w, err, actorOf(ctx), "Could not change the appointment")
		return
	}
	h.writeOne(w, r, http.StatusOK, a)
}

// SetMyReminders handles PUT /appointments/{appointmentId}/my-reminders.
//
//	@Summary		Turn the session's own reminders of an appointment on or off
//	@Description	Only for the person who asks, never for the rest of the family; a Caregiver can too. Only a scheduled appointment has reminders (409).
//	@Tags			appointments
//	@Accept			json
//	@Produce		json
//	@Param			appointmentId	path		string				true	"Appointment UUID"
//	@Param			payload			body		myRemindersRequest	true	"enabled"
//	@Success		200				{object}	myRemindersResponse
//	@Failure		404				{object}	errorDoc	"No such appointment"
//	@Failure		409				{object}	errorDoc	"The appointment is not scheduled"
//	@Security		ClerkSession
//	@Failure		401				{object}	errorDoc	"No valid Clerk session"
//	@Failure		403				{object}	errorDoc	"No access to this appointment"
//	@Router			/appointments/{appointmentId}/my-reminders [put]
func (h *Handler) SetMyReminders(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	id, ok := h.idParam(w, r, "appointmentId")
	if !ok {
		return
	}
	var req myRemindersRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	actor := actorOf(ctx)
	if actor == uuid.Nil {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not save the reminder choice", nil)
		return
	}
	if err := h.service.SetMyReminders(ctx, id, actor, req.Enabled); err != nil {
		h.writeError(ctx, w, err, actor, "Could not save the reminder choice")
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, myRemindersResponse{MyReminders: req.Enabled}, nil)
}
