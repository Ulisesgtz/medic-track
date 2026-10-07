package appointment_test

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
	"github.com/Ulisesgtz/medic-track/backend/internal/appointment"
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

// family is an owner account with one child and one consultation of 2026-09-28.
type family struct {
	accountID, childID, consultationID uuid.UUID
}

func newFamily(t *testing.T, pool *pgxpool.Pool, plan account.Plan) family {
	t.Helper()
	suffix := fmt.Sprintf("%d.%s", time.Now().UnixNano(), uuid.NewString()[:6])
	acc := &account.Account{
		FirstName: "Ana", LastName: "Prueba", Email: "appointment." + suffix + "@example.com", Plan: plan,
		Children: []account.Child{{FirstName: "Hijo", LastName: "Prueba", BirthDate: time.Now().AddDate(-5, 0, 0)}},
	}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))
	f := family{accountID: acc.ID, childID: acc.Children[0].ID}
	f.consultationID = newConsultation(t, pool, f.childID, "2026-09-28")
	return f
}

func newConsultation(t *testing.T, pool *pgxpool.Pool, childID uuid.UUID, date string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO consultations (child_id, doctor_name, consult_date, photo) VALUES ($1, 'Dra. López', $2::date, '\x00') RETURNING id`,
		childID, date).Scan(&id))
	return id
}

func newPerson(t *testing.T, pool *pgxpool.Pool, first string) uuid.UUID {
	t.Helper()
	acc := &account.Account{FirstName: first, LastName: "Prueba", Email: fmt.Sprintf("person.%d.%s@example.com", time.Now().UnixNano(), uuid.NewString()[:6]), Plan: account.PlanFree}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))
	return acc.ID
}

// fixedNow is the clock of the tests: Wednesday 2026-10-07 12:00 UTC.
var fixedNow = time.Date(2026, 10, 7, 12, 0, 0, 0, time.UTC)

// friday is Friday 9 Oct 2026, 10:30 at -06:00 (16:30 UTC).
var friday = time.Date(2026, 10, 9, 16, 30, 0, 0, time.UTC)

const offset = -360

func newRepo(pool *pgxpool.Pool) *appointment.Repository {
	repo := appointment.NewRepository(pool)
	appointment.SetNow(repo, func() time.Time { return fixedNow })
	return repo
}

func newService(repo *appointment.Repository) *appointment.Service {
	svc := appointment.NewService(repo)
	appointment.SetServiceNow(svc, func() time.Time { return fixedNow })
	return svc
}

func ip(n int) *int       { return &n }
func sp(s string) *string { return &s }

// build validates an input against an old consultation date.
func build(t *testing.T, in appointment.Input) appointment.Normalized {
	t.Helper()
	n, errs := appointment.ValidateInput(in, "2026-01-01")
	require.False(t, errs.HasErrors(), "%v", errs)
	return n
}

// onFriday is a valid input for friday with the default notices.
func onFriday(note string) appointment.Input {
	return appointment.Input{StartsAt: friday, UtcOffsetMinutes: offset, Note: note}
}

func noticeIDs(a *appointment.Appointment) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(a.Notices))
	for _, n := range a.Notices {
		out = append(out, n.ID)
	}
	return out
}
