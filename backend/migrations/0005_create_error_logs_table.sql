CREATE TABLE error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message TEXT NOT NULL,
    http_status INTEGER,
    endpoint TEXT NOT NULL,
    file TEXT NOT NULL,
    line INTEGER NOT NULL,
    account_id UUID REFERENCES accounts (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
