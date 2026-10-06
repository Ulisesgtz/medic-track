-- Tomas con autor y recordatorios por persona (specs/032-compartir-con-familia, data-model.md).

-- Quien marco la toma y cuando. Nulos en las marcadas antes de esta funcion (se siguen viendo "tomada", sin "por ...").
ALTER TABLE doses
    ADD COLUMN taken_by_account_id UUID NULL REFERENCES accounts (id),
    ADD COLUMN taken_at TIMESTAMPTZ NULL;

-- Una toma sin marcar no tiene autor ni hora.
ALTER TABLE doses
    ADD CONSTRAINT doses_author_only_when_taken CHECK (taken OR (taken_by_account_id IS NULL AND taken_at IS NULL));

-- "Ya se le aviso a esta persona de esta toma": la llave primaria garantiza a lo mas un aviso por toma y por persona,
-- aunque corran dos ticks a la vez. `doses.reminder_sent_at` se sigue escribiendo (compatibilidad) pero ya no decide.
CREATE TABLE dose_reminders (
    dose_id UUID NOT NULL REFERENCES doses (id),
    account_id UUID NOT NULL REFERENCES accounts (id),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (dose_id, account_id)
);

CREATE INDEX idx_dose_reminders_account ON dose_reminders (account_id);

-- Lo ya avisado antes de esta migracion se le aviso a la cuenta duenia de su hijo: que nada se reenvie al desplegar.
INSERT INTO dose_reminders (dose_id, account_id, sent_at)
SELECT d.id, ch.account_id, d.reminder_sent_at
FROM doses d
JOIN medications m ON m.id = d.medication_id
JOIN consultations c ON c.id = m.consultation_id
JOIN children ch ON ch.id = c.child_id
WHERE d.reminder_sent_at IS NOT NULL;

-- Candidatas a aviso: por hora, solo las no marcadas.
CREATE INDEX idx_doses_untaken_scheduled ON doses (scheduled_at) WHERE taken = false;
