package account_test

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
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

// TestRepository_GetByID_NotFound covers specs/003-home-listado-hijos FR-002:
// an id with no matching account must map to ErrAccountNotFound, not an
// opaque wrapped error.
func TestRepository_GetByID_NotFound(t *testing.T) {
	pool := testPool(t)
	repo := account.NewRepository(pool)

	_, err := repo.GetByID(context.Background(), uuid.New())

	require.ErrorIs(t, err, account.ErrAccountNotFound)
}

// TestRepository_GetByID_WithChildren covers the happy path: an account with
// children returns them ordered oldest-first (spec.md's "mismo orden en que
// fueron dados de alta").
func TestRepository_GetByID_WithChildren(t *testing.T) {
	pool := testPool(t)
	repo := account.NewRepository(pool)

	acc := &account.Account{
		FirstName: "Ana", LastName: "Gómez", Email: uniqueEmail("getbyid.repo.test"), Plan: account.PlanFree,
		Children: []account.Child{
			{FirstName: "Primero", LastName: "Gómez", BirthDate: mustParseDate(t, "2018-01-01")},
		},
	}
	require.NoError(t, repo.Create(context.Background(), acc))

	got, err := repo.GetByID(context.Background(), acc.ID)
	require.NoError(t, err)
	require.Equal(t, acc.Email, got.Email)
	require.Len(t, got.Children, 1)
	require.Equal(t, "Primero", got.Children[0].FirstName)
}

func TestRepository_GetByID_ConnectionError(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	repo := account.NewRepository(closedPool(t, dsn))

	_, err := repo.GetByID(context.Background(), uuid.New())

	require.Error(t, err)
	require.False(t, errors.Is(err, account.ErrAccountNotFound))
}

// TestRepository_CreateChild covers adding a child to an already-existing
// account (specs/003-home-listado-hijos, "Agregar hijo" from the home page).
func TestRepository_CreateChild(t *testing.T) {
	pool := testPool(t)
	repo := account.NewRepository(pool)

	acc := &account.Account{FirstName: "Ana", LastName: "Gómez", Email: uniqueEmail("createchild.repo.test"), Plan: account.PlanFree}
	require.NoError(t, repo.Create(context.Background(), acc))

	child, err := repo.CreateChild(context.Background(), acc.ID, account.CreateChildInput{
		FirstName: "Luis", LastName: "Gómez", BirthDate: mustParseDate(t, "2020-01-15"),
	})
	require.NoError(t, err)
	require.NotEqual(t, uuid.Nil, child.ID)

	got, err := repo.GetByID(context.Background(), acc.ID)
	require.NoError(t, err)
	require.Len(t, got.Children, 1)
}

func TestRepository_CreateChild_ConnectionError(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	repo := account.NewRepository(closedPool(t, dsn))

	_, err := repo.CreateChild(context.Background(), uuid.New(), account.CreateChildInput{
		FirstName: "Luis", LastName: "Gómez", BirthDate: mustParseDate(t, "2020-01-15"),
	})

	require.Error(t, err)
}

func mustParseDate(t *testing.T, s string) time.Time {
	t.Helper()
	d, err := time.Parse("2006-01-02", s)
	require.NoError(t, err)
	return d
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
