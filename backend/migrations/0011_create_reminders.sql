-- Recordatorios de tomas por notificaciones push (specs/011-recordatorios-push, data-model.md).

-- A browser or installed PWA on which a tutor turned reminders on. `endpoint` is unique: one browser
-- reminds one account at a time (activating it for another account moves it there).
CREATE TABLE reminder_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts (id),
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deactivated_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_reminder_devices_account_active ON reminder_devices (account_id) WHERE active;

-- What reminders show: the medication and child, or a generic text. NULL = not chosen yet
-- (the first activation of the account asks for it).
ALTER TABLE accounts
    ADD COLUMN reminder_detail TEXT NULL CHECK (reminder_detail IN ('detailed', 'generic'));

-- When a dose was claimed for its reminder, so it is never reminded twice. Never goes back to NULL.
ALTER TABLE doses ADD COLUMN reminder_sent_at TIMESTAMPTZ NULL;

CREATE INDEX idx_doses_pending_reminder ON doses (scheduled_at)
    WHERE reminder_sent_at IS NULL AND taken = false;
