package vaccination_test

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
	"github.com/Ulisesgtz/medic-track/backend/internal/vaccination"
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

func closedPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	require.NoError(t, err)
	pool.Close()
	return pool
}

// family is an owner account with one child born five years ago.
type family struct {
	accountID, childID uuid.UUID
	birth              time.Time
}

func newFamily(t *testing.T, pool *pgxpool.Pool) family {
	t.Helper()
	suffix := fmt.Sprintf("%d.%s", time.Now().UnixNano(), uuid.NewString()[:6])
	birth := time.Now().UTC().AddDate(-5, 0, 0)
	acc := &account.Account{
		FirstName: "Ana", LastName: "Prueba", Email: "vaccination." + suffix + "@example.com", Plan: account.PlanPaid,
		Children: []account.Child{{FirstName: "Hijo", LastName: "Prueba", BirthDate: birth}},
	}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))
	return family{accountID: acc.ID, childID: acc.Children[0].ID, birth: birth}
}

// addChild adds a second child to the family's account.
func (f family) addChild(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO children (account_id, first_name, last_name, birth_date) VALUES ($1, 'Otro', 'Hijo', $2) RETURNING id`,
		f.accountID, f.birth).Scan(&id))
	return id
}

func today() string { return time.Now().UTC().Format("2006-01-02") }

func dose(code, on string) vaccination.Input {
	return vaccination.Input{VaccineCode: code, AppliedOn: on}
}

func intp(n int) *int { return &n }
