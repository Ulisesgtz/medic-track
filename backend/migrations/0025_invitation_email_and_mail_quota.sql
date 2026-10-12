-- specs/040-invitacion-familiar-por-correo: invitation e-mails and the shared daily e-mail quota.
--
-- mail_daily_counts: how many e-mails went out each day (Mexico City date), shared by the invitations and the weekly error
-- digest, so the provider's 100-a-day free plan is watched in one place. It stores nothing else: no address, link or text.
-- One row a day (about 365 a year): no purge needed.
--
-- family_invitations gets the state of the invitation's e-mail and how many e-mails were asked for it today (the limits per
-- invitation and per family). It does NOT store the recipient again (it is `email`), the link, the token or the message.

CREATE TABLE mail_daily_counts (
    day    DATE PRIMARY KEY,
    sent   INTEGER NOT NULL DEFAULT 0 CHECK (sent >= 0),
    -- The warning threshold was already reported this day.
    warned BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE family_invitations
    -- none = no e-mail asked (no provider configured), sending, sent, failed.
    ADD COLUMN email_status TEXT NOT NULL DEFAULT 'none' CHECK (email_status IN ('none', 'sending', 'sent', 'failed')),
    ADD COLUMN email_status_at TIMESTAMPTZ NULL,
    -- Mexico City day that email_sends_count refers to.
    ADD COLUMN email_sends_day DATE NULL,
    ADD COLUMN email_sends_count INTEGER NOT NULL DEFAULT 0 CHECK (email_sends_count >= 0);

-- The sweep that closes sends stuck in 'sending'. Almost always empty.
CREATE INDEX idx_family_invitations_email_sending ON family_invitations (email_status_at) WHERE email_status = 'sending';
