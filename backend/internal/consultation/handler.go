package consultation

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/catalog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// Handler exposes the consultation HTTP endpoints.
type Handler struct {
	service   *Service
	responder *httpx.Responder
}

// NewHandler creates a consultation Handler backed by the given service.
func NewHandler(service *Service, responder *httpx.Responder) *Handler {
	return &Handler{service: service, responder: responder}
}

// maxRequestBodyBytes caps the create-consultation body: the photo is
// base64-encoded in the JSON (~33% overhead over its 8MB decoded limit,
// research.md), plus room for the rest of the payload.
const maxRequestBodyBytes = 11 << 20 // 11 MiB

type doseResponse struct {
	ID          string `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	ScheduledAt string `json:"scheduledAt" example:"2026-01-15T08:00:00Z"`
	Taken       bool   `json:"taken" example:"false"`
	// Status is derived by the server with its own clock (specs/013): pending, due ("por marcar"), taken or
	// unregistered ("sin registrar": the next dose of its medication came and it isn't marked).
	Status string `json:"status" enums:"pending,due,taken,unregistered,canceled" example:"due"`
	// TakenBy: who marked it and when (specs/032); null if it isn't marked or was marked before that feature.
	TakenBy *takenByResponse `json:"takenBy"`
} // @name DoseResponse

// takenByResponse says who marked a dose: the first name of their account (never their e-mail) and when.
type takenByResponse struct {
	Name string `json:"name" example:"Ana"`
	At   string `json:"at" example:"2026-01-15T14:05:00Z"`
	// Mine: the session's own account marked it (it may take its own mark back; anybody else's only a person who can do
	// everything may).
	Mine bool `json:"mine" example:"false"`
} // @name TakenByResponse

// actorOf is the session's own account for the request (what RequireAccess found), uuid.Nil when unknown.
func actorOf(ctx context.Context) uuid.UUID {
	if a, ok := access.FromContext(ctx); ok {
		return a.ActorAccountID
	}
	return uuid.Nil
}

func toTakenByResponse(t *TakenBy, actor uuid.UUID) *takenByResponse {
	if t == nil {
		return nil
	}
	return &takenByResponse{Name: t.Name, At: t.At.Format(time.RFC3339), Mine: actor != uuid.Nil && t.AccountID == actor}
}

type medicationResponse struct {
	ID             string  `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	Name           string  `json:"name" example:"Amoxicilina"`
	FrequencyHours int     `json:"frequencyHours" example:"8"`
	DurationDays   int     `json:"durationDays" example:"5"`
	StartTime      *string `json:"startTime" example:"08:00"`
	// EndedAt is when the parent ended the treatment early (specs/016); null while it runs.
	EndedAt *string        `json:"endedAt" example:"2026-09-30T14:02:00Z"`
	Doses   []doseResponse `json:"doses"`
	// ExtendableDoses is how many unregistered doses haven't been covered by an extension yet (specs/020): the number the
	// app proposes adding; the button "Recorrer tratamiento" shows only when it is above 0. 0 once the treatment ended.
	ExtendableDoses int `json:"extendableDoses" example:"2"`
	// Extensions are the parent's decisions to add doses to the end, oldest first.
	Extensions []extensionResponse `json:"extensions"`
} // @name MedicationResponse

type extensionResponse struct {
	CreatedAt     string `json:"createdAt" example:"2026-09-30T14:02:00Z"`
	ProposedDoses int    `json:"proposedDoses" example:"2"`
	AddedDoses    int    `json:"addedDoses" example:"3"`
	// Manual is true when the parent changed the number the app proposed.
	Manual bool `json:"manual" example:"true"`
} // @name ExtensionResponse

type extendTreatmentRequest struct {
	// Doses is how many doses to add to the end: a whole number from 1 to 60.
	Doses *int `json:"doses" example:"3"`
} // @name ExtendTreatmentRequest

type consultationSummaryResponse struct {
	ID              string   `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	DoctorName      string   `json:"doctorName" example:"Dra. López"`
	ConsultDate     string   `json:"consultDate" example:"2026-01-15"`
	Notes           string   `json:"notes" example:"Comió mariscos el domingo; la fiebre empezó el lunes"`
	SymptomNames    []string `json:"symptomNames" example:"Fiebre,Tos"`
	MedicationCount int      `json:"medicationCount" example:"2"`
	// RecordOnly: saved only as a record (specs/024) — no schedule, no doses, no reminders.
	RecordOnly bool `json:"recordOnly" example:"false"`
} // @name ConsultationSummaryResponse

type consultationListResponse struct {
	ChildID       string                        `json:"childId" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	Consultations []consultationSummaryResponse `json:"consultations"`
} // @name ConsultationListResponse

type consultationDetailResponse struct {
	ID          string `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	ChildID     string `json:"childId" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	DoctorName  string `json:"doctorName" example:"Dra. López"`
	ConsultDate string `json:"consultDate" example:"2026-01-15"`
	PhotoBase64 string `json:"photoBase64"`
	Notes       string `json:"notes" example:"Comió mariscos el domingo; la fiebre empezó el lunes"`
	// Symptoms are the marked symptoms in catalog order, retired ones included.
	Symptoms    []catalog.SymptomResponse `json:"symptoms"`
	Medications []medicationResponse      `json:"medications"`
	// RecordOnly: saved only as a record (specs/024) — its medications have no start time and no doses.
	RecordOnly bool `json:"recordOnly" example:"false"`
} // @name ConsultationDetailResponse

