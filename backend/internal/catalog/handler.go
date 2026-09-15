package catalog

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// Handler exposes the read-only catalog HTTP endpoints.
type Handler struct {
	repo *Repository
}

// NewHandler creates a catalog Handler backed by the given repository.
func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

type countryResponse struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type stateResponse struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

// ListCountries handles GET /catalog/countries.
func (h *Handler) ListCountries(w http.ResponseWriter, r *http.Request) {
	countries, err := h.repo.ListCountries(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "internal_error", "Could not load countries")
		return
	}

	resp := make([]countryResponse, 0, len(countries))
	for _, c := range countries {
		resp = append(resp, countryResponse{Code: c.Code, Name: c.Name})
	}
	writeJSON(w, http.StatusOK, resp)
}

// ListStates handles GET /catalog/countries/{countryCode}/states.
func (h *Handler) ListStates(w http.ResponseWriter, r *http.Request) {
	countryCode := chi.URLParam(r, "countryCode")

	exists, err := h.repo.CountryExists(r.Context(), countryCode)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "internal_error", "Could not verify country")
		return
	}
	if !exists {
		writeJSONError(w, http.StatusNotFound, "country_not_found", "Country not found in catalog")
		return
	}

	states, err := h.repo.ListStatesByCountry(r.Context(), countryCode)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "internal_error", "Could not load states")
		return
	}

	resp := make([]stateResponse, 0, len(states))
	for _, s := range states {
		resp = append(resp, stateResponse{Code: s.Code, Name: s.Name})
	}
	writeJSON(w, http.StatusOK, resp)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeJSONError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"error": code, "message": message})
}
