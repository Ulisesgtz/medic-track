-- La zona horaria de la consulta (bugfix/054, pendiente de la revision de la spec 051).
-- La "Primera toma" de cada medicamento es una hora local (HH:MM) y las tomas se generan leyendola con el desfase de UTC del
-- telefono que creo la consulta. Al editar un horario se usaba el desfase del telefono que edita: desde otra zona, una toma
-- nueva quedaba a horas de distancia de una conservada. Ahora la consulta guarda su desfase y al editar se usa ese.
-- NULL = desconocido (consultas solo registro sin tomas, o editadas antes de esta migracion): la siguiente edicion guarda el
-- desfase de quien edita.
ALTER TABLE consultations
    ADD COLUMN utc_offset_minutes INTEGER NULL
        CONSTRAINT consultations_utc_offset_range CHECK (utc_offset_minutes BETWEEN -840 AND 840);

-- Relleno: el desfase se deduce de la primera toma de la consulta, que se genero en su fecha a la "Primera toma" local
-- (fecha + hora local - instante UTC). Solo consultas nunca editadas: una edicion puede haber cambiado la hora de inicio o
-- la fecha y dejado tomas pasadas del horario anterior. Un resultado fuera de rango, o que no sea multiplo de 15 minutos
-- (ninguna zona horaria real lo es), se descarta y la consulta queda sin desfase.
UPDATE consultations c
SET utc_offset_minutes = f.offset_minutes
FROM (
    SELECT DISTINCT ON (m.consultation_id)
        m.consultation_id,
        round(extract(epoch FROM ((co.consult_date + m.start_time) - (d.scheduled_at AT TIME ZONE 'UTC'))) / 60)::INTEGER
            AS offset_minutes
    FROM medications m
    JOIN consultations co ON co.id = m.consultation_id
    JOIN doses d ON d.medication_id = m.id
    WHERE m.start_time IS NOT NULL
      AND d.added_by_extension_id IS NULL
      AND co.edited_at IS NULL
    ORDER BY m.consultation_id, d.scheduled_at, m.created_at, m.id
) f
WHERE c.id = f.consultation_id
  AND f.offset_minutes BETWEEN -840 AND 840
  AND f.offset_minutes % 15 = 0;
