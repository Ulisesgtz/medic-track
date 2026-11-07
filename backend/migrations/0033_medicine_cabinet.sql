-- Botiquin de la casa (specs/062-botiquin, data-model.md). Una tabla nueva; no cambia ninguna existente.
-- El botiquin es de la cuenta duena de la familia (account_id): lo ve la familia y lo cambian la duena y sus Tutores
-- (access.OnAccount). La caducidad es solo un dato que el padre captura: la app nunca dice si algo caduco ni si se puede usar
-- (Principio I). Quitar un medicamento lo borra de verdad, con su foto.
CREATE TABLE medicine_cabinet_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts (id),
    name TEXT NOT NULL,
    strength TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL,
    unit TEXT NOT NULL,
    expires_year INTEGER NOT NULL,
    expires_month INTEGER NOT NULL,
    expires_day INTEGER NULL,
    note TEXT NOT NULL DEFAULT '',
    photo BYTEA NULL,
    created_by_account_id UUID NOT NULL REFERENCES accounts (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_account_id UUID NULL REFERENCES accounts (id),
    updated_at TIMESTAMPTZ NULL,
    CONSTRAINT medicine_cabinet_items_name_len CHECK (char_length(name) BETWEEN 1 AND 120),
    CONSTRAINT medicine_cabinet_items_strength_len CHECK (char_length(strength) <= 60),
    CONSTRAINT medicine_cabinet_items_note_len CHECK (char_length(note) <= 500),
    CONSTRAINT medicine_cabinet_items_quantity CHECK (quantity BETWEEN 0 AND 999),
    CONSTRAINT medicine_cabinet_items_unit CHECK (unit IN ('box', 'tablet', 'bottle', 'ml')),
    CONSTRAINT medicine_cabinet_items_year CHECK (expires_year BETWEEN 2000 AND 2100),
    CONSTRAINT medicine_cabinet_items_month CHECK (expires_month BETWEEN 1 AND 12),
    CONSTRAINT medicine_cabinet_items_day CHECK (expires_day IS NULL OR expires_day BETWEEN 1 AND 31),
    CONSTRAINT medicine_cabinet_items_photo_size CHECK (photo IS NULL OR octet_length(photo) BETWEEN 1 AND 5242880),
    CONSTRAINT medicine_cabinet_items_updated_together CHECK ((updated_by_account_id IS NULL) = (updated_at IS NULL))
);

CREATE INDEX idx_medicine_cabinet_items_account ON medicine_cabinet_items (account_id);
