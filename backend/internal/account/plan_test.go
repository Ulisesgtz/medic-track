package account_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
)

// TestChildLimit pins how many children each plan allows; anything that is not the paid plan gets the
// free plan's limit, so an unknown value can never grant more.
func TestChildLimit(t *testing.T) {
	require.Equal(t, 1, account.ChildLimit(account.PlanFree))
	require.Equal(t, 10, account.ChildLimit(account.PlanPaid))
	require.Equal(t, 1, account.ChildLimit(account.Plan("")))
	require.Equal(t, 1, account.ChildLimit(account.Plan("premium")))
}

// TestRepository_AddChildIfUnderLimit_PaidPlan: a paid account passes the free plan's limit of one child
// and stops at the paid plan's own ceiling, reporting it in the *FreemiumLimitError.
func TestRepository_AddChildIfUnderLimit_PaidPlan(t *testing.T) {
	pool := testPool(t)
	repo := account.NewRepository(pool)

	acc := &account.Account{
		FirstName: "Rosa", LastName: "Mena", Email: uniqueEmail("paidplan.repo.test"), Plan: account.PlanPaid,
		Children: []account.Child{{FirstName: "Hijo 1", LastName: "Mena", BirthDate: mustParseDate(t, "2018-01-01")}},
	}
	require.NoError(t, repo.Create(context.Background(), acc))

	var got *account.Account
	var err error
	for i := 2; i <= account.ChildLimit(account.PlanPaid); i++ {
		got, err = repo.AddChildIfUnderLimit(context.Background(), acc.ID, account.CreateChildInput{
			FirstName: fmt.Sprintf("Hijo %d", i), LastName: "Mena", BirthDate: mustParseDate(t, "2019-01-01"),
		})
		require.NoError(t, err, "child %d must fit in the paid plan", i)
	}
	require.Len(t, got.Children, 10)
	require.Equal(t, account.PlanPaid, got.Plan)

	_, err = repo.AddChildIfUnderLimit(context.Background(), acc.ID, account.CreateChildInput{
		FirstName: "Hijo 11", LastName: "Mena", BirthDate: mustParseDate(t, "2020-01-01"),
	})
	var limitErr *account.FreemiumLimitError
	require.ErrorAs(t, err, &limitErr)
	require.Equal(t, 10, limitErr.Limit)
	require.Equal(t, 11, limitErr.Received)
}
