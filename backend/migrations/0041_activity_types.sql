-- specs/075: tipos de actividad.

CREATE TABLE activity_types (
    code       TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    sort_order INTEGER NOT NULL UNIQUE,
    active     BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO activity_types (code, name, sort_order) VALUES
    ('school',  'Escolar',                  10),
    ('sports',  'Deportiva',                20),
    ('arts',    'Artística y cultural',     30),
    ('therapy', 'Terapia y seguimiento',    40),
    ('habits',  'Hábitos y cuidado diario', 50),
    ('other',   'Otra',                     60);

ALTER TABLE supplement_routines
    ADD COLUMN activity_type TEXT NULL REFERENCES activity_types (code);

UPDATE supplement_routines SET activity_type = 'habits' WHERE kind = 'activity';

ALTER TABLE supplement_routines
    ADD CONSTRAINT supplement_routines_activity_type_only_activities
    CHECK ((kind = 'activity') = (activity_type IS NOT NULL));
