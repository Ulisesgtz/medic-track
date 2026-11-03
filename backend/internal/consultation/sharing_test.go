package consultation_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// specs/058 (research R5, R7): the switch to share one's own consultations, and a Tutor's reminders of one shared.

func joinFamily(t *testing.T, ownerAccount, member uuid.UUID, role string) {
	t.Helper()
	_, err := testPool(t).Exec(context.Background(), `
		INSERT INTO family_members (family_account_id, account_id, role, invited_by_account_id) VALUES ($1, $2, $3, $1)`, ownerAccount, member, role)
	require.NoError(t, err)
}

func TestSharing_OnNeedsAPayingFamilyOffAlwaysWorks(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	repo := consultation.NewRepository(pool)

	// Alone: nobody to share with.
	alone := accountOfChild(t, pool, createTestChild(t, pool))
	_, err := repo.SetSharing(ctx, alone, true)
	var unavailable *consultation.SharingUnavailableError
	require.ErrorAs(t, err, &unavailable)
	require.Equal(t, consultation.SharingNoFamily, unavailable.Reason)
	got, err := repo.SetSharing(ctx, alone, false)
	require.NoError(t, err)
	require.False(t, got.Shared)
	require.NotNil(t, got.ChangedAt)

	// A family on the free plan: refused for the plan, for its owner and for the invited person alike.
	free := accountOfChild(t, pool, createFreeTestChild(t, pool))
	invited := accountOfChild(t, pool, createFreeTestChild(t, pool))
	joinFamily(t, free, invited, "tutor")
	for _, who := range []uuid.UUID{free, invited} {
		_, err = repo.SetSharing(ctx, who, true)
		require.ErrorAs(t, err, &unavailable)
		require.Equal(t, consultation.SharingPlan, unavailable.Reason)
	}

	// A paying family: on, for either; then off.
	paid := accountOfChild(t, pool, createTestChild(t, pool))
	member := accountOfChild(t, pool, createFreeTestChild(t, pool))
	joinFamily(t, paid, member, "caregiver")
	for _, who := range []uuid.UUID{paid, member} {
		got, err = repo.SetSharing(ctx, who, true)
		require.NoError(t, err)
		require.True(t, got.Shared)
		got, err = repo.SetSharing(ctx, who, false)
		require.NoError(t, err)
		require.False(t, got.Shared)
	}

	_, err = repo.SetSharing(ctx, uuid.New(), false)
	require.ErrorIs(t, err, consultation.ErrAccountNotFound)
}

func TestOwnReminders_OnlyForATutorOfAnotherPersonsOwnConsultation(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	svc := consultation.NewService(repo)

	child := createTestChild(t, pool)
	owner := accountOfChild(t, pool, child)
	tutor := accountOfChild(t, pool, createFreeTestChild(t, pool))
	own, err := svc.CreateOwnConsultation(ctx, owner, ownInput("Dr. Propio", "08:00"))
	require.NoError(t, err)
	childs, err := svc.CreateConsultation(ctx, child, ownInput("Dra. Del Hijo", "08:00"))
	require.NoError(t, err)

	require.NoError(t, repo.SetOwnReminders(ctx, own.ID, tutor, true))
	require.NoError(t, repo.SetOwnReminders(ctx, own.ID, tutor, true)) // twice is once
	on, err := repo.OwnReminders(ctx, own.ID, tutor)
	require.NoError(t, err)
	require.True(t, on)
	require.NoError(t, repo.SetOwnReminders(ctx, own.ID, tutor, false))
	on, err = repo.OwnReminders(ctx, own.ID, tutor)
	require.NoError(t, err)
	require.False(t, on)

	require.ErrorIs(t, repo.SetOwnReminders(ctx, own.ID, owner, true), consultation.ErrNotShared)
	require.ErrorIs(t, repo.SetOwnReminders(ctx, childs.ID, tutor, true), consultation.ErrNotShared)
	require.ErrorIs(t, repo.SetOwnReminders(ctx, uuid.New(), tutor, true), consultation.ErrConsultationNotFound)
}

func TestSharingHandlers(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	child := createTestChild(t, pool)
	owner := accountOfChild(t, pool, child)
	tutor := accountOfChild(t, pool, createFreeTestChild(t, pool))
	joinFamily(t, owner, tutor, "tutor")
	own, err := consultation.NewService(consultation.NewRepository(pool)).CreateOwnConsultation(ctx, owner, ownInput("Dr. Propio", "08:00"))
	require.NoError(t, err)

	asOwner, _ := routerAs(t, access.Access{Level: access.Full, ActorAccountID: owner})
	base := "/accounts/" + owner.String() + "/consultation-sharing"
	require.Equal(t, http.StatusBadRequest, doPutPath(t, asOwner, base, map[string]any{}).Code)
	rec := doPutPath(t, asOwner, base, map[string]any{"shared": true})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"shared":true`)
	require.Equal(t, http.StatusNotFound, doPutPath(t, asOwner, "/accounts/not-a-uuid/consultation-sharing", map[string]any{"shared": true}).Code)
	require.Equal(t, http.StatusNotFound, doPutPath(t, asOwner, "/accounts/"+uuid.NewString()+"/consultation-sharing", map[string]any{"shared": false}).Code)
	alone := accountOfChild(t, pool, createTestChild(t, pool))
	rec = doPutPath(t, asOwner, "/accounts/"+alone.String()+"/consultation-sharing", map[string]any{"shared": true})
	require.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	require.Contains(t, rec.Body.String(), `"reason":"no_family"`)
	free := accountOfChild(t, pool, createFreeTestChild(t, pool))
	joinFamily(t, free, accountOfChild(t, pool, createFreeTestChild(t, pool)), "tutor")
	rec = doPutPath(t, asOwner, "/accounts/"+free.String()+"/consultation-sharing", map[string]any{"shared": true})
	require.Contains(t, rec.Body.String(), `"reason":"plan"`)

	// The Tutor's reminders, and the detail tells them.
	asTutor, _ := routerAs(t, access.Access{Level: access.Mark, ActorAccountID: tutor})
	path := "/consultations/" + own.ID.String() + "/my-reminders"
	require.Equal(t, http.StatusBadRequest, doPutPath(t, asTutor, path, map[string]any{}).Code)
	rec = doPutPath(t, asTutor, path, map[string]any{"on": true})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	rec = doGet(t, asTutor, "/consultations/"+own.ID.String())
	require.Contains(t, rec.Body.String(), `"myReminders":true`)
	rec = doGet(t, asOwner, "/consultations/"+own.ID.String())
	require.NotContains(t, rec.Body.String(), `"myReminders"`)
	rec = doPutPath(t, asOwner, path, map[string]any{"on": true})
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "not_shared")
	require.Equal(t, http.StatusNotFound, doPutPath(t, asTutor, "/consultations/not-a-uuid/my-reminders", map[string]any{"on": true}).Code)
	require.Equal(t, http.StatusNotFound, doPutPath(t, asTutor, "/consultations/"+uuid.NewString()+"/my-reminders", map[string]any{"on": true}).Code)
	require.Equal(t, http.StatusInternalServerError, doPutPath(t, routerWithoutAccess(t), path, map[string]any{"on": true}).Code)
}
