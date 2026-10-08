-- Actividades a una hora fija (specs/035-actividades-y-suplementos): ademas de "desde una hora hasta otra, cada cuanto" (periodo
-- 'window'), una actividad puede ser a horas fijas como un suplemento (una practica de futbol los martes y jueves a las 17:00,
-- salir a correr a una hora): periodo 'daily' o 'weekdays' con de 1 a 6 horas. Solo se relaja el CHECK de forma; no cambia ningun dato.

ALTER TABLE supplement_routines DROP CONSTRAINT supplement_routines_period_shape;

ALTER TABLE supplement_routines
    ADD CONSTRAINT supplement_routines_period_shape CHECK (
        (period = 'daily'
            AND cardinality(times) BETWEEN 1 AND 6
            AND cardinality(weekdays) = 0
            AND window_start IS NULL AND window_end IS NULL AND interval_minutes IS NULL)
        OR (period = 'weekdays'
            AND cardinality(times) BETWEEN 1 AND 6
            AND cardinality(weekdays) BETWEEN 1 AND 7
            AND window_start IS NULL AND window_end IS NULL AND interval_minutes IS NULL)
        OR (kind = 'activity' AND period = 'window'
            AND cardinality(times) = 0
            AND cardinality(weekdays) BETWEEN 0 AND 7
            AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_end > window_start
            AND interval_minutes BETWEEN 5 AND 1440)
    );
