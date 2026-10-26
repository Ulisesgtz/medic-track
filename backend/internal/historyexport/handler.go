package historyexport

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// Handler serves POST /children/{childId}/export. Every response goes through the Responder; nothing the parent chose (doctor,
// text, dates) is ever in a message or an address.
type Handler struct {
	service   *Service
	responder *httpx.Responder
}

// NewHandler creates the Handler.
func NewHandler(service *Service, responder *httpx.Responder) *Handler {
	return &Handler{service: service, responder: responder}
}

const maxBodyBytes = 16 << 10

type filtersRequest struct {
	Q            string   `json:"q" example:""`
	From         string   `json:"from" example:"2026-07-01"`
	To           string   `json:"to" example:"2026-10-24"`
	Doctor       string   `json:"doctor" example:"Dra. Laura Cázares"`
	Medication   string   `json:"medication" example:""`
	SymptomCodes []string `json:"symptomCodes" example:"fever"`
	Kind         string   `json:"kind" example:"all"`
} // @name ExportFiltersRequest

type periodRequest struct {
	// Kind is "all" (the whole history), "range" (From–To, days, both included) or "filters" (the history's own criteria).
	Kind    string          `json:"kind" enums:"all,range,filters" example:"range"`
	From    string          `json:"from" example:"2026-01-01"`
	To      string          `json:"to" example:"2026-10-24"`
	Filters *filtersRequest `json:"filters"`
} // @name ExportPeriodRequest

type sectionsRequest struct {
	Consultations bool `json:"consultations" example:"true"`
	Vaccinations  bool `json:"vaccinations" example:"true"`
	Photos        bool `json:"photos" example:"false"`
} // @name ExportSectionsRequest

type exportRequest struct {
	Period   periodRequest   `json:"period"`
	Sections sectionsRequest `json:"sections"`
} // @name ExportRequest

// parseRequest checks the body and turns it into a Request; the history's criteria follow the history's own rules (specs/031).
func parseRequest(body exportRequest) (Request, []httpx.FieldError) {
	req := Request{PeriodKind: body.Period.Kind, Consultations: body.Sections.Consultations, Vaccinations: body.Sections.Vaccinations, Photos: body.Sections.Photos}
	var errs []httpx.FieldError
	day := func(field, value string, required bool) *time.Time {
		if value == "" {
			if required {
				errs = append(errs, httpx.FieldError{Field: field, Message: "is required"})
			}
			return nil
		}
		t, err := consultation.ParseDay(value)
		if err != nil {
			errs = append(errs, httpx.FieldError{Field: field, Message: "must be an ISO-8601 date (YYYY-MM-DD)"})
			return nil
		}
		return t
	}
	switch body.Period.Kind {
	case PeriodAll:
	case PeriodRange:
		req.From, req.To = day("period.from", body.Period.From, true), day("period.to", body.Period.To, true)
		if req.From != nil && req.To != nil && req.To.Before(*req.From) {
			errs = append(errs, httpx.FieldError{Field: "period.to", Message: "must not be before from"})
		}
	case PeriodFilters:
		f := body.Period.Filters
		if f == nil {
			f = &filtersRequest{}
		}
		search := consultation.HistorySearch{Q: f.Q, Doctor: f.Doctor, Medication: f.Medication, SymptomCodes: f.SymptomCodes, Kind: f.Kind}
		search.From, search.To = day("period.filters.from", f.From, false), day("period.filters.to", f.To, false)
		cleaned, verrs := consultation.ValidateHistorySearch(search)
		for _, e := range verrs {
			errs = append(errs, httpx.FieldError{Field: "period.filters." + e.Field, Message: e.Message})
		}
		req.Filters = Filters{Q: cleaned.Q, Doctor: cleaned.Doctor, Medication: cleaned.Medication, Kind: cleaned.Kind, From: cleaned.From, To: cleaned.To, SymptomCodes: cleaned.SymptomCodes}
	default:
		errs = append(errs, httpx.FieldError{Field: "period.kind", Message: "must be all, range or filters"})
	}
	if !req.Consultations && !req.Vaccinations {
		errs = append(errs, httpx.FieldError{Field: "sections", Message: "choose consultations, vaccinations or both"})
	}
	return req, errs
}

