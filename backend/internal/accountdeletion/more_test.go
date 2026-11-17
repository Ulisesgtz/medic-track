package accountdeletion

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	clerk "github.com/clerk/clerk-sdk-go/v2"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/authmw/authmwtest"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/mailer"
)

func TestRequireNotPending(t *testing.T) {
	h := newHarness(t)
	responder := httpx.NewResponder(&recorder{})
	verifier := authmwtest.NewVerifier(t, responder)
	r := chi.NewRouter()
	ok := func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) }
	// Inside a group, as in internal/server: there chi already knows the route when the guard runs.
	r.Group(func(r chi.Router) {
		r.Use(verifier.Middleware)
		r.Use(RequireNotPending(responder, h.repo))
		r.Get("/accounts/me", ok)
		r.Get("/children/{childId}/consultations", ok)
		r.Post("/accounts/{accountId}/data-export", ok)
	})
	do := func(method, path, clerkID string) int {
		req := httptest.NewRequest(method, path, nil)
		req.Header.Set("Authorization", "Bearer "+verifier.Token(t, clerkID))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec.Code
	}
	clerkA := "user_" + h.w.A.String()
	require.Equal(t, http.StatusTeapot, do(http.MethodGet, "/children/x/consultations", clerkA), "not paused yet")

	_, err := h.svc.Request(context.Background(), h.w.A, ConfirmWord, true)
	require.NoError(t, err)
	require.Equal(t, http.StatusConflict, do(http.MethodGet, "/children/x/consultations", clerkA))
	require.Equal(t, http.StatusTeapot, do(http.MethodGet, "/accounts/me", clerkA), "allowed while pending")
	require.Equal(t, http.StatusTeapot, do(http.MethodPost, "/accounts/x/data-export", clerkA))
	require.Equal(t, http.StatusTeapot, do(http.MethodGet, "/children/x/consultations", "user_"+h.w.B.String()), "only the paused account")

	// A request without a session never gets this far in the router; here it passes through untouched.
	plain := RequireNotPending(responder, h.repo)(http.HandlerFunc(ok))
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/children/x/consultations", nil)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, chi.NewRouteContext()))
	plain.ServeHTTP(rec, req)
	require.Equal(t, http.StatusTeapot, rec.Code)

	// With the database gone the guard answers 500 instead of letting the request through.
	closed := closedPool(t)
	r2 := chi.NewRouter()
	r2.Group(func(r chi.Router) {
		r.Use(verifier.Middleware)
		r.Use(RequireNotPending(responder, NewRepository(closed)))
		r.Get("/children/{childId}/consultations", ok)
	})
	req = httptest.NewRequest(http.MethodGet, "/children/x/consultations", nil)
	req.Header.Set("Authorization", "Bearer "+verifier.Token(t, clerkA))
	rec = httptest.NewRecorder()
	r2.ServeHTTP(rec, req)
	require.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestPendingAccountSQL(t *testing.T) {
	sql := PendingAccountSQL("m.account_id")
	require.Contains(t, sql, "d.account_id = m.account_id")
	require.Contains(t, sql, OpenSQL)
}

func closedPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	pool.Close()
	return pool
}

func TestEverythingFailsCleanlyWithoutTheDatabase(t *testing.T) {
	pool := closedPool(t)
	ctx := context.Background()
	repo := NewRepository(pool)
	_, err := repo.Open(ctx, uuid.New())
	require.Error(t, err)
	_, err = repo.OpenForClerkUser(ctx, "user_x")
	require.Error(t, err)
	_, err = repo.Cancel(ctx, uuid.New())
	require.Error(t, err)
	require.Error(t, repo.markAttempt(ctx, uuid.New()))

	rep := &fakeReporter{}
	svc := NewService(repo, pool, &fakeClerk{}, nil, nil, rep)
	_, err = svc.Request(ctx, uuid.New(), ConfirmWord, true)
	require.Error(t, err)
	require.Error(t, svc.Cancel(ctx, uuid.New()))
	_, err = svc.RunOnce(ctx)
	require.Error(t, err)
	_, err = svc.ReconcileDeleted(ctx, func(context.Context, string) (bool, error) { return true, nil }, ReconcileOptions{})
	require.Error(t, err)

	responder := httpx.NewResponder(&recorder{})
	verifier := authmwtest.NewVerifier(t, responder)
	handler := NewHandler(svc, responder)
	r := chi.NewRouter()
	r.Use(verifier.Middleware)
	r.Get("/accounts/{accountId}/deletion", handler.GetDeletion)
	r.Post("/accounts/{accountId}/deletion", handler.RequestDeletion)
	r.Post("/accounts/{accountId}/deletion/cancel", handler.CancelDeletion)
	id := uuid.NewString()
	for _, c := range []struct{ method, path, body string }{
		{http.MethodGet, "/accounts/" + id + "/deletion", ""},
		{http.MethodPost, "/accounts/" + id + "/deletion", `{"confirm":"ELIMINAR"}`},
		{http.MethodPost, "/accounts/" + id + "/deletion/cancel", ""},
	} {
		req := httptest.NewRequest(c.method, c.path, strings.NewReader(c.body))
		req.Header.Set("Authorization", "Bearer "+verifier.TokenVerifiedMinutesAgo(t, "user_x", 1))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusInternalServerError, rec.Code, c.path)
	}
}

