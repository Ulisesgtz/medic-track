CREATE TABLE countries (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE states (
    code TEXT PRIMARY KEY,
    country_code TEXT NOT NULL REFERENCES countries (code),
    name TEXT NOT NULL
);

CREATE INDEX idx_states_country_code ON states (country_code);

-- Seed data: Mexico and its states, plus a couple of other countries with no
-- subdivisions in this catalog (the frontend hides the state selector then).
INSERT INTO countries (code, name) VALUES
    ('MX', 'México'),
    ('US', 'Estados Unidos'),
    ('CA', 'Canadá');

INSERT INTO states (code, country_code, name) VALUES
    ('MX-AGU', 'MX', 'Aguascalientes'),
    ('MX-BCN', 'MX', 'Baja California'),
    ('MX-BCS', 'MX', 'Baja California Sur'),
    ('MX-CAM', 'MX', 'Campeche'),
    ('MX-CHP', 'MX', 'Chiapas'),
    ('MX-CHH', 'MX', 'Chihuahua'),
    ('MX-CMX', 'MX', 'Ciudad de México'),
    ('MX-COA', 'MX', 'Coahuila'),
    ('MX-COL', 'MX', 'Colima'),
    ('MX-DUR', 'MX', 'Durango'),
    ('MX-GUA', 'MX', 'Guanajuato'),
    ('MX-GRO', 'MX', 'Guerrero'),
    ('MX-HID', 'MX', 'Hidalgo'),
    ('MX-JAL', 'MX', 'Jalisco'),
    ('MX-MEX', 'MX', 'Estado de México'),
    ('MX-MIC', 'MX', 'Michoacán'),
    ('MX-MOR', 'MX', 'Morelos'),
    ('MX-NAY', 'MX', 'Nayarit'),
    ('MX-NLE', 'MX', 'Nuevo León'),
    ('MX-OAX', 'MX', 'Oaxaca'),
    ('MX-PUE', 'MX', 'Puebla'),
    ('MX-QUE', 'MX', 'Querétaro'),
    ('MX-ROO', 'MX', 'Quintana Roo'),
    ('MX-SLP', 'MX', 'San Luis Potosí'),
    ('MX-SIN', 'MX', 'Sinaloa'),
    ('MX-SON', 'MX', 'Sonora'),
    ('MX-TAB', 'MX', 'Tabasco'),
    ('MX-TAM', 'MX', 'Tamaulipas'),
    ('MX-TLA', 'MX', 'Tlaxcala'),
    ('MX-VER', 'MX', 'Veracruz'),
    ('MX-YUC', 'MX', 'Yucatán'),
    ('MX-ZAC', 'MX', 'Zacatecas');
