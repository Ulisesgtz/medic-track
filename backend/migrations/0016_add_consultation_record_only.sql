-- Consulta «solo como registro» (specs/024-consulta-solo-registro, data-model.md).

-- TRUE = the consultation was saved only as a record: its medications have no start time and no doses exist, so it
-- has no schedule, no active treatment and no reminders. Written once when the consultation is created and never
-- updated (consultations are immutable, specs/004 FR-014). Every existing row stays FALSE.
ALTER TABLE consultations ADD COLUMN record_only BOOLEAN NOT NULL DEFAULT false;