// sessionErrorResponseDoc documents the 401/403 bodies every endpoint here can
// answer (missing/invalid session, or a resource the session doesn't own).
type sessionErrorResponseDoc struct {
	Error   string `json:"error" example:"forbidden"`
	Message string `json:"message" example:"This resource does not belong to the current session"`
} // @name ConsultationSessionErrorResponse

type childNotFoundResponseDoc struct {
	Error   string `json:"error" example:"child_not_found"`
	Message string `json:"message" example:"Child not found"`
} // @name ChildNotFoundResponse

type consultationNotFoundResponseDoc struct {
	Error   string `json:"error" example:"consultation_not_found"`
	Message string `json:"message" example:"Consultation not found"`
} // @name ConsultationNotFoundResponse

type doseNotFoundResponseDoc struct {
	Error   string `json:"error" example:"dose_not_found"`
	Message string `json:"message" example:"Dose not found"`
} // @name DoseNotFoundResponse

type validationErrorResponseDoc struct {
	Error   string          `json:"error" example:"validation_error"`
	Message string          `json:"message" example:"One or more fields are invalid"`
	Details []fieldErrorDoc `json:"details"`
} // @name ConsultationValidationErrorResponse

type fieldErrorDoc struct {
	Field   string `json:"field" example:"doctorName"`
	Message string `json:"message" example:"doctor name is required"`
} // @name ConsultationFieldError

// searchConsultationsRequest is the body of POST /children/{childId}/consultations/search (specs/031). Every field is
// optional; the ones given must all hold. It is a body, not a query string, so what the parent typed (it can be health
// information about the child) doesn't travel in the address: the server logs addresses, and so do the hosting providers.
type searchConsultationsRequest struct {
	// Q matches the doctor, the notes or the name of any medication, ignoring case and accents, as a part of the text (up to 100 characters).
	Q string `json:"q" example:"amox"`
	// From and To bound the consultation date, both ends included ("YYYY-MM-DD"); To must not be before From.
	From string `json:"from" example:"2026-01-01"`
	To   string `json:"to" example:"2026-06-30"`
	// Doctor is a doctor's name exactly as registered (see history-options).
	Doctor string `json:"doctor" example:"Dra. López"`
	// Medication is a medication's name exactly as registered (see history-options).
	Medication string `json:"medication" example:"Amoxicilina 250 mg"`
	// SymptomCodes are catalog codes; the consultation must have all of them (retired ones included).
	SymptomCodes []string `json:"symptomCodes" example:"fever,cough"`
	// Kind narrows to "treatment" (with a schedule) or "record" (saved only as a record); "all" or empty doesn't filter.
	Kind string `json:"kind" enums:"all,treatment,record" example:"all"`
} // @name SearchConsultationsRequest

type historyOptionsResponse struct {
	Doctors     []string `json:"doctors" example:"Dr. Iván Robles,Dra. Laura Cázares"`
	Medications []string `json:"medications" example:"Amoxicilina 250 mg,Paracetamol"`
} // @name HistoryOptionsResponse

// toSummaries maps the consultations of a list (or of a search) to their response shape.
func toSummaries(consultations []Consultation) []consultationSummaryResponse {
	summaries := make([]consultationSummaryResponse, 0, len(consultations))
	for _, c := range consultations {
		summaries = append(summaries, consultationSummaryResponse{
			ID:              c.ID.String(),
			DoctorName:      c.DoctorName,
			ConsultDate:     c.ConsultDate.Format("2006-01-02"),
			Notes:           c.Notes,
			SymptomNames:    c.SymptomNames, // [] when none: the query COALESCEs to an empty array,
			MedicationCount: c.MedicationCount,
			RecordOnly:      c.RecordOnly,
		})
	}
	return summaries
}

// ListConsultations handles GET /children/{childId}/consultations
// (specs/004-detalle-consulta-hijo/contracts/get-consultations.md).
//
//	@Summary		List a child's consultations
//	@Description	Lists a child's medical consultations (date, doctor, notes, marked symptom names in catalog order and medication count), most recent first (FR-001).
//	@Tags			consultations
//	@Produce		json
//	@Param			childId	path		string	true	"Child UUID"
//	@Success		200		{object}	consultationListResponse
//	@Failure		404		{object}	childNotFoundResponseDoc	"No child exists for this id"
//	@Security		ClerkSession
//	@Failure		401		{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Failure		403		{object}	sessionErrorResponseDoc	"The session does not own this resource"
//	@Router			/children/{childId}/consultations [get]
func (h *Handler) ListConsultations(w http.ResponseWriter, r *http.Request) {
	childID, err := uuid.Parse(chi.URLParam(r, "childId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, childNotFoundBody(), nil)
		return
	}

	consultations, err := h.service.ListConsultations(r.Context(), childID)
	if err != nil {
		if errors.Is(err, ErrChildNotFound) {
			h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, childNotFoundBody(), nil)
			return
		}
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not list consultations", nil)
		return
	}

	summaries := toSummaries(consultations)

	h.responder.WriteJSON(r.Context(), w, http.StatusOK, consultationListResponse{
		ChildID:       childID.String(),
		Consultations: summaries,
	}, nil)
}

