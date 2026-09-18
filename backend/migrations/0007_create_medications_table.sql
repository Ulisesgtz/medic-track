CREATE TABLE medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES consultations (id),
    name TEXT NOT NULL,
    frequency_hours INTEGER NOT NULL,
    duration_days INTEGER NOT NULL,
    start_time TIME NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_medications_consultation_id ON medications (consultation_id);
