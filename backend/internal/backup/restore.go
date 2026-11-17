package backup

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strconv"

	"github.com/jackc/pgx/v5"
)

// Restorer restores a plain (decrypted) copy somewhere disposable and returns its table counts.
type Restorer interface {
	RestoreAndCount(ctx context.Context, r io.Reader) (map[string]int64, error)
}

// EphemeralRestorer restores into a PostgreSQL server of its own, started in a temporary directory (0700) that listens only on
// the loopback address (127.0.0.1, a free port, no Unix socket: the same on Linux and Windows) and asks a password made for this
// run alone, written only in that directory — so no other process or user of the machine can read the restored copy. The
// directory is removed at the end whatever happened (FR-007, FR-011).
type EphemeralRestorer struct {
	Run    Runner
	TmpDir string // "" = the system's
	// Connect opens a connection to the restored database on 127.0.0.1:port (pgx; replaced in tests).
	Connect func(ctx context.Context, port int, password string) (Querier, func(), error)
	// FreePort picks the port (replaced in tests).
	FreePort func() (int, error)
}

// EphemeralArgs are the commands the restorer runs, in order (exposed for tests). pwfile holds the server's password.
func EphemeralArgs(dir string, port int, pwfile string) (initdb, start, create, restore, stop []string) {
	data := filepath.Join(dir, "data")
	p := strconv.Itoa(port)
	initdb = []string{"-D", data, "-U", "postgres", "--auth=scram-sha-256", "--pwfile=" + pwfile, "--no-sync", "--encoding=UTF8", "--locale=C"}
	start = []string{"-D", data, "-l", filepath.Join(dir, "server.log"), "-o", "-c listen_addresses=127.0.0.1 -c unix_socket_directories= -p " + p, "-w", "start"}
	create = []string{"-h", "127.0.0.1", "-p", p, "-U", "postgres", "restore_check"}
	restore = []string{"--exit-on-error", "--no-owner", "-h", "127.0.0.1", "-p", p, "-U", "postgres", "-d", "restore_check"}
	stop = []string{"-D", data, "-m", "fast", "-w", "stop"}
	return
}

func freePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, fmt.Errorf("finding a free port: %w", err)
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

// randomPassword is 32 random bytes in hex.
func randomPassword() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("making the restore password: %w", err)
	}
	return hex.EncodeToString(b), nil
}

func (e *EphemeralRestorer) RestoreAndCount(ctx context.Context, r io.Reader) (map[string]int64, error) {
	run := e.Run
	if run == nil {
		run = ExecRunner
	}
	pick := e.FreePort
	if pick == nil {
		pick = freePort
	}
	port, err := pick()
	if err != nil {
		return nil, err
	}
	password, err := randomPassword()
	if err != nil {
		return nil, err
	}
	dir, err := os.MkdirTemp(e.TmpDir, "peditrack-restore-")
	if err != nil {
		return nil, fmt.Errorf("making the restore directory: %w", err)
	}
	defer os.RemoveAll(dir) // always, also on failure
	pwfile := filepath.Join(dir, "pwfile")
	if err := os.WriteFile(pwfile, []byte(password+"\n"), 0o600); err != nil {
		return nil, fmt.Errorf("writing the restore password: %w", err)
	}
	env := []string{"PGPASSWORD=" + password}

	initArgs, startArgs, createArgs, restoreArgs, stopArgs := EphemeralArgs(dir, port, pwfile)
	if err := run(ctx, Command{Name: "initdb", Args: initArgs}); err != nil {
		return nil, err
	}
	_ = os.Remove(pwfile) // initdb read it; the password now lives only in this process
	if err := run(ctx, Command{Name: "pg_ctl", Args: startArgs}); err != nil {
		return nil, err
	}
	defer func() { _ = run(context.WithoutCancel(ctx), Command{Name: "pg_ctl", Args: stopArgs}) }()
	if err := run(ctx, Command{Name: "createdb", Args: createArgs, Env: env}); err != nil {
		return nil, err
	}
	if err := run(ctx, Command{Name: "pg_restore", Args: restoreArgs, Env: env, Stdin: r}); err != nil {
		return nil, err
	}

	connect := e.Connect
	if connect == nil {
		connect = connectLoopback
	}
	q, closeConn, err := connect(ctx, port, password)
	if err != nil {
		return nil, err
	}
	defer closeConn()
	return CountTables(ctx, q)
}

func connectLoopback(ctx context.Context, port int, password string) (Querier, func(), error) {
	cfg, err := pgx.ParseConfig(fmt.Sprintf("postgres://postgres@127.0.0.1:%d/restore_check?sslmode=disable", port))
	if err != nil {
		return nil, nil, fmt.Errorf("connecting to the restored copy")
	}
	cfg.Password = password
	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		return nil, nil, fmt.Errorf("connecting to the restored copy")
	}
	return conn, func() { _ = conn.Close(context.WithoutCancel(ctx)) }, nil
}

// Mismatch is a table whose rows differ between the copy and what was counted when it was made. Only names and numbers.
type Mismatch struct {
	Table    string
	Expected int64 // -1 = the table was not expected
	Got      int64 // -1 = the table is missing
}

// CompareCounts lists every difference: a missing table, an extra one or another number of rows.
func CompareCounts(expected, got map[string]int64) []Mismatch {
	var out []Mismatch
	for t, n := range expected {
		g, ok := got[t]
		switch {
		case !ok:
			out = append(out, Mismatch{Table: t, Expected: n, Got: -1})
		case g != n:
			out = append(out, Mismatch{Table: t, Expected: n, Got: g})
		}
	}
	for t, g := range got {
		if _, ok := expected[t]; !ok {
			out = append(out, Mismatch{Table: t, Expected: -1, Got: g})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Table < out[j].Table })
	return out
}

// PgTarget is a database a copy is restored into by hand (`backup restore --target`).
type PgTarget struct {
	URL string
	Run Runner
}

func (p *PgTarget) connect(ctx context.Context) (*pgx.Conn, error) {
	conn, err := pgx.Connect(ctx, p.URL)
	if err != nil {
		return nil, fmt.Errorf("connecting to the target database")
	}
	return conn, nil
}

// TableCount says how many tables the target's public schema has.
func (p *PgTarget) TableCount(ctx context.Context) (int, error) {
	conn, err := p.connect(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = conn.Close(context.WithoutCancel(ctx)) }()
	var n int
	if err := conn.QueryRow(ctx, `SELECT count(*) FROM pg_tables WHERE schemaname = 'public'`).Scan(&n); err != nil {
		return 0, fmt.Errorf("reading the target database")
	}
	return n, nil
}

// Restore loads a plain copy with pg_restore and counts the tables it left.
func (p *PgTarget) Restore(ctx context.Context, r io.Reader) (map[string]int64, error) {
	run := p.Run
	if run == nil {
		run = ExecRunner
	}
	dbURL, env, err := SplitPassword(p.URL)
	if err != nil {
		return nil, err
	}
	args := []string{"--exit-on-error", "--no-owner", "--no-privileges", "--dbname=" + dbURL}
	if err := run(ctx, Command{Name: "pg_restore", Args: args, Env: env, Stdin: r}); err != nil {
		return nil, err
	}
	conn, err := p.connect(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = conn.Close(context.WithoutCancel(ctx)) }()
	return CountTables(ctx, conn)
}