func TestPurge_StopsAtTheFirstFailingStep(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	require.NoError(t, tx.Rollback(ctx))
	err = Purge(ctx, tx, uuid.New())
	require.Error(t, err)
	require.Contains(t, err.Error(), "step 1")
}

func TestRunOnce_APurgeThatFailsIsReported(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	_, err := h.svc.Request(ctx, h.w.A, ConfirmWord, true)
	require.NoError(t, err)
	h.now = h.now.Add(GracePeriod + time.Minute)
	// A row the purge can't delete without breaking a key: a dose of another account added by one of A's extensions.
	_, err = h.pool.Exec(ctx, `INSERT INTO doses (medication_id, scheduled_at, added_by_extension_id)
		VALUES (('22222222-0000-0000-0000-'||right($1::text, 12))::uuid, now(), ('33333333-0000-0000-0000-'||right($2::text, 12))::uuid)`,
		h.w.X.String(), h.w.A.String())
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = h.pool.Exec(context.Background(), `DELETE FROM doses WHERE added_by_extension_id = ('33333333-0000-0000-0000-'||right($1::text, 12))::uuid`, h.w.A.String())
	})
	n, err := h.svc.RunOnce(ctx)
	require.NoError(t, err)
	require.Zero(t, n)
	require.Equal(t, []string{KindPurge + ": " + messagePurge}, h.reporter.kinds)
	require.Equal(t, []string{"user_" + h.w.A.String()}, h.clerk.deleted, "the Clerk user went first; the next run retries the data")
}

// mockClerk points Clerk's global backend at a server that answers every call with status.
func mockClerk(t *testing.T, status int) {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		if status >= 400 {
			_, _ = w.Write([]byte(`{"errors":[{"code":"resource_not_found","message":"not found"}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"id":"user_1","object":"user","deleted":true}`))
	}))
	t.Cleanup(server.Close)
	clerk.SetKey("test-secret-key")
	clerk.SetBackend(clerk.NewBackend(&clerk.BackendConfig{HTTPClient: server.Client(), URL: &server.URL}))
}

func TestClerkAPI(t *testing.T) {
	ctx := context.Background()
	mockClerk(t, http.StatusOK)
	require.NoError(t, ClerkAPI{}.Delete(ctx, "user_1"))
	exists, err := ClerkAPI{}.Exists(ctx, "user_1")
	require.NoError(t, err)
	require.True(t, exists)

	mockClerk(t, http.StatusNotFound)
	require.NoError(t, ClerkAPI{}.Delete(ctx, "user_1"), "already gone counts as done")
	exists, err = ClerkAPI{}.Exists(ctx, "user_1")
	require.NoError(t, err)
	require.False(t, exists)

	mockClerk(t, http.StatusInternalServerError)
	err = ClerkAPI{}.Delete(ctx, "user_1")
	require.Error(t, err)
	require.NotContains(t, err.Error(), "not found", "never Clerk's own text")
	_, err = ClerkAPI{}.Exists(ctx, "user_1")
	require.Error(t, err)
}

type failingSender struct{ calls int }

func (f *failingSender) Send(context.Context, mailer.Message) error {
	f.calls++
	return errors.New("provider down")
}

func TestMailer_AFailingSendIsRetriedAndReturned(t *testing.T) {
	sender := &failingSender{}
	m := NewMailer(sender, nil, "a@b.c")
	m.sleep = func(context.Context, time.Duration) error { return nil }
	require.Error(t, m.Completed(context.Background(), "x@y.z", "Ana"))
	require.Equal(t, 3, sender.calls)
}

func TestPaymentsCanceler_CancelsOnlyAnOpenSubscription(t *testing.T) {
	pool := testPool(t)
	w := seedWorld(t, pool) // A has an active subscription; X has none
	ctx := context.Background()
	var calls []uuid.UUID
	cancel := PaymentsCanceler(pool, func(_ context.Context, id uuid.UUID) error {
		calls = append(calls, id)
		return nil
	})
	canceled, err := cancel(ctx, w.A)
	require.NoError(t, err)
	require.True(t, canceled)
	canceled, err = cancel(ctx, w.X)
	require.NoError(t, err)
	require.False(t, canceled)
	require.Equal(t, []uuid.UUID{w.A}, calls)

	failing := PaymentsCanceler(pool, func(context.Context, uuid.UUID) error { return errors.New("provider down") })
	_, err = failing(ctx, w.A)
	require.Error(t, err)
	none := PaymentsCanceler(pool, nil)
	canceled, err = none(ctx, w.A)
	require.NoError(t, err)
	require.False(t, canceled, "without the charge configured there is nothing to cancel")
	_, err = PaymentsCanceler(closedPool(t), nil)(ctx, w.A)
	require.Error(t, err)
}
