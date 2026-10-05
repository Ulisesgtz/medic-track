package platform_test

import (
	"context"
	"os"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/platform"
)

func TestNewPostgresPool_MissingDatabaseURL(t *testing.T) {
	original, wasSet := os.LookupEnv("DATABASE_URL")
	os.Unsetenv("DATABASE_URL")
	t.Cleanup(func() {
		if wasSet {
			os.Setenv("DATABASE_URL", original)
		}
	})

	_, err := platform.NewPostgresPool(context.Background())

	require.Error(t, err)
	require.Contains(t, err.Error(), "DATABASE_URL")
}

func TestNewPostgresPool_Success(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}

	pool, err := platform.NewPostgresPool(context.Background())

	require.NoError(t, err)
	require.NotNil(t, pool)
	pool.Close()
}
