package childprofile_test

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
	"github.com/Ulisesgtz/medic-track/backend/internal/childprofile"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/growth"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

func f(v float64) *float64 { return &v }

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

type family struct {
	accountID, childID uuid.UUID
	birth              time.Time
}

// newFamily is an owner account (Ana) with one child (Mateo Prueba) born two years ago, with the signup's height and no weight.
func newFamily(t *testing.T, pool *pgxpool.Pool, plan account.Plan) family {
	t.Helper()
	suffix := fmt.Sprintf("%d.%s", time.Now().UnixNano(), uuid.NewString()[:6])
	birth := time.Now().UTC().AddDate(-2, 0, 0).Truncate(24 * time.Hour)
	acc := &account.Account{
		FirstName: "Ana", LastName: "Prueba", Email: "childprofile." + suffix + "@example.com", Plan: plan,
		Children: []account.Child{{FirstName: "Mateo", LastName: "Prueba", BirthDate: birth, Height: f(85)}},
	}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))
	return family{accountID: acc.ID, childID: acc.Children[0].ID, birth: birth}
}

// newPerson is another account (Luis), the Tutor who corrects in the tests.
func newPerson(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	acc := &account.Account{FirstName: "Luis", LastName: "Prueba", Email: fmt.Sprintf("childprofile.luis.%d@example.com", time.Now().UnixNano()), Plan: account.PlanFree}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))
	return acc.ID
}

func day(t time.Time) string { return t.Format("2006-01-02") }

func (fam family) input() childprofile.Input {
	return childprofile.Input{FirstName: "Mateo", LastName: "Prueba", BirthDate: day(fam.birth), Height: f(85)}
}

func addMeasurement(t *testing.T, pool *pgxpool.Pool, fam family, on time.Time) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `INSERT INTO growth_measurements (child_id, account_id, measured_on, weight_kg, created_by_account_id)
		VALUES ($1, $2, $3, 10, $2)`, fam.childID, fam.accountID, on)
	require.NoError(t, err)
}

func addVaccination(t *testing.T, pool *pgxpool.Pool, fam family, on time.Time) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `INSERT INTO vaccine_records (child_id, account_id, vaccine_code, applied_on, created_by_account_id)
		VALUES ($1, $2, 'bcg', $3, $2)`, fam.childID, fam.accountID, on)
	require.NoError(t, err)
}

type row struct {
	first, last string
	birth       time.Time
	height      *float64
	weight      *float64
	correctedAt *time.Time
	correctedBy *uuid.UUID
}

func readChild(t *testing.T, pool *pgxpool.Pool, id uuid.UUID) row {
	t.Helper()
	var r row
	require.NoError(t, pool.QueryRow(context.Background(), `
		SELECT first_name, last_name, birth_date, height::float8, weight::float8, corrected_at, corrected_by_account_id
		FROM children WHERE id = $1`, id).Scan(&r.first, &r.last, &r.birth, &r.height, &r.weight, &r.correctedAt, &r.correctedBy))
	return r
}

