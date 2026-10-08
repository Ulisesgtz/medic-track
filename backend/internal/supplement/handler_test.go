package supplement_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
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
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/supplement"
)

// specs/033: the routines' routes behind the real access checks, from the HTTP answers down to the tables.

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

type env struct {
	pool      *pgxpool.Pool
	router    http.Handler
	verifier  *authmwtest.Verifier
	log       *capture
	owner     string // clerk id of the owner (paid)
	caregiver string // clerk id of a caregiver of the owner's family
	childID   uuid.UUID
	accountID uuid.UUID
}

func newEnv(t *testing.T, plan account.Plan) *env {
	t.Helper()
	pool := testPool(t)
	e := &env{pool: pool, log: &capture{}}
	responder := httpx.NewResponder(e.log)
	e.verifier = authmwtest.NewVerifier(t, responder)

	suffix := uuid.NewString()
	e.owner, e.caregiver = "user_supp_owner_"+suffix, "user_supp_care_"+suffix
	repo := account.NewRepository(pool)
	owner := &account.Account{
		FirstName: "Ana", LastName: "Prueba", Email: "supp.owner." + suffix + "@example.com", Plan: plan, ClerkUserID: &e.owner,
		Children: []account.Child{{FirstName: "Hijo", LastName: "Prueba", BirthDate: time.Now().AddDate(-5, 0, 0)}},
	}
	require.NoError(t, repo.Create(context.Background(), owner))
	e.accountID, e.childID = owner.ID, owner.Children[0].ID
	care := &account.Account{FirstName: "Cuidadora", LastName: "Prueba", Email: "supp.care." + suffix + "@example.com", Plan: account.PlanFree, ClerkUserID: &e.caregiver}
	require.NoError(t, repo.Create(context.Background(), care))
	_, err := pool.Exec(context.Background(), `
		INSERT INTO family_members (family_account_id, account_id, role, invited_by_account_id)
		VALUES ($1, $2, 'caregiver', $1)`, owner.ID, care.ID)
	require.NoError(t, err)

	acc := access.NewRepository(pool)
	h := supplement.NewHandler(supplement.NewService(supplement.NewRepository(pool)), responder)
	r := chi.NewRouter()
	r.Use(e.verifier.Middleware)
	seesChild := authmw.RequireAccess(responder, "childId", access.Mark, acc.OnChild)
	fullChild := authmw.RequireAccess(responder, "childId", access.Full, acc.OnChild)
	seesRoutine := authmw.RequireAccess(responder, "routineId", access.Mark, acc.OnRoutine)
	fullRoutine := authmw.RequireAccess(responder, "routineId", access.Full, acc.OnRoutine)
	r.With(seesChild).Get("/children/{childId}/routines", h.ListRoutines)
	r.With(fullChild).Post("/children/{childId}/routines", h.CreateRoutine)
	r.With(seesRoutine).Get("/routines/{routineId}", h.GetRoutine)
	r.With(seesRoutine).Patch("/routines/{routineId}/doses/{doseId}", h.UpdateDose)
	r.With(seesRoutine).Put("/routines/{routineId}/my-reminders", h.SetMyReminders)
	r.With(seesRoutine).Post("/routines/{routineId}/done", h.MarkRoutineDone)
	r.With(fullRoutine).Patch("/routines/{routineId}", h.UpdateRoutine)
	r.With(fullRoutine).Post("/routines/{routineId}/pause", h.PauseRoutine)
	r.With(fullRoutine).Post("/routines/{routineId}/resume", h.ResumeRoutine)
	r.With(fullRoutine).Post("/routines/{routineId}/finish", h.FinishRoutine)
	e.router = r
	return e
}

func (e *env) do(t *testing.T, clerkID, method, path, body string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	if clerkID != "" {
		req.Header.Set("Authorization", "Bearer "+e.verifier.Token(t, clerkID))
	}
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, req)
	out := map[string]any{}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

