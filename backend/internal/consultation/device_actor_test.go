package consultation_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// specs/047-dispositivo-del-hijo: a dose can also be marked by the child's own phone. The author is stored as the phone and shown with
// the CHILD's first name; the rules of specs/032 (first mark wins, unmark only your own unless you can do everything) are the same.

// childPhone inserts an active phone for the child and returns its id and the child's first name.
func childPhone(t *testing.T, pool *pgxpool.Pool, childID uuid.UUID) (uuid.UUID, string) {
	t.Helper()
	var id uuid.UUID
	var first string
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO child_device_links (child_id, account_id, name, created_by_account_id, status, expires_at, redeemed_at, credential_hash, rotated_at)
		SELECT c.id, c.account_id, 'Teléfono', c.account_id, 'active', now(), now(), decode(md5(random()::text) || md5(random()::text), 'hex'), now()
		FROM children c WHERE c.id = $1 RETURNING id, (SELECT first_name FROM children WHERE id = $1)`, childID).Scan(&id, &first))
	return id, first
}

func TestDeviceMarks_TheChildsPhoneMarksAndTheChildsNameIsShown(t *testing.T) {
	svc, pool, c, doseID := freshDose(t)
	phone, childName := childPhone(t, pool, c.ChildID)

	dose, err := svc.MarkDose(context.Background(), c.ID, doseID, true, consultation.Actor{DeviceID: phone})
	require.NoError(t, err)
	require.True(t, dose.Taken)
	require.NotNil(t, dose.TakenBy)
	require.Equal(t, childName, dose.TakenBy.Name, "the child's first name, never the name the parent gave the phone")
	require.Equal(t, phone, dose.TakenBy.AccountID, "the author id of a phone is the phone's")

	var byAccount, byDevice *uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT taken_by_account_id, taken_by_child_device_id FROM doses WHERE id = $1`, doseID).Scan(&byAccount, &byDevice))
	require.Nil(t, byAccount)
	require.NotNil(t, byDevice)
	require.Equal(t, phone, *byDevice)

	// The detail and the overview say the same.
	detail, err := svc.GetConsultation(context.Background(), c.ID)
	require.NoError(t, err)
	got := detail.Medications[0].Doses[0]
	require.NotNil(t, got.TakenBy)
	require.Equal(t, childName, got.TakenBy.Name)
	now := time.Now() // one reading: two would make the window a few nanoseconds longer than the 48 hours allowed
	overview, err := svc.GetChildOverview(context.Background(), c.ChildID, now.Add(-24*time.Hour), now.Add(24*time.Hour))
	require.NoError(t, err)
	found := false
	for _, d := range overview.Doses {
		if d.ID == doseID {
			found = true
			require.NotNil(t, d.TakenBy)
			require.Equal(t, childName, d.TakenBy.Name)
		}
	}
	require.True(t, found)
}

func TestDeviceMarks_TheFirstMarkWinsWhoeverIsFirst(t *testing.T) {
	svc, pool, c, doseID := freshDose(t)
	phone, childName := childPhone(t, pool, c.ChildID)
	ana := person(t, pool, "Ana")
	ctx := context.Background()

	_, err := svc.MarkDose(ctx, c.ID, doseID, true, consultation.Actor{AccountID: ana})
	require.NoError(t, err)
	second, err := svc.MarkDose(ctx, c.ID, doseID, true, consultation.Actor{DeviceID: phone})
	require.NoError(t, err)
	require.Equal(t, "Ana", second.TakenBy.Name, "the parent was first")

	other := c.Medications[0].Doses[1].ID
	_, err = svc.MarkDose(ctx, c.ID, other, true, consultation.Actor{DeviceID: phone})
	require.NoError(t, err)
	again, err := svc.MarkDose(ctx, c.ID, other, true, consultation.Actor{AccountID: ana})
	require.NoError(t, err)
	require.Equal(t, childName, again.TakenBy.Name, "the child's phone was first")
}

func TestDeviceMarks_UnmarkingOnlyWhatIsYours(t *testing.T) {
	svc, pool, c, doseID := freshDose(t)
	phone, _ := childPhone(t, pool, c.ChildID)
	ana, luis := person(t, pool, "Ana"), person(t, pool, "Luis")
	ctx := context.Background()

	// The phone unmarks its own mark.
	_, err := svc.MarkDose(ctx, c.ID, doseID, true, consultation.Actor{DeviceID: phone})
	require.NoError(t, err)
	un, err := svc.MarkDose(ctx, c.ID, doseID, false, consultation.Actor{DeviceID: phone})
	require.NoError(t, err)
	require.False(t, un.Taken)
	require.Nil(t, un.TakenBy)

	// It can't unmark a parent's.
	_, err = svc.MarkDose(ctx, c.ID, doseID, true, consultation.Actor{AccountID: ana})
	require.NoError(t, err)
	_, err = svc.MarkDose(ctx, c.ID, doseID, false, consultation.Actor{DeviceID: phone})
	require.ErrorIs(t, err, consultation.ErrDoseForbidden)

	// A parent who can do everything takes back the child's; one who can only mark can't.
	_, err = svc.MarkDose(ctx, c.ID, doseID, false, consultation.Actor{AccountID: ana})
	require.NoError(t, err)
	_, err = svc.MarkDose(ctx, c.ID, doseID, true, consultation.Actor{DeviceID: phone})
	require.NoError(t, err)
	_, err = svc.MarkDose(ctx, c.ID, doseID, false, consultation.Actor{AccountID: luis})
	require.ErrorIs(t, err, consultation.ErrDoseForbidden)
	taken, err := svc.MarkDose(ctx, c.ID, doseID, false, consultation.Actor{AccountID: luis, Full: true})
	require.NoError(t, err)
	require.False(t, taken.Taken)
}

func TestDeviceMarks_ADoseHasAtMostOneAuthorAndNoneWhenNotMarked(t *testing.T) {
	_, pool, c, doseID := freshDose(t)
	phone, _ := childPhone(t, pool, c.ChildID)
	ana := person(t, pool, "Ana")
	ctx := context.Background()

	_, err := pool.Exec(ctx, `UPDATE doses SET taken = true, taken_by_account_id = $2, taken_by_child_device_id = $3, taken_at = now() WHERE id = $1`, doseID, ana, phone)
	require.Error(t, err, "an account and a phone at once")
	_, err = pool.Exec(ctx, `UPDATE doses SET taken = false, taken_by_child_device_id = $2 WHERE id = $1`, doseID, phone)
	require.Error(t, err, "an author on a dose that is not marked")
}

func TestDeviceMarks_AMarkSurvivesTheRemovalOfThePhone(t *testing.T) {
	svc, pool, c, doseID := freshDose(t)
	phone, childName := childPhone(t, pool, c.ChildID)
	_, err := svc.MarkDose(context.Background(), c.ID, doseID, true, consultation.Actor{DeviceID: phone})
	require.NoError(t, err)

	_, err = pool.Exec(context.Background(), `UPDATE child_device_links SET status = 'revoked', revoked_at = now(), credential_hash = NULL WHERE id = $1`, phone)
	require.NoError(t, err)

	detail, err := svc.GetConsultation(context.Background(), c.ID)
	require.NoError(t, err)
	got := detail.Medications[0].Doses[0]
	require.True(t, got.Taken)
	require.NotNil(t, got.TakenBy)
	require.Equal(t, childName, got.TakenBy.Name)
}