func countMeasurements(t *testing.T, pool *pgxpool.Pool, id uuid.UUID) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM growth_measurements WHERE child_id = $1`, id).Scan(&n))
	return n
}

func TestUpdate_HeightAndWeightOnEveryPlan(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	fam := newFamily(t, pool, account.PlanFree)
	svc := childprofile.NewService(childprofile.NewRepository(pool))

	// Saving without changes is not a correction.
	saved, err := svc.Update(ctx, fam.childID, fam.accountID, fam.input())
	require.NoError(t, err)
	require.Nil(t, saved.Child.CorrectedAt)
	require.Nil(t, readChild(t, pool, fam.childID).correctedAt)
	require.Equal(t, account.PlanFree, saved.Plan)

	// The weight written, the height emptied.
	in := fam.input()
	in.Weight, in.Height = f(12.5), nil
	saved, err = svc.Update(ctx, fam.childID, fam.accountID, in)
	require.NoError(t, err)
	require.Equal(t, 12.5, *saved.Child.Weight)
	require.Nil(t, saved.Child.Height)
	require.NotNil(t, saved.Child.CorrectedAt)
	require.Equal(t, "Ana", *saved.Child.CorrectedBy)
	got := readChild(t, pool, fam.childID)
	require.Equal(t, fam.accountID, *got.correctedBy)
	require.Equal(t, 12.5, *got.weight)
	require.Nil(t, got.height)

	// The same identity sent again by a free family never asks for the plan.
	require.Equal(t, "Mateo", got.first)
}

func TestUpdate_TheIdentityNeedsThePaidPlan(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := childprofile.NewService(childprofile.NewRepository(pool))

	free := newFamily(t, pool, account.PlanFree)
	for _, change := range []func(*childprofile.Input){
		func(in *childprofile.Input) { in.FirstName = "Sofía" },
		func(in *childprofile.Input) { in.LastName = "Gómez" },
		func(in *childprofile.Input) { in.BirthDate = day(free.birth.AddDate(0, 0, -3)) },
	} {
		in := free.input()
		change(&in)
		in.Weight = f(13) // the weight that comes with it is not saved either
		_, err := svc.Update(ctx, free.childID, free.accountID, in)
		require.ErrorIs(t, err, childprofile.ErrPlanRequired)
	}
	got := readChild(t, pool, free.childID)
	require.Equal(t, "Mateo", got.first)
	require.Nil(t, got.weight)
	require.Nil(t, got.correctedAt)

	paid := newFamily(t, pool, account.PlanPaid)
	tutor := newPerson(t, pool)
	in := paid.input()
	in.FirstName, in.LastName, in.BirthDate = " Sofía ", "Gómez", day(paid.birth.AddDate(0, -1, 0))
	saved, err := svc.Update(ctx, paid.childID, tutor, in)
	require.NoError(t, err)
	require.Equal(t, "Sofía", saved.Child.FirstName)
	require.Equal(t, "Luis", *saved.Child.CorrectedBy, "the Tutor who corrected it")
	require.Equal(t, account.PlanPaid, saved.Plan)
	require.Equal(t, day(paid.birth.AddDate(0, -1, 0)), day(readChild(t, pool, paid.childID).birth))

	_, err = svc.Update(ctx, uuid.New(), paid.accountID, in)
	require.ErrorIs(t, err, childprofile.ErrNotFound)
}

func TestUpdate_ABirthDateAfterWhatWasWrittenDownIsRefused(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	fam := newFamily(t, pool, account.PlanPaid)
	svc := childprofile.NewService(childprofile.NewRepository(pool))
	addMeasurement(t, pool, fam, fam.birth.AddDate(0, 2, 0))
	addMeasurement(t, pool, fam, fam.birth.AddDate(0, 1, 0))
	addMeasurement(t, pool, fam, fam.birth.AddDate(1, 0, 0))
	addVaccination(t, pool, fam, fam.birth.AddDate(0, 1, 15))

	in := fam.input()
	in.BirthDate = day(fam.birth.AddDate(0, 6, 0))
	_, err := svc.Update(ctx, fam.childID, fam.accountID, in)
	var conflict *childprofile.ConflictError
	require.ErrorAs(t, err, &conflict)
	require.Equal(t, 2, conflict.MeasurementCount)
	require.Equal(t, []string{day(fam.birth.AddDate(0, 1, 0)), day(fam.birth.AddDate(0, 2, 0))}, conflict.Measurements, "ascending")
	require.Equal(t, 1, conflict.VaccinationCount)
	require.Equal(t, []string{day(fam.birth.AddDate(0, 1, 15))}, conflict.Vaccinations)
	require.Equal(t, day(fam.birth), day(readChild(t, pool, fam.childID).birth), "nothing saved")

	// The day of the first record is allowed (a measurement on the day of the birth), and an earlier date always is.
	in.BirthDate = day(fam.birth.AddDate(0, 1, 0))
	_, err = svc.Update(ctx, fam.childID, fam.accountID, in)
	require.NoError(t, err)
	in.BirthDate = day(fam.birth.AddDate(-1, 0, 0))
	_, err = svc.Update(ctx, fam.childID, fam.accountID, in)
	require.NoError(t, err)
}

func TestUpdate_TheConflictListsAtMostTwentyDatesButCountsThemAll(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	fam := newFamily(t, pool, account.PlanPaid)
	for i := 0; i < childprofile.MaxConflictDates+5; i++ {
		addMeasurement(t, pool, fam, fam.birth.AddDate(0, 0, i))
	}
	in := fam.input()
	in.BirthDate = day(fam.birth.AddDate(1, 0, 0))
	_, err := childprofile.NewService(childprofile.NewRepository(pool)).Update(ctx, fam.childID, fam.accountID, in)
	var conflict *childprofile.ConflictError
	require.ErrorAs(t, err, &conflict)
	require.Equal(t, childprofile.MaxConflictDates+5, conflict.MeasurementCount)
	require.Len(t, conflict.Measurements, childprofile.MaxConflictDates)
	require.Equal(t, 0, conflict.VaccinationCount)
	require.Empty(t, conflict.Vaccinations)
}

func TestUpdate_TheMeasurementIsWrittenWithTheCorrectionOrNothingIs(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	fam := newFamily(t, pool, account.PlanFree)
	svc := childprofile.NewService(childprofile.NewRepository(pool))

	in := fam.input()
	in.Weight, in.Height = f(12.4), f(88.5)
	in.Measurement = &childprofile.MeasurementInput{MeasuredOn: day(time.Now().UTC())}
	_, err := svc.Update(ctx, fam.childID, fam.accountID, in)
	require.NoError(t, err)
	ms, err := growth.NewRepository(pool).List(ctx, fam.childID)
	require.NoError(t, err)
	require.Len(t, ms, 1)
	require.Equal(t, 12.4, *ms[0].WeightKg)
	require.Equal(t, 88.5, *ms[0].HeightCm)

	// 250 kg is a valid signup weight but not a measurement: nothing is saved.
	in.Weight = f(250)
	_, err = svc.Update(ctx, fam.childID, fam.accountID, in)
	var verrs childprofile.ValidationErrors
	require.ErrorAs(t, err, &verrs)
	require.Equal(t, "measurement.weightKg", verrs[0].Field)
	require.Equal(t, 12.4, *readChild(t, pool, fam.childID).weight)

	// Past the cap of the growth record: neither the correction nor the measurement.
	_, err = pool.Exec(ctx, `
		INSERT INTO growth_measurements (child_id, account_id, measured_on, weight_kg, created_by_account_id)
		SELECT $1, $2, current_date, 10, $2 FROM generate_series(1, $3)`, fam.childID, fam.accountID, growth.MaxPerChild-1)
	require.NoError(t, err)
	in.Weight = f(13)
	_, err = svc.Update(ctx, fam.childID, fam.accountID, in)
	require.ErrorIs(t, err, growth.ErrLimit)
	require.Equal(t, 12.4, *readChild(t, pool, fam.childID).weight)
	require.Equal(t, growth.MaxPerChild, countMeasurements(t, pool, fam.childID))
}

// SC-003: with a correction of the birth date and a measurement written down at the same time, no measurement ends up before the
// birth: one of the two waits for the other and then refuses.
func TestUpdate_ABirthDateAndAMeasurementAtTheSameTime(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	for i := 0; i < 5; i++ {
		fam := newFamily(t, pool, account.PlanPaid)
		newBirth := fam.birth.AddDate(0, 6, 0)
		in := fam.input()
		in.BirthDate = day(newBirth)
		svc := childprofile.NewService(childprofile.NewRepository(pool))
		measurements := growth.NewRepository(pool)

		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			_, _ = svc.Update(ctx, fam.childID, fam.accountID, in)
		}()
		go func() {
			defer wg.Done()
			_, _ = measurements.Create(ctx, fam.childID, fam.accountID, growth.Cleaned{MeasuredOn: fam.birth.AddDate(0, 1, 0), WeightKg: f(5)})
		}()
		wg.Wait()

		var before int
		require.NoError(t, pool.QueryRow(ctx, `
			SELECT count(*) FROM growth_measurements m JOIN children c ON c.id = m.child_id
			WHERE c.id = $1 AND m.measured_on < c.birth_date`, fam.childID).Scan(&before))
		require.Zero(t, before)
	}
}

func TestRepository_ADatabaseFailureIsAnError(t *testing.T) {
	testPool(t)
	pool, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	require.NoError(t, err)
	pool.Close()
	_, err = childprofile.NewRepository(pool).Update(context.Background(), uuid.New(), uuid.New(), childprofile.Cleaned{})
	require.Error(t, err)
}

// --- the handler, behind a stand-in of the access middleware ---

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

func serve(t *testing.T, pool *pgxpool.Pool, actor uuid.UUID, log *capture) http.Handler {
	t.Helper()
	h := childprofile.NewHandler(childprofile.NewService(childprofile.NewRepository(pool)), httpx.NewResponder(log))
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(access.WithAccess(req.Context(), access.Access{Level: access.Full, ActorAccountID: actor})))
		})
	})
	r.Put("/children/{childId}", h.UpdateChild)
	return r
}

func put(t *testing.T, h http.Handler, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPut, path, bytes.NewBufferString(body)))
	return rec
}

func TestHandler_TheContract(t *testing.T) {
	pool := testPool(t)
	log := &capture{}
	fam := newFamily(t, pool, account.PlanFree)
	h := serve(t, pool, fam.accountID, log)
	path := "/children/" + fam.childID.String()
	body := func(first, birth string, extra string) string {
		return fmt.Sprintf(`{"firstName":%q,"lastName":"Prueba","birthDate":%q,"height":85,"weight":12.5%s}`, first, birth, extra)
	}

	rec := put(t, h, path, body("Mateo", day(fam.birth), ""))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var child map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &child))
	require.Equal(t, "owner", child["role"])
	require.Equal(t, "free", child["plan"])
	require.Equal(t, 12.5, child["weight"])
	require.Equal(t, "Ana", child["correctedBy"])
	require.NotNil(t, child["correctedAt"])

	rec = put(t, h, path, body("Secretísimo", day(fam.birth), ""))
	require.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	require.Contains(t, rec.Body.String(), `"reason":"child_identity"`)

	rec = put(t, h, path, body("Secret0", day(fam.birth), ""))
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), `"field":"firstName"`)

	rec = put(t, h, path, body("Mateo", day(fam.birth), `,"measurement":{"measuredOn":"`+day(time.Now().UTC())+`"}`))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, 1, countMeasurements(t, pool, fam.childID))

	require.Equal(t, http.StatusBadRequest, put(t, h, path, `{`).Code)
	require.Equal(t, http.StatusNotFound, put(t, h, "/children/nope", body("Mateo", day(fam.birth), "")).Code)
	require.Equal(t, http.StatusNotFound, put(t, h, "/children/"+uuid.NewString(), body("Mateo", day(fam.birth), "")).Code)

	// A paid family: the conflict and the Tutor's role.
	paid := newFamily(t, pool, account.PlanPaid)
	addMeasurement(t, pool, paid, paid.birth.AddDate(0, 1, 0))
	tutor := newPerson(t, pool)
	ht := serve(t, pool, tutor, log)
	ppath := "/children/" + paid.childID.String()
	rec = put(t, ht, ppath, body("Mateo", day(paid.birth.AddDate(0, 2, 0)), ""))
	require.Equal(t, http.StatusConflict, rec.Code)
	var conflict map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &conflict))
	require.Equal(t, "birth_date_conflict", conflict["error"])
	require.Equal(t, float64(1), conflict["measurementCount"])
	require.Equal(t, []any{day(paid.birth.AddDate(0, 1, 0))}, conflict["measurements"])
	require.Equal(t, []any{}, conflict["vaccinations"])
	rec = put(t, ht, ppath, body("Sofía", day(paid.birth), ""))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &child))
	require.Equal(t, "tutor", child["role"])
	require.Equal(t, "Luis", child["correctedBy"])

	// The cap of the growth record.
	_, err := pool.Exec(context.Background(), `
		INSERT INTO growth_measurements (child_id, account_id, measured_on, weight_kg, created_by_account_id)
		SELECT $1, $2, current_date, 10, $2 FROM generate_series(1, $3)`, fam.childID, fam.accountID, growth.MaxPerChild)
	require.NoError(t, err)
	rec = put(t, h, path, body("Mateo", day(fam.birth), `,"measurement":{"measuredOn":"`+day(time.Now().UTC())+`"}`))
	require.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	require.Contains(t, rec.Body.String(), "growth_limit_exceeded")

	// Neither a name nor a value ever reaches error_logs.
	for _, e := range log.entries {
		for _, secret := range []string{"Secret", "Sofía", "12.5", "85"} {
			require.NotContains(t, e.Message, secret)
		}
	}
	require.NotEmpty(t, log.entries)
}

func TestHandler_NoActorAndADatabaseFailureAreInternalErrors(t *testing.T) {
	pool := testPool(t)
	fam := newFamily(t, pool, account.PlanFree)
	body := `{"firstName":"Mateo","lastName":"Prueba","birthDate":"` + day(fam.birth) + `"}`
	rec := put(t, serve(t, pool, uuid.Nil, &capture{}), "/children/"+fam.childID.String(), body)
	require.Equal(t, http.StatusInternalServerError, rec.Code)

	closed, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	require.NoError(t, err)
	closed.Close()
	rec = put(t, serve(t, closed, fam.accountID, &capture{}), "/children/"+fam.childID.String(), body)
	require.Equal(t, http.StatusInternalServerError, rec.Code)
	require.False(t, strings.Contains(rec.Body.String(), "Mateo"))
}
