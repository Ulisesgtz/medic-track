package ops

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

const (
	defaultLimit = 100
	maxLimit     = 500
	// defaultPeriod is how far back a query looks when it names no `since`.
	defaultPeriod = 7 * 24 * time.Hour
)

// Reader is what the queries read (satisfied by *errorlog.Repository).
type Reader interface {
	List(ctx context.Context, f errorlog.Filter) ([]errorlog.Entry, bool, error)
	Summary(ctx context.Context, f errorlog.Filter) ([]errorlog.SummaryRow, error)
}

// Handler answers the operation queries. Every route it serves must sit behind RequireKey.
type Handler struct {
	reader    Reader
	responder *httpx.Responder
	now       func() time.Time
}

// NewHandler creates the Handler.
func NewHandler(reader Reader, responder *httpx.Responder) *Handler {
	return &Handler{reader: reader, responder: responder, now: time.Now}
}

type entryResponse struct {
	ID         string  `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	CreatedAt  string  `json:"createdAt" example:"2026-09-30T14:02:11Z"`
	Message    string  `json:"message" example:"email is required"`
	HTTPStatus *int    `json:"httpStatus" example:"400"`
	Endpoint   string  `json:"endpoint" example:"/accounts"`
	File       string  `json:"file" example:"internal/account/handler.go"`
	Line       int     `json:"line" example:"88"`
	AccountID  *string `json:"accountId" example:"a1b2c3d4-0000-0000-0000-000000000000"`
} // @name ErrorLogEntry

type listResponse struct {
	Entries []entryResponse `json:"entries"`
	// NextCursor is null on the last page.
	NextCursor *string `json:"nextCursor" example:"MTc5MDc3MDAwMDAwMDAwMDAwMC5hMWIyYzNkNA"`
} // @name ErrorLogListResponse

type summaryGroupResponse struct {
	Endpoint   string `json:"endpoint" example:"/accounts"`
	HTTPStatus *int   `json:"httpStatus" example:"400"`
	Message    string `json:"message" example:"email is required"`
	Count      int    `json:"count" example:"42"`
	FirstSeen  string `json:"firstSeen" example:"2026-09-24T10:00:00Z"`
	LastSeen   string `json:"lastSeen" example:"2026-09-30T13:58:02Z"`
} // @name ErrorLogSummaryGroup

type summaryResponse struct {
	Groups []summaryGroupResponse `json:"groups"`
} // @name ErrorLogSummaryResponse

type validationErrorDoc struct {
	Error   string `json:"error" example:"validation_error"`
	Message string `json:"message" example:"One or more fields are invalid"`
	Details []struct {
		Field   string `json:"field" example:"limit"`
		Message string `json:"message" example:"must be a whole number from 1 to 500"`
	} `json:"details"`
} // @name ErrorLogValidationError

// parse reads the filters every query shares, and the paging of the list. It answers with the problems found, never
// reading the table when there is one.
func (h *Handler) parse(r *http.Request, forList bool) (errorlog.Filter, []httpx.FieldError) {
	q := r.URL.Query()
	var f errorlog.Filter
	var errs []httpx.FieldError
	bad := func(field, msg string) { errs = append(errs, httpx.FieldError{Field: field, Message: msg}) }

	since := h.now().Add(-defaultPeriod)
	sinceGiven := false
	f.Since = since
	if v := q.Get("since"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			bad("since", "must be an RFC 3339 date and time")
		} else {
			f.Since, sinceGiven = t, true
		}
	}
	if v := q.Get("until"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			bad("until", "must be an RFC 3339 date and time")
		} else {
			f.Until = t
			if !sinceGiven {
				// Only an `until`: the default period is the one that ends there, not the last 7 days from now.
				f.Since = t.Add(-defaultPeriod)
			} else if !f.Until.After(f.Since) && len(errs) == 0 {
				bad("until", "must be after since")
			}
		}
	}
	f.Endpoint = q.Get("endpoint")
	f.EndpointPrefix = q.Get("endpointPrefix")
	if f.Endpoint != "" && f.EndpointPrefix != "" {
		bad("endpointPrefix", "cannot be combined with endpoint")
	}
	if v := q.Get("status"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			bad("status", "must be a whole number")
		} else {
			f.Status = &n
		}
	}
	if v := q.Get("accountId"); v != "" {
		id, err := uuid.Parse(v)
		if err != nil {
			bad("accountId", "must be a UUID")
		} else {
			f.AccountID = &id
		}
	}
	if forList {
		f.Limit = defaultLimit
		if v := q.Get("limit"); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil || n < 1 || n > maxLimit {
				bad("limit", "must be a whole number from 1 to 500")
			} else {
				f.Limit = n
			}
		}
		if v := q.Get("cursor"); v != "" {
			c, err := decodeCursor(v)
			if err != nil {
				bad("cursor", "is not a valid cursor")
			} else {
				f.After = &c
			}
		}
	}
	return f, errs
}

func (h *Handler) invalid(w http.ResponseWriter, r *http.Request, errs []httpx.FieldError) {
	h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, httpx.ValidationBody("One or more fields are invalid", errs), nil)
}

// ListErrorLogs handles GET /ops/error-logs (specs/021-consulta-y-retencion-error-logs/contracts/ops-error-logs.md).
//
//	@Summary		List the registered errors, newest first
//	@Description	For the team that runs the service, not for parents: needs the operation key (`Authorization: Bearer
//	@Description	<OPS_API_KEY>`), and the route does not exist when the server has none. A wrong or missing key gets the
//	@Description	same 404 as an unknown route. Filters by period (default: the last 7 days), endpoint (exact or prefix such as
//	@Description	`job:`), status and account; paged by cursor (100 by default, at most 500).
//	@Tags			operations
//	@Produce		json
//	@Param			since			query		string	false	"RFC 3339; default: 7 days ago"
//	@Param			until			query		string	false	"RFC 3339; default: no upper bound"
//	@Param			endpoint		query		string	false	"Exact endpoint, e.g. /accounts or job:reminders"
//	@Param			endpointPrefix	query		string	false	"Endpoint prefix, e.g. job:"
//	@Param			status			query		int		false	"HTTP status"
//	@Param			accountId		query		string	false	"Account UUID"
//	@Param			limit			query		int		false	"1 to 500; default 100"
//	@Param			cursor			query		string	false	"nextCursor of the previous page"
//	@Success		200				{object}	listResponse
//	@Failure		400				{object}	validationErrorDoc
//	@Security		OpsKey
//	@Router			/ops/error-logs [get]
func (h *Handler) ListErrorLogs(w http.ResponseWriter, r *http.Request) {
	f, errs := h.parse(r, true)
	if len(errs) > 0 {
		h.invalid(w, r, errs)
		return
	}
	entries, more, err := h.reader.List(r.Context(), f)
	if err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not read the error log", nil)
		return
	}
	out := listResponse{Entries: make([]entryResponse, 0, len(entries))}
	for _, e := range entries {
		var account *string
		if e.AccountID != nil {
			s := e.AccountID.String()
			account = &s
		}
		out.Entries = append(out.Entries, entryResponse{
			ID:         e.ID.String(),
			CreatedAt:  e.CreatedAt.UTC().Format(time.RFC3339),
			Message:    e.Message,
			HTTPStatus: e.HTTPStatus,
			Endpoint:   e.Endpoint,
			File:       e.File,
			Line:       e.Line,
			AccountID:  account,
		})
	}
	if more {
		last := entries[len(entries)-1]
		next := encodeCursor(errorlog.Cursor{CreatedAt: last.CreatedAt, ID: last.ID})
		out.NextCursor = &next
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, out, nil)
}

