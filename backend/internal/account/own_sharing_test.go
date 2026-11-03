package account_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
)

// specs/058: the account says whether the person shares their own consultations, and whose are shared with them.

func sharingAccount(t *testing.T, pool *pgxpool.Pool, name string, plan account.Plan) *account.Account {
	t.Helper()
	clerk := "user_share_" + uuid.NewString()
	acc := &account.Account{FirstName: name, LastName: "Prueba", Email: uniqueEmail("share"), Plan: plan, ClerkUserID: &clerk}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))
	return acc
}

func TestOwnSharing_TheSwitchAndWhoSharesWithMe(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	repo := account.NewRepository(pool)
	ana := sharingAccount(t, pool, "Ana", account.PlanPaid)
	luis := sharingAccount(t, pool, "Luis", account.PlanFree)
	rosa := sharingAccount(t, pool, "Rosa", account.PlanFree)
	for who, role := range map[uuid.UUID]string{luis.ID: "tutor", rosa.ID: "caregiver"} {
		_, err := pool.Exec(ctx, `INSERT INTO family_members (family_account_id, account_id, role, invited_by_account_id) VALUES ($1, $2, $3, $1)`, ana.ID, who, role)
		require.NoError(t, err)
	}

	got, err := repo.GetByClerkUserID(ctx, *ana.ClerkUserID)
	require.NoError(t, err)
	require.False(t, got.ConsultationSharing.Shared)
	require.Nil(t, got.ConsultationSharing.ChangedAt)
	require.Empty(t, got.SharedProfiles)

	share := func(who uuid.UUID, on bool) {
		_, err := pool.Exec(ctx, `INSERT INTO own_consultation_sharing (account_id, shared) VALUES ($1, $2)
			ON CONFLICT (account_id) DO UPDATE SET shared = EXCLUDED.shared, changed_at = now()`, who, on)
		require.NoError(t, err)
	}
	share(ana.ID, true)
	share(luis.ID, true)

	got, err = repo.GetByClerkUserID(ctx, *ana.ClerkUserID)
	require.NoError(t, err)
	require.True(t, got.ConsultationSharing.Shared)
	require.WithinDuration(t, time.Now(), *got.ConsultationSharing.ChangedAt, time.Minute)
	require.Equal(t, []account.SharedProfile{{AccountID: luis.ID, FirstName: "Luis"}}, got.SharedProfiles, "the family's owner sees her Tutor's")

	got, err = repo.GetByClerkUserID(ctx, *luis.ClerkUserID)
	require.NoError(t, err)
	require.Equal(t, []account.SharedProfile{{AccountID: ana.ID, FirstName: "Ana"}}, got.SharedProfiles, "a Tutor sees the owner's")

	got, err = repo.GetByClerkUserID(ctx, *rosa.ClerkUserID)
	require.NoError(t, err)
	require.Empty(t, got.SharedProfiles, "a Caregiver sees nobody's")

	share(ana.ID, false)
	got, err = repo.GetByClerkUserID(ctx, *luis.ClerkUserID)
	require.NoError(t, err)
	require.Empty(t, got.SharedProfiles)
}
