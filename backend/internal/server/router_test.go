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

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw/authmwtest"
	"github.com/Ulisesgtz/medic-track/backend/internal/catalog"
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/family"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/ownership"
	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
	"github.com/Ulisesgtz/medic-track/backend/internal/server"
	"github.com/Ulisesgtz/medic-track/backend/internal/supplement"
)

type noopRecorder struct{}

func (noopRecorder) Create(context.Context, *errorlog.Entry) error { return nil }

// world is two tutors, each with a child and a consultation, behind the real
// router: what one session can and cannot reach of the other's data.
type world struct {
	router   http.Handler
	verifier *authmwtest.Verifier

	clerkA, clerkB string
	// Specs/032: people of A's family (and one who left), each with their own account and no children of their own.
	clerkTutor, clerkCaregiver, clerkKid, clerkRemoved string
	pool                                              *pgxpool.Pool
	// emails is each session's verified e-mail, what the (fake) Clerk answers to the family's invitations.
	emails map[string]string
	accountA       uuid.UUID
	childA         uuid.UUID
	consultationA  uuid.UUID
	doseA          uuid.UUID
	// Specs/033: a supplement routine of child A (inserted directly: A is on the free plan here) and one of its doses.
	routineA     uuid.UUID
	routineDoseA uuid.UUID
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
		verifier:       verifier,
		pool:           pool,
		clerkA:         fmt.Sprintf("user_router_a_%d", suffix),
		clerkB:         fmt.Sprintf("user_router_b_%d", suffix),
		clerkTutor:     fmt.Sprintf("user_router_tutor_%d", suffix),
		clerkCaregiver: fmt.Sprintf("user_router_caregiver_%d", suffix),
		clerkKid:       fmt.Sprintf("user_router_kid_%d", suffix),
		clerkRemoved:   fmt.Sprintf("user_router_removed_%d", suffix),
		emails:         map[string]string{},
	}
	create := func(clerkID, name string) *account.Account {
		acc := &account.Account{
			FirstName: name, LastName: "Prueba", Email: fmt.Sprintf("%s.%d@example.com", name, suffix),
			Plan: account.PlanFree, ClerkUserID: &clerkID,
			Children: []account.Child{{FirstName: "Hijo", LastName: name, BirthDate: time.Now().AddDate(-5, 0, 0)}},
		}
		require.NoError(t, accountRepo.Create(context.Background(), acc))
		w.emails[clerkID] = acc.Email
		return acc
	}
	a := create(w.clerkA, "Ana")
	create(w.clerkB, "Beto")
	w.accountA, w.childA = a.ID, a.Children[0].ID
	member := func(clerkID, name, role string, childID *uuid.UUID, status string) {
		acc := &account.Account{FirstName: name, LastName: "Prueba", Email: fmt.Sprintf("%s.%d@example.com", name, suffix), Plan: account.PlanFree, ClerkUserID: &clerkID}
		require.NoError(t, accountRepo.Create(context.Background(), acc))
		w.emails[clerkID] = acc.Email
		_, err := pool.Exec(context.Background(), `
			INSERT INTO family_members (family_account_id, account_id, role, child_id, invited_by_account_id, status, ended_at)
			VALUES ($1, $2, $3, $4, $1, $5, CASE WHEN $5 = 'active' THEN NULL ELSE now() END)`, a.ID, acc.ID, role, childID, status)
		require.NoError(t, err)
	}
	member(w.clerkTutor, "Tutor", "tutor", nil, "active")
	member(w.clerkCaregiver, "Cuidadora", "caregiver", nil, "active")
	member(w.clerkKid, "Hijo", "child", &w.childA, "active")
	member(w.clerkRemoved, "Quitado", "tutor", nil, "removed")

	start := "08:00"
	c, err := consultationSvc.CreateConsultation(context.Background(), w.childA, consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: time.Now(), Photo: []byte("fake-jpeg-bytes"),
		Medications: []consultation.CreateMedicationInput{{Name: "Amoxicilina", FrequencyHours: 8, DurationDays: 3, StartTime: &start}},
	})
	require.NoError(t, err)
	w.consultationA = c.ID
	w.doseA = c.Medications[0].Doses[0].ID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO supplement_routines (account_id, child_id, name, period, times, first_date, utc_offset_minutes, generated_until, created_by_account_id)
		VALUES ($1, $2, 'Vitamina D', 'daily', ARRAY['08:00']::time[], current_date, 0, now() + interval '14 days', $1) RETURNING id`, w.accountA, w.childA).Scan(&w.routineA))
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO supplement_doses (routine_id, scheduled_at) VALUES ($1, now() + interval '1 hour') RETURNING id`, w.routineA).Scan(&w.routineDoseA))

	w.router = server.NewRouter(server.Deps{
		Responder:    responder,
		Catalog:      catalog.NewHandler(catalog.NewRepository(pool), responder),
		Account:      account.NewHandler(account.NewService(accountRepo), responder),
		Consultation: consultation.NewHandler(consultationSvc, responder),
		Reminder: reminder.NewHandler(reminder.NewService(reminder.NewRepository(pool), nil, reminder.Config{
			VAPIDPublicKey: "test-public", VAPIDPrivateKey: "test-private", VAPIDSubject: "test@example.com", ActionSecret: "test-secret",
		}), responder),
		Family: family.NewHandler(family.NewService(family.NewRepository(pool), access.NewRepository(pool),
			family.EmailFunc(func(_ context.Context, clerkUserID string) (string, error) {
				if email, ok := w.emails[clerkUserID]; ok {
					return email, nil
				}
				return "", family.ErrEmailNotVerified
			})), responder),
		Supplement:     supplement.NewHandler(supplement.NewService(supplement.NewRepository(pool)), responder),
		Ownership:      ownership.NewRepository(pool),
		Access:         access.NewRepository(pool),
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
		{"accept disclaimer", http.MethodPost, "/accounts/" + w.accountA.String() + "/disclaimer-acceptance", `{}`, http.StatusBadRequest},
		{"reminder settings", http.MethodPatch, "/accounts/" + w.accountA.String() + "/reminder-settings", `{}`, http.StatusBadRequest},
		{"register reminder device", http.MethodPost, "/accounts/" + w.accountA.String() + "/reminder-devices", `{}`, http.StatusBadRequest},
		{"remove reminder device", http.MethodPost, "/accounts/" + w.accountA.String() + "/reminder-devices/remove", `{}`, http.StatusBadRequest},
		{"list consultations", http.MethodGet, "/children/" + w.childA.String() + "/consultations", "", http.StatusOK},
		// Specs/031: tutor A's account is on the free plan here, so the owner reaches the handler and is told it is the paid plan's.
		{"search consultations", http.MethodPost, "/children/" + w.childA.String() + "/consultations/search", `{}`, http.StatusUnprocessableEntity},
		{"history options", http.MethodGet, "/children/" + w.childA.String() + "/history-options", "", http.StatusUnprocessableEntity},
		{"child overview", http.MethodGet, "/children/" + w.childA.String() + "/overview" + window, "", http.StatusOK},
		{"create consultation", http.MethodPost, "/children/" + w.childA.String() + "/consultations", `{}`, http.StatusBadRequest},
		{"get consultation", http.MethodGet, "/consultations/" + w.consultationA.String(), "", http.StatusOK},
		{"mark dose", http.MethodPatch, "/consultations/" + w.consultationA.String() + "/doses/" + w.doseA.String(), `{"taken":true}`, http.StatusOK},
		// The owner reaches the handler, which knows no such medication (a real one would be ended for good).
		{"end treatment", http.MethodPost, "/consultations/" + w.consultationA.String() + "/medications/" + uuid.NewString() + "/end", "", http.StatusNotFound},
		{"extend treatment", http.MethodPost, "/consultations/" + w.consultationA.String() + "/medications/" + uuid.NewString() + "/extend", `{"doses":2}`, http.StatusNotFound},
		// Specs/033: the owner reaches the handler (an empty form is a 400; the free plan is only asked once the form is valid).
		{"list routines", http.MethodGet, "/children/" + w.childA.String() + "/routines" + window, "", http.StatusOK},
		{"create routine", http.MethodPost, "/children/" + w.childA.String() + "/routines", `{}`, http.StatusBadRequest},
		{"get routine", http.MethodGet, "/routines/" + w.routineA.String() + window, "", http.StatusOK},
		{"mark routine dose", http.MethodPatch, "/routines/" + w.routineA.String() + "/doses/" + w.routineDoseA.String(), `{"taken":true}`, http.StatusOK},
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
	for _, path := range []string{"/accounts/me", "/reminders/config"} {
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
		"/routines/" + uuid.NewString() + "?from=2026-01-15T00:00:00Z&to=2026-01-16T00:00:00Z",
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
	for _, path := range []string{"/accounts/not-a-uuid", "/children/not-a-uuid/consultations", "/consultations/not-a-uuid", "/routines/not-a-uuid", "/children/not-a-uuid/routines"} {
		require.Equal(t, http.StatusNotFound, w.do(t, http.MethodGet, path, tokenA, "").Code, path)
	}
}

// The reminder's "Tomada" action has no session by design; without a valid token it does nothing.
func TestRouter_TheReminderActionIsPublicButNeedsItsToken(t *testing.T) {
	w := newWorld(t)
	require.Equal(t, http.StatusBadRequest, w.do(t, http.MethodPost, "/reminders/actions/taken", "", `{}`).Code)
	rec := w.do(t, http.MethodPost, "/reminders/actions/taken", "", `{"token":"forged.token"}`)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), `"invalid_action_token"`)
}

