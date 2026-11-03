package consultation_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The schema of specs/058 (migration 0032): every consultation has the account it belongs to, a child's consultation can only
// be of that child's account, a consultation without a child is a person's own, and symptoms and appointments can only hang
// from a consultation of their own account.

func accountOfChild(t *testing.T, pool *pgxpool.Pool, childID uuid.UUID) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT account_id FROM children WHERE id = $1`, childID).Scan(&id))
	return id
}

func TestMigration0032_EveryConsultationHasAnAccount(t *testing.T) {
	pool := testPool(t)
	var missing int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM consultations WHERE account_id IS NULL`).Scan(&missing))
	assert.Zero(t, missing)

	var wrong int
	require.NoError(t, pool.QueryRow(context.Background(), `
		SELECT count(*) FROM consultations c JOIN children ch ON ch.id = c.child_id WHERE ch.account_id <> c.account_id`).Scan(&wrong))
	assert.Zero(t, wrong)
}

func TestMigration0032_AChildConsultationTakesItsChildsAccount(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	child := createTestChild(t, pool)

	// Inserted the old way (no account_id): the trigger fills it in, so the API before 058 keeps working once 0032 is applied.
	var id, acc uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO consultations (child_id, doctor_name, consult_date, photo) VALUES ($1, 'Dra. Ruiz', current_date, '')
		RETURNING id, account_id`, child).Scan(&id, &acc))
	assert.Equal(t, accountOfChild(t, pool, child), acc)

	// Another account for a child's consultation is refused.
	other := accountOfChild(t, pool, createTestChild(t, pool))
	_, err := pool.Exec(ctx, `
		INSERT INTO consultations (child_id, account_id, doctor_name, consult_date, photo) VALUES ($1, $2, 'Dra. Ruiz', current_date, '')`,
		child, other)
	require.Error(t, err)
}

func TestMigration0032_OwnConsultationAndWhatHangsFromIt(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	owner := accountOfChild(t, pool, createTestChild(t, pool))
	other := accountOfChild(t, pool, createTestChild(t, pool))

	var own uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO consultations (account_id, doctor_name, consult_date, photo) VALUES ($1, 'Dr. Paz', current_date, '')
		RETURNING id`, owner).Scan(&own))

	// A consultation needs an account: with no child and no account there is nobody it belongs to.
	_, err := pool.Exec(ctx, `INSERT INTO consultations (doctor_name, consult_date, photo) VALUES ('Dr. Paz', current_date, '')`)
	require.Error(t, err)

	// Symptoms of the own consultation: with its account, yes; with another, no.
	_, err = pool.Exec(ctx, `INSERT INTO consultation_symptoms (consultation_id, account_id, symptom_code)
		SELECT $1, $2, code FROM symptoms ORDER BY sort_order LIMIT 1`, own, owner)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO consultation_symptoms (consultation_id, account_id, symptom_code)
		SELECT $1, $2, code FROM symptoms ORDER BY sort_order OFFSET 1 LIMIT 1`, own, other)
	require.Error(t, err)

	// An appointment of the own consultation: with its account, yes; with another, no.
	insertAppointment := `INSERT INTO consultation_appointments (consultation_id, account_id, starts_at, utc_offset_minutes, created_by_account_id)
		VALUES ($1, $2, now() + interval '3 days', -360, $2)`
	_, err = pool.Exec(ctx, insertAppointment, own, owner)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, insertAppointment, own, other)
	require.Error(t, err)
}
