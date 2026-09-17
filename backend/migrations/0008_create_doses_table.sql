CREATE TABLE doses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medication_id UUID NOT NULL REFERENCES medications (id),
    scheduled_at TIMESTAMPTZ NOT NULL,
    taken BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_doses_medication_id ON doses (medication_id);