type childResponse struct {
	FirstName string   `json:"firstName" example:"Mateo"`
	LastName  string   `json:"lastName" example:"Morales"`
	BirthDate string   `json:"birthDate" example:"2021-03-14"`
	Height    *float64 `json:"height" example:"112"`
	Weight    *float64 `json:"weight" example:"19.4"`
} // @name ExportChild

type activeTreatmentResponse struct {
	MedicationName string `json:"medicationName" example:"Amoxicilina"`
	FrequencyHours int    `json:"frequencyHours" example:"8"`
	Since          string `json:"since" example:"2026-10-18T14:00:00Z"`
	DoctorName     string `json:"doctorName" example:"Dra. Laura Cázares"`
} // @name ExportActiveTreatment

type appointmentResponse struct {
	ScheduledAt string `json:"scheduledAt" example:"2026-10-28T16:30:00Z"`
	DoctorName  string `json:"doctorName" example:"Dra. Laura Cázares"`
	Location    string `json:"location" example:"Consultorio 204, Torre Médica Satélite"`
} // @name ExportAppointment

type extensionResponse struct {
	CreatedAt  string `json:"createdAt"`
	AddedDoses int    `json:"addedDoses" example:"2"`
} // @name ExportExtension

type dosesResponse struct {
	Taken        int `json:"taken" example:"16"`
	Unregistered int `json:"unregistered" example:"2"`
	Due          int `json:"due" example:"0"`
	Pending      int `json:"pending" example:"3"`
	Total        int `json:"total" example:"21"`
} // @name ExportDoseCounts

type markResponse struct {
	At string `json:"at"`
	By string `json:"by" example:"Ana"`
} // @name ExportMark

type medicationResponse struct {
	Name           string              `json:"name" example:"Amoxicilina"`
	FrequencyHours int                 `json:"frequencyHours" example:"8"`
	DurationDays   int                 `json:"durationDays" example:"7"`
	StartTime      *string             `json:"startTime" example:"08:00"`
	EndedAt        *string             `json:"endedAt"`
	Extensions     []extensionResponse `json:"extensions"`
	Doses          dosesResponse       `json:"doses"`
	FirstDoseAt    *string             `json:"firstDoseAt"`
	LastDoseAt     *string             `json:"lastDoseAt"`
	LastMark       *markResponse       `json:"lastMark"`
} // @name ExportMedication

type symptomResponse struct {
	Code string `json:"code" example:"fever"`
	Name string `json:"name" example:"Fiebre"`
} // @name ExportSymptom

type consultationResponse struct {
	ID          string               `json:"id"`
	ConsultDate string               `json:"consultDate" example:"2026-10-18"`
	DoctorName  string               `json:"doctorName" example:"Dra. Laura Cázares"`
	RecordOnly  bool                 `json:"recordOnly"`
	Notes       string               `json:"notes"`
	Symptoms    []symptomResponse    `json:"symptoms"`
	HasPhoto    bool                 `json:"hasPhoto"`
	Medications []medicationResponse `json:"medications"`
	Appointment *appointmentResponse `json:"appointment"`
} // @name ExportConsultation

type correctedResponse struct {
	At string  `json:"at"`
	By *string `json:"by" example:"Ana"`
} // @name ExportCorrected

type vaccinationResponse struct {
	ID         string             `json:"id"`
	Name       string             `json:"name" example:"Hepatitis B"`
	Custom     bool               `json:"custom"`
	DoseNumber *int               `json:"doseNumber" example:"1"`
	AppliedOn  string             `json:"appliedOn" example:"2021-03-15"`
	Lot        *string            `json:"lot"`
	Place      *string            `json:"place"`
	Notes      *string            `json:"notes"`
	Corrected  *correctedResponse `json:"corrected"`
} // @name ExportVaccination

type consultationPhotoResponse struct {
	ConsultationID string `json:"consultationId"`
	ConsultDate    string `json:"consultDate" example:"2026-10-18"`
	DoctorName     string `json:"doctorName" example:"Dra. Laura Cázares"`
} // @name ExportConsultationPhoto

