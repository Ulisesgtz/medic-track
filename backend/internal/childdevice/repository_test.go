package childdevice_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/childdevice"
)

func TestAuthenticate_AnActiveDeviceIsRecognisedWithItsChild(t *testing.T) {
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanPaid)
	now := time.Now().UTC().Truncate(time.Second)
	cred, linkID := activeDevice(t, pool, f, "Teléfono de Mateo", now.Add(-time.Hour))

	p, err := childdevice.NewRepository(pool).Authenticate(context.Background(), hashOf(t, cred), now)
	require.NoError(t, err)
	require.Equal(t, linkID, p.LinkID)
	require.Equal(t, f.childID, p.ChildID)
	require.Equal(t, f.accountID, p.OwnerAccountID)
	require.Equal(t, "Mateo", p.ChildFirstName)
	require.Equal(t, "Teléfono de Mateo", p.DeviceName)
	require.WithinDuration(t, now.Add(-time.Hour).Add(childdevice.RotateEvery), p.RotateAfter, time.Second)
}

func TestAuthenticate_EveryWayOfNotWorkingIsTheSameError(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	now := time.Now().UTC().Truncate(time.Second)
	ctx := context.Background()

	stranger, _, err := childdevice.NewToken()
	require.NoError(t, err)
	_, err = repo.Authenticate(ctx, hashOf(t, stranger), now)
	require.ErrorIs(t, err, childdevice.ErrNotFound)

	removed, removedID := activeDevice(t, pool, f, "quitado", now.Add(-time.Hour))
	_, err = pool.Exec(ctx, `UPDATE child_device_links SET status = 'revoked', revoked_at = $2, credential_hash = NULL WHERE id = $1`, removedID, now)
	require.NoError(t, err)
	_, err = repo.Authenticate(ctx, hashOf(t, removed), now)
	require.ErrorIs(t, err, childdevice.ErrNotFound)

	idle, _ := activeDevice(t, pool, f, "sin usar", now.Add(-childdevice.CredentialIdle-time.Hour))
	_, err = repo.Authenticate(ctx, hashOf(t, idle), now)
	require.ErrorIs(t, err, childdevice.ErrNotFound, "idle for more than 90 days")

	recent, _ := activeDevice(t, pool, f, "casi vencido", now.Add(-childdevice.CredentialIdle+time.Hour))
	_, err = repo.Authenticate(ctx, hashOf(t, recent), now)
	require.NoError(t, err, "just inside the 90 days")
}

func TestAuthenticate_AUsedDeviceStaysAliveBecauseLastSeenCounts(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	now := time.Now().UTC().Truncate(time.Second)
	cred, linkID := activeDevice(t, pool, f, "usado", now.Add(-200*24*time.Hour))
	_, err := pool.Exec(context.Background(), `UPDATE child_device_links SET last_seen_at = $2 WHERE id = $1`, linkID, now.Add(-24*time.Hour))
	require.NoError(t, err)
	_, err = repo.Authenticate(context.Background(), hashOf(t, cred), now)
	require.NoError(t, err)
}

func TestAuthenticate_LastSeenIsWrittenAtMostEveryTenMinutes(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	now := time.Now().UTC().Truncate(time.Second)
	cred, linkID := activeDevice(t, pool, f, "visto", now.Add(-time.Hour))
	seen := func() *time.Time {
		var at *time.Time
		require.NoError(t, pool.QueryRow(context.Background(), `SELECT last_seen_at FROM child_device_links WHERE id = $1`, linkID).Scan(&at))
		return at
	}
	require.Nil(t, seen())

	_, err := repo.Authenticate(context.Background(), hashOf(t, cred), now)
	require.NoError(t, err)
	first := seen()
	require.NotNil(t, first)
	require.WithinDuration(t, now, *first, time.Second)

	_, err = repo.Authenticate(context.Background(), hashOf(t, cred), now.Add(5*time.Minute))
	require.NoError(t, err)
	require.True(t, first.Equal(*seen()), "not rewritten within ten minutes")

	_, err = repo.Authenticate(context.Background(), hashOf(t, cred), now.Add(11*time.Minute))
	require.NoError(t, err)
	require.WithinDuration(t, now.Add(11*time.Minute), *seen(), time.Second)
}

func TestAuthenticate_ThePreviousCredentialWorksOnlyInsideItsGrace(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	now := time.Now().UTC().Truncate(time.Second)
	oldCred, linkID := activeDevice(t, pool, f, "rotado", now.Add(-10*24*time.Hour))
	newCred, newHash, err := childdevice.NewToken()
	require.NoError(t, err)
	rotatedAt := now.Add(-2 * time.Hour)
	_, err = pool.Exec(context.Background(), `
		UPDATE child_device_links SET credential_hash_previous = credential_hash, credential_hash = $2, rotated_at = $3 WHERE id = $1`,
		linkID, newHash, rotatedAt)
	require.NoError(t, err)

	_, err = repo.Authenticate(context.Background(), hashOf(t, newCred), now)
	require.NoError(t, err)
	_, err = repo.Authenticate(context.Background(), hashOf(t, oldCred), now)
	require.NoError(t, err, "inside the 24 hours of grace")
	_, err = repo.Authenticate(context.Background(), hashOf(t, oldCred), rotatedAt.Add(childdevice.RotateGrace+time.Minute))
	require.ErrorIs(t, err, childdevice.ErrNotFound, "after the grace")
}

func TestOwnership_RoutineAndConsultationBelongToTheirChildOnly(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	f := newFamily(t, pool, account.PlanPaid)
	other := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	var routineID, consultationID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO supplement_routines (account_id, child_id, name, period, times, first_date, utc_offset_minutes, generated_until, created_by_account_id)
		VALUES ($1, $2, 'Vitamina D', 'daily', ARRAY['08:00']::time[], current_date, 0, now() + interval '14 days', $1) RETURNING id`,
		f.accountID, f.childID).Scan(&routineID))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO consultations (child_id, doctor_name, consult_date, photo) VALUES ($1, 'Dra. López', current_date, '\x01') RETURNING id`,
		f.childID).Scan(&consultationID))

	ok, err := repo.RoutineOfChild(ctx, routineID, f.childID)
	require.NoError(t, err)
	require.True(t, ok)
	ok, err = repo.RoutineOfChild(ctx, routineID, other.childID)
	require.NoError(t, err)
	require.False(t, ok)
	ok, err = repo.RoutineOfChild(ctx, uuid.New(), f.childID)
	require.NoError(t, err)
	require.False(t, ok)

	ok, err = repo.ConsultationOfChild(ctx, consultationID, f.childID)
	require.NoError(t, err)
	require.True(t, ok)
	ok, err = repo.ConsultationOfChild(ctx, consultationID, other.childID)
	require.NoError(t, err)
	require.False(t, ok)
}

func TestRepository_ReportsDatabaseFailures(t *testing.T) {
	pool := testPool(t)
	repo := childdevice.NewRepository(pool)
	pool.Close()
	_, err := repo.Authenticate(context.Background(), make([]byte, 32), time.Now())
	require.Error(t, err)
	require.NotErrorIs(t, err, childdevice.ErrNotFound)
	_, err = repo.RoutineOfChild(context.Background(), uuid.New(), uuid.New())
	require.Error(t, err)
	_, err = repo.ConsultationOfChild(context.Background(), uuid.New(), uuid.New())
	require.Error(t, err)
}
