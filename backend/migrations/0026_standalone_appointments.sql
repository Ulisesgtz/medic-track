-- Citas sin consulta previa, con doctor y lugar (spec 043, bugfix/044).
-- Una cita se puede agregar desde la pagina del hijo sin haber registrado una consulta: consultation_id pasa a ser opcional
-- (la llave compuesta con consultations solo se revisa cuando trae consulta) y la cita guarda su propio doctor y lugar.
-- Una cita de una consulta sigue leyendo el doctor de su consulta mientras no tenga uno propio.

ALTER TABLE consultation_appointments ALTER COLUMN consultation_id DROP NOT NULL;

ALTER TABLE consultation_appointments
    ADD COLUMN doctor_name TEXT NOT NULL DEFAULT '' CHECK (char_length(doctor_name) <= 200),
    -- Lugar tal como lo escribio el padre (consultorio, direccion) y, si quiere, la liga de Google Maps de ese lugar.
    ADD COLUMN location TEXT NOT NULL DEFAULT '' CHECK (char_length(location) <= 300),
    ADD COLUMN location_url TEXT NOT NULL DEFAULT '' CHECK (char_length(location_url) <= 500);
