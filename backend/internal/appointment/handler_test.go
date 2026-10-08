package appointment_test

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
	"github.com/Ulisesgtz/medic-track/backend/internal/appointment"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw/authmwtest"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

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
	pool               *pgxpool.Pool
	router             http.Handler
	verifier           *authmwtest.Verifier
	log                *capture
	owner, caregiver   string
	accountID, childID uuid.UUID
	consultationID     uuid.UUID
	caregiverAccountID uuid.UUID
}

func newEnv(t *testing.T, plan account.Plan) *env {
	t.Helper()
	pool := testPool(t)
	e := &env{pool: pool, log: &capture{}}
	responder := httpx.NewResponder(e.log)
	e.verifier = authmwtest.NewVerifier(t, responder)

	suffix := uuid.NewString()
	e.owner, e.caregiver = "user_appt_owner_"+suffix, "user_appt_care_"+suffix
	repo := account.NewRepository(pool)
	owner := &account.Account{
		FirstName: "Ana", LastName: "Prueba", Email: "appt.owner." + suffix + "@example.com", Plan: plan, ClerkUserID: &e.owner,
		Children: []account.Child{{FirstName: "Hijo", LastName: "Prueba", BirthDate: time.Now().AddDate(-5, 0, 0)}},
	}
	require.NoError(t, repo.Create(context.Background(), owner))
	e.accountID, e.childID = owner.ID, owner.Children[0].ID
	e.consultationID = newConsultation(t, pool, e.childID, "2026-09-28")
	care := &account.Account{FirstName: "Cuidadora", LastName: "Prueba", Email: "appt.care." + suffix + "@example.com", Plan: account.PlanFree, ClerkUserID: &e.caregiver}
	require.NoError(t, repo.Create(context.Background(), care))
	e.caregiverAccountID = care.ID
	_, err := pool.Exec(context.Background(), `INSERT INTO family_members (family_account_id, account_id, role, invited_by_account_id) VALUES ($1, $2, 'caregiver', $1)`, owner.ID, care.ID)
	require.NoError(t, err)

	acc := access.NewRepository(pool)
	svc := newService(appointment.NewRepository(pool))
	h := appointment.NewHandler(svc, responder)
	r := chi.NewRouter()
	r.Use(e.verifier.Middleware)
	seesChild := authmw.RequireAccess(responder, "childId", access.Mark, acc.OnChild)
	seesConsultation := authmw.RequireAccess(responder, "consultationId", access.Mark, acc.OnConsultation)
	fullConsultation := authmw.RequireAccess(responder, "consultationId", access.Full, acc.OnConsultation)
	seesAppointment := authmw.RequireAccess(responder, "appointmentId", access.Mark, acc.OnAppointment)
	fullAppointment := authmw.RequireAccess(responder, "appointmentId", access.Full, acc.OnAppointment)
	r.With(seesChild).Get("/children/{childId}/appointments", h.ForChild)
	r.With(seesConsultation).Get("/consultations/{consultationId}/appointment", h.ForConsultation)
	r.With(fullConsultation).Post("/consultations/{consultationId}/appointments", h.Create)
	r.With(seesAppointment).Get("/appointments/{appointmentId}", h.Get)
	r.With(fullAppointment).Patch("/appointments/{appointmentId}", h.Update)
	r.With(fullAppointment).Post("/appointments/{appointmentId}/status", h.SetStatus)
	r.With(seesAppointment).Put("/appointments/{appointmentId}/my-reminders", h.SetMyReminders)
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

// body is an appointment two days from fixedNow (the service clock) with the default notices.
func apptBody(note string) string {
	return fmt.Sprintf(`{"startsAt":%q,"utcOffsetMinutes":-360,"note":%q}`, friday.Format(time.RFC3339), note)
}

func (e *env) create(t *testing.T, note string) string {
	t.Helper()
	code, got := e.do(t, e.owner, http.MethodPost, "/consultations/"+e.consultationID.String()+"/appointments", apptBody(note))
	require.Equal(t, http.StatusCreated, code, got)
	return got["id"].(string)
}

func TestCreate_AnswersWithTheAppointmentItsNoticesAndWhatTheSessionCanDo(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	code, got := e.do(t, e.owner, http.MethodPost, "/consultations/"+e.consultationID.String()+"/appointments", apptBody("Revisión de oído"))
	require.Equal(t, http.StatusCreated, code, got)
	require.Equal(t, "scheduled", got["status"])
	require.Equal(t, "Revisión de oído", got["note"])
	require.Equal(t, "Dra. López", got["doctorName"])
	require.Equal(t, "2026-09-28", got["consultDate"])
	require.Equal(t, true, got["canEdit"])
	require.Equal(t, true, got["canMark"])
	require.Equal(t, true, got["myReminders"])
	require.Nil(t, got["statusBy"])
	notices := got["notices"].([]any)
	require.Len(t, notices, 2)
	first := notices[0].(map[string]any)
	require.Equal(t, "1 día antes", first["label"])
	require.EqualValues(t, 1440, first["leadMinutes"])
	require.Nil(t, first["daysBefore"])
	// Past also compares with when the row was saved (the database's own clock), so it depends on the real day: the notice is past
	// exactly when it fires at or before now.
	fireAt, err := time.Parse(time.RFC3339, first["fireAt"].(string))
	require.NoError(t, err)
	require.Equal(t, !fireAt.After(time.Now()), first["past"])
}

func TestCreate_FixedHourNoticesAndPastOnes(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	body := fmt.Sprintf(`{"startsAt":%q,"utcOffsetMinutes":-360,"notices":[{"kind":"at_time","daysBefore":1,"atTime":"20:00"},{"kind":"before","leadMinutes":4000}]}`, friday.Format(time.RFC3339))
	code, got := e.do(t, e.owner, http.MethodPost, "/consultations/"+e.consultationID.String()+"/appointments", body)
	require.Equal(t, http.StatusCreated, code, got)
	notices := got["notices"].([]any)
	require.Len(t, notices, 2)
	byLabel := map[string]map[string]any{}
	for _, n := range notices {
		m := n.(map[string]any)
		byLabel[m["label"].(string)] = m
	}
	require.EqualValues(t, 1, byLabel["Un día antes a las 20:00"]["daysBefore"])
	require.Equal(t, "20:00", byLabel["Un día antes a las 20:00"]["atTime"])
	require.Equal(t, true, byLabel["2 días antes"] == nil, "4000 minutes is not a whole number of days")
	var past bool
	for label, n := range byLabel {
		if strings.Contains(label, "minutos") {
			past = n["past"].(bool)
		}
	}
	require.True(t, past, "4000 minutes before Friday 16:30 is before the service clock: past")
}

func TestCreate_ErrorsAreTheContractsOwn(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	path := "/consultations/" + e.consultationID.String() + "/appointments"

	code, got := e.do(t, e.owner, http.MethodPost, path, fmt.Sprintf(`{"startsAt":%q,"utcOffsetMinutes":-360}`, time.Date(2026, 9, 20, 10, 0, 0, 0, time.UTC).Format(time.RFC3339)))
	require.Equal(t, http.StatusBadRequest, code)
	require.Equal(t, "validation_error", got["error"])
	require.Contains(t, fmt.Sprint(got["details"]), "startsAt")

	code, _ = e.do(t, e.owner, http.MethodPost, path, `{not json`)
	require.Equal(t, http.StatusBadRequest, code)
	code, _ = e.do(t, e.owner, http.MethodPost, "/consultations/not-a-uuid/appointments", apptBody(""))
	require.Equal(t, http.StatusNotFound, code)

	e.create(t, "")
	code, got = e.do(t, e.owner, http.MethodPost, path, apptBody("otra"))
	require.Equal(t, http.StatusConflict, code)
	require.Equal(t, "appointment_exists", got["error"])
}

func TestCreate_AFreeOwnerGets422WithTheAppointmentsReason(t *testing.T) {
	e := newEnv(t, account.PlanFree)
	code, got := e.do(t, e.owner, http.MethodPost, "/consultations/"+e.consultationID.String()+"/appointments", apptBody(""))
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "freemium_consultation_limit_exceeded", got["error"])
	require.Equal(t, "appointments", got["reason"])
}

