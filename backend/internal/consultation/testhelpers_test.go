package consultation_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
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

func closedPool(t *testing.T, dsn string) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	pool.Close()
	return pool
}

func uniqueEmail(base string) string {
	return fmt.Sprintf("%s.%d@example.com", base, time.Now().UnixNano())
}

// createTestChild persists a PAID account with a single child directly through the account package, returning the
// child's id — consultations always belong to an already-existing child. The tests that aren't about the free plan's
// rules (specs/030) use a paid account so those rules don't get in their way; plan_test.go uses createFreeTestChild.
func createTestChild(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	return createChildren(t, pool, account.PlanPaid, 1)[0]
}

// createFreeTestChild is createTestChild on the free plan.
func createFreeTestChild(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	return createChildren(t, pool, account.PlanFree, 1)[0]
}

// createChildren persists one account on the given plan with n children and returns their ids. (Creating the account
// directly through the repository doesn't apply the free plan's one-child limit; that one is checked by the service.)
func createChildren(t *testing.T, pool *pgxpool.Pool, plan account.Plan, n int) []uuid.UUID {
	t.Helper()
	acc := &account.Account{FirstName: "Ana", LastName: "Gómez", Email: uniqueEmail("consultation.test"), Plan: plan}
	for i := 0; i < n; i++ {
		acc.Children = append(acc.Children, account.Child{FirstName: fmt.Sprintf("Hijo%c", 'A'+i), LastName: "Gómez", BirthDate: time.Now().AddDate(-5, 0, 0)})
	}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))
	ids := make([]uuid.UUID, 0, n)
	for _, child := range acc.Children {
		ids = append(ids, child.ID)
	}
	return ids
}

func strPtr(s string) *string { return &s }
