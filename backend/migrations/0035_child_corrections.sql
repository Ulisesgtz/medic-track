-- Editar los datos del hijo (specs/064-editar-datos-hijo, data-model.md). Dos columnas opcionales en children: quien corrigio
-- por ultima vez los datos del hijo (nombre, apellido, fecha de nacimiento, talla o peso) y cuando. Sin historial de valores
-- anteriores; no cambia ningun dato existente.
ALTER TABLE children
    ADD COLUMN corrected_by_account_id UUID NULL REFERENCES accounts (id),
    ADD COLUMN corrected_at TIMESTAMPTZ NULL,
    ADD CONSTRAINT children_correction_together CHECK ((corrected_by_account_id IS NULL) = (corrected_at IS NULL));
