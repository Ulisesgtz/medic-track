CREATE TABLE consultations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children (id),
    doctor_name TEXT NOT NULL,
    consult_date DATE NOT NULL,
    photo BYTEA NOT NULL,
    symptoms TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_consultations_child_id ON consultations (child_id);
