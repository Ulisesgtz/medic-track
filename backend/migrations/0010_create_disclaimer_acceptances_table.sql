-- Audit trail of the "Antes de empezar" notice (specs/010-registro-aceptacion-aviso): which account
-- acknowledged which version of the text, and when. One row per (account, version): pressing
-- "Entendido" again for the same version is a no-op and keeps the first timestamp.
CREATE TABLE disclaimer_acceptances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts (id),
    version TEXT NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_id, version)
);