func TestReads_ForConsultationForChildAndOne(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	id := e.create(t, "nota")

	code, got := e.do(t, e.caregiver, http.MethodGet, "/consultations/"+e.consultationID.String()+"/appointment", "")
	require.Equal(t, http.StatusOK, code, got)
	require.Equal(t, true, got["paidPlan"])
	one := got["appointment"].(map[string]any)
	require.Equal(t, id, one["id"])
	require.Equal(t, false, one["canEdit"], "a Caregiver only sees")
	require.Equal(t, false, one["canMark"])

	code, got = e.do(t, e.caregiver, http.MethodGet, "/children/"+e.childID.String()+"/appointments", "")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, id, got["next"].(map[string]any)["id"])
	require.Equal(t, []any{}, got["history"])

	code, got = e.do(t, e.owner, http.MethodGet, "/appointments/"+id, "")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, id, got["id"])
	code, _ = e.do(t, e.owner, http.MethodGet, "/appointments/not-a-uuid", "")
	require.Equal(t, http.StatusNotFound, code)
	code, _ = e.do(t, e.owner, http.MethodGet, "/appointments/"+uuid.NewString(), "")
	require.Equal(t, http.StatusForbidden, code, "an unknown appointment is the same 403 as someone else's")

	other := newEnv(t, account.PlanPaid)
	code, got = other.do(t, other.owner, http.MethodGet, "/consultations/"+other.consultationID.String()+"/appointment", "")
	require.Equal(t, http.StatusOK, code)
	require.Nil(t, got["appointment"])
}

