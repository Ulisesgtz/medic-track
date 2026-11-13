package backup

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// lockKey is the advisory lock of the backup process: only one run at a time, whatever starts it.
const lockKey int64 = 0x0069_ba_c0_0001

// TryLock takes the lock on a dedicated connection. ok is false when another run holds it; release frees it.
func TryLock(ctx context.Context, pool *pgxpool.Pool) (release func(), ok bool, err error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, false, fmt.Errorf("taking the backup lock: %w", err)
	}
	var got bool
	if err := conn.QueryRow(ctx, `SELECT pg_try_advisory_lock($1)`, lockKey).Scan(&got); err != nil {
		conn.Release()
		return nil, false, fmt.Errorf("taking the backup lock: %w", err)
	}
	if !got {
		conn.Release()
		return func() {}, false, nil
	}
	return func() {
		_, _ = conn.Exec(context.WithoutCancel(ctx), `SELECT pg_advisory_unlock($1)`, lockKey)
		conn.Release()
	}, true, nil
}