type cardPhotoResponse struct {
	ID        string `json:"id"`
	CreatedAt string `json:"createdAt"`
} // @name ExportCardPhoto

type photosResponse struct {
	Consultations []consultationPhotoResponse `json:"consultations"`
	Card          []cardPhotoResponse         `json:"card"`
} // @name ExportPhotos

type documentResponse struct {
	Child           childResponse            `json:"child"`
	ActiveTreatment *activeTreatmentResponse `json:"activeTreatment"`
	NextAppointment *appointmentResponse     `json:"nextAppointment"`
	Consultations   []consultationResponse   `json:"consultations"`
	Vaccinations    []vaccinationResponse    `json:"vaccinations"`
	Photos          *photosResponse          `json:"photos"`
} // @name ExportDocument

type errorDoc struct {
	Error   string `json:"error" example:"child_not_found"`
	Message string `json:"message"`
} // @name ExportErrorResponse

type planLimitDoc struct {
	Error   string `json:"error" example:"freemium_consultation_limit_exceeded"`
	Message string `json:"message"`
	Reason  string `json:"reason" example:"pdf_export"`
} // @name ExportPlanLimitResponse

func stamp(t time.Time) string { return t.UTC().Format(time.RFC3339) }

func stampPtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := stamp(*t)
	return &s
}

func appointmentOf(a *Appointment) *appointmentResponse {
	if a == nil {
		return nil
	}
	return &appointmentResponse{ScheduledAt: stamp(a.ScheduledAt), DoctorName: a.DoctorName, Location: a.Location}
}

func toResponse(d *Document) documentResponse {
	out := documentResponse{
		Child: childResponse{FirstName: d.Child.FirstName, LastName: d.Child.LastName, BirthDate: d.Child.BirthDate.Format("2006-01-02"),
			Height: d.Child.Height, Weight: d.Child.Weight},
		NextAppointment: appointmentOf(d.NextAppointment),
		Consultations:   make([]consultationResponse, 0, len(d.Consultations)),
		Vaccinations:    make([]vaccinationResponse, 0, len(d.Vaccinations)),
	}
	if t := d.ActiveTreatment; t != nil {
		out.ActiveTreatment = &activeTreatmentResponse{MedicationName: t.MedicationName, FrequencyHours: t.FrequencyHours, Since: stamp(t.Since), DoctorName: t.DoctorName}
	}
	for _, c := range d.Consultations {
		rc := consultationResponse{ID: c.ID.String(), ConsultDate: c.ConsultDate.Format("2006-01-02"), DoctorName: c.DoctorName, RecordOnly: c.RecordOnly,
			Notes: c.Notes, HasPhoto: c.HasPhoto, Symptoms: []symptomResponse{}, Medications: []medicationResponse{}, Appointment: appointmentOf(c.Appointment)}
		for _, s := range c.Symptoms {
			rc.Symptoms = append(rc.Symptoms, symptomResponse(s))
		}
		for _, m := range c.Medications {
			rm := medicationResponse{Name: m.Name, FrequencyHours: m.FrequencyHours, DurationDays: m.DurationDays, StartTime: m.StartTime,
				EndedAt: stampPtr(m.EndedAt), Extensions: []extensionResponse{}, Doses: dosesResponse(m.Doses),
				FirstDoseAt: stampPtr(m.FirstDoseAt), LastDoseAt: stampPtr(m.LastDoseAt)}
			for _, e := range m.Extensions {
				rm.Extensions = append(rm.Extensions, extensionResponse{CreatedAt: stamp(e.CreatedAt), AddedDoses: e.AddedDoses})
			}
			if m.LastMark != nil {
				rm.LastMark = &markResponse{At: stamp(m.LastMark.At), By: m.LastMark.By}
			}
			rc.Medications = append(rc.Medications, rm)
		}
		out.Consultations = append(out.Consultations, rc)
	}
	for _, v := range d.Vaccinations {
		rv := vaccinationResponse{ID: v.ID.String(), Name: v.Name, Custom: v.Custom, DoseNumber: v.DoseNumber, AppliedOn: v.AppliedOn, Lot: v.Lot, Place: v.Place, Notes: v.Notes}
		if v.CorrectedAt != nil {
			rv.Corrected = &correctedResponse{At: stamp(*v.CorrectedAt), By: v.CorrectedBy}
		}
		out.Vaccinations = append(out.Vaccinations, rv)
	}
	if p := d.Photos; p != nil {
		out.Photos = &photosResponse{Consultations: []consultationPhotoResponse{}, Card: []cardPhotoResponse{}}
		for _, c := range p.Consultations {
			out.Photos.Consultations = append(out.Photos.Consultations, consultationPhotoResponse{ConsultationID: c.ConsultationID.String(),
				ConsultDate: c.ConsultDate.Format("2006-01-02"), DoctorName: c.DoctorName})
		}
		for _, c := range p.Card {
			out.Photos.Card = append(out.Photos.Card, cardPhotoResponse{ID: c.ID.String(), CreatedAt: stamp(c.CreatedAt)})
		}
	}
	return out
}