func TestRouter_TheCatalogStaysPublic(t *testing.T) {
	w := newWorld(t)
	require.Equal(t, http.StatusOK, w.do(t, http.MethodGet, "/catalog/countries", "", "").Code)
	require.Equal(t, http.StatusOK, w.do(t, http.MethodGet, "/catalog/symptoms", "", "").Code)
}

// ---- Specs/032-compartir-con-familia: the matrix of roles over every route.

// ownRoutes are the person's own account (their notice, reminder settings and devices): never a family's.
// fullRoutes need the full level (the owner or a Tutor); every other protected route needs only Mark (see and mark).
var (
	ownRoutes  = map[string]bool{"get account": true, "accept disclaimer": true, "reminder settings": true, "register reminder device": true, "remove reminder device": true}
	fullRoutes = map[string]bool{"add child": true, "create consultation": true, "end treatment": true, "extend treatment": true, "create routine": true}
)

func (w *world) setOwnerPlan(t *testing.T, plan string) {
	t.Helper()
	_, err := w.pool.Exec(context.Background(), `UPDATE accounts SET plan = $2 WHERE id = $1`, w.accountA, plan)
	require.NoError(t, err)
}

// reaches is true when the request got past the access check to the handler (whatever the handler then answered).
func reaches(rec *httptest.ResponseRecorder) bool {
	return rec.Code != http.StatusUnauthorized && rec.Code != http.StatusForbidden
}

