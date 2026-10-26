-- Editar consultas ya guardadas (specs/051-editar-consultas, data-model.md).
-- La consulta guarda quien la edito por ultima vez y cuando; no hay historial de versiones. Las dos columnas van juntas:
-- o la consulta nunca se edito (ambas nulas) o tiene las dos. Sin relleno: las consultas existentes quedan sin editar.
ALTER TABLE consultations
    ADD COLUMN edited_at TIMESTAMPTZ NULL,
    ADD COLUMN edited_by_account_id UUID NULL REFERENCES accounts (id),
    ADD CONSTRAINT consultations_edit_pair CHECK ((edited_at IS NULL) = (edited_by_account_id IS NULL));
