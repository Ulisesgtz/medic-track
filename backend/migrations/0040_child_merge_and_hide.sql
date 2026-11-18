-- specs/074-unir-hijo-duplicado: unir un hijo propio con el de la familia y ocultar hijos propios.

-- 1. Ocultar: la dueña oculta a un hijo propio. Solo tiene efecto mientras sea integrante activa de una familia
--    (Tutor o Cuidador); lo decide la consulta, no la columna.
ALTER TABLE children ADD COLUMN hidden_at timestamptz NULL;

-- 2. Registro de las uniones (de solo agregar). Solo numeros: ni nombres ni textos libres ni datos de salud.
--    source_account_id y merged_by_account_id quedan en NULL si esa cuenta se borra (spec 070).
CREATE TABLE child_merges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_account_id UUID NOT NULL REFERENCES accounts (id),
    target_child_id UUID NOT NULL,
    source_account_id UUID NULL REFERENCES accounts (id),
    merged_by_account_id UUID NULL REFERENCES accounts (id),
    merged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    counts JSONB NOT NULL,
    FOREIGN KEY (target_child_id, family_account_id) REFERENCES children (id, account_id)
);

CREATE INDEX idx_child_merges_target ON child_merges (target_child_id);

-- 3. Las cuatro llaves de una hija a consultations pasan a DEFERRABLE INITIALLY IMMEDIATE: la union mueve primero las
--    consultas y despues sus sintomas y citas en una transaccion, y las revisa al COMMIT. Fuera de la union siguen
--    inmediatas (mismo nombre, mismas columnas).
ALTER TABLE consultation_symptoms DROP CONSTRAINT consultation_symptoms_consultation_id_child_id_fkey;
ALTER TABLE consultation_symptoms ADD CONSTRAINT consultation_symptoms_consultation_id_child_id_fkey
    FOREIGN KEY (consultation_id, child_id) REFERENCES consultations (id, child_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE consultation_symptoms DROP CONSTRAINT consultation_symptoms_consultation_account_fkey;
ALTER TABLE consultation_symptoms ADD CONSTRAINT consultation_symptoms_consultation_account_fkey
    FOREIGN KEY (consultation_id, account_id) REFERENCES consultations (id, account_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE consultation_appointments DROP CONSTRAINT consultation_appointments_consultation_id_child_id_fkey;
ALTER TABLE consultation_appointments ADD CONSTRAINT consultation_appointments_consultation_id_child_id_fkey
    FOREIGN KEY (consultation_id, child_id) REFERENCES consultations (id, child_id) DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE consultation_appointments DROP CONSTRAINT consultation_appointments_consultation_account_fkey;
ALTER TABLE consultation_appointments ADD CONSTRAINT consultation_appointments_consultation_account_fkey
    FOREIGN KEY (consultation_id, account_id) REFERENCES consultations (id, account_id) DEFERRABLE INITIALLY IMMEDIATE;
