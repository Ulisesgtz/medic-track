// Package httpx holds the shared HTTP response mechanism used by every
// handler package, so the JSON error envelope shape — and, per
// specs/002-registro-log-errores, the automatic error logging hook — are
// defined in exactly one place.
package httpx

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"runtime"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
)

// Recorder persists an error log entry. Satisfied by *errorlog.Repository;
// kept as an interface here (consumer-defined, per the project's Go
// conventions) so httpx doesn't depend on how entries are actually stored.
type Recorder interface {
	Create(ctx context.Context, e *errorlog.Entry) error
}

// recordTimeout bounds the background write so a slow/unavailable database
// can never pile up goroutines.
const recordTimeout = 2 * time.Second

// Responder writes JSON HTTP responses and, for every 4xx/5xx response,
// automatically records an errorlog.Entry via the injected Recorder — no
// handler has to call anything extra to get a response logged (FR-001,
// FR-006 of specs/002-registro-log-errores).
type Responder struct {
	recorder Recorder
}

// NewResponder creates a Responder backed by the given Recorder.
func NewResponder(recorder Recorder) *Responder {
	return &Responder{recorder: recorder}
}

// WriteJSON writes body as a JSON response with the given status code. If
// status is a 4xx/5xx, it also records an error log entry in the
// background — this is the single choke point every error response (even
// ones with a custom body shape beyond {error, message}) passes through.
func (r *Responder) WriteJSON(ctx context.Context, w http.ResponseWriter, status int, body any, accountID *uuid.UUID) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)

	if status >= 400 {
		r.record(ctx, status, extractMessage(body, status), accountID)
	}
}

// WriteJSONError writes a {"error": code, "message": message} JSON body and
// records an error log entry (see WriteJSON).
func (r *Responder) WriteJSONError(ctx context.Context, w http.ResponseWriter, status int, code, message string, accountID *uuid.UUID) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": code, "message": message})

	r.record(ctx, status, message, accountID)
}

// record captures the call site of whichever public method invoked it
// (skip=2: 0=record's own frame, 1=WriteJSON/WriteJSONError's frame,
// 2=their caller) and persists the entry in a detached background
// goroutine, so a failing or slow database NEVER delays or breaks the HTTP
// response that has already been written (FR-005, SC-004).
func (r *Responder) record(ctx context.Context, status int, message string, accountID *uuid.UUID) {
	_, file, line, ok := runtime.Caller(2)
	if !ok {
		file, line = "unknown", 0
	}

	endpoint := endpointFromContext(ctx)
	httpStatus := status

	go func() {
		recordCtx, cancel := context.WithTimeout(context.Background(), recordTimeout)
		defer cancel()

		entry := &errorlog.Entry{
			Message:    message,
			HTTPStatus: &httpStatus,
			Endpoint:   endpoint,
			File:       file,
			Line:       line,
			AccountID:  accountID,
		}
		if err := r.recorder.Create(recordCtx, entry); err != nil {
			log.Printf("httpx: failed to record error log entry: %v", err)
		}
	}()
}

// endpointFromContext prefers chi's templated route pattern (e.g.
// "/catalog/countries/{countryCode}/states") over the literal request path,
// so entries group by endpoint rather than fragmenting by parameter value
// (see research.md). Falls back to the literal path when no route context
// is available (e.g. a unit test calling the Responder directly).
func endpointFromContext(ctx context.Context) string {
	if rc := chi.RouteContext(ctx); rc != nil {
		if pattern := rc.RoutePattern(); pattern != "" {
			return pattern
		}
	}
	return ""
}

// extractMessage best-effort pulls a "message" field out of an arbitrary
// response body, since several error responses carry a custom shape beyond
// {error, message} (e.g. the freemium-limit 422 also has limit/received).
func extractMessage(body any, status int) string {
	switch b := body.(type) {
	case map[string]string:
		if m, ok := b["message"]; ok {
			return m
		}
	case map[string]any:
		if m, ok := b["message"].(string); ok {
			return m
		}
	}
	return http.StatusText(status)
}