type overviewDoseResponse struct {
	ID             string `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	ConsultationID string `json:"consultationId" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	MedicationName string `json:"medicationName" example:"Amoxicilina"`
	ScheduledAt    string `json:"scheduledAt" example:"2026-01-15T14:00:00Z"`
	Taken          bool   `json:"taken" example:"false"`
	// Status as in DoseResponse (specs/013).
	Status string `json:"status" enums:"pending,due,taken,unregistered,canceled" example:"due"`
	// TakenBy as in DoseResponse (specs/032).
	TakenBy *takenByResponse `json:"takenBy"`
} // @name OverviewDoseResponse

type activeTreatmentResponse struct {
	MedicationName string `json:"medicationName" example:"Amoxicilina"`
	EndsAt         string `json:"endsAt" example:"2026-01-18T22:00:00Z"`
	OtherCount     int    `json:"otherCount" example:"0"`
} // @name ActiveTreatmentResponse

type childOverviewResponse struct {
	ChildID         string                   `json:"childId" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	Doses           []overviewDoseResponse   `json:"doses"`
	ActiveTreatment *activeTreatmentResponse `json:"activeTreatment"`
} // @name ChildOverviewResponse

// GetChildOverview handles GET /children/{childId}/overview
// (specs/006-resumen-detalle-hijo/contracts/get-overview.md).
//
//	@Summary		A child's doses in a window and active treatment
//	@Description	Returns the doses scheduled in [from, to) (the parent's local "today"; the client
//	@Description	sends the window because only it knows its timezone) and the treatment still
//	@Description	running — the medication whose last scheduled dose is furthest ahead, derived only
//	@Description	from the dose schedule. The window may not exceed 48 hours.
//	@Tags			consultations
//	@Produce		json
//	@Param			childId	path		string	true	"Child UUID"
//	@Param			from	query		string	true	"Window start, RFC 3339"	example(2026-01-15T00:00:00-06:00)
//	@Param			to		query		string	true	"Window end (exclusive), RFC 3339"	example(2026-01-16T00:00:00-06:00)
//	@Success		200		{object}	childOverviewResponse
//	@Failure		400		{object}	validationErrorResponseDoc	"Missing/invalid window"
//	@Failure		404		{object}	childNotFoundResponseDoc	"No child exists for this id"
//	@Security		ClerkSession
//	@Failure		401		{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Failure		403		{object}	sessionErrorResponseDoc	"The session does not own this resource"
//	@Router			/children/{childId}/overview [get]
func (h *Handler) GetChildOverview(w http.ResponseWriter, r *http.Request) {
	childID, err := uuid.Parse(chi.URLParam(r, "childId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, childNotFoundBody(), nil)
		return
	}

	var fieldErrs []ValidationError
	from, err := time.Parse(time.RFC3339, r.URL.Query().Get("from"))
	if err != nil {
		fieldErrs = append(fieldErrs, ValidationError{Field: "from", Message: "must be an RFC 3339 timestamp"})
	}
	to, err := time.Parse(time.RFC3339, r.URL.Query().Get("to"))
	if err != nil {
		fieldErrs = append(fieldErrs, ValidationError{Field: "to", Message: "must be an RFC 3339 timestamp"})
	}
	if len(fieldErrs) > 0 {
		h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationErrorBody(fieldErrs, "One or more fields are invalid"), nil)
		return
	}

	overview, err := h.service.GetChildOverview(r.Context(), childID, from, to)
	if err != nil {
		var validationErrs ValidationErrors
		switch {
		case errors.Is(err, ErrChildNotFound):
			h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, childNotFoundBody(), nil)
		case errors.As(err, &validationErrs):
			h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationErrorBody(validationErrs, "One or more fields are invalid"), nil)
		default:
			h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not load the child overview", nil)
		}
		return
	}

	doses := make([]overviewDoseResponse, 0, len(overview.Doses))
	for _, d := range overview.Doses {
		doses = append(doses, overviewDoseResponse{
			ID:             d.ID.String(),
			ConsultationID: d.ConsultationID.String(),
			MedicationName: d.MedicationName,
			ScheduledAt:    d.ScheduledAt.Format(time.RFC3339),
			Taken:          d.Taken,
			Status:         string(d.Status),
			TakenBy:        toTakenByResponse(d.TakenBy, actorOf(r.Context())),
		})
	}
	resp := childOverviewResponse{ChildID: childID.String(), Doses: doses}
	if t := overview.ActiveTreatment; t != nil {
		resp.ActiveTreatment = &activeTreatmentResponse{
			MedicationName: t.MedicationName,
			EndsAt:         t.EndsAt.Format(time.RFC3339),
			OtherCount:     t.OtherCount,
		}
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, resp, nil)
}

type createMedicationRequest struct {
	Name           string  `json:"name" example:"Amoxicilina"`
	FrequencyHours int     `json:"frequencyHours" example:"8"`
	DurationDays   int     `json:"durationDays" example:"5"`
	StartTime      *string `json:"startTime" example:"08:00"`
}

type createConsultationRequest struct {
	DoctorName  string `json:"doctorName" example:"Dra. López"`
	ConsultDate string `json:"consultDate" example:"2026-01-15"`
	PhotoBase64 string `json:"photoBase64"`
	Notes       string `json:"notes" example:"Comió mariscos el domingo; la fiebre empezó el lunes"`
	// SymptomCodes are catalog codes (GET /catalog/symptoms); optional, duplicates ignored.
	SymptomCodes []string                  `json:"symptomCodes" example:"fever,cough"`
	Medications  []createMedicationRequest `json:"medications"`
	// LegacySymptoms is the free text's name before specs/012 ("symptoms": "..."), still accepted as the
	// notes so a tab on an older bundle doesn't lose what the parent wrote while both versions coexist.
	LegacySymptoms json.RawMessage `json:"symptoms,omitempty" swaggerignore:"true"`
	// UTCOffsetMinutes is the parent's UTC offset, so "startTime" is read in
	// their own time zone. Optional: 0 (default) means UTC.
	UTCOffsetMinutes int `json:"utcOffsetMinutes" example:"-360"`
	// RecordOnly saves the consultation only as a record (specs/024): optional, false by default. When true the
	// medications' "startTime" is not required and is discarded, so no doses (and no reminders) exist.
	RecordOnly bool `json:"recordOnly" example:"false"`
}

// CreateConsultation handles POST /children/{childId}/consultations
// (specs/004-detalle-consulta-hijo/contracts/post-consultations.md).
//
//	@Summary		Register a new medical consultation
//	@Description	Registers a consultation with its prescription photo, medications, notes and marked symptoms
//	@Description	(FR-003, FR-004). At least one medication is required (FR-015), and each one needs
//	@Description	its startTime ("HH:MM"): all of its doses are generated at once from it (research.md).
//	@Description	Every symptomCodes entry must be an active catalog symptom, or 400 with details[].message "symptom_not_available" (specs/012).
//	@Description	On the free plan, a consultation is refused with 422 "freemium_consultation_limit_exceeded" while any child of the account
//	@Description	still has an active treatment (reason "active_treatment") and when recordOnly is true (reason "record_only"); paid accounts have neither limit (specs/030).
//	@Tags			consultations
//	@Accept			json
//	@Produce		json
//	@Param			childId	path		string						true	"Child UUID"
//	@Param			payload	body		createConsultationRequest	true	"Consultation to register"
//	@Success		201		{object}	consultationDetailResponse
//	@Failure		400		{object}	validationErrorResponseDoc	"Missing/invalid field"
//	@Failure		404		{object}	childNotFoundResponseDoc	"No child exists for this id"
//	@Failure		422		{object}	planLimitResponseDoc	"Free plan: another treatment is still active, or recordOnly (specs/030)"
//	@Security		ClerkSession
//	@Failure		401		{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Failure		403		{object}	sessionErrorResponseDoc	"The session does not own this resource"
//	@Router			/children/{childId}/consultations [post]
func (h *Handler) CreateConsultation(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)

	childID, err := uuid.Parse(chi.URLParam(r, "childId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, childNotFoundBody(), nil)
		return
	}

	var req createConsultationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}

	var consultDate time.Time
	if req.ConsultDate != "" {
		parsed, err := time.Parse("2006-01-02", req.ConsultDate)
		if err != nil {
			h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationErrorBody([]ValidationError{{
				Field:   "consultDate",
				Message: "consult date must be an ISO-8601 date (YYYY-MM-DD)",
			}}, "One or more fields are invalid"), nil)
			return
		}
		consultDate = parsed
	}

	var photo []byte
	if req.PhotoBase64 != "" {
		decoded, err := base64.StdEncoding.DecodeString(req.PhotoBase64)
		if err != nil {
			h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationErrorBody([]ValidationError{{
				Field:   "photoBase64",
				Message: "photo must be valid base64",
			}}, "One or more fields are invalid"), nil)
			return
		}
		photo = decoded
	}

	input := CreateConsultationInput{
		DoctorName:   req.DoctorName,
		ConsultDate:  consultDate,
		Photo:        photo,
		Notes:        notesOf(req),
		SymptomCodes: req.SymptomCodes,
		RecordOnly:   req.RecordOnly,

		UTCOffsetMinutes: req.UTCOffsetMinutes,
	}
	for _, m := range req.Medications {
		input.Medications = append(input.Medications, CreateMedicationInput{
			Name:           m.Name,
			FrequencyHours: m.FrequencyHours,
			DurationDays:   m.DurationDays,
			StartTime:      m.StartTime,
		})
	}

	c, err := h.service.CreateConsultation(r.Context(), childID, input)
	if err != nil {
		h.writeCreateConsultationError(r.Context(), w, err)
		return
	}

	h.responder.WriteJSON(r.Context(), w, http.StatusCreated, toConsultationDetailResponse(c, actorOf(r.Context())), nil)
}

// notesOf returns the request's notes, or — from a client older than specs/012 — its "symptoms" text.
// Anything else under "symptoms" (the new list shape is "symptomCodes") is ignored.
func notesOf(req createConsultationRequest) string {
	if req.Notes != "" || len(req.LegacySymptoms) == 0 {
		return req.Notes
	}
	var legacy string
	if err := json.Unmarshal(req.LegacySymptoms, &legacy); err != nil {
		return ""
	}
	return legacy
}

func (h *Handler) writeCreateConsultationError(ctx context.Context, w http.ResponseWriter, err error) {
	var validationErrs ValidationErrors
	var planErr *PlanLimitError
	switch {
	case errors.As(err, &validationErrs):
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationErrorBody(validationErrs, "One or more fields are invalid"), nil)
	case errors.Is(err, ErrSymptomNotAvailable):
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationErrorBody(ValidationErrors{{
			Field:   "symptomCodes",
			Message: "symptom_not_available",
		}}, "One or more fields are invalid"), nil)
	case errors.As(err, &planErr):
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, planLimitBody(planErr.Reason), nil)
	case errors.Is(err, ErrChildNotFound):
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, childNotFoundBody(), nil)
	default:
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not create consultation", nil)
	}
}

// planLimitResponseDoc documents the 422 body of a consultation the free plan doesn't include (specs/030).
type planLimitResponseDoc struct {
	Error   string `json:"error" example:"freemium_consultation_limit_exceeded"`
	Message string `json:"message" example:"The free plan includes one active treatment at a time"`
	// Reason is "active_treatment" (another treatment is still running), "record_only" (saving only as a record) or
	// "history_search" (searching and filtering the history, specs/031).
	Reason string `json:"reason" example:"active_treatment"`
} // @name PlanLimitResponse

// planLimitBody builds the 422 body for a consultation the free plan doesn't include (specs/030). The error code
// follows the child limit's (`freemium_child_limit_exceeded`); the reason says which rule applied.
func planLimitBody(reason string) map[string]string {
	message := "The free plan includes one active treatment at a time"
	switch reason {
	case PlanLimitRecordOnly:
		message = "Saving a consultation only as a record is part of the paid plan"
	case PlanLimitHistorySearch:
		message = "Searching and filtering the history is part of the paid plan"
	}
	return map[string]string{"error": "freemium_consultation_limit_exceeded", "message": message, "reason": reason}
}

// SearchConsultations handles POST /children/{childId}/consultations/search (specs/031-historial-busqueda-filtros,
// contracts/history-search.md).
//
//	@Summary		Search and filter a child's consultations
//	@Description	The paid plan's history: lists the child's consultations that meet every criterion given (text, date range,
//	@Description	doctor, medication, symptoms, kind), most recent first, in the same shape as the plain list. It only finds what
//	@Description	was registered. It is a POST so the typed text is not part of the address. A free account always gets 422
//	@Description	"freemium_consultation_limit_exceeded" with reason "history_search" and no consultations.
//	@Tags			consultations
//	@Accept			json
//	@Produce		json
//	@Param			childId	path		string						true	"Child UUID"
//	@Param			payload	body		searchConsultationsRequest	true	"Criteria (all optional)"
//	@Success		200		{object}	consultationListResponse
//	@Failure		400		{object}	validationErrorResponseDoc	"Malformed body or an invalid criterion"
//	@Failure		404		{object}	childNotFoundResponseDoc	"No child exists for this id"
//	@Failure		422		{object}	planLimitResponseDoc		"Free plan: searching the history is part of the paid plan"
//	@Security		ClerkSession
//	@Failure		401		{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Failure		403		{object}	sessionErrorResponseDoc	"The session does not own this resource"
//	@Router			/children/{childId}/consultations/search [post]
func (h *Handler) SearchConsultations(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)

	childID, err := uuid.Parse(chi.URLParam(r, "childId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, childNotFoundBody(), nil)
		return
	}

	var req searchConsultationsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}

	search := HistorySearch{
		Q:            req.Q,
		Doctor:       req.Doctor,
		Medication:   req.Medication,
		SymptomCodes: req.SymptomCodes,
		Kind:         req.Kind,
	}
	var dateErrs ValidationErrors
	if search.From, err = parseSearchDate(req.From); err != nil {
		dateErrs = append(dateErrs, ValidationError{Field: "from", Message: "must be an ISO-8601 date (YYYY-MM-DD)"})
	}
	if search.To, err = parseSearchDate(req.To); err != nil {
		dateErrs = append(dateErrs, ValidationError{Field: "to", Message: "must be an ISO-8601 date (YYYY-MM-DD)"})
	}
	if dateErrs.HasErrors() {
		h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationErrorBody(dateErrs, "One or more fields are invalid"), nil)
		return
	}

	consultations, err := h.service.SearchConsultations(r.Context(), childID, search)
	if err != nil {
		h.writeHistoryError(r.Context(), w, err, "Could not search consultations")
		return
	}

	h.responder.WriteJSON(r.Context(), w, http.StatusOK, consultationListResponse{
		ChildID:       childID.String(),
		Consultations: toSummaries(consultations),
	}, nil)
}

// HistoryOptions handles GET /children/{childId}/history-options (specs/031, contracts/history-search.md).
//
//	@Summary		List the doctors and medications registered for a child
//	@Description	The distinct doctor and medication names already registered for the child, as written, sorted without telling
//	@Description	apart case or accents: the choices of the history's filters. A free account gets 422 "history_search".
//	@Tags			consultations
//	@Produce		json
//	@Param			childId	path		string	true	"Child UUID"
//	@Success		200		{object}	historyOptionsResponse
//	@Failure		404		{object}	childNotFoundResponseDoc	"No child exists for this id"
//	@Failure		422		{object}	planLimitResponseDoc		"Free plan: the history is part of the paid plan"
//	@Security		ClerkSession
//	@Failure		401		{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Failure		403		{object}	sessionErrorResponseDoc	"The session does not own this resource"
//	@Router			/children/{childId}/history-options [get]
func (h *Handler) HistoryOptions(w http.ResponseWriter, r *http.Request) {
	childID, err := uuid.Parse(chi.URLParam(r, "childId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, childNotFoundBody(), nil)
		return
	}

	options, err := h.service.HistoryOptions(r.Context(), childID)
	if err != nil {
		h.writeHistoryError(r.Context(), w, err, "Could not list the history options")
		return
	}

	h.responder.WriteJSON(r.Context(), w, http.StatusOK, historyOptionsResponse{
		Doctors:     options.Doctors,
		Medications: options.Medications,
	}, nil)
}

// parseSearchDate reads an optional "YYYY-MM-DD" criterion: empty means none.
func parseSearchDate(value string) (*time.Time, error) {
	if value == "" {
		return nil, nil
	}
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

// writeHistoryError maps the errors of the history's two endpoints. Each case calls the responder from its own line, so
// error_logs keeps telling them apart (backend/CLAUDE.md).
func (h *Handler) writeHistoryError(ctx context.Context, w http.ResponseWriter, err error, internalMessage string) {
	var validationErrs ValidationErrors
	var planErr *PlanLimitError
	switch {
	case errors.As(err, &validationErrs):
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationErrorBody(validationErrs, "One or more fields are invalid"), nil)
	case errors.Is(err, ErrSymptomNotAvailable):
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationErrorBody(ValidationErrors{{
			Field:   "symptomCodes",
			Message: "symptom_not_available",
		}}, "One or more fields are invalid"), nil)
	case errors.As(err, &planErr):
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, planLimitBody(planErr.Reason), nil)
	case errors.Is(err, ErrChildNotFound):
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, childNotFoundBody(), nil)
	default:
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", internalMessage, nil)
	}
}

// GetConsultation handles GET /consultations/{consultationId}
// (specs/004-detalle-consulta-hijo/contracts/get-consultation-detail.md).
//
//	@Summary		Get a consultation's full detail
//	@Description	Retrieves the prescription photo, doctor, date, medications (with their doses,
//	@Description	if any), notes and marked symptoms (catalog order, retired ones included) of a consultation (FR-013, specs/012).
//	@Tags			consultations
//	@Produce		json
//	@Param			consultationId	path		string	true	"Consultation UUID"
//	@Success		200				{object}	consultationDetailResponse
//	@Failure		404				{object}	consultationNotFoundResponseDoc	"No consultation exists for this id"
//	@Security		ClerkSession
//	@Failure		401		{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Failure		403		{object}	sessionErrorResponseDoc	"The session does not own this resource"
//	@Router			/consultations/{consultationId} [get]
func (h *Handler) GetConsultation(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "consultationId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, consultationNotFoundBody(), nil)
		return
	}

	c, err := h.service.GetConsultation(r.Context(), id)
	if err != nil {
		if errors.Is(err, ErrConsultationNotFound) {
			h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, consultationNotFoundBody(), nil)
			return
		}
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not fetch consultation", nil)
		return
	}

	h.responder.WriteJSON(r.Context(), w, http.StatusOK, toConsultationDetailResponse(c, actorOf(r.Context())), nil)
}

type updateDoseRequest struct {
	Taken bool `json:"taken" example:"true"`
}

// UpdateDose handles PATCH /consultations/{consultationId}/doses/{doseId}
// (specs/004-detalle-consulta-hijo/contracts/patch-dose.md).
//
//	@Summary		Mark or unmark a dose as taken
//	@Description	Sets a dose's taken status. No validation of scheduled date or treatment
//	@Description	status — a dose can be marked/unmarked at any time (FR-011, FR-016).
//	@Description	Marking is first-come: a dose already marked answers 200 as it is, with who marked it (takenBy, specs/032).
//	@Description	Unmarking is for who marked it or for someone who can do everything (the owner or a Tutor); anyone else gets 403.
//	@Tags			consultations
//	@Accept			json
//	@Produce		json
//	@Param			consultationId	path		string				true	"Consultation UUID"
//	@Param			doseId			path		string				true	"Dose UUID"
//	@Param			payload			body		updateDoseRequest	true	"New taken status"
//	@Success		200				{object}	doseResponse
//	@Failure		404				{object}	doseNotFoundResponseDoc	"No dose exists for this id"
//	@Security		ClerkSession
//	@Failure		401		{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Failure		403		{object}	sessionErrorResponseDoc	"The session does not own this resource"
//	@Router			/consultations/{consultationId}/doses/{doseId} [patch]
func (h *Handler) UpdateDose(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)

	consultationID, err := uuid.Parse(chi.URLParam(r, "consultationId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, doseNotFoundBody(), nil)
		return
	}

	doseID, err := uuid.Parse(chi.URLParam(r, "doseId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, doseNotFoundBody(), nil)
		return
	}

	var req updateDoseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}

	// Scoping the update to consultationID (not just doseID) is what makes
	// a dose from a different consultation correctly 404 instead of
	// silently succeeding — see repository.go's UpdateDoseStatus.
	// Who is marking: RequireAccess put it in the context (specs/032). Without it nothing is allowed (fail closed).
	got, ok := access.FromContext(r.Context())
	if !ok {
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not update dose", nil)
		return
	}
	actor := Actor{AccountID: got.ActorAccountID, Full: got.Level == access.Full}

	dose, err := h.service.MarkDose(r.Context(), consultationID, doseID, req.Taken, actor)
	if err != nil {
		if errors.Is(err, ErrDoseNotFound) {
			h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, doseNotFoundBody(), nil)
			return
		}
		if errors.Is(err, ErrDoseForbidden) {
			h.responder.WriteJSONError(r.Context(), w, http.StatusForbidden, "forbidden", "Only who marked a dose, or a tutor, can unmark it", nil)
			return
		}
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not update dose", nil)
		return
	}

	h.responder.WriteJSON(r.Context(), w, http.StatusOK, toDoseResponse(dose, actorOf(r.Context())), nil)
}

func childNotFoundBody() map[string]string {
	return map[string]string{"error": "child_not_found", "message": "Child not found"}
}

func consultationNotFoundBody() map[string]string {
	return map[string]string{"error": "consultation_not_found", "message": "Consultation not found"}
}

func doseNotFoundBody() map[string]string {
	return map[string]string{"error": "dose_not_found", "message": "Dose not found"}
}

// validationErrorBody builds the 400 response body shape. Pure data
// shaping only — same rationale as internal/account's validationErrorBody.
func validationErrorBody(errs []ValidationError, message string) map[string]any {
	details := make([]map[string]string, 0, len(errs))
	for _, e := range errs {
		details = append(details, map[string]string{"field": e.Field, "message": e.Message})
	}
	return map[string]any{
		"error":   "validation_error",
		"message": message,
		"details": details,
	}
}

// EndTreatment handles POST /consultations/{consultationId}/medications/{medicationId}/end
// (specs/016-finalizar-tratamiento/contracts/medication-end.md).
//
//	@Summary		End a medication's treatment early
//	@Description	Records when the parent ended the treatment (irreversible). No dose is deleted: the ones whose
//	@Description	time hadn't come turn "canceled" and stop being reminded. Idempotent: ending it again returns the
//	@Description	same result (specs/016).
//	@Tags			consultations
//	@Produce		json
//	@Param			consultationId	path		string	true	"Consultation UUID"
//	@Param			medicationId	path		string	true	"Medication UUID"
//	@Success		200				{object}	medicationResponse
//	@Failure		400				{object}	validationErrorResponseDoc	"Nothing left to end (details: nothing_to_end)"
//	@Failure		404				{object}	medicationNotFoundResponseDoc	"No such medication in this consultation"
//	@Security		ClerkSession
//	@Failure		401		{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Failure		403		{object}	sessionErrorResponseDoc	"The session does not own this resource"
//	@Router			/consultations/{consultationId}/medications/{medicationId}/end [post]
func (h *Handler) EndTreatment(w http.ResponseWriter, r *http.Request) {
	consultationID, err := uuid.Parse(chi.URLParam(r, "consultationId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, medicationNotFoundBody(), nil)
		return
	}
	medicationID, err := uuid.Parse(chi.URLParam(r, "medicationId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, medicationNotFoundBody(), nil)
		return
	}

	med, err := h.service.EndTreatment(r.Context(), consultationID, medicationID)
	switch {
	case errors.Is(err, ErrMedicationNotFound):
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, medicationNotFoundBody(), nil)
	case errors.Is(err, ErrNothingToEnd):
		h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationErrorBody(ValidationErrors{{
			Field:   "medicationId",
			Message: "nothing_to_end",
		}}, "One or more fields are invalid"), nil)
	case err != nil:
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not end the treatment", nil)
	default:
		h.responder.WriteJSON(r.Context(), w, http.StatusOK, toMedicationResponse(med, actorOf(r.Context())), nil)
	}
}

// ExtendTreatment handles POST /consultations/{consultationId}/medications/{medicationId}/extend
// (specs/020-recorrer-tratamiento/contracts/medication-extend.md).
//
//	@Summary		Add doses to the end of a medication's treatment
//	@Description	Only because the parent decided so (their doctor told them to): adds `doses` doses after the last one, one
//	@Description	frequency apart, records who decided and what was proposed vs confirmed, and marks the unregistered doses as
//	@Description	covered so they are never proposed twice. Nothing that exists changes. Not idempotent on purpose: a second
//	@Description	attempt for the same doses gets nothing_to_extend (specs/020).
//	@Tags			consultations
//	@Accept			json
//	@Produce		json
//	@Param			consultationId	path		string					true	"Consultation UUID"
//	@Param			medicationId	path		string					true	"Medication UUID"
//	@Param			body			body		extendTreatmentRequest	true	"How many doses to add"
//	@Success		200				{object}	medicationResponse
//	@Failure		400				{object}	validationErrorResponseDoc	"doses out of range, or nothing to extend (details: nothing_to_extend)"
//	@Failure		404				{object}	medicationNotFoundResponseDoc	"No such medication in this consultation"
//	@Security		ClerkSession
//	@Failure		401				{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Failure		403				{object}	sessionErrorResponseDoc	"The session does not own this resource"
//	@Router			/consultations/{consultationId}/medications/{medicationId}/extend [post]
func (h *Handler) ExtendTreatment(w http.ResponseWriter, r *http.Request) {
	consultationID, err := uuid.Parse(chi.URLParam(r, "consultationId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, medicationNotFoundBody(), nil)
		return
	}
	medicationID, err := uuid.Parse(chi.URLParam(r, "medicationId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, medicationNotFoundBody(), nil)
		return
	}

	var req extendTreatmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	if req.Doses == nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationErrorBody(ValidationErrors{{
			Field:   "doses",
			Message: "is required",
		}}, "One or more fields are invalid"), nil)
		return
	}

	med, err := h.service.ExtendTreatment(r.Context(), consultationID, medicationID, *req.Doses)
	var validation ValidationErrors
	switch {
	case errors.As(err, &validation):
		h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationErrorBody(validation, "One or more fields are invalid"), nil)
	case errors.Is(err, ErrMedicationNotFound):
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, medicationNotFoundBody(), nil)
	case errors.Is(err, ErrNothingToExtend):
		h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationErrorBody(ValidationErrors{{
			Field:   "medicationId",
			Message: "nothing_to_extend",
		}}, "One or more fields are invalid"), nil)
	case err != nil:
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not extend the treatment", nil)
	default:
		h.responder.WriteJSON(r.Context(), w, http.StatusOK, toMedicationResponse(med, actorOf(r.Context())), nil)
	}
}

type medicationNotFoundResponseDoc struct {
	Error   string `json:"error" example:"medication_not_found"`
	Message string `json:"message" example:"Medication not found"`
} // @name MedicationNotFoundResponse

func medicationNotFoundBody() map[string]any {
	return map[string]any{"error": "medication_not_found", "message": "Medication not found"}
}

func toMedicationResponse(m *Medication, actor uuid.UUID) medicationResponse {
	doses := make([]doseResponse, 0, len(m.Doses))
	for _, d := range m.Doses {
		doses = append(doses, toDoseResponse(&d, actor))
	}
	var endedAt *string
	if m.EndedAt != nil {
		formatted := m.EndedAt.Format(time.RFC3339)
		endedAt = &formatted
	}
	extensions := make([]extensionResponse, 0, len(m.Extensions))
	for _, e := range m.Extensions {
		extensions = append(extensions, extensionResponse{
			CreatedAt:     e.CreatedAt.Format(time.RFC3339),
			ProposedDoses: e.ProposedDoses,
			AddedDoses:    e.AddedDoses,
			Manual:        e.Manual(),
		})
	}
	return medicationResponse{
		ID:              m.ID.String(),
		Name:            m.Name,
		FrequencyHours:  m.FrequencyHours,
		DurationDays:    m.DurationDays,
		StartTime:       m.StartTime,
		EndedAt:         endedAt,
		Doses:           doses,
		ExtendableDoses: m.ExtendableDoses,
		Extensions:      extensions,
	}
}

func toDoseResponse(d *Dose, actor uuid.UUID) doseResponse {
	return doseResponse{
		ID:          d.ID.String(),
		ScheduledAt: d.ScheduledAt.Format(time.RFC3339),
		Taken:       d.Taken,
		Status:      string(d.Status),
		TakenBy:     toTakenByResponse(d.TakenBy, actor),
	}
}

func toConsultationDetailResponse(c *Consultation, actor uuid.UUID) consultationDetailResponse {
	medications := make([]medicationResponse, 0, len(c.Medications))
	for i := range c.Medications {
		medications = append(medications, toMedicationResponse(&c.Medications[i], actor))
	}
	symptoms := make([]catalog.SymptomResponse, 0, len(c.Symptoms))
	for _, sym := range c.Symptoms {
		symptoms = append(symptoms, catalog.NewSymptomResponse(sym))
	}
	return consultationDetailResponse{
		ID:          c.ID.String(),
		ChildID:     c.ChildID.String(),
		DoctorName:  c.DoctorName,
		ConsultDate: c.ConsultDate.Format("2006-01-02"),
		PhotoBase64: base64.StdEncoding.EncodeToString(c.Photo),
		Notes:       c.Notes,
		Symptoms:    symptoms,
		Medications: medications,
		RecordOnly:  c.RecordOnly,
	}
}
