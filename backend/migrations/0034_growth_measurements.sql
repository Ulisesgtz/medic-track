-- Curvas de crecimiento (specs/063-curvas-crecimiento, data-model.md). Una tabla nueva y una columna opcional en children;
-- no cambia ningun dato existente. La app registra las medidas y dibuja la referencia de la OMS; nunca calcula ni guarda el
-- percentil del hijo (Principio I).

-- Una fila por medida anotada (la revision del pediatra). La llave compuesta (child_id, account_id) hace que la base misma
-- rechace otro hijo u otra cuenta (children_id_account_id_key existe desde la migracion 0012). Al menos uno de los dos valores;
-- corrected_by_account_id y corrected_at van juntos (la huella de la ultima correccion, sin historial).
CREATE TABLE growth_measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL,
    account_id UUID NOT NULL,
    measured_on DATE NOT NULL,
    weight_kg NUMERIC(5,2) NULL,
    height_cm NUMERIC(4,1) NULL,
    note TEXT NULL,
    created_by_account_id UUID NOT NULL REFERENCES accounts (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    corrected_by_account_id UUID NULL REFERENCES accounts (id),
    corrected_at TIMESTAMPTZ NULL,
    FOREIGN KEY (child_id, account_id) REFERENCES children (id, account_id),
    CONSTRAINT growth_measurements_some_value CHECK (weight_kg IS NOT NULL OR height_cm IS NOT NULL),
    CONSTRAINT growth_measurements_weight_range CHECK (weight_kg IS NULL OR weight_kg BETWEEN 0.3 AND 200),
    CONSTRAINT growth_measurements_height_range CHECK (height_cm IS NULL OR height_cm BETWEEN 30 AND 220),
    CONSTRAINT growth_measurements_note_len CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 300),
    CONSTRAINT growth_measurements_correction_together CHECK ((corrected_by_account_id IS NULL) = (corrected_at IS NULL))
);

CREATE INDEX idx_growth_measurements_child ON growth_measurements (child_id, measured_on DESC, created_at DESC);

-- Que tabla de la OMS usar para la grafica de este hijo (niña o niño). Opcional: se pide solo al abrir la grafica.
ALTER TABLE children ADD COLUMN growth_reference_sex TEXT NULL
    CONSTRAINT children_growth_reference_sex CHECK (growth_reference_sex IN ('female', 'male'));
