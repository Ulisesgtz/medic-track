package ownership_test

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
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
	"github.com/Ulisesgtz/medic-track/backend/internal/ownership"
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

type fixture struct {
	repo           *ownership.Repository
	clerkID        string
	accountID      uuid.UUID
	childID        uuid.UUID
	consultationID uuid.UUID
}

func newFixture(t *testing.T) fixture {
	t.Helper()
	pool := testPool(t)
	suffix := time.Now().UnixNano()
	clerkID := fmt.Sprintf("user_ownership_%d", suffix)
	acc := &account.Account{
		FirstName: "Ana", LastName: "Prueba", Email: fmt.Sprintf("ownership.%d@example.com", suffix),
		Plan: account.PlanFree, ClerkUserID: &clerkID,
		Children: []account.Child{{FirstName: "Luis", LastName: "Prueba", BirthDate: time.Now().AddDate(-5, 0, 0)}},
	}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))

	start := "08:00"
	c, err := consultation.NewService(consultation.NewRepository(pool)).CreateConsultation(context.Background(), acc.Children[0].ID,
		consultation.CreateConsultationInput{
			DoctorName: "Dra. López", ConsultDate: time.Now(), Photo: []byte("fake"),
			Medications: []consultation.CreateMedicationInput{{Name: "Amoxicilina", FrequencyHours: 8, DurationDays: 1, StartTime: &start}},
		})
	require.NoError(t, err)

	return fixture{
		repo: ownership.NewRepository(pool), clerkID: clerkID,
		accountID: acc.ID, childID: acc.Children[0].ID, consultationID: c.ID,
	}
}

func TestRepository_OwnerOwnsEverythingTheyHave(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()

	for name, owns := range map[string]func() (bool, error){
		"account":      func() (bool, error) { return f.repo.OwnsAccount(ctx, f.clerkID, f.accountID) },
		"child":        func() (bool, error) { return f.repo.OwnsChild(ctx, f.clerkID, f.childID) },
		"consultation": func() (bool, error) { return f.repo.OwnsConsultation(ctx, f.clerkID, f.consultationID) },
	} {
		got, err := owns()
		require.NoError(t, err, name)
		require.True(t, got, name)
	}
}

func TestRepository_AnotherUserOwnsNothing(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()

	for name, owns := range map[string]func() (bool, error){
		"account":      func() (bool, error) { return f.repo.OwnsAccount(ctx, "user_someone_else", f.accountID) },
		"child":        func() (bool, error) { return f.repo.OwnsChild(ctx, "user_someone_else", f.childID) },
		"consultation": func() (bool, error) { return f.repo.OwnsConsultation(ctx, "user_someone_else", f.consultationID) },
	} {
		got, err := owns()
		require.NoError(t, err, name)
		require.False(t, got, name)
	}
}

func TestRepository_NothingIsOwnedThatDoesNotExist(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()

	got, err := f.repo.OwnsChild(ctx, f.clerkID, uuid.New())
	require.NoError(t, err)
	require.False(t, got)
}

func TestRepository_AnEmptyClerkUserIDOwnsNothing(t *testing.T) {
	f := newFixture(t)

	got, err := f.repo.OwnsAccount(context.Background(), "", f.accountID)
	require.NoError(t, err)
	require.False(t, got)
}

func TestRepository_ConnectionError(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	pool.Close()

	_, err = ownership.NewRepository(pool).OwnsAccount(context.Background(), "user_x", uuid.New())
	require.Error(t, err)
}
