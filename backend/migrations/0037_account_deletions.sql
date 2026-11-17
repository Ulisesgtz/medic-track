-- specs/070-eliminar-cuenta-y-datos: deleting an account.
--
-- 1. account_deletions: one row per request. No foreign key to accounts on purpose: the row outlives the account as the
--    record that the right of cancellation was honored (FR-018). It never holds a name, an e-mail or health data: only the
--    account's random UUID, the Clerk user id until the deletion completes, dates and attempts.
CREATE TABLE account_deletions (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      uuid        NOT NULL,
    clerk_user_id   text        NULL,
    requested_at    timestamptz NOT NULL DEFAULT now(),
    scheduled_for   timestamptz NOT NULL,
    canceled_at     timestamptz NULL,
    completed_at    timestamptz NULL,
    attempts        integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_attempt_at timestamptz NULL,
    CONSTRAINT account_deletions_scheduled_after_request CHECK (scheduled_for > requested_at),
    CONSTRAINT account_deletions_canceled_or_completed CHECK (canceled_at IS NULL OR completed_at IS NULL),
    CONSTRAINT account_deletions_completed_forgets_clerk CHECK (completed_at IS NULL OR clerk_user_id IS NULL)
);

-- One open request per account (neither canceled nor completed).
CREATE UNIQUE INDEX account_deletions_one_open ON account_deletions (account_id)
    WHERE canceled_at IS NULL AND completed_at IS NULL;

-- The sweeper's query: the open requests whose date has come.
CREATE INDEX account_deletions_due ON account_deletions (scheduled_for)
    WHERE canceled_at IS NULL AND completed_at IS NULL;

-- 2. Authorship becomes optional in what one person writes on another account's children (research R1): when an invited
--    person deletes their account, what they created or marked in the family stays, without their name.
ALTER TABLE supplement_routines       ALTER COLUMN created_by_account_id DROP NOT NULL;
ALTER TABLE consultation_appointments ALTER COLUMN created_by_account_id DROP NOT NULL;
ALTER TABLE vaccine_records           ALTER COLUMN created_by_account_id DROP NOT NULL;
ALTER TABLE vaccine_card_photos       ALTER COLUMN created_by_account_id DROP NOT NULL;
ALTER TABLE growth_measurements       ALTER COLUMN created_by_account_id DROP NOT NULL;
ALTER TABLE medicine_cabinet_items    ALTER COLUMN created_by_account_id DROP NOT NULL;
ALTER TABLE child_device_links        ALTER COLUMN created_by_account_id DROP NOT NULL;
ALTER TABLE family_members            ALTER COLUMN invited_by_account_id DROP NOT NULL;
ALTER TABLE family_invitations        ALTER COLUMN invited_by_account_id DROP NOT NULL;

-- 3. "Who and when" pairs: an author still needs its date, but a date may now stay without its (deleted) author — «Corregida
--    el 3 oct», with no name.
ALTER TABLE vaccine_records DROP CONSTRAINT vaccine_records_correction_together,
    ADD CONSTRAINT vaccine_records_correction_together CHECK (corrected_by_account_id IS NULL OR corrected_at IS NOT NULL);
ALTER TABLE growth_measurements DROP CONSTRAINT growth_measurements_correction_together,
    ADD CONSTRAINT growth_measurements_correction_together CHECK (corrected_by_account_id IS NULL OR corrected_at IS NOT NULL);
ALTER TABLE children DROP CONSTRAINT children_correction_together,
    ADD CONSTRAINT children_correction_together CHECK (corrected_by_account_id IS NULL OR corrected_at IS NOT NULL);
ALTER TABLE consultations DROP CONSTRAINT consultations_edit_pair,
    ADD CONSTRAINT consultations_edit_pair CHECK (edited_by_account_id IS NULL OR edited_at IS NOT NULL);
ALTER TABLE medicine_cabinet_items DROP CONSTRAINT medicine_cabinet_items_updated_together,
    ADD CONSTRAINT medicine_cabinet_items_updated_together CHECK (updated_by_account_id IS NULL OR updated_at IS NOT NULL);
ALTER TABLE consultation_appointments DROP CONSTRAINT consultation_appointments_status_author,
    ADD CONSTRAINT consultation_appointments_status_author CHECK (status = 'scheduled' OR status_at IS NOT NULL);
