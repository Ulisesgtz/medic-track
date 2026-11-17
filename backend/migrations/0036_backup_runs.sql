-- specs/069-respaldos-base: one row per backup or weekly check run of the `backup` service. Never data of a family: only
-- table names, row counts and fixed failure codes. A run that dies half way stays `running` and is never a valid backup.
CREATE TABLE backup_runs (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    kind           text        NOT NULL CHECK (kind IN ('backup', 'check')),
    env            text        NOT NULL CHECK (env ~ '^[a-z]{2,12}$'),
    started_at     timestamptz NOT NULL DEFAULT now(),
    finished_at    timestamptz,
    status         text        NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'failed')),
    failure        text        CHECK (failure IN ('config', 'lock', 'snapshot', 'dump', 'encrypt', 'upload', 'retention',
                                                  'download', 'decrypt', 'restore', 'verify', 'record')),
    object_key     text        CHECK (object_key ~ '^[a-z]{2,12}/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z\.dump\.age$'),
    size_bytes     bigint      CHECK (size_bytes >= 0),
    table_counts   jsonb,
    -- On a check (ok or failed): the backup it looked at. A backup whose latest check failed at `restore` or `verify` is no longer
    -- the valid one (`restore latest` and the next check skip it).
    checked_run_id uuid        REFERENCES backup_runs (id),
    CONSTRAINT backup_runs_ok_shape CHECK (
        status <> 'ok' OR (
            finished_at IS NOT NULL AND object_key IS NOT NULL
            AND (kind <> 'backup' OR (size_bytes IS NOT NULL AND table_counts IS NOT NULL))
        )
    ),
    CONSTRAINT backup_runs_failed_shape CHECK (status <> 'failed' OR (failure IS NOT NULL AND finished_at IS NOT NULL))
);

CREATE INDEX backup_runs_latest ON backup_runs (kind, env, status, started_at DESC);
