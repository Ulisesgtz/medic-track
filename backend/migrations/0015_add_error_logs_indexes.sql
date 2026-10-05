-- specs/021-consulta-y-retencion-error-logs: the table was only ever written to and had no index besides its key.
-- Reading it (newest first, by period, by endpoint) and purging it by age must not scan it all.
CREATE INDEX idx_error_logs_created_at ON error_logs (created_at DESC, id DESC);
CREATE INDEX idx_error_logs_endpoint ON error_logs (endpoint text_pattern_ops, created_at DESC);
