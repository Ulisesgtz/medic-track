-- Finalizar tratamiento antes de tiempo (specs/016-finalizar-tratamiento, data-model.md).

-- When the parent confirmed ending the medication early. NULL = still running. No dose is touched: a dose that
-- hadn't come yet at that moment is derived as "canceled" (scheduled_at > ended_at, not marked). This is the one
-- exception to consultations being immutable (specs/004 FR-014): only the end of the treatment changes.
ALTER TABLE medications ADD COLUMN ended_at TIMESTAMPTZ NULL;
