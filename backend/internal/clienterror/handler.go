package clienterror

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// maxBodyBytes is the largest body a report may have (contract).
const maxBodyBytes = 2 << 10

// recordTimeout bounds the background write so a slow database never piles up goroutines (the same as httpx).
const recordTimeout = 2 * time.Second

// Recorder persists an error log entry; satisfied by *errorlog.Repository.
type Recorder interface {
	Create(ctx context.Context, e *errorlog.Entry) error
}

// Handler serves POST /client-errors.
type Handler struct {
	responder *httpx.Responder
	recorder  Recorder
	throttle  *throttle
	spawn     func(func())
}

// NewHandler builds the handler. The responder writes the answers; the recorder writes the row.
func NewHandler(responder *httpx.Responder, recorder Recorder) *Handler {
	return &Handler{responder: responder, recorder: recorder, throttle: newThrottle(time.Now), spawn: func(f func()) { go f() }}
}

// Submit godoc
// @Summary      Report an error of the app
// @Description  Public (no session; Authorization is ignored). The app reports what failed on a phone or a browser: a kind, a cleaned message, the screen pattern (never a real address), the browser family and the version. It is written to error_logs as `client:<screen>` with no account. Always 204 when the body is valid, even if the server's cap left the row out. Bodies over 2 KiB: 413. Its own per-address limit answers 429.
// @Tags         client-errors
// @Accept       json
// @Param        body body Report true "The report"
// @Success      204
// @Failure      400 {object} map[string]string "invalid_client_error"
// @Failure      413 {object} map[string]string "body_too_large"
// @Failure      429 {object} map[string]string "too_many_requests"
// @Router       /client-errors [post]
func (h *Handler) Submit(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	var tooBig *http.MaxBytesError
	if errors.As(err, &tooBig) {
		h.responder.WriteJSONErrorUnlogged(w, http.StatusRequestEntityTooLarge, "body_too_large", "The report is too large")
		return
	}
	var report Report
	if err != nil || decode(body, &report) != nil || report.Validate() != nil {
		h.responder.WriteJSONErrorUnlogged(w, http.StatusBadRequest, "invalid_client_error", "The report is not valid")
		return
	}

	h.write(report)
	h.responder.WriteNoContent(w)
}

// decode reads exactly one JSON object with the fields of Report and nothing else.
func decode(body []byte, into *Report) error {
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	if err := dec.Decode(into); err != nil {
		return err
	}
	if _, err := dec.Token(); err != io.EOF {
		return fmt.Errorf("data after the report")
	}
	return nil
}

// write keeps the report's row unless the server's cap leaves it out; it never blocks the answer.
func (h *Handler) write(report Report) {
	clean := Clean(report.Message)
	ok, suppressed := h.throttle.admit(report.groupKeyOf(clean))
	if !ok {
		return
	}
	tail := ""
	if suppressed > 0 {
		tail = fmt.Sprintf(" (+%d más desde la última)", suppressed)
	}
	entry := &errorlog.Entry{
		Message:  report.rowMessage(clean, tail),
		Endpoint: report.Endpoint(),
		File:     rowFile,
		Line:     rowLine,
	}
	h.spawn(func() {
		ctx, cancel := context.WithTimeout(context.Background(), recordTimeout)
		defer cancel()
		if err := h.recorder.Create(ctx, entry); err != nil {
			log.Printf("clienterror: failed to record the report: %v", err)
		}
	})
}