// ErrorLogSummary handles GET /ops/error-logs/summary.
//
//	@Summary		Summarize the registered errors of a period
//	@Description	Groups by endpoint, status and message with how often each happened and when first and last; the most
//	@Description	frequent first (the most recent breaks a tie), up to 100 groups. Same key and filters as the list.
//	@Tags			operations
//	@Produce		json
//	@Param			since			query		string	false	"RFC 3339; default: 7 days ago"
//	@Param			until			query		string	false	"RFC 3339; default: no upper bound"
//	@Param			endpoint		query		string	false	"Exact endpoint"
//	@Param			endpointPrefix	query		string	false	"Endpoint prefix, e.g. job:"
//	@Param			status			query		int		false	"HTTP status"
//	@Param			accountId		query		string	false	"Account UUID"
//	@Success		200				{object}	summaryResponse
//	@Failure		400				{object}	validationErrorDoc
//	@Security		OpsKey
//	@Router			/ops/error-logs/summary [get]
func (h *Handler) ErrorLogSummary(w http.ResponseWriter, r *http.Request) {
	f, errs := h.parse(r, false)
	if len(errs) > 0 {
		h.invalid(w, r, errs)
		return
	}
	rows, err := h.reader.Summary(r.Context(), f)
	if err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not summarize the error log", nil)
		return
	}
	out := summaryResponse{Groups: make([]summaryGroupResponse, 0, len(rows))}
	for _, s := range rows {
		out.Groups = append(out.Groups, summaryGroupResponse{
			Endpoint:   s.Endpoint,
			HTTPStatus: s.HTTPStatus,
			Message:    s.Message,
			Count:      s.Count,
			FirstSeen:  s.FirstSeen.UTC().Format(time.RFC3339),
			LastSeen:   s.LastSeen.UTC().Format(time.RFC3339),
		})
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, out, nil)
}
