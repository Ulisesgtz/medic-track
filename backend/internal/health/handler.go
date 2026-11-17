package health

import (
	"net/http"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// Handler serves GET and HEAD /healthz. It writes only through Responder.WriteJSONUnlogged: nothing here is an error
// to record, and a monitor asking every minute must never fill error_logs.
type Handler struct {
	responder *httpx.Responder
	checker   *Checker
}

// NewHandler builds the handler.
func NewHandler(responder *httpx.Responder, checker *Checker) *Handler {
	return &Handler{responder: responder, checker: checker}
}

// StatusResponse is the 200 body.
type StatusResponse struct {
	Status  string `json:"status" example:"ok"`
	Version string `json:"version" example:"3e34a6799b24"`
}

// UnavailableResponse is the 503 body: no error text, no address, no version.
type UnavailableResponse struct {
	Status string `json:"status" example:"unavailable"`
}

// headWriter drops the body of a HEAD answer while the Responder writes it as usual.
type headWriter struct{ http.ResponseWriter }

func (headWriter) Write(p []byte) (int, error) { return len(p), nil }

// Health godoc
// @Summary      Service health
// @Description  200 when the process is alive and the database answers within 2 s; 503 otherwise. Public, never limited, never logged.
// @Tags         health
// @Produce      json
// @Success      200 {object} StatusResponse
// @Failure      503 {object} UnavailableResponse
// @Router       /healthz [get]
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	out := http.ResponseWriter(w)
	if r.Method == http.MethodHead {
		out = headWriter{w}
	}
	if h.checker.Healthy(r.Context()) {
		h.responder.WriteJSONUnlogged(out, http.StatusOK, StatusResponse{Status: "ok", Version: h.checker.Version()})
		return
	}
	h.responder.WriteJSONUnlogged(out, http.StatusServiceUnavailable, UnavailableResponse{Status: "unavailable"})
}
