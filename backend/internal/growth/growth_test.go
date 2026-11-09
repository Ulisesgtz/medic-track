package growth_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw/authmwtest"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/growth"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

func closedPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	require.NoError(t, err)
	pool.Close()
	return pool
}

// capture keeps what the Responder would write to error_logs.
type capture struct {
	mu      sync.Mutex
	entries []errorlog.Entry
}

func (c *capture) Create(_ context.Context, e *errorlog.Entry) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = append(c.entries, *e)
	return nil
}

func (c *capture) all() []errorlog.Entry {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]errorlog.Entry(nil), c.entries...)
}

type family struct {
	accountID, childID uuid.UUID
	birth              time.Time
}

// newFamily is an owner account (Ana) with one child born two years ago, with the signup's weight and height.
func newFamily(t *testing.T, pool *pgxpool.Pool, plan account.Plan) family {
	t.Helper()
	suffix := fmt.Sprintf("%d.%s", time.Now().UnixNano(), uuid.NewString()[:6])
	birth := time.Now().UTC().AddDate(-2, 0, 0)
	acc := &account.Account{
		FirstName: "Ana", LastName: "Prueba", Email: "growth." + suffix + "@example.com", Plan: plan,
		Children: []account.Child{{FirstName: "Mateo", LastName: "Prueba", BirthDate: birth, Height: f(85), Weight: f(12)}},
	}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))
	return family{accountID: acc.ID, childID: acc.Children[0].ID, birth: birth}
}

func day(t time.Time) string { return t.Format("2006-01-02") }

func TestRepository_TheRecordFromStartToEnd(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	fam := newFamily(t, pool, account.PlanFree)
	svc := growth.NewService(growth.NewRepository(pool))

	// A free family writes down, corrects and removes: only the chart is the paid plan's.
	old, err := svc.Create(ctx, fam.childID, fam.accountID, growth.Input{MeasuredOn: day(fam.birth.AddDate(0, 6, 0)), WeightKg: f(7.9), HeightCm: f(67.5)})
	require.NoError(t, err)
	recent, err := svc.Create(ctx, fam.childID, fam.accountID, growth.Input{MeasuredOn: day(fam.birth.AddDate(1, 0, 0)), WeightKg: f(124), Note: "en ayunas"})
	require.NoError(t, err)
	require.Equal(t, "Ana", recent.CreatedByName)
	require.Nil(t, recent.CorrectedAt)

	list, err := svc.List(ctx, fam.childID)
	require.NoError(t, err)
	require.Len(t, list.Measurements, 2)
	require.Equal(t, recent.ID, list.Measurements[0].ID, "newest first")
	require.Equal(t, 12.0, *list.Child.WeightKg, "the signup's weight, apart")
	require.False(t, list.Child.Paid)
	require.Nil(t, list.Child.Sex)

	fixed, err := svc.Update(ctx, fam.childID, recent.ID, fam.accountID, growth.Input{MeasuredOn: recent.MeasuredOn, WeightKg: f(12.4)})
	require.NoError(t, err)
	require.Equal(t, 12.4, *fixed.WeightKg)
	require.Nil(t, fixed.Note, "the whole measurement is replaced")
	require.Equal(t, "Ana", *fixed.CorrectedByName)
	require.NotNil(t, fixed.CorrectedAt)

	require.NoError(t, svc.Delete(ctx, fam.childID, old.ID))
	require.ErrorIs(t, svc.Delete(ctx, fam.childID, old.ID), growth.ErrNotFound)
	_, err = svc.Update(ctx, fam.childID, old.ID, fam.accountID, growth.Input{MeasuredOn: recent.MeasuredOn, WeightKg: f(10)})
	require.ErrorIs(t, err, growth.ErrNotFound)

	// Another child's measurement is not found through this child.
	other := newFamily(t, pool, account.PlanPaid)
	require.ErrorIs(t, svc.Delete(ctx, other.childID, recent.ID), growth.ErrNotFound)
	_, err = svc.Update(ctx, other.childID, recent.ID, other.accountID, growth.Input{MeasuredOn: day(time.Now()), WeightKg: f(10)})
	require.ErrorIs(t, err, growth.ErrNotFound)

	// The date can't be before the birth (the service reads it).
	_, err = svc.Create(ctx, fam.childID, fam.accountID, growth.Input{MeasuredOn: day(fam.birth.AddDate(0, 0, -1)), WeightKg: f(3)})
	var verrs growth.ValidationErrors
	require.ErrorAs(t, err, &verrs)

	// An unknown child.
	_, err = svc.List(ctx, uuid.New())
	require.ErrorIs(t, err, growth.ErrChildNotFound)
	_, err = svc.Create(ctx, uuid.New(), fam.accountID, growth.Input{MeasuredOn: day(time.Now()), WeightKg: f(10)})
	require.ErrorIs(t, err, growth.ErrChildNotFound)
	require.ErrorIs(t, svc.SetSex(ctx, uuid.New(), growth.Male), growth.ErrChildNotFound)
}

