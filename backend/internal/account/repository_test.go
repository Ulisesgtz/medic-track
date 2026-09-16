package account_test

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
)

// closedPool returns a pool whose connection has already been closed, so any
// query against it fails immediately. Used to exercise the internal-error
// branches of Repository methods without needing to break the real database.
func closedPool(t *testing.T, dsn string) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	pool.Close()
	return pool
}

// TestRepository_Create_DuplicateEmail covers FR-002: creating a second
// account with an email already in use must fail with ErrEmailAlreadyExists,
// mapped by the handler to 409 Conflict.
func TestRepository_Create_DuplicateEmail(t *testing.T) {
	pool := testPool(t)
	repo := account.NewRepository(pool)

	email := uniqueEmail("duplicate.repo.test")
	first := &account.Account{FirstName: "Ana", LastName: "Gómez", Email: email, Plan: account.PlanFree}
	require.NoError(t, repo.Create(context.Background(), first))

	second := &account.Account{FirstName: "Otra", LastName: "Persona", Email: email, Plan: account.PlanFree}
	err := repo.Create(context.Background(), second)

	require.ErrorIs(t, err, account.ErrEmailAlreadyExists)
}

// TestRepository_EmailExists covers the read path used by Service before
// attempting an insert.
func TestRepository_EmailExists(t *testing.T) {
	pool := testPool(t)
	repo := account.NewRepository(pool)

	email := uniqueEmail("exists.repo.test")

	exists, err := repo.EmailExists(context.Background(), email)
	require.NoError(t, err)
	require.False(t, exists)

	acc := &account.Account{FirstName: "Ana", LastName: "Gómez", Email: email, Plan: account.PlanFree}
	require.NoError(t, repo.Create(context.Background(), acc))

	exists, err = repo.EmailExists(context.Background(), email)
	require.NoError(t, err)
	require.True(t, exists)
}

func TestRepository_EmailExists_ConnectionError(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	repo := account.NewRepository(closedPool(t, dsn))

	_, err := repo.EmailExists(context.Background(), "irrelevant@example.com")

	require.Error(t, err)
}

// TestRepository_Create_NameLengthCheckConstraint covers the defense-in-depth
// DB CHECK constraint (migration 0004): a name exceeding 100 characters that
// somehow bypasses service-layer validation must map to ErrInvalidNameFormat,
// not a raw wrapped error the handler would turn into a 500.
func TestRepository_Create_NameLengthCheckConstraint(t *testing.T) {
	pool := testPool(t)
	repo := account.NewRepository(pool)

	err := repo.Create(context.Background(), &account.Account{
		FirstName: strings.Repeat("a", 101),
		LastName:  "Gómez",
		Email:     uniqueEmail("check-constraint.repo.test"),
		Plan:      account.PlanFree,
	})

	require.ErrorIs(t, err, account.ErrInvalidNameFormat)
}

func TestRepository_Create_ConnectionError(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	repo := account.NewRepository(closedPool(t, dsn))

	err := repo.Create(context.Background(), &account.Account{
		FirstName: "Ana", LastName: "Gómez", Email: "irrelevant@example.com", Plan: account.PlanFree,
	})

	require.Error(t, err)
}
