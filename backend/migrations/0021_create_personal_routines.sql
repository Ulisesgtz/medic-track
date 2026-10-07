-- Rutinas personales de suplementos (specs/033-recordatorios-suplementos-citas, parte 3, parte3/plan.md).
-- Son filas de supplement_routines con child_id NULL: la cuenta duenia es la propia persona y nadie mas las ve.

-- Una rutina sin hijo la crea y es de la misma persona.
ALTER TABLE supplement_routines
    ADD CONSTRAINT supplement_routines_personal_is_own CHECK (child_id IS NOT NULL OR created_by_account_id = account_id);

-- El tope de rutinas activas por persona.
CREATE INDEX idx_supplement_routines_personal_active ON supplement_routines (account_id) WHERE child_id IS NULL AND status = 'active';

-- «Entendido» del aviso de primera vez de la seccion personal: una fila = esa cuenta ya lo vio (en todos sus dispositivos).
CREATE TABLE personal_routine_notices (
    account_id UUID PRIMARY KEY REFERENCES accounts (id),
    seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
