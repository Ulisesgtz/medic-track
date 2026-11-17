-- specs/071-primer-uso-guiado: the first-use guide on the home.
-- NULL = the guide is not closed; a date = the account closed it with «Ahora no» (reopening sets it back to NULL).
ALTER TABLE accounts ADD COLUMN first_use_guide_dismissed_at timestamptz NULL;

-- GET /accounts/me now tells whether the account has a consultation (its oldest one): one index over every
-- consultation of the account, a child's or its own.
CREATE INDEX consultations_account_created ON consultations (account_id, created_at, id);
