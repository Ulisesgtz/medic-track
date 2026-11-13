package backup

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Kind of a run.
const (
	KindBackup = "backup"
	KindCheck  = "check"
)

// Run is one row of backup_runs.
type Run struct {
	ID          uuid.UUID
	Kind        string
	Env         string
	StartedAt   time.Time
	FinishedAt  *time.Time
	Status      string
	Failure     *string
	ObjectKey   *string
	SizeBytes   *int64
	TableCounts map[string]int64
}

// Repository reads and writes backup_runs. Never data of a family: table names, numbers and fixed codes only.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository works on pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// ErrNoValidBackup: there is no finished backup of the environment yet.
var ErrNoValidBackup = errors.New("no valid backup")

// Start opens a run (status running).
func (r *Repository) Start(ctx context.Context, kind, env string) (uuid.UUID, error) {
	var id uuid.UUID
	err := r.pool.QueryRow(ctx, `INSERT INTO backup_runs (kind, env) VALUES ($1, $2) RETURNING id`, kind, env).Scan(&id)
	if err != nil {
		return uuid.Nil, fmt.Errorf("starting a backup run: %w", err)
	}
	return id, nil
}

// FinishOK closes a run as ok. size and counts are those of a backup; checked is the backup a check verified.
func (r *Repository) FinishOK(ctx context.Context, id uuid.UUID, objectKey string, size *int64, counts map[string]int64, checked *uuid.UUID) error {
	var countsJSON []byte
	if counts != nil {
		b, err := json.Marshal(counts)
		if err != nil {
			return fmt.Errorf("encoding table counts: %w", err)
		}
		countsJSON = b
	}
	tag, err := r.pool.Exec(ctx, `
		UPDATE backup_runs
		SET status = 'ok', finished_at = now(), object_key = $2, size_bytes = $3, table_counts = $4, checked_run_id = $5
		WHERE id = $1 AND status = 'running'`, id, objectKey, size, countsJSON, checked)
	if err != nil {
		return fmt.Errorf("finishing a backup run: %w", err)
	}
	if tag.RowsAffected() != 1 {
		return fmt.Errorf("finishing a backup run: not running")
	}
	return nil
}

// FinishFailed closes a run as failed at the given step. objectKey and checked are the copy and the backup a check was looking
// at, if any.
func (r *Repository) FinishFailed(ctx context.Context, id uuid.UUID, f Failure, objectKey *string, checked *uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE backup_runs
		SET status = 'failed', finished_at = now(), failure = $2, object_key = coalesce($3, object_key),
		    checked_run_id = coalesce($4, checked_run_id)
		WHERE id = $1 AND status = 'running'`, id, string(f), objectKey, checked)
	if err != nil {
		return fmt.Errorf("closing a failed backup run: %w", err)
	}
	return nil
}

// checkFailedSQL is true for a backup b whose most recent finished check could not restore it or found other counts: the copy
// is broken, so it is not the valid one any more (a later check that passes makes it valid again).
const checkFailedSQL = `EXISTS (
	SELECT 1 FROM (
		SELECT c.status, c.failure FROM backup_runs c
		WHERE c.kind = 'check' AND c.checked_run_id = b.id AND c.status <> 'running'
		ORDER BY c.started_at DESC LIMIT 1
	) last WHERE last.status = 'failed' AND last.failure IN ('restore', 'verify'))`

// LatestValidBackup is the most recent finished backup of env whose last check, if any, did not fail.
func (r *Repository) LatestValidBackup(ctx context.Context, env string) (*Run, error) {
	return r.validBackup(ctx, `b.env = $1 AND NOT `+checkFailedSQL, env)
}

// BackupByObjectKey is the finished backup of a given object (also one whose check failed: it is asked for by name).
func (r *Repository) BackupByObjectKey(ctx context.Context, key string) (*Run, error) {
	return r.validBackup(ctx, `b.object_key = $1`, key)
}

func (r *Repository) validBackup(ctx context.Context, where string, arg string) (*Run, error) {
	run := Run{}
	var counts []byte
	err := r.pool.QueryRow(ctx, `
		SELECT b.id, b.kind, b.env, b.started_at, b.finished_at, b.status, b.failure, b.object_key, b.size_bytes, b.table_counts
		FROM backup_runs b
		WHERE b.kind = 'backup' AND b.status = 'ok' AND `+where+`
		ORDER BY b.started_at DESC LIMIT 1`, arg).
		Scan(&run.ID, &run.Kind, &run.Env, &run.StartedAt, &run.FinishedAt, &run.Status, &run.Failure, &run.ObjectKey, &run.SizeBytes, &counts)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNoValidBackup
	}
	if err != nil {
		return nil, fmt.Errorf("reading the latest backup: %w", err)
	}
	if len(counts) > 0 {
		if err := json.Unmarshal(counts, &run.TableCounts); err != nil {
			return nil, fmt.Errorf("reading the latest backup's counts: %w", err)
		}
	}
	return &run, nil
}

// Recorded states of a copy (ObjectStates).
const (
	StateOK          = "ok"
	StateCheckFailed = "check_failed"
)

// ObjectStates are the objects of env whose backup finished ok, each StateOK or, when its last check failed, StateCheckFailed.
// An object of the storage that isn't here was never recorded as a finished backup.
func (r *Repository) ObjectStates(ctx context.Context, env string) (map[string]string, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT b.object_key, `+checkFailedSQL+`
		FROM backup_runs b WHERE b.kind = 'backup' AND b.status = 'ok' AND b.env = $1`, env)
	if err != nil {
		return nil, fmt.Errorf("reading the recorded backups: %w", err)
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var key string
		var failed bool
		if err := rows.Scan(&key, &failed); err != nil {
			return nil, fmt.Errorf("reading the recorded backups: %w", err)
		}
		out[key] = StateOK
		if failed {
			out[key] = StateCheckFailed
		}
	}
	return out, rows.Err()
}

// LastOK is when the last run of kind finished ok, in any environment; nil without one (the weekly digest, FR-015).
func (r *Repository) LastOK(ctx context.Context, kind string) (*time.Time, error) {
	var at *time.Time
	err := r.pool.QueryRow(ctx, `SELECT max(finished_at) FROM backup_runs WHERE kind = $1 AND status = 'ok'`, kind).Scan(&at)
	if err != nil {
		return nil, fmt.Errorf("reading the last backup: %w", err)
	}
	return at, nil
}

// HasAny says whether any run was ever recorded (the digest says «sin registros» otherwise).
func (r *Repository) HasAny(ctx context.Context) (bool, error) {
	var any bool
	if err := r.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM backup_runs)`).Scan(&any); err != nil {
		return false, fmt.Errorf("reading the backup runs: %w", err)
	}
	return any, nil
}
