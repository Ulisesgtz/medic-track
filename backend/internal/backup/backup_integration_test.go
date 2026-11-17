//go:build integration

package backup

// The whole backup for real (specs/069 T024): pg_dump of the test database in one snapshot, age, an in-memory store, and the
// weekly check restoring it into a PostgreSQL of its own. Needs pg_dump, pg_restore, initdb, pg_ctl and createdb of the same
// major version as the server in the PATH, and DATABASE_URL. Outside CI:
//
//	go test -tags integration ./internal/backup/ -run Integration -v

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"filippo.io/age"
	"github.com/stretchr/testify/require"
)

func TestIntegration_BackupAndRestoreForReal(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	env := testEnv(t, pool)
	owner, err := age.GenerateX25519Identity()
	require.NoError(t, err)
	check, err := age.GenerateX25519Identity()
	require.NoError(t, err)
	store := NewMemoryStore()
	tmp := t.TempDir()
	rec := &recorder{}

	svc := &Service{
		Env:        env,
		Recipients: []age.Recipient{owner.Recipient(), check.Recipient()},
		Check:      check,
		Runs:       NewRepository(pool),
		Store:      store,
		Dumper:     &PgDumper{Pool: pool, DatabaseURL: os.Getenv("DATABASE_URL")},
		Restorer:   &EphemeralRestorer{TmpDir: tmp},
		Reporter:   NewReporter(rec),
		Lock:       func(ctx context.Context) (func(), bool, error) { return TryLock(ctx, pool) },
		Now:        time.Now,
	}

	start := time.Now()
	res, err := svc.RunBackup(ctx)
	require.NoError(t, err, rec.messages())
	t.Logf("backup: %s, %d bytes, %d tables, %s", res.ObjectKey, res.Size, res.Tables, time.Since(start).Round(time.Millisecond))
	data, ok := store.Bytes(res.ObjectKey)
	require.True(t, ok)
	require.True(t, strings.HasPrefix(string(data), "age-encryption.org/v1"))

	start = time.Now()
	checked, err := svc.RunCheck(ctx)
	if err != nil && checked != nil {
		for _, m := range checked.Mismatches {
			t.Logf("mismatch %s: expected %d got %d", m.Table, m.Expected, m.Got)
		}
	}
	require.NoError(t, err, rec.messages())
	require.Empty(t, checked.Mismatches)
	t.Logf("check: %d tables restored and equal, %s", checked.Tables, time.Since(start).Round(time.Millisecond))

	entries, _ := os.ReadDir(tmp)
	require.Empty(t, entries, "the disposable server is gone")
	require.Empty(t, rec.entries, "nothing failed, nothing reported")
}
