package payments_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/family"
	"github.com/Ulisesgtz/medic-track/backend/internal/payments"
)

// fixedNow is the clock of the tests: Thursday 2026-10-15 12:00 UTC. Nothing here depends on the real date.
var fixedNow = time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)

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

// newAccount creates an account with the given plan (the plan is given by hand: plan_source stays manual).
func newAccount(t *testing.T, pool *pgxpool.Pool, first string, plan account.Plan) uuid.UUID {
	t.Helper()
	acc := &account.Account{
		FirstName: first, LastName: "Prueba", Plan: plan,
		Email: fmt.Sprintf("pay.%d.%s@example.com", time.Now().UnixNano(), uuid.NewString()[:6]),
	}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))
	return acc.ID
}

// join makes `member` an active member of `owner`'s family.
func join(t *testing.T, pool *pgxpool.Pool, owner, member uuid.UUID, role string) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `INSERT INTO family_members (family_account_id, account_id, role, invited_by_account_id) VALUES ($1, $2, $3, $1)`, owner, member, role)
	require.NoError(t, err)
}

func newRepo(t *testing.T, pool *pgxpool.Pool) *payments.Repository {
	t.Helper()
	repo := payments.NewRepository(pool, family.NewRepository(pool))
	payments.SetNow(repo, func() time.Time { return fixedNow })
	return repo
}

// subOpts are the fields of a subscription the tests set.
type subOpts struct {
	status      payments.Status
	paidThrough *time.Time
	graceUntil  *time.Time
	createdAt   *time.Time
	providerID  string
}

func at(t time.Time) *time.Time { return &t }

// insertSub inserts a subscription row directly.
func insertSub(t *testing.T, pool *pgxpool.Pool, accountID uuid.UUID, o subOpts) uuid.UUID {
	t.Helper()
	if o.providerID == "" {
		o.providerID = "fake_" + uuid.NewString()[:8]
	}
	created := fixedNow
	if o.createdAt != nil {
		created = *o.createdAt
	}
	var id uuid.UUID
	err := pool.QueryRow(context.Background(), `
		INSERT INTO subscriptions (account_id, provider, provider_subscription_id, status, paid_through, grace_until, created_at, updated_at)
		VALUES ($1, 'fake', $2, $3, $4, $5, $6, $6) RETURNING id`,
		accountID, o.providerID, string(o.status), o.paidThrough, o.graceUntil, created).Scan(&id)
	require.NoError(t, err)
	return id
}

// planOf reads accounts.plan and plan_source.
func planOf(t *testing.T, pool *pgxpool.Pool, accountID uuid.UUID) (plan, source string) {
	t.Helper()
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT plan::text, plan_source FROM accounts WHERE id = $1`, accountID).Scan(&plan, &source))
	return plan, source
}

// recompute runs Recompute in its own transaction.
func recompute(t *testing.T, pool *pgxpool.Pool, repo *payments.Repository, accountID uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	require.NoError(t, repo.Recompute(ctx, tx, accountID))
	require.NoError(t, tx.Commit(ctx))
}

var _ pgx.Tx // keeps the import used if a helper is added
