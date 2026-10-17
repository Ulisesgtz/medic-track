package payments_test

import (
	"context"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/family"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/payments"
)

// What the service and the handler do when the database fails: nothing is half done and nothing is leaked.

func closedPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	require.NoError(t, err)
	pool.Close()
	return pool
}

func brokenWorld(t *testing.T) (*world, *payments.Repository) {
	t.Helper()
	testPool(t) // skips without a database
	pool := closedPool(t)
	repo := payments.NewRepository(pool, family.NewRepository(pool))
	payments.SetNow(repo, func() time.Time { return fixedNow })
	return build(t, pool, repo, payments.NewFake("http://x"), fakeConfig), repo
}

func TestWhenTheDatabaseFailsEveryOperationReturnsAnError(t *testing.T) {
	w, repo := brokenWorld(t)
	ctx := context.Background()
	id := uuid.New()

	_, err := w.svc.State(ctx, id)
	require.Error(t, err)
	_, err = w.svc.Subscribe(ctx, id)
	require.Error(t, err)
	require.Error(t, w.svc.Cancel(ctx, id))
	_, err = w.svc.Sweep(ctx)
	require.Error(t, err)
	_, err = w.svc.Reconcile(ctx)
	require.Error(t, err)
	_, err = repo.CanSubscribe(ctx, id)
	require.Error(t, err)
	_, err = repo.Current(ctx, id)
	require.Error(t, err)
	_, err = repo.LastEnded(ctx, id)
	require.Error(t, err)
}

func TestTheHandlerAnswers500WhenTheDatabaseFails(t *testing.T) {
	w, _ := brokenWorld(t)
	h := payments.NewHandler(w.svc, httpx.NewResponder(&logCapture{}), fakeConfig)
	r := chi.NewRouter()
	r.Get("/accounts/{accountId}/subscription", h.GetSubscription)
	r.Post("/accounts/{accountId}/subscription", h.Subscribe)
	r.Post("/accounts/{accountId}/subscription/cancel", h.Cancel)
	a := &api{world: w, router: r, logs: &logCapture{}, cfg: fakeConfig}
	base := "/accounts/" + uuid.NewString() + "/subscription"

	for _, c := range []struct{ method, path string }{{http.MethodGet, base}, {http.MethodPost, base}, {http.MethodPost, base + "/cancel"}} {
		code, body, _ := a.do(t, c.method, c.path, "", nil)
		require.Equal(t, http.StatusInternalServerError, code, c.path)
		require.Equal(t, "internal_error", body["error"])
	}
}

func TestRecomputeAndTheSweeperSurfaceDatabaseErrors(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(t, pool)
	id := newAccount(t, pool, "Ana", account.PlanFree)
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	require.NoError(t, tx.Rollback(ctx))
	require.Error(t, repo.Recompute(ctx, tx, id), "a transaction that is over cannot be used")

	w := build(t, pool, repo, payments.NewFake("x"), fakeConfig)
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	_, err = w.svc.Sweep(cancelled)
	require.Error(t, err)
	_, err = w.svc.Reconcile(cancelled)
	require.Error(t, err)
}

func TestSmallThingsOfTheModel(t *testing.T) {
	require.Equal(t, "subscription not allowed: already_paid", (&payments.NotAllowedError{Reason: "already_paid"}).Error())
	d := payments.Decision{}
	require.True(t, d.Allowed())
	d.Reason = payments.ReasonPending
	require.False(t, d.Allowed())
}

func TestConfigFromTheEnvironment(t *testing.T) {
	t.Setenv("PAYMENTS_DRIVER", "fake")
	t.Setenv("FRONTEND_ORIGIN", "http://localhost:5173")
	t.Setenv("PAYMENTS_GRACE_DAYS", "9")

	cfg := payments.ConfigFromEnv()

	require.True(t, cfg.Fake())
	require.True(t, cfg.Available())
	require.Equal(t, 9, cfg.GraceDays)
}
