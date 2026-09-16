package catalog_test

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/catalog"
)

// testPool returns a pool connected to DATABASE_URL, skipping the test if it
// is not configured (so `go test ./...` still passes without a live database).
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

func TestRepository_ListCountries(t *testing.T) {
	pool := testPool(t)
	repo := catalog.NewRepository(pool)

	countries, err := repo.ListCountries(context.Background())

	require.NoError(t, err)
	require.NotEmpty(t, countries, "expected the seeded catalog to contain at least one country")

	var foundMexico bool
	for _, c := range countries {
		if c.Code == "MX" {
			foundMexico = true
			require.Equal(t, "México", c.Name)
		}
	}
	require.True(t, foundMexico, "expected MX to be present in the seeded catalog")
}

func TestRepository_CountryExists(t *testing.T) {
	pool := testPool(t)
	repo := catalog.NewRepository(pool)

	tests := []struct {
		name        string
		countryCode string
		want        bool
	}{
		{name: "existing country", countryCode: "MX", want: true},
		{name: "non-existing country", countryCode: "ZZ", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := repo.CountryExists(context.Background(), tt.countryCode)
			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}
}

func testDSN(t *testing.T) string {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	return dsn
}

func closedPool(t *testing.T, dsn string) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	pool.Close()
	return pool
}

func TestRepository_ConnectionErrors(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	repo := catalog.NewRepository(closedPool(t, dsn))

	_, err := repo.ListCountries(context.Background())
	require.Error(t, err)

	_, err = repo.CountryExists(context.Background(), "MX")
	require.Error(t, err)

	_, err = repo.ListStatesByCountry(context.Background(), "MX")
	require.Error(t, err)
}

func TestRepository_ListStatesByCountry(t *testing.T) {
	pool := testPool(t)
	repo := catalog.NewRepository(pool)

	tests := []struct {
		name        string
		countryCode string
		wantEmpty   bool
	}{
		{name: "country with states", countryCode: "MX", wantEmpty: false},
		{name: "country without states in catalog", countryCode: "US", wantEmpty: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			states, err := repo.ListStatesByCountry(context.Background(), tt.countryCode)
			require.NoError(t, err)
			if tt.wantEmpty {
				require.Empty(t, states)
			} else {
				require.NotEmpty(t, states)
				for _, s := range states {
					require.Equal(t, tt.countryCode, s.CountryCode)
				}
			}
		})
	}
}
