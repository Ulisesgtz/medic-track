package errorlog_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
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

// closedPool returns a pool whose connection has already been closed, so any
// query against it fails immediately.
func closedPool(t *testing.T, dsn string) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	pool.Close()
	return pool
}

func intPtr(i int) *int { return &i }

// createTestAccount inserts a minimal account row directly and returns its ID.
func createTestAccount(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	email := fmt.Sprintf("errorlog.test.%d@example.com", time.Now().UnixNano())
	err := pool.QueryRow(context.Background(), `
		INSERT INTO accounts (first_name, last_name, email, plan)
		VALUES ('Ana', 'Gómez', $1, 'free')
		RETURNING id
	`, email).Scan(&id)
	require.NoError(t, err)
	return id
}

func TestRepository_Create_WithoutAccount(t *testing.T) {
	pool := testPool(t)
	repo := errorlog.NewRepository(pool)

	entry := &errorlog.Entry{
		Message:    "email is required",
		HTTPStatus: intPtr(400),
		Endpoint:   "/accounts",
		File:       "handler.go",
		Line:       42,
		AccountID:  nil,
	}

	err := repo.Create(context.Background(), entry)

	require.NoError(t, err)
	require.NotEqual(t, uuid.Nil, entry.ID)
	require.False(t, entry.CreatedAt.IsZero())
}

func TestRepository_Create_WithAccount(t *testing.T) {
	pool := testPool(t)
	repo := errorlog.NewRepository(pool)
	accountID := createTestAccount(t, pool)

	entry := &errorlog.Entry{
		Message:    "Email is already in use",
		HTTPStatus: intPtr(409),
		Endpoint:   "/accounts",
		File:       "handler.go",
		Line:       55,
		AccountID:  &accountID,
	}

	err := repo.Create(context.Background(), entry)

	require.NoError(t, err)
	require.NotEqual(t, uuid.Nil, entry.ID)
}

func TestRepository_Create_ConnectionError(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	repo := errorlog.NewRepository(closedPool(t, dsn))

	err := repo.Create(context.Background(), &errorlog.Entry{
		Message:  "irrelevant",
		Endpoint: "/irrelevant",
		File:     "irrelevant.go",
		Line:     1,
	})

	require.Error(t, err)
}