func TestRouter_ACaregiverSeesAndMarksButNothingMore(t *testing.T) {
	w := newWorld(t)
	token := w.verifier.Token(t, w.clerkCaregiver)
	for _, rt := range w.routes() {
		t.Run(rt.name, func(t *testing.T) {
			rec := w.do(t, rt.method, rt.path, token, rt.body)
			if ownRoutes[rt.name] || fullRoutes[rt.name] {
				require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
				return
			}
			require.Equal(t, rt.ownerStatus, rec.Code, rec.Body.String())
		})
	}
}

// FR-024: with the owner's plan not paid, a Tutor keeps seeing and marking and nothing else.
func TestRouter_ATutorOfAFamilyThatIsNotPaidIsCappedAtMark(t *testing.T) {
	w := newWorld(t) // the owner is on the free plan
	token := w.verifier.Token(t, w.clerkTutor)
	for _, rt := range w.routes() {
		t.Run(rt.name, func(t *testing.T) {
			rec := w.do(t, rt.method, rt.path, token, rt.body)
			if ownRoutes[rt.name] || fullRoutes[rt.name] {
				require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
				return
			}
			require.Equal(t, rt.ownerStatus, rec.Code, rec.Body.String())
		})
	}
}

func TestRouter_ATutorOfAPaidFamilyReachesWhatTheOwnerDoesButNotTheOwnersOwnAccount(t *testing.T) {
	w := newWorld(t)
	w.setOwnerPlan(t, "paid")
	token := w.verifier.Token(t, w.clerkTutor)
	for _, rt := range w.routes() {
		t.Run(rt.name, func(t *testing.T) {
			rec := w.do(t, rt.method, rt.path, token, rt.body)
			if ownRoutes[rt.name] {
				require.Equal(t, http.StatusForbidden, rec.Code, "the owner's own notice, settings and devices are hers: "+rec.Body.String())
				return
			}
			require.True(t, reaches(rec), "%s -> %d %s", rt.name, rec.Code, rec.Body.String())
		})
	}
}

func TestRouter_AChildRoleMemberSeesAndMarksTheirChildAndNothingElse(t *testing.T) {
	w := newWorld(t)
	w.setOwnerPlan(t, "paid")
	token := w.verifier.Token(t, w.clerkKid)
	for _, rt := range w.routes() {
		t.Run(rt.name, func(t *testing.T) {
			rec := w.do(t, rt.method, rt.path, token, rt.body)
			if ownRoutes[rt.name] || fullRoutes[rt.name] {
				require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
				return
			}
			require.True(t, reaches(rec), "%s -> %d %s", rt.name, rec.Code, rec.Body.String())
		})
	}
}

// FR-028 / SC-007: someone who left or was removed gets 403 on everything, at once.
func TestRouter_APersonWhoWasRemovedGets403OnEveryRoute(t *testing.T) {
	w := newWorld(t)
	w.setOwnerPlan(t, "paid")
	token := w.verifier.Token(t, w.clerkRemoved)
	for _, rt := range w.routes() {
		t.Run(rt.name, func(t *testing.T) {
			require.Equal(t, http.StatusForbidden, w.do(t, rt.method, rt.path, token, rt.body).Code)
		})
	}
}
