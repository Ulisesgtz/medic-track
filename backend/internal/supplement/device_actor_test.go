package supplement_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/supplement"
)

// specs/047-dispositivo-del-hijo: the child's phone marks supplement and activity doses too; the author is the phone, shown with the
// child's first name, and the rules of specs/032 hold.

func phoneOf(t *testing.T, pool *pgxpool.Pool, f family) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO child_device_links (child_id, account_id, name, created_by_account_id, status, expires_at, redeemed_at, credential_hash, rotated_at)
		VALUES ($1, $2, 'Teléfono', $2, 'active', now(), now(), decode(md5(random()::text) || md5(random()::text), 'hex'), now()) RETURNING id`,
		f.childID, f.accountID).Scan(&id))
	return id
}

func TestDeviceMarks_ASupplementDoseIsMarkedByThePhoneWithTheChildsName(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	id, err := repo.Create(ctx, f.childID, daily("Vitamina D"), f.accountID)
	require.NoError(t, err)
	var doseID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM supplement_doses WHERE routine_id = $1 ORDER BY scheduled_at LIMIT 1`, id).Scan(&doseID))
	phone := phoneOf(t, pool, f)
	ana := newPerson(t, pool, "Ana")

	dose, err := repo.UpdateDoseStatus(ctx, id, doseID, true, supplement.Actor{DeviceID: phone})
	require.NoError(t, err)
	require.True(t, dose.Taken)
	require.NotNil(t, dose.TakenBy)
	require.Equal(t, "Hijo", dose.TakenBy.Name, "the child's first name")
	require.Equal(t, phone, dose.TakenBy.AccountID)

	again, err := repo.UpdateDoseStatus(ctx, id, doseID, true, supplement.Actor{AccountID: ana})
	require.NoError(t, err)
	require.Equal(t, "Hijo", again.TakenBy.Name, "the first mark wins")

	_, err = repo.UpdateDoseStatus(ctx, id, doseID, false, supplement.Actor{AccountID: ana})
	require.ErrorIs(t, err, supplement.ErrDoseForbidden, "a parent who can only mark can't take back the child's")
	un, err := repo.UpdateDoseStatus(ctx, id, doseID, false, supplement.Actor{DeviceID: phone})
	require.NoError(t, err)
	require.False(t, un.Taken)
	require.Nil(t, un.TakenBy)

	_, err = repo.UpdateDoseStatus(ctx, id, doseID, true, supplement.Actor{AccountID: ana})
	require.NoError(t, err)
	_, err = repo.UpdateDoseStatus(ctx, id, doseID, false, supplement.Actor{DeviceID: phone})
	require.ErrorIs(t, err, supplement.ErrDoseForbidden, "the phone can't take back a parent's mark")
	un, err = repo.UpdateDoseStatus(ctx, id, doseID, false, supplement.Actor{AccountID: f.accountID, Full: true})
	require.NoError(t, err)
	require.False(t, un.Taken)
}

func TestDeviceMarks_RealizadoByThePhoneAndItsLastMark(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	id, err := repo.Create(ctx, f.childID, supplement.Routine{Kind: supplement.KindActivity, Name: "Estirar", Period: supplement.PeriodWindow,
		WindowStart: "08:00", WindowEnd: "08:10", IntervalMinutes: 5, FirstDate: "2026-10-05"}, f.accountID)
	require.NoError(t, err)
	phone := phoneOf(t, pool, f)
	day := time.Date(2026, 10, 5, 0, 0, 0, 0, time.UTC)

	dose, err := repo.MarkNext(ctx, id, day, day.Add(24*time.Hour), supplement.Actor{DeviceID: phone})
	require.NoError(t, err)
	require.True(t, dose.Taken)
	require.Equal(t, "Hijo", dose.TakenBy.Name)

	var byAccount, byDevice *uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT taken_by_account_id, taken_by_child_device_id FROM supplement_doses WHERE id = $1`, dose.ID).Scan(&byAccount, &byDevice))
	require.Nil(t, byAccount)
	require.Equal(t, phone, *byDevice)
}

func TestDeviceMarks_ADoseHasAtMostOneAuthor(t *testing.T) {
	pool := testPool(t)
	repo := newRepo(pool)
	f := newFamily(t, pool, account.PlanPaid)
	ctx := context.Background()
	id, err := repo.Create(ctx, f.childID, daily("Omega"), f.accountID)
	require.NoError(t, err)
	phone := phoneOf(t, pool, f)
	_, err = pool.Exec(ctx, `
		UPDATE supplement_doses SET taken = true, taken_by_account_id = $2, taken_by_child_device_id = $3, taken_at = now()
		WHERE id = (SELECT id FROM supplement_doses WHERE routine_id = $1 LIMIT 1)`, id, f.accountID, phone)
	require.Error(t, err)
}
