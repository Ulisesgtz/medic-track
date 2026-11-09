package growth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// Handler serves the growth record's routes. Every response goes through the Responder; the values and the note are only ever in
// JSON bodies, never in an address, a message or error_logs.
type Handler struct {
	service   *Service
	responder *httpx.Responder
}

// NewHandler creates a growth Handler.
func NewHandler(service *Service, responder *httpx.Responder) *Handler {
	return &Handler{service: service, responder: responder}
}

const maxGrowthBody = 16 << 10

type inputRequest struct {
	MeasuredOn string   `json:"measuredOn" example:"2026-11-03"`
	WeightKg   *float64 `json:"weightKg" example:"12.4"`
	HeightCm   *float64 `json:"heightCm" example:"86"`
	Note       *string  `json:"note" example:"en ayunas"`
} // @name GrowthMeasurementInput

type namedDoc struct {
	Name string `json:"name" example:"Ana"`
} // @name GrowthPersonName

type correctedDoc struct {
	At string   `json:"at" example:"2026-11-08T18:00:00Z"`
	By namedDoc `json:"by"`
} // @name GrowthCorrection

type measurementResponse struct {
	ID         string        `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	MeasuredOn string        `json:"measuredOn" example:"2026-11-03"`
	WeightKg   *float64      `json:"weightKg" example:"12.4"`
	HeightCm   *float64      `json:"heightCm" example:"86"`
	Note       *string       `json:"note"`
	CreatedBy  namedDoc      `json:"createdBy"`
	CreatedAt  string        `json:"createdAt" example:"2026-11-03T18:00:00Z"`
	Corrected  *correctedDoc `json:"corrected"`
} // @name GrowthMeasurement

type registeredDoc struct {
	WeightKg *float64 `json:"weightKg" example:"12"`
	HeightCm *float64 `json:"heightCm" example:"85"`
} // @name GrowthRegistered

type listResponse struct {
	Measurements []measurementResponse `json:"measurements"`
	// Registered is the weight and height written when the child was added, without a date (never drawn); null if none.
	Registered   *registeredDoc `json:"registered"`
	ReferenceSex *string        `json:"referenceSex" example:"male"`
	BirthDate    string         `json:"birthDate" example:"2025-06-10"`
	// CanEdit: the session can write down, correct and remove (the owner, a Tutor of a paid family).
	CanEdit bool `json:"canEdit"`
	// ChartAvailable: the family has the paid plan, so the chart answers.
	ChartAvailable bool `json:"chartAvailable"`
} // @name GrowthList

type sexRequest struct {
	Sex string `json:"sex" example:"female"`
} // @name GrowthReferenceInput

type chartPointDoc struct {
	MeasuredOn string  `json:"measuredOn" example:"2026-11-03"`
	Months     float64 `json:"months" example:"16.8"`
	Value      float64 `json:"value" example:"12.4"`
} // @name GrowthChartPoint

type curvePointDoc struct {
	Months int     `json:"months" example:"0"`
	P3     float64 `json:"p3" example:"2.5"`
	P15    float64 `json:"p15" example:"2.9"`
	P50    float64 `json:"p50" example:"3.3"`
	P85    float64 `json:"p85" example:"3.9"`
	P97    float64 `json:"p97" example:"4.3"`
} // @name GrowthCurvePoint

type curveDoc struct {
	MaxMonths int             `json:"maxMonths" example:"120"`
	Curves    []curvePointDoc `json:"curves"`
} // @name GrowthCurve

type referenceDoc struct {
	// Available is false while the WHO curves are switched off (WHO_GROWTH_REFERENCE_ENABLED); the curves are then empty.
	Available bool     `json:"available"`
	Source    string   `json:"source" example:"OMS: Patrones de Crecimiento Infantil (2006) y Referencia de Crecimiento 2007"`
	Weight    curveDoc `json:"weight"`
	Height    curveDoc `json:"height"`
} // @name GrowthReference

type chartPointsDoc struct {
	Weight []chartPointDoc `json:"weight"`
	Height []chartPointDoc `json:"height"`
} // @name GrowthChartPoints

type chartResponse struct {
	BirthDate    string         `json:"birthDate" example:"2025-06-10"`
	ReferenceSex *string        `json:"referenceSex" example:"male"`
	Points       chartPointsDoc `json:"points"`
	// Reference is null until a WHO table is chosen for the child.
	Reference *referenceDoc `json:"reference"`
} // @name GrowthChart

type errorDoc struct {
	Error   string `json:"error" example:"measurement_not_found"`
	Message string `json:"message"`
} // @name GrowthErrorResponse

type planLimitDoc struct {
	Error   string `json:"error" example:"freemium_consultation_limit_exceeded"`
	Message string `json:"message"`
	Reason  string `json:"reason" example:"growth_chart"`
} // @name GrowthPlanLimitResponse

type validationDoc struct {
	Error   string `json:"error" example:"validation_error"`
	Message string `json:"message"`
	Details []struct {
		Field   string `json:"field" example:"measuredOn"`
		Message string `json:"message"`
	} `json:"details"`
} // @name GrowthValidationResponse

// referenceSource is the citation the chart shows under the curves.
const referenceSource = "OMS: Patrones de Crecimiento Infantil (2006) y Referencia de Crecimiento 2007"

func formatTime(t time.Time) string { return t.UTC().Format(time.RFC3339) }

func toResponse(m Measurement) measurementResponse {
	out := measurementResponse{
		ID: m.ID.String(), MeasuredOn: m.MeasuredOn, WeightKg: m.WeightKg, HeightCm: m.HeightCm, Note: m.Note,
		CreatedBy: namedDoc{Name: m.CreatedByName}, CreatedAt: formatTime(m.CreatedAt),
	}
	if m.CorrectedAt != nil && m.CorrectedByName != nil {
		out.Corrected = &correctedDoc{At: formatTime(*m.CorrectedAt), By: namedDoc{Name: *m.CorrectedByName}}
	}
	return out
}

func sexPtr(s *Sex) *string {
	if s == nil {
		return nil
	}
	v := string(*s)
	return &v
}

func curve(r *Reference) curveDoc {
	out := curveDoc{MaxMonths: r.MaxMonths, Curves: make([]curvePointDoc, 0, len(r.Curves))}
	for _, p := range r.Curves {
		out.Curves = append(out.Curves, curvePointDoc{Months: p.Months, P3: p.P3, P15: p.P15, P50: p.P50, P85: p.P85, P97: p.P97})
	}
	return out
}

func points(ps []ChartPoint) []chartPointDoc {
	out := make([]chartPointDoc, 0, len(ps))
	for _, p := range ps {
		out = append(out, chartPointDoc{MeasuredOn: p.MeasuredOn, Months: p.Months, Value: p.Value})
	}
	return out
}

func inputOf(req inputRequest) Input {
	in := Input{MeasuredOn: req.MeasuredOn, WeightKg: req.WeightKg, HeightCm: req.HeightCm}
	if req.Note != nil {
		in.Note = *req.Note
	}
	return in
}

func accessOf(ctx context.Context) access.Access {
	a, _ := access.FromContext(ctx)
	return a
}

func actorPtr(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}

func (h *Handler) idParam(w http.ResponseWriter, r *http.Request, name, notFound string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, name))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, map[string]string{"error": notFound, "message": "Not found"}, nil)
		return uuid.Nil, false
	}
	return id, true
}

// writeError maps the domain errors to the contract's answers. The messages are fixed: none repeats what the parent wrote.
func (h *Handler) writeError(ctx context.Context, w http.ResponseWriter, err error, actor uuid.UUID, internalMessage string) {
	var verrs ValidationErrors
	switch {
	case errors.As(err, &verrs):
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, httpx.ValidationBody("Invalid measurement", verrs), actorPtr(actor))
	case errors.Is(err, ErrPlanRequired):
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, map[string]string{
			"error": "freemium_consultation_limit_exceeded", "message": "The growth chart is part of the paid plan", "reason": PlanLimitGrowthChart,
		}, actorPtr(actor))
	case errors.Is(err, ErrLimit):
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, map[string]string{
			"error": "growth_limit_exceeded", "message": "The child reached its limit of measurements", "limit": strconv.Itoa(MaxPerChild),
		}, actorPtr(actor))
	case errors.Is(err, ErrNotFound):
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, map[string]string{"error": "measurement_not_found", "message": "Measurement not found"}, actorPtr(actor))
	case errors.Is(err, ErrChildNotFound):
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, map[string]string{"error": "child_not_found", "message": "Child not found"}, actorPtr(actor))
	default:
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", internalMessage, actorPtr(actor))
	}
}

// ListMeasurements handles GET /children/{childId}/growth-measurements.
//
//	@Summary		A child's growth record: the measurements written down
//	@Description	The most recent first, with the signup's weight and height apart (no date) and the chosen WHO table. Every plan.
//	@Description	Nothing here says where a child stands.
//	@Tags			growth
//	@Produce		json
//	@Param			childId	path		string	true	"Child UUID"
//	@Success		200		{object}	listResponse
//	@Failure		404		{object}	errorDoc	"No child exists for this id"
//	@Security		ClerkSession
//	@Failure		401		{object}	errorDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorDoc	"The session has no access to this child"
//	@Router			/children/{childId}/growth-measurements [get]
func (h *Handler) ListMeasurements(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	childID, ok := h.idParam(w, r, "childId", "child_not_found")
	if !ok {
		return
	}
	a := accessOf(ctx)
	list, err := h.service.List(ctx, childID)
	if err != nil {
		h.writeError(ctx, w, err, a.ActorAccountID, "Could not list the measurements")
		return
	}
	out := listResponse{
		Measurements:   make([]measurementResponse, 0, len(list.Measurements)),
		ReferenceSex:   sexPtr(list.Child.Sex),
		BirthDate:      list.Child.BirthDate.Format("2006-01-02"),
		CanEdit:        a.Level >= access.Full,
		ChartAvailable: list.Child.Paid,
	}
	if list.Child.WeightKg != nil || list.Child.HeightCm != nil {
		out.Registered = &registeredDoc{WeightKg: list.Child.WeightKg, HeightCm: list.Child.HeightCm}
	}
	for _, m := range list.Measurements {
		out.Measurements = append(out.Measurements, toResponse(m))
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, out, actorPtr(a.ActorAccountID))
}

// CreateMeasurement handles POST /children/{childId}/growth-measurements.
//
//	@Summary		Write down a measurement
//	@Description	A date (not in the future, not before the birth) and the weight in kg (0.3–200, 2 decimals) and/or the height in cm
//	@Description	(30–220, 1 decimal), with an optional note (≤ 300). Every plan. 422 `growth_limit_exceeded` past 500 per child.
//	@Tags			growth
//	@Accept			json
//	@Produce		json
//	@Param			childId	path		string			true	"Child UUID"
//	@Param			payload	body		inputRequest	true	"The measurement"
//	@Success		201		{object}	measurementResponse
//	@Failure		400		{object}	validationDoc	"An invalid field or a malformed body"
//	@Failure		404		{object}	errorDoc		"No child exists for this id"
//	@Failure		422		{object}	errorDoc		"The cap of measurements (growth_limit_exceeded)"
//	@Security		ClerkSession
//	@Failure		401		{object}	errorDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorDoc	"The session can't write measurements for this child"
//	@Router			/children/{childId}/growth-measurements [post]
func (h *Handler) CreateMeasurement(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxGrowthBody)
	childID, ok := h.idParam(w, r, "childId", "child_not_found")
	if !ok {
		return
	}
	var req inputRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	actor := accessOf(ctx).ActorAccountID
	if actor == uuid.Nil {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not write the measurement", nil)
		return
	}
	m, err := h.service.Create(ctx, childID, actor, inputOf(req))
	if err != nil {
		h.writeError(ctx, w, err, actor, "Could not write the measurement")
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusCreated, toResponse(*m), actorPtr(actor))
}

// UpdateMeasurement handles PUT /children/{childId}/growth-measurements/{measurementId}.
//
//	@Summary		Correct a measurement
//	@Description	The whole measurement is sent and replaces the one saved; it keeps who corrected it last and when. Every plan.
//	@Tags			growth
//	@Accept			json
//	@Produce		json
//	@Param			childId			path		string			true	"Child UUID"
//	@Param			measurementId	path		string			true	"Measurement UUID"
//	@Param			payload			body		inputRequest	true	"The measurement"
//	@Success		200				{object}	measurementResponse
//	@Failure		404				{object}	errorDoc		"No such measurement for this child"
//	@Failure		400				{object}	validationDoc	"An invalid field or a malformed body"
//	@Security		ClerkSession
//	@Failure		401				{object}	errorDoc	"No valid Clerk session"
//	@Failure		403				{object}	errorDoc	"The session can't correct measurements of this child"
//	@Router			/children/{childId}/growth-measurements/{measurementId} [put]
func (h *Handler) UpdateMeasurement(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxGrowthBody)
	childID, ok := h.idParam(w, r, "childId", "child_not_found")
	if !ok {
		return
	}
	id, ok := h.idParam(w, r, "measurementId", "measurement_not_found")
	if !ok {
		return
	}
	var req inputRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	actor := accessOf(ctx).ActorAccountID
	if actor == uuid.Nil {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not correct the measurement", nil)
		return
	}
	m, err := h.service.Update(ctx, childID, id, actor, inputOf(req))
	if err != nil {
		h.writeError(ctx, w, err, actor, "Could not correct the measurement")
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, toResponse(*m), actorPtr(actor))
}

// DeleteMeasurement handles DELETE /children/{childId}/growth-measurements/{measurementId}.
//
//	@Summary		Remove a measurement for good
//	@Description	No trash and no undo. Every plan.
//	@Tags			growth
//	@Param			childId			path	string	true	"Child UUID"
//	@Param			measurementId	path	string	true	"Measurement UUID"
//	@Success		204
//	@Failure		404	{object}	errorDoc	"No such measurement for this child"
//	@Security		ClerkSession
//	@Failure		401	{object}	errorDoc	"No valid Clerk session"
//	@Failure		403	{object}	errorDoc	"The session can't remove measurements of this child"
//	@Router			/children/{childId}/growth-measurements/{measurementId} [delete]
func (h *Handler) DeleteMeasurement(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	childID, ok := h.idParam(w, r, "childId", "child_not_found")
	if !ok {
		return
	}
	id, ok := h.idParam(w, r, "measurementId", "measurement_not_found")
	if !ok {
		return
	}
	if err := h.service.Delete(ctx, childID, id); err != nil {
		h.writeError(ctx, w, err, accessOf(ctx).ActorAccountID, "Could not remove the measurement")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SetReference handles PUT /children/{childId}/growth-reference.
//
//	@Summary		Choose the child's WHO table (girls or boys)
//	@Description	Only to pick the WHO curves of the chart. Every plan.
//	@Tags			growth
//	@Accept			json
//	@Param			childId	path	string		true	"Child UUID"
//	@Param			payload	body	sexRequest	true	"female or male"
//	@Success		204
//	@Failure		404	{object}	errorDoc		"No child exists for this id"
//	@Failure		400	{object}	validationDoc	"Not female or male, or a malformed body"
//	@Security		ClerkSession
//	@Failure		401	{object}	errorDoc	"No valid Clerk session"
//	@Failure		403	{object}	errorDoc	"The session can't change this child"
//	@Router			/children/{childId}/growth-reference [put]
func (h *Handler) SetReference(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxGrowthBody)
	childID, ok := h.idParam(w, r, "childId", "child_not_found")
	if !ok {
		return
	}
	var req sexRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	actor := accessOf(ctx).ActorAccountID
	sex, ok := ValidSex(req.Sex)
	if !ok {
		h.writeError(ctx, w, ValidationErrors{{Field: "sex", Message: "Elige la tabla de niña o la de niño."}}, actor, "")
		return
	}
	if err := h.service.SetSex(ctx, childID, sex); err != nil {
		h.writeError(ctx, w, err, actor, "Could not save the WHO table")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetChart handles GET /children/{childId}/growth-chart.
//
//	@Summary		The growth chart: the child's points and the WHO reference curves (paid plan)
//	@Description	The plan is decided first: without the paid plan, 422 `freemium_consultation_limit_exceeded` with reason
//	@Description	`growth_chart` and no data. `reference` is null until a WHO table is chosen; `reference.available` is false (no
//	@Description	curves) while the WHO curves are switched off. Only the published P3–P97; never the child's percentile.
//	@Tags			growth
//	@Produce		json
//	@Param			childId	path		string	true	"Child UUID"
//	@Success		200		{object}	chartResponse
//	@Failure		404		{object}	errorDoc		"No child exists for this id"
//	@Failure		422		{object}	planLimitDoc	"The family is not on the paid plan"
//	@Security		ClerkSession
//	@Failure		401		{object}	errorDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorDoc	"The session has no access to this child"
//	@Router			/children/{childId}/growth-chart [get]
func (h *Handler) GetChart(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	childID, ok := h.idParam(w, r, "childId", "child_not_found")
	if !ok {
		return
	}
	actor := accessOf(ctx).ActorAccountID
	c, err := h.service.Chart(ctx, childID)
	if err != nil {
		h.writeError(ctx, w, err, actor, "Could not build the growth chart")
		return
	}
	out := chartResponse{
		BirthDate: c.BirthDate, ReferenceSex: sexPtr(c.Sex),
		Points: chartPointsDoc{Weight: points(c.Weight), Height: points(c.Height)},
	}
	if c.WeightReference != nil && c.HeightReference != nil {
		out.Reference = &referenceDoc{Available: c.ReferenceAvailable, Source: referenceSource, Weight: curve(c.WeightReference), Height: curve(c.HeightReference)}
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, out, actorPtr(actor))
}