func TestChart_ThePlanFirstThenThePointsAndTheCurves(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := growth.NewService(growth.NewRepository(pool))

	free := newFamily(t, pool, account.PlanFree)
	_, err := svc.Create(ctx, free.childID, free.accountID, growth.Input{MeasuredOn: day(time.Now()), WeightKg: f(12)})
	require.NoError(t, err)
	_, err = svc.Chart(ctx, free.childID)
	require.ErrorIs(t, err, growth.ErrPlanRequired)
	_, err = svc.Chart(ctx, uuid.New())
	require.ErrorIs(t, err, growth.ErrChildNotFound)

	paid := newFamily(t, pool, account.PlanPaid)
	_, err = svc.Create(ctx, paid.childID, paid.accountID, growth.Input{MeasuredOn: day(paid.birth.AddDate(1, 0, 0)), WeightKg: f(9.6), HeightCm: f(75)})
	require.NoError(t, err)
	_, err = svc.Create(ctx, paid.childID, paid.accountID, growth.Input{MeasuredOn: day(paid.birth.AddDate(0, 2, 0)), HeightCm: f(58)})
	require.NoError(t, err)

	c, err := svc.Chart(ctx, paid.childID)
	require.NoError(t, err)
	require.Nil(t, c.Sex)
	require.Nil(t, c.WeightReference, "no WHO table chosen: no curves")
	require.Len(t, c.Weight, 1)
	require.Len(t, c.Height, 2)
	require.Less(t, c.Height[0].Months, c.Height[1].Months, "in the order of time")
	require.Equal(t, 58.0, c.Height[0].Value)

	require.NoError(t, svc.SetSex(ctx, paid.childID, growth.Female))
	c, err = svc.Chart(ctx, paid.childID)
	require.NoError(t, err)
	require.Equal(t, growth.Female, *c.Sex)
	require.False(t, c.ReferenceAvailable)
	require.Empty(t, c.WeightReference.Curves, "switched off until WHO's permission")
	require.Equal(t, 120, c.WeightReference.MaxMonths)

	svc.SetReferenceEnabled(true)
	c, err = svc.Chart(ctx, paid.childID)
	require.NoError(t, err)
	require.True(t, c.ReferenceAvailable)
	require.Len(t, c.WeightReference.Curves, 121)
	require.Len(t, c.HeightReference.Curves, 229)
	require.Equal(t, 3.2, c.WeightReference.Curves[0].P50, "girls")
}

