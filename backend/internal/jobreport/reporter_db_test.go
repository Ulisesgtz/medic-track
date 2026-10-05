package jobreport_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/jobreport"
)

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

func TestReporter_WritesARealErrorLogsRow(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	var accountID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO accounts (first_name, last_name, email, plan) VALUES ('Ana', 'Gómez', $1, 'free') RETURNING id
	`, fmt.Sprintf("jobreport.test.%d@example.com", time.Now().UnixNano())).Scan(&accountID))
	// A name of its own so the row can be told apart and cleaned.
	job := fmt.Sprintf("test-%d", time.Now().UnixNano())
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM error_logs WHERE endpoint = $1`, "job:"+job)
		_, _ = pool.Exec(ctx, `DELETE FROM accounts WHERE id = $1`, accountID)
	})

	r := jobreport.New(errorlog.NewRepository(pool), job)
	jobreport.RunInline(r)
	r.Report("deliver", "1 of 2 reminders could not be delivered", &accountID)

	var (
		status  *int
		message string
		file    string
		line    int
		account *uuid.UUID
	)
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT http_status, message, file, line, account_id FROM error_logs WHERE endpoint = $1
	`, "job:"+job).Scan(&status, &message, &file, &line, &account))
	require.Nil(t, status, "a process has no HTTP status")
	require.Equal(t, "1 of 2 reminders could not be delivered", message)
	require.Contains(t, file, "reporter_db_test.go")
	require.Positive(t, line)
	require.Equal(t, &accountID, account)
}