func TestUpdate_StatusAndTheCaregiverCannotManage(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	id := e.create(t, "antes")
	path := "/appointments/" + id

	code, got := e.do(t, e.owner, http.MethodPatch, path, apptBody("después"))
	require.Equal(t, http.StatusOK, code, got)
	require.Equal(t, "después", got["note"])
	code, _ = e.do(t, e.owner, http.MethodPatch, path, `nope`)
	require.Equal(t, http.StatusBadRequest, code)
	code, got = e.do(t, e.owner, http.MethodPatch, path, fmt.Sprintf(`{"startsAt":%q,"utcOffsetMinutes":-360,"notices":[{"kind":"before"}]}`, friday.Format(time.RFC3339)))
	require.Equal(t, http.StatusBadRequest, code, got)

	for _, p := range []string{"PATCH", "POST"} {
		url := path
		if p == "POST" {
			url = path + "/status"
		}
		code, got = e.do(t, e.caregiver, p, url, `{"status":"done"}`)
		require.Equal(t, http.StatusForbidden, code, p)
		require.Equal(t, "forbidden", got["error"])
	}

	code, got = e.do(t, e.owner, http.MethodPost, path+"/status", `{"status":"done"}`)
	require.Equal(t, http.StatusOK, code, got)
	require.Equal(t, "done", got["status"])
	require.Equal(t, "Ana", got["statusBy"])
	code, got = e.do(t, e.owner, http.MethodPatch, path, apptBody("x"))
	require.Equal(t, http.StatusConflict, code)
	require.Equal(t, "appointment_closed", got["error"])
	code, got = e.do(t, e.owner, http.MethodPost, path+"/status", `{"status":"scheduled"}`)
	require.Equal(t, http.StatusOK, code, got)
	code, got = e.do(t, e.owner, http.MethodPost, path+"/status", `{"status":"canceled"}`)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, "canceled", got["status"])
	code, got = e.do(t, e.owner, http.MethodPost, path+"/status", `{"status":"scheduled"}`)
	require.Equal(t, http.StatusConflict, code)
	code, got = e.do(t, e.owner, http.MethodPost, path+"/status", `{"status":"weird"}`)
	require.Equal(t, http.StatusBadRequest, code)
	code, _ = e.do(t, e.owner, http.MethodPost, path+"/status", `nope`)
	require.Equal(t, http.StatusBadRequest, code)
	code, _ = e.do(t, e.owner, http.MethodPost, "/appointments/not-a-uuid/status", `{"status":"done"}`)
	require.Equal(t, http.StatusNotFound, code)
}

