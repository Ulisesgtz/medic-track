-- specs/039-digest-semanal-errores: one row per week the weekly error digest was tried, so the same week's e-mail is never
-- sent twice (a restart or two copies of the API) and never lost (a process that dies mid-send leaves a 'sending' row whose
-- lease expires and another copy takes over; the provider's idempotency key stops the retry from sending a second e-mail).
--
-- It stores nothing of the e-mail: no recipient, sender, subject, body, key or provider answer. 52 rows a year: no retention.

CREATE TABLE error_digest_runs (
    -- ISO week of the scheduled time, in Mexico City time: '2026-W42'.
    week_key    TEXT PRIMARY KEY CHECK (week_key ~ '^[0-9]{4}-W[0-9]{2}$'),
    status      TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
    claimed_at  TIMESTAMPTZ NOT NULL,
    -- Until when the claim belongs to whoever took it; a 'sending' row past this instant can be taken again.
    lease_until TIMESTAMPTZ NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 1 CHECK (attempts >= 1),
    sent_at     TIMESTAMPTZ,
    failed_at   TIMESTAMPTZ,
    -- The state and its timestamp can't contradict each other.
    CHECK ((status = 'sent') = (sent_at IS NOT NULL) AND (status = 'failed') = (failed_at IS NOT NULL))
);
