-- Cartilla de vacunacion del hijo (specs/046-cartilla-vacunacion, data-model.md).
-- Tres tablas nuevas; no cambia ninguna existente. La app registra lo que el padre captura y nunca interpreta (Principio I):
-- el catalogo son solo nombres, sin edades, calendarios ni dosis objetivo.

-- El catalogo (publico, se mantiene con SQL sin publicar la app, como symptoms): agregar = INSERT con un sort_order libre,
-- retirar = active = false (ya no se ofrece, se sigue viendo en lo registrado), renombrar = UPDATE name. Un code nunca cambia
-- ni se borra. La lista de abajo se valida con la Cartilla Nacional de Salud vigente antes de publicar.
CREATE TABLE vaccine_catalog (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO vaccine_catalog (code, name, sort_order) VALUES
    ('bcg', 'BCG', 10),
    ('hepatitis_b', 'Hepatitis B', 20),
    ('hexavalent', 'Hexavalente acelular', 30),
    ('pentavalent', 'Pentavalente acelular', 40),
    ('rotavirus', 'Rotavirus', 50),
    ('pneumococcal', 'Neumocócica conjugada', 60),
    ('influenza', 'Influenza', 70),
    ('mmr', 'SRP (sarampión, rubéola y parotiditis)', 80),
    ('mr', 'SR (sarampión y rubéola)', 90),
    ('dpt', 'DPT', 100),
    ('td', 'Td (tétanos y difteria)', 110),
    ('tdap', 'Tdpa', 120),
    ('hpv', 'VPH (virus del papiloma humano)', 130),
    ('hepatitis_a', 'Hepatitis A', 140),
    ('varicella', 'Varicela', 150),
    ('covid19', 'COVID-19', 160),
    ('polio', 'Polio', 170),
    ('meningococcal', 'Meningococo', 180);

-- Una fila por dosis aplicada. La llave compuesta (child_id, account_id) hace que la base misma rechace otro hijo u otra cuenta
-- (la restriccion unica children_id_account_id_key existe desde la migracion 0012). Exactamente uno de vaccine_code y
-- custom_name; corrected_by_account_id y corrected_at van juntos (la huella de la ultima correccion, sin historial).
CREATE TABLE vaccine_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL,
    account_id UUID NOT NULL,
    vaccine_code TEXT NULL REFERENCES vaccine_catalog (code),
    custom_name TEXT NULL,
    applied_on DATE NOT NULL,
    dose_number INTEGER NULL,
    lot TEXT NULL,
    place TEXT NULL,
    notes TEXT NULL,
    created_by_account_id UUID NOT NULL REFERENCES accounts (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    corrected_by_account_id UUID NULL REFERENCES accounts (id),
    corrected_at TIMESTAMPTZ NULL,
    FOREIGN KEY (child_id, account_id) REFERENCES children (id, account_id),
    CONSTRAINT vaccine_records_one_name CHECK ((vaccine_code IS NULL) <> (custom_name IS NULL)),
    CONSTRAINT vaccine_records_custom_name_len CHECK (custom_name IS NULL OR char_length(custom_name) BETWEEN 1 AND 100),
    CONSTRAINT vaccine_records_dose_range CHECK (dose_number IS NULL OR dose_number BETWEEN 1 AND 20),
    CONSTRAINT vaccine_records_lot_len CHECK (lot IS NULL OR char_length(lot) <= 60),
    CONSTRAINT vaccine_records_place_len CHECK (place IS NULL OR char_length(place) <= 120),
    CONSTRAINT vaccine_records_notes_len CHECK (notes IS NULL OR char_length(notes) <= 500),
    CONSTRAINT vaccine_records_correction_together CHECK ((corrected_by_account_id IS NULL) = (corrected_at IS NULL))
);

CREATE INDEX idx_vaccine_records_child ON vaccine_records (child_id, applied_on, created_at);
CREATE INDEX idx_vaccine_records_account ON vaccine_records (account_id);

-- Una fila por foto de la cartilla de papel. El tope de 10 por hijo se aplica en la transaccion de la subida (con la fila del hijo
-- bloqueada), no aqui. Las fotos y las dosis no se relacionan entre si.
CREATE TABLE vaccine_card_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL,
    account_id UUID NOT NULL,
    photo BYTEA NOT NULL CHECK (octet_length(photo) > 0),
    created_by_account_id UUID NOT NULL REFERENCES accounts (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (child_id, account_id) REFERENCES children (id, account_id)
);

CREATE INDEX idx_vaccine_card_photos_child ON vaccine_card_photos (child_id, created_at);
