package consultation_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// specs/058 (FR-008): a person's own consultation never shows in, nor counts for, anything of their children. Every query of
// a child filters by the child, and an own consultation has none.

func ownInput(doctor string, start string) consultation.CreateConsultationInput {
	return consultation.CreateConsultationInput{
		DoctorName: doctor, ConsultDate: time.Now(), Photo: testJPEG, Notes: "notas propias", SymptomCodes: []string{"fever"},
		Medications: []consultation.CreateMedicationInput{{Name: "Amoxicilina propia", FrequencyHours: 8, DurationDays: 3, StartTime: &start}},
	}
}

func TestOwnIsolation_NothingOfTheParentReachesTheChild(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	svc := consultation.NewService(repo)

	child := createTestChild(t, pool)
	accountID := accountOfChild(t, pool, child)
	start := time.Now().Add(-time.Hour).UTC().Format("15:04")

	own, err := svc.CreateOwnConsultation(ctx, accountID, ownInput("Dr. Propio", start))
	require.NoError(t, err)
	require.True(t, own.IsOwn())
	require.Equal(t, accountID, own.AccountID)
	childs, err := svc.CreateConsultation(ctx, child, ownInput("Dra. Del Hijo", start))
	require.NoError(t, err)
	require.False(t, childs.IsOwn())

	list, err := repo.GetByChild(ctx, child)
	require.NoError(t, err)
	require.Len(t, list, 1)
	require.Equal(t, childs.ID, list[0].ID)

	now := time.Now()
	overview, err := repo.GetOverview(ctx, child, now.Add(-24*time.Hour), now.Add(24*time.Hour), now)
	require.NoError(t, err)
	for _, d := range overview.Doses {
		require.Equal(t, childs.ID, d.ConsultationID, "a dose of the parent's own consultation in the child's day")
	}

	found, err := repo.Search(ctx, child, consultation.HistorySearch{Q: "propi"})
	require.NoError(t, err)
	for _, c := range found {
		require.Equal(t, childs.ID, c.ID)
	}
	options, err := repo.HistoryOptions(ctx, child)
	require.NoError(t, err)
	require.NotContains(t, options.Doctors, "Dr. Propio")

	// The detail of each is what it is.
	got, err := repo.GetByID(ctx, own.ID)
	require.NoError(t, err)
	require.Equal(t, uuid.Nil, got.ChildID)
	require.Equal(t, accountID, got.AccountID)
	require.Len(t, got.Symptoms, 1)
	got, err = repo.GetByID(ctx, childs.ID)
	require.NoError(t, err)
	require.Equal(t, child, got.ChildID)
	require.Equal(t, accountID, got.AccountID)
}

func TestOwnIsolation_TheFreePlansRuleOnlyCountsTheChildren(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	svc := consultation.NewService(repo)

	// A paid account saves its own treatment, then the plan lapses: the child's consultation is still welcome (research R4).
	child := createTestChild(t, pool)
	accountID := accountOfChild(t, pool, child)
	start := time.Now().Add(time.Hour).UTC().Format("15:04")
	_, err := svc.CreateOwnConsultation(ctx, accountID, ownInput("Dr. Propio", start))
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE accounts SET plan = 'free' WHERE id = $1`, accountID)
	require.NoError(t, err)

	childs, err := svc.CreateConsultation(ctx, child, ownInput("Dra. Del Hijo", start))
	require.NoError(t, err)

	// …and the child's running treatment is the one that counts for the next.
	_, err = svc.CreateConsultation(ctx, child, ownInput("Dra. Otra", start))
	var limit *consultation.PlanLimitError
	require.ErrorAs(t, err, &limit)
	require.Equal(t, consultation.PlanLimitActiveTreatment, limit.Reason)
	_ = childs
}

func TestOwnConsultation_PlanAndPhotoCap(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	start := "08:00"

	// The free plan doesn't save a person's own consultation, and nothing is written.
	free := accountOfChild(t, pool, createFreeTestChild(t, pool))
	_, err := svc.CreateOwnConsultation(ctx, free, ownInput("Dr. Propio", start))
	var limit *consultation.PlanLimitError
	require.ErrorAs(t, err, &limit)
	require.Equal(t, consultation.PlanLimitOwnConsultations, limit.Reason)
	var n int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM consultations WHERE account_id = $1`, free).Scan(&n))
	require.Zero(t, n)

	// A free account in a paying family does (the plan of their own things, as with their routines).
	owner := accountOfChild(t, pool, createTestChild(t, pool))
	_, err = pool.Exec(ctx, `INSERT INTO family_members (family_account_id, account_id, role, invited_by_account_id) VALUES ($1, $2, 'tutor', $1)`, owner, free)
	require.NoError(t, err)
	_, err = svc.CreateOwnConsultation(ctx, free, ownInput("Dr. Propio", start))
	require.NoError(t, err)

	// No such account.
	_, err = svc.CreateOwnConsultation(ctx, uuid.New(), ownInput("Dr. Propio", start))
	require.ErrorIs(t, err, consultation.ErrAccountNotFound)

	// Own photos count in the account's cap: past it a photo is refused.
	paid := accountOfChild(t, pool, createTestChild(t, pool))
	_, err = pool.Exec(ctx, `
		INSERT INTO consultations (account_id, doctor_name, consult_date, photo)
		SELECT $1, 'Dr. Lleno', current_date, '\xffd8ff'::bytea FROM generate_series(1, $2)`, paid, consultation.MaxPhotosPerAccount)
	require.NoError(t, err)
	_, err = svc.CreateOwnConsultation(ctx, paid, ownInput("Dr. Propio", start))
	require.ErrorIs(t, err, consultation.ErrPhotoLimit)
}
