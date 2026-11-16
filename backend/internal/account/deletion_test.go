package account_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
)

// specs/070: /accounts/me says when the account will be deleted, and an invited person sees the date of the family's
// owner, with the shared children read-only until then.
func TestGetByClerkUserID_SaysWhenTheAccountOrItsFamilyWillBeDeleted(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	repo := account.NewRepository(pool)
	ownerClerk, tutorClerk := uniqueClerkUserID("del_owner"), uniqueClerkUserID("del_tutor")
	owner := &account.Account{FirstName: "Ana", LastName: "Borra", Email: fmt.Sprintf("%s@x.test", ownerClerk), Plan: account.PlanPaid,
		ClerkUserID: &ownerClerk, Children: []account.Child{{FirstName: "Mateo", LastName: "Borra", BirthDate: time.Now().AddDate(-4, 0, 0)}}}
	require.NoError(t, repo.Create(ctx, owner))
	tutor := &account.Account{FirstName: "Beto", LastName: "Borra", Email: fmt.Sprintf("%s@x.test", tutorClerk), Plan: account.PlanFree,
		ClerkUserID: &tutorClerk}
	require.NoError(t, repo.Create(ctx, tutor))
	_, err := pool.Exec(ctx, `UPDATE accounts SET plan = 'paid' WHERE id = $1`, owner.ID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO family_members (family_account_id, account_id, role, invited_by_account_id) VALUES ($1, $2, 'tutor', $1)`,
		owner.ID, tutor.ID)
	require.NoError(t, err)
	t.Cleanup(func() {
		for _, sql := range []string{
			`DELETE FROM account_deletions WHERE account_id = ANY($1)`,
			`DELETE FROM family_members WHERE family_account_id = ANY($1)`,
			`DELETE FROM children WHERE account_id = ANY($1)`,
			`DELETE FROM accounts WHERE id = ANY($1)`,
		} {
			_, _ = pool.Exec(context.Background(), sql, []uuid.UUID{owner.ID, tutor.ID})
		}
	})

	me, err := repo.GetByClerkUserID(ctx, ownerClerk)
	require.NoError(t, err)
	require.Nil(t, me.DeletionScheduledFor)
	them, err := repo.GetByClerkUserID(ctx, tutorClerk)
	require.NoError(t, err)
	require.NotNil(t, them.Family)
	require.False(t, them.Family.ReadOnly())

	scheduled := time.Now().Add(30 * 24 * time.Hour).UTC().Truncate(time.Second)
	_, err = pool.Exec(ctx, `INSERT INTO account_deletions (account_id, scheduled_for) VALUES ($1, $2)`, owner.ID, scheduled)
	require.NoError(t, err)

	me, err = repo.GetByClerkUserID(ctx, ownerClerk)
	require.NoError(t, err)
	require.NotNil(t, me.DeletionScheduledFor)
	require.True(t, scheduled.Equal(*me.DeletionScheduledFor))

	them, err = repo.GetByClerkUserID(ctx, tutorClerk)
	require.NoError(t, err)
	require.NotNil(t, them.Family.DeletionScheduledFor)
	require.True(t, them.Family.ReadOnly(), "until the date the Tutor sees and marks, nothing more")
	require.Nil(t, them.DeletionScheduledFor, "the Tutor's own account is not being deleted")
	for _, c := range them.Children {
		require.True(t, c.ReadOnly)
	}
}