func TestAFreeOwnerCanOnlyMarkWhatWasCreated(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	id := e.create(t, "")
	_, err := e.pool.Exec(context.Background(), `UPDATE accounts SET plan = 'free' WHERE id = $1`, e.accountID)
	require.NoError(t, err)
	code, got := e.do(t, e.owner, http.MethodPatch, "/appointments/"+id, apptBody("x"))
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "appointments", got["reason"])
	code, got = e.do(t, e.owner, http.MethodGet, "/appointments/"+id, "")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, false, got["canEdit"])
	require.Equal(t, true, got["canMark"])
	code, _ = e.do(t, e.owner, http.MethodPost, "/appointments/"+id+"/status", `{"status":"done"}`)
	require.Equal(t, http.StatusOK, code)
}

func TestMyReminders_EachPersonDecides(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	id := e.create(t, "")
	path := "/appointments/" + id + "/my-reminders"

	code, got := e.do(t, e.caregiver, http.MethodPut, path, `{"enabled":false}`)
	require.Equal(t, http.StatusOK, code, got)
	require.Equal(t, false, got["myReminders"])
	_, mine := e.do(t, e.caregiver, http.MethodGet, "/appointments/"+id, "")
	require.Equal(t, false, mine["myReminders"])
	_, owners := e.do(t, e.owner, http.MethodGet, "/appointments/"+id, "")
	require.Equal(t, true, owners["myReminders"])
	code, _ = e.do(t, e.caregiver, http.MethodPut, path, `nope`)
	require.Equal(t, http.StatusBadRequest, code)
	code, _ = e.do(t, e.caregiver, http.MethodPut, "/appointments/not-a-uuid/my-reminders", `{"enabled":true}`)
	require.Equal(t, http.StatusNotFound, code)

	e.do(t, e.owner, http.MethodPost, "/appointments/"+id+"/status", `{"status":"done"}`)
	code, got = e.do(t, e.caregiver, http.MethodPut, path, `{"enabled":false}`)
	require.Equal(t, http.StatusConflict, code)
	require.Equal(t, "appointment_not_scheduled", got["error"])
}

func TestForChild_ShowsTheHistoryWithWhoMarkedIt(t *testing.T) {
	e := newEnv(t, account.PlanPaid)
	id := e.create(t, "")
	e.do(t, e.owner, http.MethodPost, "/appointments/"+id+"/status", `{"status":"canceled"}`)
	code, got := e.do(t, e.owner, http.MethodGet, "/children/"+e.childID.String()+"/appointments", "")
	require.Equal(t, http.StatusOK, code)
	require.Nil(t, got["next"])
	history := got["history"].([]any)
	require.Len(t, history, 1)
	require.Equal(t, "canceled", history[0].(map[string]any)["status"])
	require.Equal(t, "Ana", history[0].(map[string]any)["statusBy"])
	code, _ = e.do(t, e.owner, http.MethodGet, "/children/not-a-uuid/appointments", "")
	require.Equal(t, http.StatusNotFound, code)
}

// Principio II: what the parent wrote (the note) is never in an error log or in a message.
func TestErrorLogsNeverCarryTheNote(t *testing.T) {
	e := newEnv(t, account.PlanFree)
	secret := "Secreto-" + uuid.NewString()
	_, free := e.do(t, e.owner, http.MethodPost, "/consultations/"+e.consultationID.String()+"/appointments", apptBody(secret))
	_, invalid := e.do(t, e.owner, http.MethodPost, "/consultations/"+e.consultationID.String()+"/appointments",
		fmt.Sprintf(`{"startsAt":%q,"utcOffsetMinutes":9999,"note":%q}`, friday.Format(time.RFC3339), secret))
	require.Eventually(t, func() bool { return len(e.log.all()) >= 2 }, 3*time.Second, 20*time.Millisecond)
	for _, entry := range e.log.all() {
		require.NotContains(t, fmt.Sprintf("%+v", entry), secret)
	}
	for _, answer := range []map[string]any{free, invalid} {
		require.NotContains(t, fmt.Sprintf("%v", answer), secret)
	}
}

func TestHandlers_FailClosedWithoutWhoIsAsking(t *testing.T) {
	h := appointment.NewHandler(appointment.NewService(nil), httpx.NewResponder(&capture{}))
	r := chi.NewRouter()
	r.Post("/consultations/{consultationId}/appointments", h.Create)
	r.Put("/appointments/{appointmentId}/my-reminders", h.SetMyReminders)
	for method, path := range map[string]string{
		http.MethodPost: "/consultations/" + uuid.NewString() + "/appointments",
		http.MethodPut:  "/appointments/" + uuid.NewString() + "/my-reminders",
	} {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(method, path, strings.NewReader(`{"enabled":true}`)))
		require.Equal(t, http.StatusInternalServerError, rec.Code, path)
	}
}

