-- Proxima cita de una consulta (specs/033-recordatorios-suplementos-citas, parte 2, parte2/plan.md).
-- La cita no es registro medico: se crea, se edita y se marca sin tocar la consulta (nunca se borra).

CREATE TABLE consultation_appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL,
    child_id UUID NOT NULL,
    -- Cuenta duenia del hijo: de ella sale el plan.
    account_id UUID NOT NULL REFERENCES accounts (id),
    starts_at TIMESTAMPTZ NOT NULL,
    -- La diferencia horaria con la que se leen la hora y el dia local de la cita.
    utc_offset_minutes SMALLINT NOT NULL,
    note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'done', 'canceled')),
    status_by_account_id UUID NULL REFERENCES accounts (id),
    status_at TIMESTAMPTZ NULL,
    created_by_account_id UUID NOT NULL REFERENCES accounts (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- La base no deja otra consulta, otro hijo ni otra cuenta.
    FOREIGN KEY (consultation_id, child_id) REFERENCES consultations (id, child_id),
    FOREIGN KEY (child_id, account_id) REFERENCES children (id, account_id),
    CONSTRAINT consultation_appointments_status_author CHECK (
        status = 'scheduled' OR (status_by_account_id IS NOT NULL AND status_at IS NOT NULL)
    )
);

-- A lo mas una cita vigente por consulta; las realizadas y canceladas se quedan en el historial.
CREATE UNIQUE INDEX uq_consultation_appointments_one_scheduled ON consultation_appointments (consultation_id) WHERE status = 'scheduled';
CREATE INDEX idx_consultation_appointments_child ON consultation_appointments (child_id, starts_at);

CREATE TABLE appointment_notices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES consultation_appointments (id),
    -- 'before' = tanto tiempo antes; 'at_time' = N dias antes a una hora fija local.
    kind TEXT NOT NULL CHECK (kind IN ('before', 'at_time')),
    lead_minutes INTEGER NULL,
    days_before SMALLINT NULL,
    at_time TIME NULL,
    -- El instante real en que toca avisar (se calcula al guardar).
    fire_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT appointment_notices_shape CHECK (
        (kind = 'before' AND lead_minutes BETWEEN 1 AND 43200 AND days_before IS NULL AND at_time IS NULL)
        OR (kind = 'at_time' AND lead_minutes IS NULL AND days_before BETWEEN 0 AND 30 AND at_time IS NOT NULL)
    )
);

CREATE INDEX idx_appointment_notices_appointment ON appointment_notices (appointment_id);
CREATE INDEX idx_appointment_notices_fire_at ON appointment_notices (fire_at);

-- A lo mas un aviso por aviso de cita y persona (como dose_reminders).
CREATE TABLE appointment_notice_reminders (
    notice_id UUID NOT NULL REFERENCES appointment_notices (id),
    account_id UUID NOT NULL REFERENCES accounts (id),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (notice_id, account_id)
);

CREATE INDEX idx_appointment_notice_reminders_account ON appointment_notice_reminders (account_id);

-- "Tus avisos de esta cita": una fila = esa persona apago sus avisos de esa cita. Sin fila = encendidos.
CREATE TABLE appointment_muted (
    appointment_id UUID NOT NULL REFERENCES consultation_appointments (id),
    account_id UUID NOT NULL REFERENCES accounts (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (appointment_id, account_id)
);