// actorOf is the session's account, for the error log (nil when unknown).
func actorOf(ctx context.Context) *uuid.UUID {
	if a, ok := access.FromContext(ctx); ok && a.ActorAccountID != uuid.Nil {
		id := a.ActorAccountID
		return &id
	}
	return nil
}

// Export handles POST /children/{childId}/export (specs/050, contracts/api.md).
//
//	@Summary		The data of a child's history PDF
//	@Description	Everything the history's PDF shows, in one read-only answer: the child, the consultations of the period with the record
//	@Description	of their doses (only counts), the running treatment, the next appointments and the whole vaccination card (the period
//	@Description	never narrows it). Photos are only listed; each one is asked for apart. The choice travels in the body, never in the
//	@Description	address. Part of the paid plan: a free family gets 422 "freemium_consultation_limit_exceeded" with reason "pdf_export"
//	@Description	and no data, even when only the card was asked for.
//	@Tags			history-export
//	@Accept			json
//	@Produce		json
//	@Param			childId	path		string			true	"Child UUID"
//	@Param			payload	body		exportRequest	true	"Period and sections"
//	@Success		200		{object}	documentResponse
//	@Failure		400		{object}	errorDoc		"Malformed body, an invalid period or no section"
//	@Failure		404		{object}	errorDoc		"No child exists for this id"
//	@Failure		422		{object}	planLimitDoc	"Free plan: the PDF is part of the paid plan"
//	@Security		ClerkSession
//	@Failure		401		{object}	errorDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorDoc	"The session has no access to this child"
//	@Router			/children/{childId}/export [post]
func (h *Handler) Export(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	childID, err := uuid.Parse(chi.URLParam(r, "childId"))
	if err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "child_not_found", "No child exists for this id", nil)
		return
	}
	var body exportRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusBadRequest, "validation_error", "Malformed JSON body", actorOf(ctx))
		return
	}
	req, errs := parseRequest(body)
	if len(errs) > 0 {
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, httpx.ValidationBody("One or more fields are invalid", errs), actorOf(ctx))
		return
	}
	doc, err := h.service.Build(ctx, childID, req)
	if err != nil {
		var plan *consultation.PlanLimitError
		switch {
		case errors.As(err, &plan):
			h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, map[string]string{
				"error": "freemium_consultation_limit_exceeded", "message": "Exporting the history to PDF is part of the paid plan", "reason": plan.Reason,
			}, actorOf(ctx))
		case errors.Is(err, ErrChildNotFound):
			h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "child_not_found", "No child exists for this id", actorOf(ctx))
		case errors.Is(err, consultation.ErrSymptomNotAvailable):
			h.responder.WriteJSON(ctx, w, http.StatusBadRequest, httpx.ValidationBody("One or more fields are invalid",
				[]httpx.FieldError{{Field: "period.filters.symptomCodes", Message: "symptom_not_available"}}), actorOf(ctx))
		default:
			h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not read the history", actorOf(ctx))
		}
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, toResponse(doc), actorOf(ctx))
}
