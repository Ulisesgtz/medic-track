-- Síntomas seleccionables y notas previas a la consulta (specs/012-sintomas-notas-consulta, data-model.md).

-- The free text a parent wrote about the visit is now "notas previas a la consulta"; every existing text is kept as is.
ALTER TABLE consultations RENAME COLUMN symptoms TO notes;

-- Already unique by id; these let consultation_symptoms reference each pair, so the database itself guarantees a
-- symptom row always carries its consultation's child and that child's account.
ALTER TABLE consultations ADD CONSTRAINT consultations_id_child_id_key UNIQUE (id, child_id);
ALTER TABLE children ADD CONSTRAINT children_id_account_id_key UNIQUE (id, account_id);

-- The catalog: what a parent can observe, never a diagnosis. Maintained with SQL, no app release needed: add with an
-- INSERT on a free sort_order, retire with active = false (still shown on the consultations that have it), rename
-- with UPDATE name. A code never changes and is never deleted.
CREATE TABLE symptoms (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    sort_order INTEGER NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO symptoms (code, name, category, sort_order) VALUES
    ('fever', 'Fiebre', 'General', 10),
    ('fatigue', 'Cansancio o decaimiento', 'General', 20),
    ('irritability', 'Irritabilidad o llanto', 'General', 30),
    ('poor_appetite', 'Poco apetito', 'General', 40),
    ('headache', 'Dolor de cabeza', 'General', 50),
    ('chills', 'Escalofríos', 'General', 60),
    ('cough', 'Tos', 'Respiratorio', 70),
    ('runny_nose', 'Mocos o nariz tapada', 'Respiratorio', 80),
    ('sneezing', 'Estornudos', 'Respiratorio', 90),
    ('sore_throat', 'Dolor de garganta', 'Respiratorio', 100),
    ('difficulty_breathing', 'Dificultad para respirar', 'Respiratorio', 110),
    ('wheezing', 'Silbido al respirar', 'Respiratorio', 120),
    ('vomiting', 'Vómito', 'Digestivo', 130),
    ('diarrhea', 'Diarrea', 'Digestivo', 140),
    ('stomach_ache', 'Dolor de estómago', 'Digestivo', 150),
    ('nausea', 'Náuseas', 'Digestivo', 160),
    ('constipation', 'Estreñimiento', 'Digestivo', 170),
    ('ear_pain', 'Dolor de oído', 'Oídos y ojos', 180),
    ('red_eyes', 'Ojos rojos o con lagañas', 'Oídos y ojos', 190),
    ('rash', 'Salpullido o ronchas', 'Piel', 200),
    ('itching', 'Comezón', 'Piel', 210),
    ('poor_sleep', 'Duerme mal', 'Sueño y ánimo', 220),
    ('sleeping_more', 'Duerme más de lo normal', 'Sueño y ánimo', 230);

-- Which symptoms a parent marked on each consultation: the consultation, its child, that child's account and the
-- symptom. Written only when the consultation is created, in the same transaction, and immutable like it.
CREATE TABLE consultation_symptoms (
    consultation_id UUID NOT NULL,
    child_id UUID NOT NULL,
    account_id UUID NOT NULL,
    symptom_code TEXT NOT NULL REFERENCES symptoms (code),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (consultation_id, symptom_code),
    FOREIGN KEY (consultation_id, child_id) REFERENCES consultations (id, child_id),
    FOREIGN KEY (child_id, account_id) REFERENCES children (id, account_id)
);

CREATE INDEX idx_consultation_symptoms_child_id ON consultation_symptoms (child_id);
CREATE INDEX idx_consultation_symptoms_account_id ON consultation_symptoms (account_id);
