-- Ficha del hijo (specs/073-ficha-del-hijo, data-model.md). Tres tablas nuevas; no cambia ninguna existente.
-- La ficha es lo que el padre captura (tipo de sangre, nota general, pediatra, alergias y padecimientos) y la app lo
-- guarda tal cual: nunca lo interpreta (Principio I).
-- Sin ON DELETE CASCADE (convencion del repo): el borrado de la cuenta sigue el orden de purgeSteps (spec 070).

-- Una fila por hijo. La llave compuesta (child_id, account_id) hace que la base misma rechace otra cuenta
-- (children_id_account_id_key existe desde la migracion 0012). version sube en cada cambio real (conflictos de edicion);
-- updated_by_account_id queda NULL si esa cuenta se borra (spec 070).
CREATE TABLE child_records (
    child_id UUID PRIMARY KEY,
    account_id UUID NOT NULL,
    blood_type TEXT NULL,
    general_note TEXT NULL,
    pediatrician_name TEXT NULL,
    pediatrician_phone TEXT NULL,
    pediatrician_office TEXT NULL,
    version INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_account_id UUID NULL REFERENCES accounts (id),
    FOREIGN KEY (child_id, account_id) REFERENCES children (id, account_id),
    CONSTRAINT child_records_blood_type CHECK (blood_type IS NULL OR blood_type IN
        ('O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'unknown')),
    CONSTRAINT child_records_general_note_len CHECK (general_note IS NULL OR char_length(general_note) <= 1000),
    CONSTRAINT child_records_pediatrician_name_len CHECK (pediatrician_name IS NULL OR char_length(pediatrician_name) <= 120),
    CONSTRAINT child_records_pediatrician_phone_len CHECK (pediatrician_phone IS NULL OR char_length(pediatrician_phone) <= 30),
    CONSTRAINT child_records_pediatrician_office_len CHECK (pediatrician_office IS NULL OR char_length(pediatrician_office) <= 300),
    CONSTRAINT child_records_version CHECK (version >= 1)
);

CREATE INDEX idx_child_records_account ON child_records (account_id);

-- Alergias del hijo, en el orden que el padre les dio (position 0-29: el tope de 30 lo cuenta la base tambien).
CREATE TABLE child_record_allergies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES child_records (child_id),
    account_id UUID NOT NULL,
    position SMALLINT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NULL,
    note TEXT NULL,
    CONSTRAINT child_record_allergies_position UNIQUE (child_id, position),
    CONSTRAINT child_record_allergies_position_range CHECK (position BETWEEN 0 AND 29),
    CONSTRAINT child_record_allergies_name_len CHECK (char_length(name) <= 120 AND char_length(btrim(name)) > 0),
    CONSTRAINT child_record_allergies_kind CHECK (kind IS NULL OR kind IN ('medication', 'food', 'other')),
    CONSTRAINT child_record_allergies_note_len CHECK (note IS NULL OR char_length(note) <= 300)
);

CREATE INDEX idx_child_record_allergies_account ON child_record_allergies (account_id);

-- Padecimientos o condiciones del hijo: igual que las alergias, sin tipo.
CREATE TABLE child_record_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES child_records (child_id),
    account_id UUID NOT NULL,
    position SMALLINT NOT NULL,
    name TEXT NOT NULL,
    note TEXT NULL,
    CONSTRAINT child_record_conditions_position UNIQUE (child_id, position),
    CONSTRAINT child_record_conditions_position_range CHECK (position BETWEEN 0 AND 29),
    CONSTRAINT child_record_conditions_name_len CHECK (char_length(name) <= 120 AND char_length(btrim(name)) > 0),
    CONSTRAINT child_record_conditions_note_len CHECK (note IS NULL OR char_length(note) <= 300)
);

CREATE INDEX idx_child_record_conditions_account ON child_record_conditions (account_id);
