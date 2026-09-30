-- specs/020-recorrer-tratamiento: the parent may add doses to the end of a medication (only with the confirmation of
-- the parent, never on its own). Every decision is a row, append-only; the doses it brought and the unregistered doses
-- it covered are marked on the doses themselves.
CREATE TABLE medication_extensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medication_id UUID NOT NULL REFERENCES medications (id),
    account_id UUID NOT NULL REFERENCES accounts (id),
    -- What the app proposed (the unregistered doses not yet covered) and what the parent confirmed;
    -- confirmed <> proposed means the parent typed the number.
    proposed_doses INTEGER NOT NULL CHECK (proposed_doses >= 1),
    added_doses INTEGER NOT NULL CHECK (added_doses BETWEEN 1 AND 60),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_medication_extensions_medication_id ON medication_extensions (medication_id);

ALTER TABLE doses
    ADD COLUMN added_by_extension_id UUID NULL REFERENCES medication_extensions (id),
    ADD COLUMN covered_by_extension_id UUID NULL REFERENCES medication_extensions (id);
