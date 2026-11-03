-- Consultas del titular (specs/058-consultas-del-titular, data-model.md).
-- Una consulta propia es una fila de consultations SIN hijo: la persona de su account_id es la paciente. Las consultas de un
-- hijo filtran por child_id, asi que una consulta propia nunca entra en ellas. La cuenta duenia se lee ahora de la propia
-- consulta (antes de children.account_id).
BEGIN;

-- La cuenta duenia de cada consulta (la del hijo, o la persona de una consulta propia).
ALTER TABLE consultations ADD COLUMN account_id UUID REFERENCES accounts (id);
UPDATE consultations c SET account_id = ch.account_id FROM children ch WHERE ch.id = c.child_id;
ALTER TABLE consultations ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE consultations ALTER COLUMN child_id DROP NOT NULL;
ALTER TABLE consultations ADD CONSTRAINT consultations_id_account_id_key UNIQUE (id, account_id);
-- Una consulta de un hijo es de la cuenta de ese hijo (solo se revisa cuando hay hijo).
ALTER TABLE consultations
    ADD CONSTRAINT consultations_child_account_fkey FOREIGN KEY (child_id, account_id) REFERENCES children (id, account_id);
CREATE INDEX idx_consultations_own ON consultations (account_id, consult_date DESC) WHERE child_id IS NULL;

-- Una consulta de un hijo que llega sin cuenta toma la de su hijo. Asi el backend anterior (que no escribe account_id) sigue
-- creando consultas mientras esta migracion ya esta aplicada y el nuevo aun no se despliega.
CREATE FUNCTION consultations_fill_account_id() RETURNS trigger AS $$
BEGIN
    IF NEW.account_id IS NULL AND NEW.child_id IS NOT NULL THEN
        SELECT account_id INTO NEW.account_id FROM children WHERE id = NEW.child_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER consultations_fill_account_id BEFORE INSERT ON consultations
    FOR EACH ROW EXECUTE FUNCTION consultations_fill_account_id();

-- Sintomas: el hijo es opcional; la consulta y la cuenta siempre coinciden.
ALTER TABLE consultation_symptoms ALTER COLUMN child_id DROP NOT NULL;
ALTER TABLE consultation_symptoms
    ADD CONSTRAINT consultation_symptoms_consultation_account_fkey
        FOREIGN KEY (consultation_id, account_id) REFERENCES consultations (id, account_id);

-- Citas: sin hijo = cita de la persona de account_id (con consulta propia o sin consulta).
ALTER TABLE consultation_appointments ALTER COLUMN child_id DROP NOT NULL;
ALTER TABLE consultation_appointments
    ADD CONSTRAINT consultation_appointments_consultation_account_fkey
        FOREIGN KEY (consultation_id, account_id) REFERENCES consultations (id, account_id);
CREATE INDEX idx_consultation_appointments_own ON consultation_appointments (account_id, starts_at) WHERE child_id IS NULL;

-- El interruptor "Compartir mis consultas con los Tutores de mi familia". Sin fila = apagado.
CREATE TABLE own_consultation_sharing (
    account_id UUID PRIMARY KEY REFERENCES accounts (id),
    shared BOOLEAN NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Los avisos que un Tutor pidio de una consulta propia compartida (apagados por omision: sin fila no hay aviso).
CREATE TABLE own_consultation_reminder_optins (
    consultation_id UUID NOT NULL REFERENCES consultations (id),
    account_id UUID NOT NULL REFERENCES accounts (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (consultation_id, account_id)
);

COMMIT;