func today() string { return time.Now().UTC().Format("2006-01-02") }

func createBody(name string) string {
	return fmt.Sprintf(`{"name":%q,"note":"","period":"daily","times":["08:00","20:00"],"firstDate":%q,"utcOffsetMinutes":0}`, name, today())
}

func windowQuery() string {
	from := time.Now().UTC().Truncate(24 * time.Hour)
	return "?from=" + from.Format(time.RFC3339) + "&to=" + from.Add(24*time.Hour).Format(time.RFC3339)
}

func (e *env) createRoutine(t *testing.T) string {
	t.Helper()
	code, got := e.do(t, e.owner, http.MethodPost, "/children/"+e.childID.String()+"/routines", createBody("Vitamina D"))
	require.Equal(t, http.StatusCreated, code, got)
	return got["id"].(string)
}

func TestCreateRoutine_AnswersWithTheRoutineAndItsDosesOfToday(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	code, got := e.do(t, e.owner, http.MethodPost, "/children/"+e.childID.String()+"/routines", createBody("Vitamina D"))
	require.Equal(t, http.StatusCreated, code, got)
	require.Equal(t, "Vitamina D", got["name"])
	require.Equal(t, "daily", got["period"])
	require.Equal(t, "active", got["status"])
	require.Equal(t, "Ana", got["createdBy"])
	require.Equal(t, true, got["canEdit"])
	require.Equal(t, e.childID.String(), got["childId"])
	require.Equal(t, []any{"08:00", "20:00"}, got["times"])
	require.Equal(t, []any{}, got["weekdays"])
	require.Equal(t, "supplement", got["kind"])
	require.Nil(t, got["intervalMinutes"])
	require.Nil(t, got["windowStart"])
	require.Nil(t, got["endDate"])
	require.Len(t, got["doses"], 2, "both doses of today")
	require.Nil(t, got["nextDose"])
	require.Contains(t, got, "progress")
}

func TestCreateRoutine_ErrorsAreTheContractsOwn(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	path := "/children/" + e.childID.String() + "/routines"

	code, got := e.do(t, e.owner, http.MethodPost, path, `{"name":"","period":"daily","times":[],"firstDate":"x"}`)
	require.Equal(t, http.StatusBadRequest, code)
	require.Equal(t, "validation_error", got["error"])
	fields := map[string]bool{}
	for _, d := range got["details"].([]any) {
		fields[d.(map[string]any)["field"].(string)] = true
	}
	require.True(t, fields["name"] && fields["times"] && fields["firstDate"], got)

	code, got = e.do(t, e.owner, http.MethodPost, path, `{not json`)
	require.Equal(t, http.StatusBadRequest, code)
	require.Equal(t, "validation_error", got["error"])

	code, _ = e.do(t, e.owner, http.MethodPost, "/children/not-a-uuid/routines", createBody("x"))
	require.Equal(t, http.StatusNotFound, code)

	for i := 0; i < supplement.MaxActivePerChild; i++ {
		e.createRoutine(t)
	}
	code, got = e.do(t, e.owner, http.MethodPost, path, createBody("la once"))
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "routine_limit_exceeded", got["error"])
	require.EqualValues(t, 10, got["limit"])
}

func TestCreateRoutine_AFreeOwnerGets422WithTheSupplementsReason(t *testing.T) {
	e := newEnv(t, account.PlanFree)
	code, got := e.do(t, e.owner, http.MethodPost, "/children/"+e.childID.String()+"/routines", createBody("Vitamina D"))
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "freemium_consultation_limit_exceeded", got["error"])
	require.Equal(t, "supplements", got["reason"])
}

