package backup

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Dumper writes a consistent copy of the database to w and returns how many rows each table had in that same instant.
type Dumper interface {
	Dump(ctx context.Context, w io.Writer) (counts map[string]int64, err error)
}

// StepError says which step of a run failed; its text is internal (never shown or stored).
type StepError struct {
	Step Failure
	Err  error
}

func (e *StepError) Error() string { return string(e.Step) + ": " + e.Err.Error() }
func (e *StepError) Unwrap() error { return e.Err }

func stepErr(step Failure, err error) error { return &StepError{Step: step, Err: err} }

// Command is one run of an external program. The password of a database never goes in Args (anyone on the machine sees the
// arguments of a process): it travels in Env as PGPASSWORD (see SplitPassword).
type Command struct {
	Name   string
	Args   []string
	Env    []string // added to the process's environment
	Stdin  io.Reader
	Stdout io.Writer // nil = discarded
}

// Runner runs an external program (ExecRunner; replaced in tests).
type Runner func(ctx context.Context, c Command) error

// ExecRunner runs a real program. Its stderr is discarded and never logged (it can name the database or its host), and so is
// stdout unless the caller reads it. Nothing it discards is a pipe: `pg_ctl start` leaves the server running, and a pipe the
// server inherited would keep Wait waiting until the server ends.
func ExecRunner(ctx context.Context, c Command) error {
	cmd := exec.CommandContext(ctx, c.Name, c.Args...)
	cmd.Stdin = c.Stdin
	if c.Stdout != nil && c.Stdout != io.Discard {
		cmd.Stdout = c.Stdout
	}
	// cmd.Stderr stays nil: the null device, not a pipe.
	if len(c.Env) > 0 {
		cmd.Env = append(os.Environ(), c.Env...)
	}
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("%s failed", c.Name)
	}
	return nil
}

// SplitPassword takes the password out of a postgres:// URL (its user part and a `password` parameter) so the URL can go in
// a program's arguments and the password in its environment. A connection string that isn't such a URL is refused rather than
// risked in the arguments.
func SplitPassword(databaseURL string) (withoutPassword string, env []string, err error) {
	u, err := url.Parse(databaseURL)
	if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") {
		return "", nil, errors.New("the database address must be a postgres:// URL")
	}
	var password string
	if u.User != nil {
		password, _ = u.User.Password()
		u.User = url.User(u.User.Username())
	}
	q := u.Query()
	if p := q.Get("password"); p != "" {
		password = p
		q.Del("password")
		u.RawQuery = q.Encode()
	}
	if password != "" {
		env = []string{"PGPASSWORD=" + password}
	}
	return u.String(), env, nil
}

// PgDumper copies the live database with pg_dump, in one exported snapshot, after counting every table in that snapshot
// (FR-002). It reads no row: only count(*).
type PgDumper struct {
	Pool        *pgxpool.Pool
	DatabaseURL string
	Run         Runner
}

// DumpArgs are pg_dump's arguments for a snapshot; databaseURL carries no password (SplitPassword).
func DumpArgs(snapshot, databaseURL string) []string {
	return []string{"--format=custom", "--snapshot=" + snapshot, "--no-owner", "--no-privileges", "--dbname=" + databaseURL}
}

func (d *PgDumper) Dump(ctx context.Context, w io.Writer) (map[string]int64, error) {
	tx, err := d.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, stepErr(FailSnapshot, err)
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()

	var snapshot string
	if err := tx.QueryRow(ctx, `SELECT pg_export_snapshot()`).Scan(&snapshot); err != nil {
		return nil, stepErr(FailSnapshot, err)
	}
	counts, err := CountTables(ctx, tx)
	if err != nil {
		return nil, stepErr(FailSnapshot, err)
	}
	run := d.Run
	if run == nil {
		run = ExecRunner
	}
	dbURL, env, err := SplitPassword(d.DatabaseURL)
	if err != nil {
		return nil, stepErr(FailDump, err)
	}
	// The transaction stays open (and its snapshot valid) until pg_dump is done.
	if err := run(ctx, Command{Name: "pg_dump", Args: DumpArgs(snapshot, dbURL), Env: env, Stdout: w}); err != nil {
		return nil, stepErr(FailDump, err)
	}
	return counts, nil
}

// Querier is what CountTables needs (a pool, a connection or a transaction).
type Querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// CountTables counts the rows of every base table of the public schema. Only numbers come back.
func CountTables(ctx context.Context, q Querier) (map[string]int64, error) {
	rows, err := q.Query(ctx, `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)
	if err != nil {
		return nil, fmt.Errorf("listing the tables: %w", err)
	}
	var names []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			rows.Close()
			return nil, fmt.Errorf("listing the tables: %w", err)
		}
		names = append(names, n)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("listing the tables: %w", err)
	}
	counts := make(map[string]int64, len(names))
	for _, n := range names {
		var c int64
		if err := q.QueryRow(ctx, `SELECT count(*) FROM public.`+pgx.Identifier{n}.Sanitize()).Scan(&c); err != nil {
			return nil, fmt.Errorf("counting a table: %w", err)
		}
		counts[n] = c
	}
	return counts, nil
}
