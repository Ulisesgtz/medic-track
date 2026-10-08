-- Suplementos y actividades por separado (specs/035-actividades-y-suplementos, plan.md).
-- Una actividad es una fila de supplement_routines de otro tipo: se define "desde una hora hasta otra, cada cuanto"
-- (periodo 'window') en lugar de horas fijas. Se retira el periodo 'interval' (cada N horas) de los suplementos: las
-- rutinas 'interval' que ya existen pasan a ser actividades.

ALTER TABLE supplement_routines
    ADD COLUMN kind TEXT NOT NULL DEFAULT 'supplement' CHECK (kind IN ('supplement', 'activity')),
    ADD COLUMN window_start TIME NULL,
    ADD COLUMN window_end TIME NULL,
    ADD COLUMN interval_minutes SMALLINT NULL;

ALTER TABLE supplement_routines DROP CONSTRAINT supplement_routines_period_shape;
ALTER TABLE supplement_routines DROP CONSTRAINT supplement_routines_period_check;

-- Las 'cada N horas' pasan a actividades: empiezan a su primera hora y siguen cada N horas hasta las 23:59, todos los dias.
UPDATE supplement_routines
SET kind = 'activity',
    period = 'window',
    window_start = LEAST(first_time, TIME '23:58'),
    window_end = TIME '23:59',
    interval_minutes = interval_hours * 60
WHERE period = 'interval';

-- Sus tomas futuras sin marcar y sin aviso se regeneran con la regla nueva (lo pasado y lo marcado no cambia): el
-- planificador las vuelve a crear desde ahora porque generated_until queda en ahora.
DELETE FROM supplement_doses d
USING supplement_routines r
WHERE d.routine_id = r.id AND r.kind = 'activity' AND d.scheduled_at > now() AND NOT d.taken
  AND NOT EXISTS (SELECT 1 FROM supplement_dose_reminders dr WHERE dr.dose_id = d.id);

UPDATE supplement_routines SET generated_until = now() WHERE kind = 'activity' AND status = 'active';

ALTER TABLE supplement_routines DROP COLUMN interval_hours;
ALTER TABLE supplement_routines DROP COLUMN first_time;

ALTER TABLE supplement_routines
    ADD CONSTRAINT supplement_routines_period_check CHECK (period IN ('daily', 'weekdays', 'window')),
    ADD CONSTRAINT supplement_routines_period_shape CHECK (
        (kind = 'supplement' AND period = 'daily'
            AND cardinality(times) BETWEEN 1 AND 6
            AND cardinality(weekdays) = 0
            AND window_start IS NULL AND window_end IS NULL AND interval_minutes IS NULL)
        OR (kind = 'supplement' AND period = 'weekdays'
            AND cardinality(times) BETWEEN 1 AND 6
            AND cardinality(weekdays) BETWEEN 1 AND 7
            AND window_start IS NULL AND window_end IS NULL AND interval_minutes IS NULL)
        OR (kind = 'activity' AND period = 'window'
            AND cardinality(times) = 0
            AND cardinality(weekdays) BETWEEN 0 AND 7
            AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_end > window_start
            AND interval_minutes BETWEEN 5 AND 1440)
    );

-- El tope de activas se cuenta por tipo (por hijo y por persona).
CREATE INDEX idx_supplement_routines_kind_active ON supplement_routines (account_id, kind) WHERE status = 'active';