func TestListAndGetRoutines_ShapeAndWhoCanEdit(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	id := e.createRoutine(t)

	code, list := e.do(t, e.owner, http.MethodGet, "/children/"+e.childID.String()+"/routines"+windowQuery(), "")
	require.Equal(t, http.StatusOK, code, list)
	require.EqualValues(t, 1, list["activeCount"])
	require.EqualValues(t, 10, list["limit"])
	require.Equal(t, true, list["paidPlan"])
	routines := list["routines"].([]any)
	require.Len(t, routines, 1)
	require.Equal(t, true, routines[0].(map[string]any)["canEdit"])

	// A Caregiver sees the same routine and can't edit it.
	code, list = e.do(t, e.caregiver, http.MethodGet, "/children/"+e.childID.String()+"/routines"+windowQuery(), "")
	require.Equal(t, http.StatusOK, code, list)
	require.Equal(t, false, list["routines"].([]any)[0].(map[string]any)["canEdit"])

	code, one := e.do(t, e.caregiver, http.MethodGet, "/routines/"+id+windowQuery(), "")
	require.Equal(t, http.StatusOK, code, one)
	require.Equal(t, id, one["id"])
	require.Equal(t, false, one["canEdit"])

	// An empty list is [] and not null.
	other := newEnv(t, account.PlanPaid)
	code, list = other.do(t, other.owner, http.MethodGet, "/children/"+other.childID.String()+"/routines"+windowQuery(), "")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, []any{}, list["routines"])
}

func TestListAndGetRoutines_WindowsAndNotFound(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	id := e.createRoutine(t)
	listPath := "/children/" + e.childID.String() + "/routines"

	code, got := e.do(t, e.owner, http.MethodGet, listPath, "")
	require.Equal(t, http.StatusBadRequest, code)
	require.Equal(t, "validation_error", got["error"])

	from := time.Now().UTC()
	tooLong := "?from=" + from.Format(time.RFC3339) + "&to=" + from.Add(72*time.Hour).Format(time.RFC3339)
	code, _ = e.do(t, e.owner, http.MethodGet, listPath+tooLong, "")
	require.Equal(t, http.StatusBadRequest, code, "a day's list is at most 48 hours")
	backwards := "?from=" + from.Format(time.RFC3339) + "&to=" + from.Add(-time.Hour).Format(time.RFC3339)
	code, _ = e.do(t, e.owner, http.MethodGet, "/routines/"+id+backwards, "")
	require.Equal(t, http.StatusBadRequest, code)
	month := "?from=" + from.Format(time.RFC3339) + "&to=" + from.Add(40*24*time.Hour).Format(time.RFC3339)
	code, _ = e.do(t, e.owner, http.MethodGet, "/routines/"+id+month, "")
	require.Equal(t, http.StatusOK, code, "a month of the calendar is fine")
	longer := "?from=" + from.Format(time.RFC3339) + "&to=" + from.Add(70*24*time.Hour).Format(time.RFC3339)
	code, _ = e.do(t, e.owner, http.MethodGet, "/routines/"+id+longer, "")
	require.Equal(t, http.StatusBadRequest, code)

	code, _ = e.do(t, e.owner, http.MethodGet, "/routines/not-a-uuid"+windowQuery(), "")
	require.Equal(t, http.StatusNotFound, code)
	code, _ = e.do(t, e.owner, http.MethodGet, "/routines/"+id, "")
	require.Equal(t, http.StatusBadRequest, code)
	code, got = e.do(t, e.owner, http.MethodGet, "/routines/"+uuid.NewString()+windowQuery(), "")
	require.Equal(t, http.StatusForbidden, code, "a routine that does not exist is the same 403 as someone else's")
	require.Equal(t, "forbidden", got["error"])
}

