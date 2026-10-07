package supplement

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

// Handler serves the routines' routes (specs/033, contracts/routines.md). Every response goes through the Responder, so
// every 4xx/5xx is logged to error_logs — and nothing the parent typed (name, note) is ever in a message or an address.
type Handler struct {
	service   *Service
	responder *httpx.Responder
}

// NewHandler creates a routines Handler.
func NewHandler(service *Service, responder *httpx.Responder) *Handler {
	return &Handler{service: service, responder: responder}
}

const maxBodyBytes = 64 << 10

type takenByResponse struct {
	Name string `json:"name" example:"Ana"`
	At   string `json:"at" example:"2026-10-05T14:05:00Z"`
	// Mine: the session's own account marked it.
	Mine bool `json:"mine" example:"false"`
} // @name SupplementTakenByResponse

type doseResponse struct {
	ID          string `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	ScheduledAt string `json:"scheduledAt" example:"2026-10-05T14:00:00Z"`
	Taken       bool   `json:"taken" example:"false"`
	// Status is derived by the server with its own clock: pending, due, taken or unregistered ("sin registrar").
	Status  string           `json:"status" enums:"pending,due,taken,unregistered" example:"due"`
	TakenBy *takenByResponse `json:"takenBy"`
} // @name SupplementDoseResponse

type progressResponse struct {
	Taken   int `json:"taken" example:"12"`
	Elapsed int `json:"elapsed" example:"13"`
	Total   int `json:"total" example:"14"`
} // @name SupplementProgressResponse

type routineResponse struct {
	ID            string   `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	ChildID       *string  `json:"childId" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	Name          string   `json:"name" example:"Vitamina D"`
	Note          string   `json:"note" example:""`
	Period        string   `json:"period" enums:"daily,weekdays,interval" example:"daily"`
	Times         []string `json:"times" example:"08:00"`
	Weekdays      []int    `json:"weekdays" example:"0,2,4"`
	IntervalHours *int     `json:"intervalHours" example:"8"`
	FirstDate     string   `json:"firstDate" example:"2026-10-01"`
	FirstTime     *string  `json:"firstTime" example:"06:00"`
	EndDate       *string  `json:"endDate" example:"2026-10-20"`
	Status        string   `json:"status" enums:"active,paused,ended" example:"active"`
	PausedAt      *string  `json:"pausedAt"`
	EndedAt       *string  `json:"endedAt"`
	// CreatedBy is the first name of who created it (never an e-mail).
	CreatedBy string `json:"createdBy" example:"Ana"`
	CreatedAt string `json:"createdAt" example:"2026-10-01T14:00:00Z"`
	// CanEdit: the session can do everything AND the owner's plan is paid (so the app doesn't offer a button that would answer 422/403).
	CanEdit  bool             `json:"canEdit" example:"true"`
	Progress progressResponse `json:"progress"`
	Doses    []doseResponse   `json:"doses"`
	// NextDose: the next dose ahead of the window, only for an active routine with no dose in it.
	NextDose *doseResponse `json:"nextDose"`
} // @name SupplementRoutineResponse

type routineListResponse struct {
	Routines    []routineResponse `json:"routines"`
	ActiveCount int               `json:"activeCount" example:"3"`
	Limit       int               `json:"limit" example:"10"`
	PaidPlan    bool              `json:"paidPlan" example:"true"`
} // @name SupplementRoutineListResponse

type createRoutineRequest struct {
	Name             string   `json:"name" example:"Vitamina D"`
	Note             string   `json:"note" example:""`
	Period           string   `json:"period" enums:"daily,weekdays,interval" example:"daily"`
	Times            []string `json:"times" example:"08:00"`
	Weekdays         []int    `json:"weekdays" example:"0,2,4"`
	IntervalHours    *int     `json:"intervalHours" example:"8"`
	FirstDate        string   `json:"firstDate" example:"2026-10-05"`
	FirstTime        *string  `json:"firstTime" example:"06:00"`
	EndDate          *string  `json:"endDate" example:"2026-10-20"`
	UtcOffsetMinutes int      `json:"utcOffsetMinutes" example:"-360"`
} // @name SupplementRoutineRequest

type updateDoseRequest struct {
	Taken bool `json:"taken" example:"true"`
} // @name SupplementUpdateDoseRequest

type errorDoc struct {
	Error   string `json:"error" example:"forbidden"`
	Message string `json:"message"`
} // @name SupplementErrorResponse

type validationDoc struct {
	Error   string `json:"error" example:"validation_error"`
	Message string `json:"message"`
	Details []struct {
		Field   string `json:"field" example:"times"`
		Message string `json:"message"`
	} `json:"details"`
} // @name SupplementValidationResponse

type planLimitDoc struct {
	Error   string `json:"error" example:"freemium_consultation_limit_exceeded"`
	Message string `json:"message"`
	// Reason is "supplements" (creating, editing and resuming routines are the paid plan's).
	Reason string `json:"reason" example:"supplements"`
} // @name SupplementPlanLimitResponse

type routineLimitDoc struct {
	Error   string `json:"error" example:"routine_limit_exceeded"`
	Message string `json:"message"`
	Limit   int    `json:"limit" example:"10"`
} // @name SupplementRoutineLimitResponse

func formatTime(t time.Time) string { return t.UTC().Format(time.RFC3339) }

func optTime(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := formatTime(*t)
	return &s
}

func optString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// actorOf is the session's own account for the request (what RequireAccess found), uuid.Nil when unknown.
func actorOf(ctx context.Context) uuid.UUID {
	if a, ok := access.FromContext(ctx); ok {
		return a.ActorAccountID
	}
	return uuid.Nil
}

func toDoseResponse(d Dose, actor uuid.UUID) doseResponse {
	out := doseResponse{ID: d.ID.String(), ScheduledAt: formatTime(d.ScheduledAt), Taken: d.Taken, Status: string(d.Status)}
	if d.TakenBy != nil {
		out.TakenBy = &takenByResponse{Name: d.TakenBy.Name, At: formatTime(d.TakenBy.At), Mine: actor != uuid.Nil && d.TakenBy.AccountID == actor}
	}
	return out
}

func toRoutineResponse(v RoutineView, level access.Level, actor uuid.UUID) routineResponse {
	out := routineResponse{
		ID: v.ID.String(), Name: v.Name, Note: v.Note, Period: string(v.Period), Times: v.Times, Weekdays: v.Weekdays,
		FirstDate: v.FirstDate, FirstTime: optString(v.FirstTime), EndDate: optString(v.EndDate), Status: string(v.Status),
		PausedAt: optTime(v.PausedAt), EndedAt: optTime(v.EndedAt), CreatedBy: v.CreatedBy, CreatedAt: formatTime(v.CreatedAt),
		CanEdit:  level == access.Full && v.PaidPlan,
		Progress: progressResponse{Taken: v.Progress.Taken, Elapsed: v.Progress.Elapsed, Total: v.Progress.Total},
		Doses:    make([]doseResponse, 0, len(v.Doses)),
	}
	if v.ChildID != nil {
		s := v.ChildID.String()
		out.ChildID = &s
	}
	if out.Times == nil {
		out.Times = []string{}
	}
	if out.Weekdays == nil {
		out.Weekdays = []int{}
	}
	if v.IntervalHours > 0 {
		h := v.IntervalHours
		out.IntervalHours = &h
	}
	for _, d := range v.Doses {
		out.Doses = append(out.Doses, toDoseResponse(d, actor))
	}
	if v.NextDose != nil {
		n := toDoseResponse(*v.NextDose, actor)
		out.NextDose = &n
	}
	return out
}

func levelOf(ctx context.Context) access.Level {
	if a, ok := access.FromContext(ctx); ok {
		return a.Level
	}
	return access.None
}

func routineNotFoundBody() map[string]string {
	return map[string]string{"error": "routine_not_found", "message": "Routine not found"}
}

func childNotFoundBody() map[string]string {
	return map[string]string{"error": "child_not_found", "message": "Child not found"}
}

func doseNotFoundBody() map[string]string {
	return map[string]string{"error": "dose_not_found", "message": "Dose not found"}
}

func validationBody(errs ValidationErrors) map[string]any {
	fields := make([]httpx.FieldError, 0, len(errs))
	for _, e := range errs {
		fields = append(fields, httpx.FieldError{Field: e.Field, Message: e.Message})
	}
	return httpx.ValidationBody("One or more fields are invalid", fields)
}

func planLimitBody(reason string) map[string]string {
	return map[string]string{
		"error":   "freemium_consultation_limit_exceeded",
		"message": "Supplement routines are part of the paid plan",
		"reason":  reason,
	}
}

func routineLimitBody(limit int) map[string]any {
	return map[string]any{"error": "routine_limit_exceeded", "message": "The child already has the maximum of active routines", "limit": limit}
}

// parseWindow reads the RFC 3339 from/to of a read; the field errors are the contract's.
func parseWindow(r *http.Request) (time.Time, time.Time, ValidationErrors) {
	var errs ValidationErrors
	from, err := time.Parse(time.RFC3339, r.URL.Query().Get("from"))
	if err != nil {
		errs = append(errs, ValidationError{Field: "from", Message: "must be an RFC 3339 timestamp"})
	}
	to, err := time.Parse(time.RFC3339, r.URL.Query().Get("to"))
	if err != nil {
		errs = append(errs, ValidationError{Field: "to", Message: "must be an RFC 3339 timestamp"})
	}
	return from, to, errs
}

// ListRoutines handles GET /children/{childId}/routines.
//
//	@Summary		A child's supplement routines
//	@Description	Lists the child's routines — active first, then paused and ended — each with only the doses of [from, to)
//	@Description	(the parent's local day, at most 48 hours), its progress and, for an active routine with nothing in the
//	@Description	window, its next dose. Reading never depends on the plan.
//	@Tags			supplements
//	@Produce		json
//	@Param			childId	path		string	true	"Child UUID"
//	@Param			from	query		string	true	"Window start, RFC 3339"
//	@Param			to		query		string	true	"Window end (exclusive), RFC 3339"
//	@Success		200		{object}	routineListResponse
//	@Failure		400		{object}	validationDoc	"Missing or invalid window"
//	@Failure		404		{object}	errorDoc		"No child exists for this id"
//	@Security		ClerkSession
//	@Failure		401		{object}	errorDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorDoc	"The session has no access to this child"
//	@Router			/children/{childId}/routines [get]
func (h *Handler) ListRoutines(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	childID, err := uuid.Parse(chi.URLParam(r, "childId"))
	if err != nil {
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, childNotFoundBody(), nil)
		return
	}
	from, to, errs := parseWindow(r)
	if errs.HasErrors() {
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationBody(errs), nil)
		return
	}
	list, err := h.service.List(ctx, childID, from, to)
	if err != nil {
		var verrs ValidationErrors
		switch {
		case errors.Is(err, ErrChildNotFound):
			h.responder.WriteJSON(ctx, w, http.StatusNotFound, childNotFoundBody(), nil)
		case errors.As(err, &verrs):
			h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationBody(verrs), nil)
		default:
			h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not list routines", nil)
		}
		return
	}
	level, actor := levelOf(ctx), actorOf(ctx)
	resp := routineListResponse{Routines: make([]routineResponse, 0, len(list.Routines)), ActiveCount: list.ActiveCount, Limit: MaxActivePerChild, PaidPlan: list.PaidPlan}
	for _, v := range list.Routines {
		resp.Routines = append(resp.Routines, toRoutineResponse(v, level, actor))
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, resp, nil)
}

// CreateRoutine handles POST /children/{childId}/routines.
//
//	@Summary		Create a supplement routine
//	@Description	Saves the routine the parent wrote, exactly as written, and generates its first doses. Part of the paid
//	@Description	plan (the server decides): a free account gets 422 "freemium_consultation_limit_exceeded" with reason
//	@Description	"supplements"; a child with 10 active routines gets 422 "routine_limit_exceeded".
//	@Tags			supplements
//	@Accept			json
//	@Produce		json
//	@Param			childId	path		string					true	"Child UUID"
//	@Param			payload	body		createRoutineRequest	true	"The routine"
//	@Success		201		{object}	routineResponse
//	@Failure		400		{object}	validationDoc		"An invalid field"
//	@Failure		404		{object}	errorDoc			"No child exists for this id"
//	@Failure		422		{object}	planLimitDoc		"Free plan, or the child has the maximum of active routines (routineLimitDoc)"
//	@Security		ClerkSession
//	@Failure		401		{object}	errorDoc	"No valid Clerk session"
//	@Failure		403		{object}	errorDoc	"The session can't create routines for this child"
//	@Router			/children/{childId}/routines [post]
func (h *Handler) CreateRoutine(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	childID, err := uuid.Parse(chi.URLParam(r, "childId"))
	if err != nil {
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, childNotFoundBody(), nil)
		return
	}
	var req createRoutineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	actor := actorOf(ctx)
	if actor == uuid.Nil {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not create routine", nil)
		return
	}
	view, err := h.service.Create(ctx, childID, Input(req), actor)
	if err != nil {
		var verrs ValidationErrors
		var planErr *PlanLimitError
		var limitErr *RoutineLimitError
		switch {
		case errors.As(err, &verrs):
			h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationBody(verrs), actorPtr(actor))
		case errors.As(err, &planErr):
			h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, planLimitBody(planErr.Reason), actorPtr(actor))
		case errors.As(err, &limitErr):
			h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, routineLimitBody(limitErr.Limit), actorPtr(actor))
		case errors.Is(err, ErrChildNotFound):
			h.responder.WriteJSON(ctx, w, http.StatusNotFound, childNotFoundBody(), actorPtr(actor))
		default:
			h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not create routine", actorPtr(actor))
		}
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusCreated, toRoutineResponse(*view, levelOf(ctx), actor), nil)
}

func actorPtr(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}

// GetRoutine handles GET /routines/{routineId}.
//
//	@Summary		A supplement routine with its doses
//	@Description	The routine with the doses of [from, to) (one calendar month, at most 62 days) and its progress.
//	@Tags			supplements
//	@Produce		json
//	@Param			routineId	path		string	true	"Routine UUID"
//	@Param			from		query		string	true	"Window start, RFC 3339"
//	@Param			to			query		string	true	"Window end (exclusive), RFC 3339"
//	@Success		200			{object}	routineResponse
//	@Failure		400			{object}	validationDoc	"Missing or invalid window"
//	@Failure		404			{object}	errorDoc		"No routine exists for this id"
//	@Security		ClerkSession
//	@Failure		401			{object}	errorDoc	"No valid Clerk session"
//	@Failure		403			{object}	errorDoc	"The session has no access to this routine"
//	@Router			/routines/{routineId} [get]
func (h *Handler) GetRoutine(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	routineID, err := uuid.Parse(chi.URLParam(r, "routineId"))
	if err != nil {
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, routineNotFoundBody(), nil)
		return
	}
	from, to, errs := parseWindow(r)
	if errs.HasErrors() {
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationBody(errs), nil)
		return
	}
	view, err := h.service.Get(ctx, routineID, from, to)
	if err != nil {
		var verrs ValidationErrors
		switch {
		case errors.Is(err, ErrRoutineNotFound):
			h.responder.WriteJSON(ctx, w, http.StatusNotFound, routineNotFoundBody(), nil)
		case errors.As(err, &verrs):
			h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationBody(verrs), nil)
		default:
			h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not load the routine", nil)
		}
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, toRoutineResponse(*view, levelOf(ctx), actorOf(ctx)), nil)
}

// UpdateDose handles PATCH /routines/{routineId}/doses/{doseId}.
//
//	@Summary		Mark or unmark a routine's dose
//	@Description	Marking: the first mark wins and records who marked it and when. Unmarking: only who marked it, or someone
//	@Description	who can do everything. It never depends on the plan.
//	@Tags			supplements
//	@Accept			json
//	@Produce		json
//	@Param			routineId	path		string				true	"Routine UUID"
//	@Param			doseId		path		string				true	"Dose UUID"
//	@Param			payload		body		updateDoseRequest	true	"New taken status"
//	@Success		200			{object}	doseResponse
//	@Failure		404			{object}	errorDoc	"No such dose in this routine"
//	@Security		ClerkSession
//	@Failure		401			{object}	errorDoc	"No valid Clerk session"
//	@Failure		403			{object}	errorDoc	"No access to the routine, or the mark is someone else's"
//	@Router			/routines/{routineId}/doses/{doseId} [patch]
func (h *Handler) UpdateDose(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	routineID, err := uuid.Parse(chi.URLParam(r, "routineId"))
	if err != nil {
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, doseNotFoundBody(), nil)
		return
	}
	doseID, err := uuid.Parse(chi.URLParam(r, "doseId"))
	if err != nil {
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, doseNotFoundBody(), nil)
		return
	}
	var req updateDoseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}
	got, ok := access.FromContext(ctx)
	if !ok {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not update dose", nil)
		return
	}
	dose, err := h.service.MarkDose(ctx, routineID, doseID, req.Taken, Actor{AccountID: got.ActorAccountID, Full: got.Level == access.Full})
	if err != nil {
		switch {
		case errors.Is(err, ErrDoseNotFound):
			h.responder.WriteJSON(ctx, w, http.StatusNotFound, doseNotFoundBody(), nil)
		case errors.Is(err, ErrDoseForbidden):
			h.responder.WriteJSONError(ctx, w, http.StatusForbidden, "forbidden", "Only who marked a dose, or a tutor, can unmark it", nil)
		default:
			h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not update dose", nil)
		}
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, toDoseResponse(*dose, got.ActorAccountID), nil)
}
