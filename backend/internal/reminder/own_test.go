package reminder_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
)

// specs/058-consultas-del-titular: the reminders of a person's own consultation (no child).

// ownDose saves a consultation of the family's account itself, with one medication, and a dose of it at `at`.
func (f family) ownDose(t *testing.T, pool *pgxpool.Pool, at time.Time) (consultationID, doseID uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO consultations (account_id, doctor_name, consult_date, photo) VALUES ($1, 'Dr. Paz', CURRENT_DATE, '') RETURNING id
	`, f.accountID).Scan(&consultationID))
	var medicationID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO medications (consultation_id, name, frequency_hours, duration_days, start_time) VALUES ($1, 'Losartán', 8, 1, '08:00') RETURNING id
	`, consultationID).Scan(&medicationID))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO doses (medication_id, scheduled_at) VALUES ($1, $2) RETURNING id
	`, medicationID, at).Scan(&doseID))
	return consultationID, doseID
}

func TestOwn_AChildPhoneIsNeverRemindedNorMarksTheParentsOwnDose(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	f := newFamily(t, pool, nil)
	_, device := phone(t, pool, repo, f, now, nil)
	_, own := f.ownDose(t, pool, now.Add(-5*time.Minute))

	due, err := repo.ClaimDueChildDevices(ctx, now, window)
	require.NoError(t, err)
	for _, d := range due {
		require.NotEqual(t, own, d.DoseID, "a phone of a child reminded of the parent's own dose")
	}

	err = repo.MarkTakenByAction(ctx, own, device.ID)
	require.ErrorIs(t, err, reminder.ErrInvalidActionToken)
	require.False(t, doseTaken(t, pool, own))
}
