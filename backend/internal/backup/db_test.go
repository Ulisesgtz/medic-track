package backup

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
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

// testEnv is an environment name of its own so these rows never mix with a real one; they are removed at the end.
func testEnv(t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()
	env := "zt" + strings.ToLower(strings.ReplaceAll(t.Name(), "_", ""))
	if len(env) > 12 {
		env = env[:12]
	}
	env = strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' {
			return r
		}
		return 'x'
	}, env)
	clean := func() {
		_, _ = pool.Exec(context.Background(), `UPDATE backup_runs SET checked_run_id = NULL WHERE env = $1`, env)
		_, _ = pool.Exec(context.Background(), `DELETE FROM backup_runs WHERE env = $1`, env)
	}
	clean()
	t.Cleanup(clean)
	return env
}

func TestRepository_RunsAndTheirShape(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	repo := NewRepository(pool)
	env := testEnv(t, pool)

	_, err := repo.LatestValidBackup(ctx, env)
	require.ErrorIs(t, err, ErrNoValidBackup)

	running, err := repo.Start(ctx, KindBackup, env)
	require.NoError(t, err)
	_, err = repo.LatestValidBackup(ctx, env)
	require.ErrorIs(t, err, ErrNoValidBackup, "a running backup is never the valid one")

	failed, err := repo.Start(ctx, KindBackup, env)
	require.NoError(t, err)
	require.NoError(t, repo.FinishFailed(ctx, failed, FailUpload, nil, nil))

	ok, err := repo.Start(ctx, KindBackup, env)
	require.NoError(t, err)
	key := ObjectKey(env, time.Now())
	size := int64(1234)
	require.NoError(t, repo.FinishOK(ctx, ok, key, &size, map[string]int64{"accounts": 2}, nil))
	require.Error(t, repo.FinishOK(ctx, ok, key, &size, nil, nil), "only a running run can finish")

	latest, err := repo.LatestValidBackup(ctx, env)
	require.NoError(t, err)
	require.Equal(t, ok, latest.ID)
	require.Equal(t, int64(2), latest.TableCounts["accounts"])
	byKey, err := repo.BackupByObjectKey(ctx, key)
	require.NoError(t, err)
	require.Equal(t, ok, byKey.ID)

	states, err := repo.ObjectStates(ctx, env)
	require.NoError(t, err)
	require.Equal(t, map[string]string{key: StateOK}, states)

	// A failed check (restore or verify) makes that backup invalid; a later check that passes makes it valid again.
	failedCheck, err := repo.Start(ctx, KindCheck, env)
	require.NoError(t, err)
	require.NoError(t, repo.FinishFailed(ctx, failedCheck, FailVerify, &key, &ok))
	_, err = repo.LatestValidBackup(ctx, env)
	require.ErrorIs(t, err, ErrNoValidBackup)
	states, err = repo.ObjectStates(ctx, env)
	require.NoError(t, err)
	require.Equal(t, map[string]string{key: StateCheckFailed}, states)
	byKey, err = repo.BackupByObjectKey(ctx, key)
	require.NoError(t, err, "asked for by name, it is still found")
	require.Equal(t, ok, byKey.ID)

	// A download failure says nothing about the copy itself.
	downloadCheck, err := repo.Start(ctx, KindCheck, env)
	require.NoError(t, err)
	require.NoError(t, repo.FinishFailed(ctx, downloadCheck, FailDownload, &key, &ok))
	_, err = repo.LatestValidBackup(ctx, env)
	require.NoError(t, err)

	check, err := repo.Start(ctx, KindCheck, env)
	require.NoError(t, err)
	require.NoError(t, repo.FinishOK(ctx, check, key, nil, map[string]int64{"accounts": 2}, &ok))
	latest, err = repo.LatestValidBackup(ctx, env)
	require.NoError(t, err)
	require.Equal(t, ok, latest.ID)
	last, err := repo.LastOK(ctx, KindCheck)
	require.NoError(t, err)
	require.NotNil(t, last)
	any, err := repo.HasAny(ctx)
	require.NoError(t, err)
	require.True(t, any)

	// The database refuses an ok backup without its key, size or counts.
	_, err = pool.Exec(ctx, `UPDATE backup_runs SET status = 'ok', finished_at = now() WHERE id = $1`, running)
	require.Error(t, err)
	// And an object key with another shape.
	_, err = pool.Exec(ctx, `UPDATE backup_runs SET object_key = 'dev/Mateo.sql' WHERE id = $1`, running)
	require.Error(t, err)
}