func TestUpdateDose_MarkWithAuthorAndUnmarkRules(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	id := e.createRoutine(t)
	_, routine := e.do(t, e.owner, http.MethodGet, "/routines/"+id+windowQuery(), "")
	doseID := routine["doses"].([]any)[0].(map[string]any)["id"].(string)
	path := "/routines/" + id + "/doses/" + doseID

	// A Caregiver marks: the answer says who and that it is theirs.
	code, dose := e.do(t, e.caregiver, http.MethodPatch, path, `{"taken":true}`)
	require.Equal(t, http.StatusOK, code, dose)
	require.Equal(t, true, dose["taken"])
	require.Equal(t, "taken", dose["status"])
	by := dose["takenBy"].(map[string]any)
	require.Equal(t, "Cuidadora", by["name"])
	require.Equal(t, true, by["mine"])

	// The owner sees it as someone else's, and may take it back (she can do everything).
	_, routine = e.do(t, e.owner, http.MethodGet, "/routines/"+id+windowQuery(), "")
	require.Equal(t, false, routine["doses"].([]any)[0].(map[string]any)["takenBy"].(map[string]any)["mine"])
	code, dose = e.do(t, e.owner, http.MethodPatch, path, `{"taken":false}`)
	require.Equal(t, http.StatusOK, code, dose)
	require.Equal(t, false, dose["taken"])

	// The owner marks; the Caregiver cannot take the owner's mark back.
	e.do(t, e.owner, http.MethodPatch, path, `{"taken":true}`)
	code, dose = e.do(t, e.caregiver, http.MethodPatch, path, `{"taken":false}`)
	require.Equal(t, http.StatusForbidden, code)
	require.Equal(t, "forbidden", dose["error"])

	code, dose = e.do(t, e.owner, http.MethodPatch, "/routines/"+id+"/doses/"+uuid.NewString(), `{"taken":true}`)
	require.Equal(t, http.StatusNotFound, code)
	require.Equal(t, "dose_not_found", dose["error"])
	code, _ = e.do(t, e.owner, http.MethodPatch, "/routines/"+id+"/doses/not-a-uuid", `{"taken":true}`)
	require.Equal(t, http.StatusNotFound, code)
	code, _ = e.do(t, e.owner, http.MethodPatch, path, `nope`)
	require.Equal(t, http.StatusBadRequest, code)
}

func TestUpdateDose_FailsClosedWithoutAccessInTheContext(t *testing.T) {
	responder := httpx.NewResponder(&capture{})
	h := supplement.NewHandler(supplement.NewService(nil), responder)
	r := chi.NewRouter()
	r.Patch("/routines/{routineId}/doses/{doseId}", h.UpdateDose)
	r.Post("/children/{childId}/routines", h.CreateRoutine)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPatch, "/routines/"+uuid.NewString()+"/doses/"+uuid.NewString(), strings.NewReader(`{"taken":true}`)))
	require.Equal(t, http.StatusInternalServerError, rec.Code)

	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/children/"+uuid.NewString()+"/routines", strings.NewReader(createBody("x"))))
	require.Equal(t, http.StatusInternalServerError, rec.Code, "creating needs to know who creates")
}

// Principio II: what the parent wrote (name, note) is never in an error log or in a message.
func TestErrorLogsNeverCarryWhatTheParentWrote(t *testing.T) {
	e := newEnv(t, account.PlanFree)
	secretName, secretNote := "Secreto-"+uuid.NewString(), "Nota-"+uuid.NewString()
	body := fmt.Sprintf(`{"name":%q,"note":%q,"period":"daily","times":["08:00"],"firstDate":%q}`, secretName, secretNote, today())

	_, free := e.do(t, e.owner, http.MethodPost, "/children/"+e.childID.String()+"/routines", body)
	_, invalid := e.do(t, e.owner, http.MethodPost, "/children/"+e.childID.String()+"/routines", strings.Replace(body, `"daily"`, `"never"`, 1))
	require.Eventually(t, func() bool { return len(e.log.all()) >= 2 }, 3*time.Second, 20*time.Millisecond)
	for _, entry := range e.log.all() {
		text := fmt.Sprintf("%+v", entry)
		require.NotContains(t, text, secretName)
		require.NotContains(t, text, secretNote)
	}
	for _, answer := range []map[string]any{free, invalid} {
		text := fmt.Sprintf("%v", answer)
		require.NotContains(t, text, secretName)
		require.NotContains(t, text, secretNote)
	}
}
