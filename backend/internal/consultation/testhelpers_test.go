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

// createTestChild persists an account with a single child directly through
// the account package, returning the child's id — consultations always
// belong to an already-existing child.
func createTestChild(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	repo := account.NewRepository(pool)
	acc := &account.Account{
		FirstName: "Ana", LastName: "Gómez", Email: uniqueEmail("consultation.test"), Plan: account.PlanFree,
		Children: []account.Child{
			{FirstName: "Luis", LastName: "Gómez", BirthDate: time.Now().AddDate(-5, 0, 0)},
		},
	}
	require.NoError(t, repo.Create(context.Background(), acc))
	return acc.Children[0].ID
}

func strPtr(s string) *string { return &s }