func TestTryLock_OnlyOneHolder(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	release, ok, err := TryLock(ctx, pool)
	require.NoError(t, err)
	require.True(t, ok)
	_, ok2, err := TryLock(ctx, pool)
	require.NoError(t, err)
	require.False(t, ok2)
	release()
	release2, ok3, err := TryLock(ctx, pool)
	require.NoError(t, err)
	require.True(t, ok3)
	release2()
}

func TestPgDumper_CountsInTheSnapshotAndPassesItToPgDump(t *testing.T) {
	pool := testPool(t)
	var gotName string
	var gotArgs []string
	var gotEnv []string
	d := &PgDumper{Pool: pool, DatabaseURL: "postgres://root:s3cret@db:5432/app?sslmode=disable", Run: func(_ context.Context, c Command) error {
		gotName, gotArgs, gotEnv = c.Name, c.Args, c.Env
		_, err := io.WriteString(c.Stdout, "PGDMP")
		return err
	}}
	var out bytes.Buffer
	counts, err := d.Dump(context.Background(), &out)
	require.NoError(t, err)
	require.Equal(t, "pg_dump", gotName)
	require.Contains(t, strings.Join(gotArgs, " "), "--snapshot=")
	require.NotContains(t, strings.Join(gotArgs, " "), "s3cret", "the password never goes in the arguments")
	require.Equal(t, []string{"PGPASSWORD=s3cret"}, gotEnv)
	require.Equal(t, "PGDMP", out.String())
	require.Contains(t, counts, "accounts")
	require.Contains(t, counts, "backup_runs")

	d.Run = func(context.Context, Command) error {
		return errors.New("pg_dump failed")
	}
	_, err = d.Dump(context.Background(), &out)
	var se *StepError
	require.ErrorAs(t, err, &se)
	require.Equal(t, FailDump, se.Step)

	d.DatabaseURL = "host=db password=s3cret"
	_, err = d.Dump(context.Background(), &out)
	require.ErrorAs(t, err, &se)
	require.Equal(t, FailDump, se.Step)
	require.NotContains(t, err.Error(), "s3cret")
}