func TestCreate_TheCapHoldsWithSimultaneousRequests(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	fam := newFamily(t, pool, account.PlanPaid)
	_, err := pool.Exec(ctx, `
		INSERT INTO growth_measurements (child_id, account_id, measured_on, weight_kg, created_by_account_id)
		SELECT $1, $2, current_date, 10, $2 FROM generate_series(1, $3)`, fam.childID, fam.accountID, growth.MaxPerChild-3)
	require.NoError(t, err)
	repo := growth.NewRepository(pool)
	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := repo.Create(ctx, fam.childID, fam.accountID, growth.Cleaned{MeasuredOn: time.Now(), WeightKg: f(11)})
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	limited := 0
	for err := range errs {
		if err != nil {
			require.ErrorIs(t, err, growth.ErrLimit)
			limited++
		}
	}
	require.Equal(t, 5, limited)
	var n int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM growth_measurements WHERE child_id = $1`, fam.childID).Scan(&n))
	require.Equal(t, growth.MaxPerChild, n)
}

func TestRepository_ADatabaseFailureIsAnError(t *testing.T) {
	testPool(t)
	ctx := context.Background()
	repo := growth.NewRepository(closedPool(t))
	_, err := repo.Child(ctx, uuid.New())
	require.Error(t, err)
	require.NotErrorIs(t, err, growth.ErrChildNotFound)
	_, err = repo.List(ctx, uuid.New())
	require.Error(t, err)
	_, err = repo.Create(ctx, uuid.New(), uuid.New(), growth.Cleaned{})
	require.Error(t, err)
	_, err = repo.Update(ctx, uuid.New(), uuid.New(), uuid.New(), growth.Cleaned{})
	require.Error(t, err)
	require.Error(t, repo.Delete(ctx, uuid.New(), uuid.New()))
	require.Error(t, repo.SetSex(ctx, uuid.New(), growth.Male))
	svc := growth.NewService(repo)
	_, err = svc.Chart(ctx, uuid.New())
	require.Error(t, err)
	_, err = svc.List(ctx, uuid.New())
	require.Error(t, err)
}

// --- the handler, behind a stand-in of the access middleware ---

type env struct {
	router http.Handler
	log    *capture
	fam    family
	pool   *pgxpool.Pool
}

func newEnv(t *testing.T, plan account.Plan, level access.Level, pool *pgxpool.Pool) *env {
	t.Helper()
	if pool == nil {
		pool = testPool(t)
	}
	e := &env{log: &capture{}, pool: pool}
	if level != 0 {
		e.fam = newFamily(t, testPool(t), plan)
	}
	svc := growth.NewService(growth.NewRepository(pool))
	svc.SetReferenceEnabled(true)
	h := growth.NewHandler(svc, httpx.NewResponder(e.log))
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(access.WithAccess(req.Context(), access.Access{Level: level, ActorAccountID: e.fam.accountID})))
		})
	})
	r.Get("/children/{childId}/growth-measurements", h.ListMeasurements)
	r.Post("/children/{childId}/growth-measurements", h.CreateMeasurement)
	r.Put("/children/{childId}/growth-measurements/{measurementId}", h.UpdateMeasurement)
	r.Delete("/children/{childId}/growth-measurements/{measurementId}", h.DeleteMeasurement)
	r.Put("/children/{childId}/growth-reference", h.SetReference)
	r.Get("/children/{childId}/growth-chart", h.GetChart)
	e.router = r
	return e
}

func (e *env) do(t *testing.T, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, req)
	return rec
}

func TestHandler_TheContract(t *testing.T) {
	e := newEnv(t, account.PlanPaid, access.Full, nil)
	base := "/children/" + e.fam.childID.String()
	today := day(time.Now())

	created := e.do(t, http.MethodPost, base+"/growth-measurements", `{"measuredOn":"`+today+`","weightKg":12.4,"heightCm":86,"note":"tos leve"}`)
	require.Equal(t, http.StatusCreated, created.Code, created.Body.String())
	var m struct {
		ID        string
		WeightKg  float64
		CreatedBy struct{ Name string }
		Corrected *struct{}
	}
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &m))
	require.Equal(t, 12.4, m.WeightKg)
	require.Equal(t, "Ana", m.CreatedBy.Name)
	require.Nil(t, m.Corrected)

	list := e.do(t, http.MethodGet, base+"/growth-measurements", "")
	require.Equal(t, http.StatusOK, list.Code)
	var l struct {
		Measurements   []json.RawMessage
		Registered     *struct{ WeightKg, HeightCm float64 }
		ReferenceSex   *string
		BirthDate      string
		CanEdit        bool
		ChartAvailable bool
	}
	require.NoError(t, json.Unmarshal(list.Body.Bytes(), &l))
	require.Len(t, l.Measurements, 1)
	require.Equal(t, 85.0, l.Registered.HeightCm)
	require.Nil(t, l.ReferenceSex)
	require.Equal(t, day(e.fam.birth), l.BirthDate)
	require.True(t, l.CanEdit)
	require.True(t, l.ChartAvailable)

	corrected := e.do(t, http.MethodPut, base+"/growth-measurements/"+m.ID, `{"measuredOn":"`+today+`","heightCm":86.5}`)
	require.Equal(t, http.StatusOK, corrected.Code, corrected.Body.String())
	require.Contains(t, corrected.Body.String(), `"corrected":{"at":`)

	chart := e.do(t, http.MethodGet, base+"/growth-chart", "")
	require.Equal(t, http.StatusOK, chart.Code)
	require.Contains(t, chart.Body.String(), `"reference":null`)

	require.Equal(t, http.StatusNoContent, e.do(t, http.MethodPut, base+"/growth-reference", `{"sex":"male"}`).Code)
	chart = e.do(t, http.MethodGet, base+"/growth-chart", "")
	var c struct {
		ReferenceSex string
		Points       struct{ Weight, Height []struct{ Value float64 } }
		Reference    struct {
			Available bool
			Source    string
			Weight    struct {
				MaxMonths int
				Curves    []map[string]float64
			}
		}
	}
	require.NoError(t, json.Unmarshal(chart.Body.Bytes(), &c))
	require.Equal(t, "male", c.ReferenceSex)
	require.Empty(t, c.Points.Weight, "the corrected measurement has only the height")
	require.Equal(t, 86.5, c.Points.Height[0].Value)
	require.True(t, c.Reference.Available)
	require.Contains(t, c.Reference.Source, "OMS")
	require.Equal(t, 120, c.Reference.Weight.MaxMonths)
	require.Equal(t, map[string]float64{"months": 0, "p3": 2.5, "p15": 2.9, "p50": 3.3, "p85": 3.9, "p97": 4.3}, c.Reference.Weight.Curves[0])
	require.NotContains(t, strings.ToLower(chart.Body.String()), "percentile\"", "never a percentile of the child")

	require.Equal(t, http.StatusNoContent, e.do(t, http.MethodDelete, base+"/growth-measurements/"+m.ID, "").Code)
	require.Equal(t, http.StatusNotFound, e.do(t, http.MethodDelete, base+"/growth-measurements/"+m.ID, "").Code)
}

func TestHandler_TheErrors(t *testing.T) {
	e := newEnv(t, account.PlanFree, access.Full, nil)
	base := "/children/" + e.fam.childID.String()

	plan := e.do(t, http.MethodGet, base+"/growth-chart", "")
	require.Equal(t, http.StatusUnprocessableEntity, plan.Code)
	require.JSONEq(t, `{"error":"freemium_consultation_limit_exceeded","message":"The growth chart is part of the paid plan","reason":"growth_chart"}`, plan.Body.String())

	bad := e.do(t, http.MethodPost, base+"/growth-measurements", `{"measuredOn":"2999-01-01","weightKg":500,"note":"secreto del niño"}`)
	require.Equal(t, http.StatusBadRequest, bad.Code)
	require.Contains(t, bad.Body.String(), `"field":"measuredOn"`)
	require.Contains(t, bad.Body.String(), `"field":"weightKg"`)

	require.Equal(t, http.StatusBadRequest, e.do(t, http.MethodPost, base+"/growth-measurements", `{`).Code)
	require.Equal(t, http.StatusBadRequest, e.do(t, http.MethodPut, base+"/growth-measurements/"+uuid.NewString(), `{`).Code)
	require.Equal(t, http.StatusBadRequest, e.do(t, http.MethodPut, base+"/growth-reference", `{`).Code)
	require.Equal(t, http.StatusBadRequest, e.do(t, http.MethodPut, base+"/growth-reference", `{"sex":"otro"}`).Code)
	require.Equal(t, http.StatusNotFound, e.do(t, http.MethodPut, base+"/growth-measurements/"+uuid.NewString(), `{"measuredOn":"`+day(time.Now())+`","weightKg":10}`).Code)
	require.Equal(t, http.StatusNotFound, e.do(t, http.MethodGet, "/children/nope/growth-measurements", "").Code)
	require.Equal(t, http.StatusNotFound, e.do(t, http.MethodDelete, base+"/growth-measurements/nope", "").Code)
	unknown := "/children/" + uuid.NewString()
	require.Equal(t, http.StatusNotFound, e.do(t, http.MethodGet, unknown+"/growth-measurements", "").Code)
	require.Equal(t, http.StatusNotFound, e.do(t, http.MethodGet, unknown+"/growth-chart", "").Code)
	require.Equal(t, http.StatusNotFound, e.do(t, http.MethodPut, unknown+"/growth-reference", `{"sex":"female"}`).Code)

	// The cap.
	_, err := e.pool.Exec(context.Background(), `
		INSERT INTO growth_measurements (child_id, account_id, measured_on, weight_kg, created_by_account_id)
		SELECT $1, $2, current_date, 10, $2 FROM generate_series(1, $3)`, e.fam.childID, e.fam.accountID, growth.MaxPerChild)
	require.NoError(t, err)
	capped := e.do(t, http.MethodPost, base+"/growth-measurements", `{"measuredOn":"`+day(time.Now())+`","weightKg":10}`)
	require.Equal(t, http.StatusUnprocessableEntity, capped.Code)
	require.Contains(t, capped.Body.String(), `"growth_limit_exceeded"`)

	time.Sleep(50 * time.Millisecond)
	for _, entry := range e.log.all() {
		require.NotContains(t, entry.Message, "secreto", "the note never reaches error_logs")
		require.NotContains(t, entry.Message, "500")
	}
}

func TestHandler_ACaregiverSeesWithoutEditingAndNoActorIsAnInternalError(t *testing.T) {
	e := newEnv(t, account.PlanPaid, access.Mark, nil)
	list := e.do(t, http.MethodGet, "/children/"+e.fam.childID.String()+"/growth-measurements", "")
	require.Equal(t, http.StatusOK, list.Code)
	require.Contains(t, list.Body.String(), `"canEdit":false`)

	// Without an actor in the context (the middleware always sets one) writing is a 500, never a write without an author.
	none := newEnv(t, account.PlanPaid, 0, nil)
	body := `{"measuredOn":"` + day(time.Now()) + `","weightKg":10}`
	require.Equal(t, http.StatusInternalServerError, none.do(t, http.MethodPost, "/children/"+uuid.NewString()+"/growth-measurements", body).Code)
	require.Equal(t, http.StatusInternalServerError, none.do(t, http.MethodPut, "/children/"+uuid.NewString()+"/growth-measurements/"+uuid.NewString(), body).Code)

	// A database failure is a 500.
	broken := newEnv(t, account.PlanPaid, access.Full, closedPool(t))
	require.Equal(t, http.StatusInternalServerError, broken.do(t, http.MethodGet, "/children/"+uuid.NewString()+"/growth-measurements", "").Code)
}

// --- by role, on the real family tables and access levels (the router's own pair of middlewares) ---

func TestRoles_TheRecordByRole(t *testing.T) {
	pool := testPool(t)
	responder := httpx.NewResponder(&capture{})
	verifier := authmwtest.NewVerifier(t, responder)
	suffix := fmt.Sprintf("%d.%s", time.Now().UnixNano(), uuid.NewString()[:6])
	repo := account.NewRepository(pool)
	create := func(name string, plan account.Plan, children int) (*account.Account, string) {
		clerk := fmt.Sprintf("user_growth_%s_%s", name, suffix)
		acc := &account.Account{FirstName: name, LastName: "Prueba", Email: fmt.Sprintf("growth.%s.%s@example.com", name, suffix), Plan: plan, ClerkUserID: &clerk}
		for i := 0; i < children; i++ {
			acc.Children = append(acc.Children, account.Child{FirstName: "Hijo", LastName: name, BirthDate: time.Now().UTC().AddDate(-3, 0, 0)})
		}
		require.NoError(t, repo.Create(context.Background(), acc))
		return acc, clerk
	}
	owner, ownerClerk := create("Ana", account.PlanPaid, 1)
	tutor, tutorClerk := create("Luis", account.PlanFree, 0)
	caregiver, caregiverClerk := create("Abuela", account.PlanFree, 0)
	_, strangerClerk := create("Ajena", account.PlanPaid, 1)
	for _, m := range []struct {
		id   uuid.UUID
		role string
	}{{tutor.ID, "tutor"}, {caregiver.ID, "caregiver"}} {
		_, err := pool.Exec(context.Background(), `
			INSERT INTO family_members (family_account_id, account_id, role, invited_by_account_id) VALUES ($1, $2, $3, $1)`, owner.ID, m.id, m.role)
		require.NoError(t, err)
	}
	svc := growth.NewService(growth.NewRepository(pool))
	h := growth.NewHandler(svc, responder)
	levels := access.NewRepository(pool)
	sees := authmw.RequireAccess(responder, "childId", access.Mark, levels.OnChild)
	full := authmw.RequireAccess(responder, "childId", access.Full, levels.OnChild)
	r := chi.NewRouter()
	r.Use(verifier.Middleware)
	r.With(sees).Get("/children/{childId}/growth-measurements", h.ListMeasurements)
	r.With(full).Post("/children/{childId}/growth-measurements", h.CreateMeasurement)
	r.With(full).Delete("/children/{childId}/growth-measurements/{measurementId}", h.DeleteMeasurement)
	r.With(sees).Get("/children/{childId}/growth-chart", h.GetChart)
	do := func(as, method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+verifier.Token(t, as))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec
	}
	base := "/children/" + owner.Children[0].ID.String()
	body := `{"measuredOn":"` + day(time.Now()) + `","weightKg":14}`
	setPlan := func(plan string) {
		_, err := pool.Exec(context.Background(), `UPDATE accounts SET plan = $2 WHERE id = $1`, owner.ID, plan)
		require.NoError(t, err)
	}

	created := do(ownerClerk, http.MethodPost, base+"/growth-measurements", body)
	require.Equal(t, http.StatusCreated, created.Code, created.Body.String())
	var m struct{ ID string }
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &m))

	require.Equal(t, http.StatusCreated, do(tutorClerk, http.MethodPost, base+"/growth-measurements", body).Code, "a Tutor of a paid family writes")
	require.Equal(t, http.StatusOK, do(caregiverClerk, http.MethodGet, base+"/growth-measurements", "").Code)
	require.Equal(t, http.StatusOK, do(caregiverClerk, http.MethodGet, base+"/growth-chart", "").Code, "a Caregiver sees the chart of a paid family")
	require.Equal(t, http.StatusForbidden, do(caregiverClerk, http.MethodPost, base+"/growth-measurements", body).Code)
	require.Equal(t, http.StatusForbidden, do(caregiverClerk, http.MethodDelete, base+"/growth-measurements/"+m.ID, "").Code)
	for _, c := range []struct{ method, path, body string }{
		{http.MethodGet, base + "/growth-measurements", ""},
		{http.MethodPost, base + "/growth-measurements", body},
		{http.MethodGet, base + "/growth-chart", ""},
	} {
		require.Equal(t, http.StatusForbidden, do(strangerClerk, c.method, c.path, c.body).Code, c.method+" "+c.path)
	}

	setPlan("free")
	require.Equal(t, http.StatusForbidden, do(tutorClerk, http.MethodPost, base+"/growth-measurements", body).Code, "a lapsed family's Tutor only sees")
	require.Equal(t, http.StatusOK, do(tutorClerk, http.MethodGet, base+"/growth-measurements", "").Code)
	require.Equal(t, http.StatusUnprocessableEntity, do(ownerClerk, http.MethodGet, base+"/growth-chart", "").Code)
	require.Equal(t, http.StatusCreated, do(ownerClerk, http.MethodPost, base+"/growth-measurements", body).Code, "the owner writes on any plan")
	require.Equal(t, http.StatusNoContent, do(ownerClerk, http.MethodDelete, base+"/growth-measurements/"+m.ID, "").Code)
}
