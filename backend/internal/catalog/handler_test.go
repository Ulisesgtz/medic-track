package catalog_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/catalog"
)

func newTestRouter(t *testing.T) http.Handler {
	pool := testPool(t)
	repo := catalog.NewRepository(pool)
	h := catalog.NewHandler(repo)

	r := chi.NewRouter()
	r.Get("/catalog/countries", h.ListCountries)
	r.Get("/catalog/countries/{countryCode}/states", h.ListStates)
	return r
}

func TestHandler_ListCountries(t *testing.T) {
	router := newTestRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/catalog/countries", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)

	var body []map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.NotEmpty(t, body)
}

func TestHandler_InternalErrors(t *testing.T) {
	dsn := testDSN(t)
	repo := catalog.NewRepository(closedPool(t, dsn))
	h := catalog.NewHandler(repo)

	r := chi.NewRouter()
	r.Get("/catalog/countries", h.ListCountries)
	r.Get("/catalog/countries/{countryCode}/states", h.ListStates)

	t.Run("ListCountries", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/catalog/countries", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusInternalServerError, rec.Code)
	})

	t.Run("ListStates - country existence check fails", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/catalog/countries/MX/states", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestHandler_ListStates(t *testing.T) {
	tests := []struct {
		name       string
		path       string
		wantStatus int
	}{
		{name: "existing country", path: "/catalog/countries/MX/states", wantStatus: http.StatusOK},
		{name: "non-existing country", path: "/catalog/countries/ZZ/states", wantStatus: http.StatusNotFound},
	}

	router := newTestRouter(t)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			require.Equal(t, tt.wantStatus, rec.Code)
		})
	}
}