func TestEphemeralRestorer_RemovesItsDirectoryAlways(t *testing.T) {
	pool := testPool(t)
	tmp := t.TempDir()
	var calls []string
	var envs [][]string
	var pwfileSeen string
	ok := func(_ context.Context, c Command) error {
		calls = append(calls, c.Name)
		envs = append(envs, c.Env)
		if c.Name == "initdb" {
			for _, a := range c.Args {
				if strings.HasPrefix(a, "--pwfile=") {
					b, err := os.ReadFile(strings.TrimPrefix(a, "--pwfile="))
					require.NoError(t, err)
					pwfileSeen = strings.TrimSpace(string(b))
				}
			}
		}
		if c.Stdin != nil {
			_, _ = io.ReadAll(c.Stdin)
		}
		return nil
	}
	var connectedWith string
	r := &EphemeralRestorer{Run: ok, TmpDir: tmp, Connect: func(ctx context.Context, _ int, password string) (Querier, func(), error) {
		connectedWith = password
		conn, err := pool.Acquire(ctx)
		if err != nil {
			return nil, nil, err
		}
		return conn, conn.Release, nil
	}}
	counts, err := r.RestoreAndCount(context.Background(), strings.NewReader("PGDMP"))
	require.NoError(t, err)
	require.Contains(t, counts, "accounts")
	require.Equal(t, []string{"initdb", "pg_ctl", "createdb", "pg_restore", "pg_ctl"}, calls)
	require.Len(t, pwfileSeen, 64, "a random password of this run")
	require.Equal(t, pwfileSeen, connectedWith)
	require.Equal(t, []string{"PGPASSWORD=" + pwfileSeen}, envs[2], "createdb gets it in its environment")
	require.Equal(t, []string{"PGPASSWORD=" + pwfileSeen}, envs[3], "and pg_restore")
	entries, _ := os.ReadDir(tmp)
	require.Empty(t, entries, "the temporary server's directory is gone")

	for _, failing := range []string{"initdb", "pg_ctl", "createdb", "pg_restore"} {
		calls = nil
		r.Run = func(_ context.Context, c Command) error {
			calls = append(calls, c.Name)
			if c.Name == failing && !(failing == "pg_ctl" && len(c.Args) > 0 && c.Args[len(c.Args)-1] == "stop") {
				return errors.New(c.Name + " failed")
			}
			return nil
		}
		_, err := r.RestoreAndCount(context.Background(), strings.NewReader("PGDMP"))
		require.Error(t, err, failing)
		entries, _ := os.ReadDir(tmp)
		require.Empty(t, entries, failing)
	}

	r.Run = ok
	r.Connect = func(context.Context, int, string) (Querier, func(), error) { return nil, nil, errors.New("no") }
	_, err = r.RestoreAndCount(context.Background(), strings.NewReader("PGDMP"))
	require.Error(t, err)

	r.TmpDir = filepath.Join(tmp, "does", "not", "exist")
	_, err = r.RestoreAndCount(context.Background(), strings.NewReader("PGDMP"))
	require.Error(t, err)

	r.FreePort = func() (int, error) { return 0, errors.New("no port") }
	_, err = r.RestoreAndCount(context.Background(), strings.NewReader("PGDMP"))
	require.Error(t, err)
	port, err := freePort()
	require.NoError(t, err)
	require.Greater(t, port, 0)
	_, _, err = connectLoopback(context.Background(), port, "x")
	require.Error(t, err, "nothing listens there")
}

func TestExecRunner(t *testing.T) {
	err := ExecRunner(context.Background(), Command{Name: "definitely-not-a-program-peditrack", Env: []string{"PGPASSWORD=x"}})
	require.Error(t, err)
	require.Equal(t, "definitely-not-a-program-peditrack failed", err.Error())

	// The program's own output reaches the caller's writer, and the environment reaches the program.
	var out bytes.Buffer
	require.NoError(t, ExecRunner(context.Background(), Command{Name: "go", Args: []string{"env", "GOFLAGS"}, Env: []string{"GOFLAGS=-peditrack"}, Stdout: &out}))
	require.Equal(t, "-peditrack", strings.TrimSpace(out.String()))
	require.NoError(t, ExecRunner(context.Background(), Command{Name: "go", Args: []string{"version"}, Stdout: io.Discard}))
}

func TestSplitPassword(t *testing.T) {
	u, env, err := SplitPassword("postgres://root:s3cret@db.internal:5432/app?sslmode=require")
	require.NoError(t, err)
	require.Equal(t, "postgres://root@db.internal:5432/app?sslmode=require", u)
	require.Equal(t, []string{"PGPASSWORD=s3cret"}, env)

	u, env, err = SplitPassword("postgresql://root@db/app?password=s3cret&sslmode=disable")
	require.NoError(t, err)
	require.NotContains(t, u, "s3cret")
	require.Contains(t, u, "sslmode=disable")
	require.Equal(t, []string{"PGPASSWORD=s3cret"}, env)

	u, env, err = SplitPassword("postgres://db/app")
	require.NoError(t, err)
	require.Equal(t, "postgres://db/app", u)
	require.Empty(t, env)

	for _, bad := range []string{"host=db password=s3cret", "mysql://u:s3cret@db/x", "postgres://u:s3cret@db/%zz"} {
		_, _, err = SplitPassword(bad)
		require.Error(t, err, bad)
		require.NotContains(t, err.Error(), "s3cret")
	}
}

