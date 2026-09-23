package server_test

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw/authmwtest"
	"github.com/Ulisesgtz/medic-track/backend/internal/catalog"
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/ownership"
	"github.com/Ulisesgtz/medic-track/backend/internal/server"
)

type noopRecorder struct{}

func (noopRecorder) Create(context.Context, *errorlog.Entry) error { return nil }

// world is two tutors, each with a child and a consultation, behind the real
// router: what one session can and cannot reach of the other's data.
type world struct {
	router   http.Handler
	verifier *authmwtest.Verifier

	clerkA, clerkB string
	accountA       uuid.UUID
	childA         uuid.UUID
	consultationA  uuid.UUID
	doseA          uuid.UUID
}

func newWorld(t *testing.T) *world {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	responder := httpx.NewResponder(noopRecorder{})
	verifier := authmwtest.NewVerifier(t, responder)

	accountRepo := account.NewRepository(pool)
	consultationSvc := consultation.NewService(consultation.NewRepository(pool))

	suffix := time.Now().UnixNano()
	w := &world{
		verifier: verifier,
		clerkA:   fmt.Sprintf("user_router_a_%d", suffix),
		clerkB:   fmt.Sprintf("user_router_b_%d", suffix),
	}
	create := func(clerkID, name string) *account.Account {
		acc := &account.Account{
			FirstName: name, LastName: "Prueba", Email: fmt.Sprintf("%s.%d@example.com", name, suffix),
			Plan: account.PlanFree, ClerkUserID: &clerkID,
			Children: []account.Child{{FirstName: "Hijo", LastName: name, BirthDate: time.Now().AddDate(-5, 0, 0)}},
		}
		require.NoError(t, accountRepo.Create(context.Background(), acc))
		return acc
	}
	a := create(w.clerkA, "Ana")
	create(w.clerkB, "Beto")
	w.accountA, w.childA = a.ID, a.Children[0].ID

	start := "08:00"
	c, err := consultationSvc.CreateConsultation(context.Background(), w.childA, consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: time.Now(), Photo: []byte("fake-jpeg-bytes"),
		Medications: []consultation.CreateMedicationInput{{Name: "Amoxicilina", FrequencyHours: 8, DurationDays: 3, StartTime: &start}},
	})
	require.NoError(t, err)
	w.consultationA = c.ID
	w.doseA = c.Medications[0].Doses[0].ID

	w.router = server.NewRouter(server.Deps{
		Responder:      responder,
		Catalog:        catalog.NewHandler(catalog.NewRepository(pool), responder),
		Account:        account.NewHandler(account.NewService(accountRepo), responder),
		Consultation:   consultation.NewHandler(consultationSvc, responder),
		Ownership:      ownership.NewRepository(pool),
		FrontendOrigin: "http://localhost:5173",
		RequireSession: verifier.Middleware,
	})
	return w
}

func (w *world) do(t *testing.T, method, path, token, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	w.router.ServeHTTP(rec, req)
	return rec
}

// A route per resource kind, all of them owned by tutor A.
func (w *world) routes() []struct {
	name, method, path, body string
	ownerStatus              int
} {
	window := "?from=2026-01-15T00:00:00Z&to=2026-01-16T00:00:00Z"
	return []struct {
		name, method, path, body string
		ownerStatus              int
	}{
		{"get account", http.MethodGet, "/accounts/" + w.accountA.String(), "", http.StatusOK},
		{"add child", http.MethodPost, "/accounts/" + w.accountA.String() + "/children", `{}`, http.StatusBadRequest},
		{"list consultations", http.MethodGet, "/children/" + w.childA.String() + "/consultations", "", http.StatusOK},
		{"child overview", http.MethodGet, "/children/" + w.childA.String() + "/overview" + window, "", http.StatusOK},
		{"create consultation", http.MethodPost, "/children/" + w.childA.String() + "/consultations", `{}`, http.StatusBadRequest},
		{"get consultation", http.MethodGet, "/consultations/" + w.consultationA.String(), "", http.StatusOK},
		{"mark dose", http.MethodPatch, "/consultations/" + w.consultationA.String() + "/doses/" + w.doseA.String(), `{"taken":true}`, http.StatusOK},
	}
}

func TestRouter_EveryProtectedRouteNeedsASession(t *testing.T) {
	w := newWorld(t)
	for _, rt := range w.routes() {
		t.Run(rt.name, func(t *testing.T) {
			require.Equal(t, http.StatusUnauthorized, w.do(t, rt.method, rt.path, "", rt.body).Code)
			require.Equal(t, http.StatusUnauthorized, w.do(t, rt.method, rt.path, "not-a-real-jwt", rt.body).Code)
		})
	}
	for _, path := range []string{"/accounts/me"} {
		require.Equal(t, http.StatusUnauthorized, w.do(t, http.MethodGet, path, "", "").Code, path)
	}
	require.Equal(t, http.StatusUnauthorized, w.do(t, http.MethodPost, "/accounts", "", `{}`).Code)
}

func TestRouter_AnotherTutorsSessionGets403OnEveryRoute(t *testing.T) {
	w := newWorld(t)
	tokenB := w.verifier.Token(t, w.clerkB)
	for _, rt := range w.routes() {
		t.Run(rt.name, func(t *testing.T) {
			rec := w.do(t, rt.method, rt.path, tokenB, rt.body)
			require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
			require.Contains(t, rec.Body.String(), `"forbidden"`)
		})
	}
}

func TestRouter_ASessionWithoutAnAccountGets403(t *testing.T) {
	w := newWorld(t)
	token := w.verifier.Token(t, "user_router_without_account")
	for _, rt := range w.routes() {
		t.Run(rt.name, func(t *testing.T) {
			require.Equal(t, http.StatusForbidden, w.do(t, rt.method, rt.path, token, rt.body).Code)
		})
	}
}

func TestRouter_NonexistentResourcesAreForbiddenNotNotFound(t *testing.T) {
	w := newWorld(t)
	tokenA := w.verifier.Token(t, w.clerkA)
	for _, path := range []string{
		"/accounts/" + uuid.NewString(),
		"/children/" + uuid.NewString() + "/consultations",
		"/consultations/" + uuid.NewString(),
	} {
		require.Equal(t, http.StatusForbidden, w.do(t, http.MethodGet, path, tokenA, "").Code, path)
	}
}

func TestRouter_TheOwnerReachesTheHandler(t *testing.T) {
	w := newWorld(t)
	tokenA := w.verifier.Token(t, w.clerkA)
	for _, rt := range w.routes() {
		t.Run(rt.name, func(t *testing.T) {
			rec := w.do(t, rt.method, rt.path, tokenA, rt.body)
			require.Equal(t, rt.ownerStatus, rec.Code, rec.Body.String())
		})
	}
}

func TestRouter_MalformedIDsFallThroughToTheHandlersOwn404(t *testing.T) {
	w := newWorld(t)
	tokenA := w.verifier.Token(t, w.clerkA)
	for _, path := range []string{"/accounts/not-a-uuid", "/children/not-a-uuid/consultations", "/consultations/not-a-uuid"} {
		require.Equal(t, http.StatusNotFound, w.do(t, http.MethodGet, path, tokenA, "").Code, path)
	}
}

func TestRouter_TheCatalogStaysPublic(t *testing.T) {
	w := newWorld(t)
	require.Equal(t, http.StatusOK, w.do(t, http.MethodGet, "/catalog/countries", "", "").Code)
}
