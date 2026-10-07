-- Rutinas de suplementos (specs/033-recordatorios-suplementos-citas, parte 1, data-model.md).
-- No toca doses ni dose_reminders: las rutinas no son registro medico y se pueden editar.

CREATE TABLE supplement_routines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Cuenta duenia (la del hijo): de ella sale el plan.
    account_id UUID NOT NULL REFERENCES accounts (id),
    -- La parte 1 siempre lo llena; nulo queda para la rutina personal del padre (parte 3).
    child_id UUID NULL,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
    period TEXT NOT NULL CHECK (period IN ('daily', 'weekdays', 'interval')),
    -- Horas locales del dia (daily/weekdays); vacio en interval.
    times TIME[] NOT NULL DEFAULT '{}',
    -- 0 = lunes ... 6 = domingo; solo en weekdays.
    weekdays SMALLINT[] NOT NULL DEFAULT '{}',
    interval_hours SMALLINT NULL,
    first_date DATE NOT NULL,
    first_time TIME NULL,
    end_date DATE NULL,
    utc_offset_minutes SMALLINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
    paused_at TIMESTAMPTZ NULL,
    ended_at TIMESTAMPTZ NULL,
    generated_until TIMESTAMPTZ NOT NULL,
    created_by_account_id UUID NOT NULL REFERENCES accounts (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- La base no deja otro hijo ni otra cuenta.
    FOREIGN KEY (child_id, account_id) REFERENCES children (id, account_id),
    CONSTRAINT supplement_routines_period_shape CHECK (
        (period = 'daily'
            AND cardinality(times) BETWEEN 1 AND 6
            AND cardinality(weekdays) = 0
            AND interval_hours IS NULL AND first_time IS NULL)
        OR (period = 'weekdays'
            AND cardinality(times) BETWEEN 1 AND 6
            AND cardinality(weekdays) BETWEEN 1 AND 7
            AND interval_hours IS NULL AND first_time IS NULL)
        OR (period = 'interval'
            AND cardinality(times) = 0
            AND cardinality(weekdays) = 0
            AND interval_hours BETWEEN 1 AND 24
            AND first_time IS NOT NULL)
    ),
    CONSTRAINT supplement_routines_end_after_first CHECK (end_date IS NULL OR end_date >= first_date),
    CONSTRAINT supplement_routines_paused_at CHECK (status <> 'paused' OR paused_at IS NOT NULL),
    CONSTRAINT supplement_routines_ended_at CHECK (status <> 'ended' OR ended_at IS NOT NULL)
);

-- El tope de rutinas activas por hijo y el planificador del horizonte.
CREATE INDEX idx_supplement_routines_child_active ON supplement_routines (child_id) WHERE status = 'active';
CREATE INDEX idx_supplement_routines_generated_until ON supplement_routines (generated_until) WHERE status = 'active';

CREATE TABLE supplement_doses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    routine_id UUID NOT NULL REFERENCES supplement_routines (id),
    scheduled_at TIMESTAMPTZ NOT NULL,
    taken BOOLEAN NOT NULL DEFAULT false,
    taken_by_account_id UUID NULL REFERENCES accounts (id),
    taken_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Regenerar nunca duplica.
    CONSTRAINT supplement_doses_unique_slot UNIQUE (routine_id, scheduled_at),
    -- Una toma sin marcar no tiene autor ni hora.
    CONSTRAINT supplement_doses_author_only_when_taken CHECK (taken OR (taken_by_account_id IS NULL AND taken_at IS NULL))
);

CREATE INDEX idx_supplement_doses_untaken_scheduled ON supplement_doses (scheduled_at) WHERE taken = false;

-- A lo mas un aviso por toma y por persona (como dose_reminders).
CREATE TABLE supplement_dose_reminders (
    dose_id UUID NOT NULL REFERENCES supplement_doses (id),
    account_id UUID NOT NULL REFERENCES accounts (id),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (dose_id, account_id)
);

CREATE INDEX idx_supplement_dose_reminders_account ON supplement_dose_reminders (account_id);

-- "Tus avisos": una fila = esa persona apago sus avisos de esa rutina. Sin fila = encendidos.
CREATE TABLE supplement_muted (
    routine_id UUID NOT NULL REFERENCES supplement_routines (id),
    account_id UUID NOT NULL REFERENCES accounts (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (routine_id, account_id)
);
