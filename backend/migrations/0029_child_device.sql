-- Dispositivo del hijo (specs/047-dispositivo-del-hijo, data-model.md).
-- El telefono de un hijo se vincula con una liga de un solo uso que da el padre; no hay correo, contrasena ni cuenta del menor.
-- Solo aditiva: tablas nuevas y columnas nulas. Nada de lo existente cambia de significado.

-- Un acceso de un telefono a UN hijo. Una sola fila recorre su ciclo: pending -> active -> revoked. Nunca se borra: las marcas que
-- hizo siguen apuntando a ella (el autor sigue siendo «Mateo» aunque se quite el dispositivo). Solo se guardan huellas (SHA-256)
-- de la ficha de la liga y de la credencial, nunca las fichas.
CREATE TABLE child_device_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL,
    account_id UUID NOT NULL,
    name TEXT NOT NULL,
    created_by_account_id UUID NOT NULL REFERENCES accounts (id),
    status TEXT NOT NULL DEFAULT 'pending',
    token_hash BYTEA NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    redeemed_at TIMESTAMPTZ NULL,
    credential_hash BYTEA NULL,
    credential_hash_previous BYTEA NULL,
    rotated_at TIMESTAMPTZ NULL,
    last_seen_at TIMESTAMPTZ NULL,
    reminder_detail TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ NULL,
    revoked_by_account_id UUID NULL REFERENCES accounts (id),
    -- La llave compuesta hace que la base misma rechace otro hijo u otra cuenta duena (children_id_account_id_key, migracion 0012).
    FOREIGN KEY (child_id, account_id) REFERENCES children (id, account_id),
    CONSTRAINT child_device_links_name_len CHECK (char_length(name) BETWEEN 1 AND 40),
    CONSTRAINT child_device_links_status CHECK (status IN ('pending', 'active', 'revoked')),
    CONSTRAINT child_device_links_reminder_detail CHECK (reminder_detail IS NULL OR reminder_detail IN ('detailed', 'generic')),
    CONSTRAINT child_device_links_pending_shape CHECK (
        status <> 'pending' OR (token_hash IS NOT NULL AND credential_hash IS NULL AND credential_hash_previous IS NULL)
    ),
    CONSTRAINT child_device_links_active_shape CHECK (
        status <> 'active' OR (credential_hash IS NOT NULL AND token_hash IS NULL AND redeemed_at IS NOT NULL)
    ),
    CONSTRAINT child_device_links_revoked_shape CHECK (
        status <> 'revoked' OR (token_hash IS NULL AND credential_hash IS NULL AND credential_hash_previous IS NULL AND revoked_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX child_device_links_token_hash_key ON child_device_links (token_hash) WHERE status = 'pending';
CREATE UNIQUE INDEX child_device_links_credential_hash_key ON child_device_links (credential_hash) WHERE status = 'active';
CREATE UNIQUE INDEX child_device_links_credential_previous_key ON child_device_links (credential_hash_previous)
    WHERE status = 'active' AND credential_hash_previous IS NOT NULL;
CREATE INDEX idx_child_device_links_child ON child_device_links (child_id, status);

-- Quien marco una toma: una cuenta (como hasta hoy) o un dispositivo de hijo, nunca los dos. Sin autor si no esta marcada.
ALTER TABLE doses ADD COLUMN taken_by_child_device_id UUID NULL REFERENCES child_device_links (id);
ALTER TABLE doses DROP CONSTRAINT doses_author_only_when_taken;
ALTER TABLE doses ADD CONSTRAINT doses_author_only_when_taken
    CHECK (taken OR (taken_by_account_id IS NULL AND taken_by_child_device_id IS NULL AND taken_at IS NULL));
ALTER TABLE doses ADD CONSTRAINT doses_one_author CHECK (taken_by_account_id IS NULL OR taken_by_child_device_id IS NULL);

ALTER TABLE supplement_doses ADD COLUMN taken_by_child_device_id UUID NULL REFERENCES child_device_links (id);
ALTER TABLE supplement_doses DROP CONSTRAINT supplement_doses_author_only_when_taken;
ALTER TABLE supplement_doses ADD CONSTRAINT supplement_doses_author_only_when_taken
    CHECK (taken OR (taken_by_account_id IS NULL AND taken_by_child_device_id IS NULL AND taken_at IS NULL));
ALTER TABLE supplement_doses ADD CONSTRAINT supplement_doses_one_author CHECK (taken_by_account_id IS NULL OR taken_by_child_device_id IS NULL);

-- Un aparato de avisos es de una cuenta O de un dispositivo de hijo. Las consultas de hoy filtran por account_id, asi que ignoran
-- por si solas las filas del hijo (y las citas y la familia nunca le llegan).
ALTER TABLE reminder_devices ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE reminder_devices ADD COLUMN child_link_id UUID NULL REFERENCES child_device_links (id);
ALTER TABLE reminder_devices ADD CONSTRAINT reminder_devices_one_owner CHECK ((account_id IS NULL) <> (child_link_id IS NULL));
CREATE INDEX idx_reminder_devices_child_link_active ON reminder_devices (child_link_id) WHERE active;

-- A lo mas un aviso por toma y por dispositivo de hijo (como dose_reminders y supplement_dose_reminders, que no cambian).
CREATE TABLE child_dose_reminders (
    dose_id UUID NOT NULL REFERENCES doses (id),
    link_id UUID NOT NULL REFERENCES child_device_links (id),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (dose_id, link_id)
);
CREATE INDEX idx_child_dose_reminders_link ON child_dose_reminders (link_id);

CREATE TABLE child_supplement_dose_reminders (
    dose_id UUID NOT NULL REFERENCES supplement_doses (id),
    link_id UUID NOT NULL REFERENCES child_device_links (id),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (dose_id, link_id)
);
CREATE INDEX idx_child_supplement_dose_reminders_link ON child_supplement_dose_reminders (link_id);