func TestHandlers_DatabaseUnavailableAnswer500(t *testing.T) {
	h := appointment.NewHandler(appointment.NewService(appointment.NewRepository(closedPool(t))), httpx.NewResponder(&capture{}))
	withAccess := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(access.WithAccess(r.Context(), access.Access{Level: access.Full, ActorAccountID: uuid.New()})))
		})
	}
	r := chi.NewRouter()
	r.Use(withAccess)
	r.Get("/children/{childId}/appointments", h.ForChild)
	r.Get("/consultations/{consultationId}/appointment", h.ForConsultation)
	r.Post("/consultations/{consultationId}/appointments", h.Create)
	r.Get("/appointments/{appointmentId}", h.Get)
	r.Patch("/appointments/{appointmentId}", h.Update)
	r.Post("/appointments/{appointmentId}/status", h.SetStatus)
	r.Put("/appointments/{appointmentId}/my-reminders", h.SetMyReminders)
	id := uuid.NewString()
	for name, req := range map[string]*http.Request{
		"child":        httptest.NewRequest(http.MethodGet, "/children/"+id+"/appointments", nil),
		"consultation": httptest.NewRequest(http.MethodGet, "/consultations/"+id+"/appointment", nil),
		"create":       httptest.NewRequest(http.MethodPost, "/consultations/"+id+"/appointments", strings.NewReader(apptBody("x"))),
		"get":          httptest.NewRequest(http.MethodGet, "/appointments/"+id, nil),
		"update":       httptest.NewRequest(http.MethodPatch, "/appointments/"+id, strings.NewReader(apptBody("x"))),
		"status":       httptest.NewRequest(http.MethodPost, "/appointments/"+id+"/status", strings.NewReader(`{"status":"done"}`)),
		"remind":       httptest.NewRequest(http.MethodPut, "/appointments/"+id+"/my-reminders", strings.NewReader(`{"enabled":true}`)),
	} {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusInternalServerError, rec.Code, name)
	}
}

func TestHandlers_UnknownThingsAreNotFound(t *testing.T) {
	pool := testPool(t)
	h := appointment.NewHandler(appointment.NewService(appointment.NewRepository(pool)), httpx.NewResponder(&capture{}))
	withAccess := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(access.WithAccess(r.Context(), access.Access{Level: access.Full, ActorAccountID: uuid.New()})))
		})
	}
	r := chi.NewRouter()
	r.Use(withAccess)
	r.Get("/children/{childId}/appointments", h.ForChild)
	r.Get("/consultations/{consultationId}/appointment", h.ForConsultation)
	r.Post("/consultations/{consultationId}/appointments", h.Create)
	r.Get("/appointments/{appointmentId}", h.Get)
	r.Patch("/appointments/{appointmentId}", h.Update)
	r.Post("/appointments/{appointmentId}/status", h.SetStatus)
	r.Put("/appointments/{appointmentId}/my-reminders", h.SetMyReminders)
	id := uuid.NewString()
	for name, req := range map[string]*http.Request{
		"child":        httptest.NewRequest(http.MethodGet, "/children/"+id+"/appointments", nil),
		"consultation": httptest.NewRequest(http.MethodGet, "/consultations/"+id+"/appointment", nil),
		"create":       httptest.NewRequest(http.MethodPost, "/consultations/"+id+"/appointments", strings.NewReader(apptBody("x"))),
		"get":          httptest.NewRequest(http.MethodGet, "/appointments/"+id, nil),
		"update":       httptest.NewRequest(http.MethodPatch, "/appointments/"+id, strings.NewReader(apptBody("x"))),
		"status":       httptest.NewRequest(http.MethodPost, "/appointments/"+id+"/status", strings.NewReader(`{"status":"done"}`)),
		"remind":       httptest.NewRequest(http.MethodPut, "/appointments/"+id+"/my-reminders", strings.NewReader(`{"enabled":true}`)),
	} {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusNotFound, rec.Code, name)
	}
}
