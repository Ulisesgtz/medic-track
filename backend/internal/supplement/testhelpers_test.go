package supplement_test

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
	"github.com/Ulisesgtz/medic-track/backend/internal/supplement"
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

// family is an owner account with one child, on the given plan.
type family struct {
	accountID uuid.UUID
	childID   uuid.UUID
}

func newFamily(t *testing.T, pool *pgxpool.Pool, plan account.Plan) family {
	t.Helper()
	suffix := fmt.Sprintf("%d.%s", time.Now().UnixNano(), uuid.NewString()[:6])
	acc := &account.Account{
		FirstName: "Ana", LastName: "Prueba", Email: "supplement." + suffix + "@example.com", Plan: plan,
		Children: []account.Child{{FirstName: "Hijo", LastName: "Prueba", BirthDate: time.Now().AddDate(-5, 0, 0)}},
	}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))
	return family{accountID: acc.ID, childID: acc.Children[0].ID}
}

// newPerson is another account, to be the one who marks (no family needed: the repository does not check access).
func newPerson(t *testing.T, pool *pgxpool.Pool, first string) uuid.UUID {
	t.Helper()
	acc := &account.Account{FirstName: first, LastName: "Prueba", Email: fmt.Sprintf("person.%d.%s@example.com", time.Now().UnixNano(), uuid.NewString()[:6]), Plan: account.PlanFree}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))
	return acc.ID
}

// fixedNow is the clock of the tests: Monday 2026-10-05 15:00 UTC.
var fixedNow = time.Date(2026, 10, 5, 15, 0, 0, 0, time.UTC)

func newRepo(pool *pgxpool.Pool) *supplement.Repository {
	repo := supplement.NewRepository(pool)
	supplement.SetNow(repo, func() time.Time { return fixedNow })
	return repo
}

// daily is a valid daily routine named name, from the clock's day.
func daily(name string, times ...string) supplement.Routine {
	if len(times) == 0 {
		times = []string{"08:00"}
	}
	return supplement.Routine{Name: name, Period: supplement.PeriodDaily, Times: times, FirstDate: "2026-10-05"}
}

func countDoses(t *testing.T, pool *pgxpool.Pool, routineID uuid.UUID) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM supplement_doses WHERE routine_id = $1`, routineID).Scan(&n))
	return n
}

// closedSupplementPool is a pool that was closed, to see how an unavailable database is answered.
func closedSupplementPool(t *testing.T, _ *pgxpool.Pool) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	require.NoError(t, err)
	pool.Close()
	return pool
}
