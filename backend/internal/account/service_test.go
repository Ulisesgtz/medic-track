package account_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
)

// uniqueEmail returns an email guaranteed not to collide with a previous
// test run against the same database (accounts.email is UNIQUE, and tests
// don't truncate the table between runs).
func uniqueEmail(base string) string {
	return fmt.Sprintf("%s.%d@example.com", base, time.Now().UnixNano())
}

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

func float64Ptr(f float64) *float64 { return &f }

// TestService_CreateAccount_Validation covers FR-001/FR-002: required fields
// and email format, without touching the database (no email is unique yet
// since these inputs are all invalid before reaching the repository).
func TestService_CreateAccount_Validation(t *testing.T) {
	pool := testPool(t)
	svc := account.NewService(account.NewRepository(pool))

	tests := []struct {
		name          string
		input         account.CreateAccountInput
		wantFieldErrs []string // field names expected among the ValidationErrors
	}{
		{
			name:          "missing first name",
			input:         account.CreateAccountInput{LastName: "Gómez", Email: "valid@example.com"},
			wantFieldErrs: []string{"firstName"},
		},
		{
			name:          "missing last name",
			input:         account.CreateAccountInput{FirstName: "Ana", Email: "valid@example.com"},
			wantFieldErrs: []string{"lastName"},
		},
		{
			name:          "missing email",
			input:         account.CreateAccountInput{FirstName: "Ana", LastName: "Gómez"},
			wantFieldErrs: []string{"email"},
		},
		{
			name:          "invalid email format",
			input:         account.CreateAccountInput{FirstName: "Ana", LastName: "Gómez", Email: "not-an-email"},
			wantFieldErrs: []string{"email"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := svc.CreateAccount(context.Background(), tt.input)

			require.Error(t, err)
			var validationErrs account.ValidationErrors
			require.ErrorAs(t, err, &validationErrs)

			gotFields := make(map[string]bool)
			for _, e := range validationErrs {
				gotFields[e.Field] = true
			}
			for _, want := range tt.wantFieldErrs {
				require.True(t, gotFields[want], "expected a validation error on field %q, got %+v", want, validationErrs)
			}
		})
	}
}

// TestService_CreateAccount_ChildValidation covers FR-004/FR-005 and the
// height/weight edge case (must be positive if provided).
func TestService_CreateAccount_ChildValidation(t *testing.T) {
	pool := testPool(t)
	svc := account.NewService(account.NewRepository(pool))

	future := time.Now().AddDate(1, 0, 0)

	tests := []struct {
		name          string
		child         account.CreateChildInput
		wantFieldErrs []string
	}{
		{
			name:          "missing child first name",
			child:         account.CreateChildInput{LastName: "Gómez", BirthDate: time.Now().AddDate(-2, 0, 0)},
			wantFieldErrs: []string{"children[0].firstName"},
		},
		{
			name:          "missing birth date",
			child:         account.CreateChildInput{FirstName: "Luis", LastName: "Gómez"},
			wantFieldErrs: []string{"children[0].birthDate"},
		},
		{
			name:          "future birth date",
			child:         account.CreateChildInput{FirstName: "Luis", LastName: "Gómez", BirthDate: future},
			wantFieldErrs: []string{"children[0].birthDate"},
		},
		{
			name: "negative height",
			child: account.CreateChildInput{
				FirstName: "Luis", LastName: "Gómez", BirthDate: time.Now().AddDate(-2, 0, 0),
				Height: float64Ptr(-10),
			},
			wantFieldErrs: []string{"children[0].height"},
		},
		{
			name: "negative weight",
			child: account.CreateChildInput{
				FirstName: "Luis", LastName: "Gómez", BirthDate: time.Now().AddDate(-2, 0, 0),
				Weight: float64Ptr(-5),
			},
			wantFieldErrs: []string{"children[0].weight"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := account.CreateAccountInput{
				FirstName: "Ana",
				LastName:  "Gómez",
				Email:     uniqueEmail("ana-" + tt.name),
				Children:  []account.CreateChildInput{tt.child},
			}

			_, err := svc.CreateAccount(context.Background(), input)

			require.Error(t, err)
			var validationErrs account.ValidationErrors
			require.ErrorAs(t, err, &validationErrs)

			gotFields := make(map[string]bool)
			for _, e := range validationErrs {
				gotFields[e.Field] = true
			}
			for _, want := range tt.wantFieldErrs {
				require.True(t, gotFields[want], "expected a validation error on field %q, got %+v", want, validationErrs)
			}
		})
	}
}

// TestService_CreateAccount_FreemiumLimit covers FR-007: a free-plan account
// (every new account starts free) cannot be created with more than one child.
func TestService_CreateAccount_FreemiumLimit(t *testing.T) {
	pool := testPool(t)
	svc := account.NewService(account.NewRepository(pool))

	input := account.CreateAccountInput{
		FirstName: "Carla",
		LastName:  "Ruiz",
		Email:     uniqueEmail("carla.freemium.test"),
		Children: []account.CreateChildInput{
			{FirstName: "Hijo1", LastName: "Ruiz", BirthDate: time.Now().AddDate(-3, 0, 0)},
			{FirstName: "Hijo2", LastName: "Ruiz", BirthDate: time.Now().AddDate(-1, 0, 0)},
		},
	}

	_, err := svc.CreateAccount(context.Background(), input)

	require.ErrorIs(t, err, account.ErrFreemiumChildLimitExceeded)
}
