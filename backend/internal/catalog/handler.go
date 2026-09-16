package catalog

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// Handler exposes the read-only catalog HTTP endpoints.
type Handler struct {
	repo      *Repository
	responder *httpx.Responder
}

// NewHandler creates a catalog Handler backed by the given repository.
func NewHandler(repo *Repository, responder *httpx.Responder) *Handler {
	return &Handler{repo: repo, responder: responder}
}

type countryResponse struct {
	Code string `json:"code" example:"MX"`
	Name string `json:"name" example:"México"`
}

type stateResponse struct {
	Code string `json:"code" example:"MX-JAL"`
	Name string `json:"name" example:"Jalisco"`
}

// notFoundResponseDoc documents the {error, message} shape used by
// internal/httpx.WriteJSONError.
type notFoundResponseDoc struct {
	Error   string `json:"error" example:"country_not_found"`
	Message string `json:"message" example:"Country not found in catalog"`
} // @name NotFoundResponse

// ListCountries handles GET /catalog/countries.
//
//	@Summary	List countries
//	@Description	Read-only catalog used to populate the país selector (contracts/get-catalog.md).
//	@Tags		catalog
//	@Produce	json
//	@Success	200	{array}		countryResponse
//	@Failure	500	{object}	notFoundResponseDoc	"Unexpected server error"
//	@Router		/catalog/countries [get]
func (h *Handler) ListCountries(w http.ResponseWriter, r *http.Request) {
	countries, err := h.repo.ListCountries(r.Context())
	if err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not load countries", nil)
		return
	}

	resp := make([]countryResponse, 0, len(countries))
	for _, c := range countries {
		resp = append(resp, countryResponse{Code: c.Code, Name: c.Name})
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, resp, nil)
}

// ListStates handles GET /catalog/countries/{countryCode}/states.
//
//	@Summary	List states/provinces for a country
//	@Description	Used to populate the estado selector. Returns an empty array if the country
//	@Description	has no subdivisions in the catalog (contracts/get-catalog.md).
//	@Tags		catalog
//	@Produce	json
//	@Param		countryCode	path		string	true	"ISO country code"	example(MX)
//	@Success	200			{array}		stateResponse
//	@Failure	404			{object}	notFoundResponseDoc	"countryCode not found in catalog"
//	@Failure	500			{object}	notFoundResponseDoc	"Unexpected server error"
//	@Router		/catalog/countries/{countryCode}/states [get]
func (h *Handler) ListStates(w http.ResponseWriter, r *http.Request) {
	countryCode := chi.URLParam(r, "countryCode")

	exists, err := h.repo.CountryExists(r.Context(), countryCode)
	if err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not verify country", nil)
		return
	}
	if !exists {
		h.responder.WriteJSONError(r.Context(), w, http.StatusNotFound, "country_not_found", "Country not found in catalog", nil)
		return
	}

	states, err := h.repo.ListStatesByCountry(r.Context(), countryCode)
	if err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not load states", nil)
		return
	}

	resp := make([]stateResponse, 0, len(states))
	for _, s := range states {
		resp = append(resp, stateResponse{Code: s.Code, Name: s.Name})
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, resp, nil)
}
