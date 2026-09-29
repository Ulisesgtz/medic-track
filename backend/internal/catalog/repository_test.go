package catalog_test

import (
	"context"
	"math/rand/v2"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/google/uuid"
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

	_, err = repo.ListSymptoms(context.Background())
	require.Error(t, err)
}

func TestRepository_ListSymptoms_TheSeededCatalogInOrder(t *testing.T) {
	repo := catalog.NewRepository(testPool(t))

	symptoms, err := repo.ListSymptoms(context.Background())

	require.NoError(t, err)
	var seeded []catalog.Symptom
	var codes []string
	for _, s := range symptoms {
		if !strings.HasPrefix(s.Code, "test_") { // rows other tests add and remove while running
			seeded = append(seeded, s)
			codes = append(codes, s.Code)
		}
	}
	require.Equal(t, []string{
		"fever", "fatigue", "irritability", "poor_appetite", "headache", "chills",
		"cough", "runny_nose", "sneezing", "sore_throat", "difficulty_breathing", "wheezing",
		"vomiting", "diarrhea", "stomach_ache", "nausea", "constipation",
		"ear_pain", "red_eyes", "rash", "itching", "poor_sleep", "sleeping_more",
	}, codes)
	require.Equal(t, catalog.Symptom{Code: "fever", Name: "Fiebre", Category: "General"}, seeded[0])
	require.Equal(t, catalog.Symptom{Code: "sleeping_more", Name: "Duerme más de lo normal", Category: "Sueño y ánimo"}, seeded[len(seeded)-1])
}

// A symptom added with SQL shows up in its place and a retired one disappears, without releasing the app (FR-006, FR-008).
func TestRepository_ListSymptoms_FollowsTheCatalogTable(t *testing.T) {
	pool := testPool(t)
	repo := catalog.NewRepository(pool)
	ctx := context.Background()
	added := "test_added_" + uuid.NewString()[:8]
	retired := "test_retired_" + uuid.NewString()[:8]
	// Far after every seeded symptom (never one of the free slots the team may use), in an existing category.
	base := 1_000_000 + rand.IntN(1_000_000_000)
	_, err := pool.Exec(ctx, `INSERT INTO symptoms (code, name, category, sort_order, active) VALUES
		($1, 'Agregado', 'General', $3, true), ($2, 'Retirado', 'General', $3 + 1, false)`, added, retired, base)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM symptoms WHERE code IN ($1, $2)`, added, retired)
	})

	symptoms, err := repo.ListSymptoms(ctx)

	require.NoError(t, err)
	codes := make([]string, 0, len(symptoms))
	for _, s := range symptoms {
		codes = append(codes, s.Code)
		require.NotEqual(t, retired, s.Code)
	}
	// Added last by sort_order, it still joins its category: right after Escalofríos (the last seeded
	// "General") and before Tos, never as a second "General" group at the end.
	at := slices.Index(codes, added)
	require.Equal(t, "chills", codes[at-1])
	require.Equal(t, "cough", codes[at+1])
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