func TestRepositoryAndDumper_FailWhenTheDatabaseIsGone(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	pool.Close()
	ctx := context.Background()
	repo := NewRepository(pool)
	_, err = repo.Start(ctx, KindBackup, "dev")
	require.Error(t, err)
	require.Error(t, repo.FinishOK(ctx, [16]byte{1}, "dev/2026-01-01T090000Z.dump.age", nil, map[string]int64{"a": 1}, nil))
	require.Error(t, repo.FinishFailed(ctx, [16]byte{1}, FailDump, nil, nil))
	_, err = repo.LatestValidBackup(ctx, "dev")
	require.Error(t, err)
	require.NotErrorIs(t, err, ErrNoValidBackup)
	_, err = repo.ObjectStates(ctx, "dev")
	require.Error(t, err)
	_, err = repo.LastOK(ctx, KindBackup)
	require.Error(t, err)
	_, err = repo.HasAny(ctx)
	require.Error(t, err)
	_, _, err = TryLock(ctx, pool)
	require.Error(t, err)
	_, err = (&PgDumper{Pool: pool}).Dump(ctx, io.Discard)
	var se *StepError
	require.ErrorAs(t, err, &se)
	require.Equal(t, FailSnapshot, se.Step)
}

type badQuerier struct{ failCount bool }

func (b badQuerier) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	return nil, errors.New("no")
}
func (b badQuerier) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row { return nil }

func TestCountTables_ListFailure(t *testing.T) {
	_, err := CountTables(context.Background(), badQuerier{})
	require.Error(t, err)
}

func TestPgTarget(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	ctx := context.Background()
	var restoreArgs []string
	target := &PgTarget{URL: dsn, Run: func(_ context.Context, c Command) error {
		restoreArgs = c.Args
		_, _ = io.ReadAll(c.Stdin)
		return nil
	}}
	n, err := target.TableCount(ctx)
	require.NoError(t, err)
	require.Greater(t, n, 0, "the development database has tables: a restore there is refused")
	counts, err := target.Restore(ctx, strings.NewReader("PGDMP"))
	require.NoError(t, err)
	require.Contains(t, counts, "accounts")
	// The address pg_restore gets carries no password (in CI the password is "postgres", the user's name too, so look at the
	// URL itself rather than for the text).
	var dbArg string
	for _, a := range restoreArgs {
		if strings.HasPrefix(a, "--dbname=") {
			dbArg = strings.TrimPrefix(a, "--dbname=")
		}
	}
	u, err := url.Parse(dbArg)
	require.NoError(t, err)
	_, hasPassword := u.User.Password()
	require.False(t, hasPassword, "no password in pg_restore's arguments")
	require.Empty(t, u.Query().Get("password"))

	target.Run = func(context.Context, Command) error {
		return errors.New("pg_restore failed")
	}
	_, err = target.Restore(ctx, strings.NewReader("PGDMP"))
	require.Error(t, err)

	bad := &PgTarget{URL: "postgres://nobody:wrong@127.0.0.1:1/none?connect_timeout=1"}
	_, err = bad.TableCount(ctx)
	require.Error(t, err)
	require.NotContains(t, err.Error(), "wrong")

	notURL := &PgTarget{URL: "host=x password=wrong", Run: target.Run}
	_, err = notURL.Restore(ctx, strings.NewReader("PGDMP"))
	require.Error(t, err)
	require.NotContains(t, err.Error(), "wrong")
}
