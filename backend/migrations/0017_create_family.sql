-- Compartir con la familia (specs/032-compartir-con-familia, data-model.md).
--
-- Los hijos y las consultas NO cambian de duenio: siguen colgando de la cuenta duenia (`accounts`). Estas dos tablas dicen
-- que personas (cuentas) tienen acceso a la familia de una cuenta duenia y con que rol, y las invitaciones pendientes.

-- Una persona con acceso a la familia de `family_account_id`. Las filas no se borran: `ended_at`/`ended_by_account_id` son
-- la auditoria y permiten volver a invitar (otra fila, otra invitacion).
CREATE TABLE family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_account_id UUID NOT NULL REFERENCES accounts (id),
    account_id UUID NOT NULL REFERENCES accounts (id),
    role TEXT NOT NULL CHECK (role IN ('tutor', 'caregiver', 'child')),
    -- Solo el rol 'child': el hijo al que esa persona tiene acceso (y a ningun otro).
    child_id UUID NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed', 'left')),
    invited_by_account_id UUID NOT NULL REFERENCES accounts (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ NULL,
    ended_by_account_id UUID NULL REFERENCES accounts (id),
    -- Solo el rol 'child': el tutor que dio su consentimiento y cuando.
    consent_by_account_id UUID NULL REFERENCES accounts (id),
    consent_at TIMESTAMPTZ NULL,
    -- La duenia no es miembro de su propia familia.
    CONSTRAINT family_members_not_the_owner CHECK (account_id <> family_account_id),
    -- 'child' lleva su hijo; los demas roles no.
    CONSTRAINT family_members_child_only_for_role_child CHECK ((role = 'child') = (child_id IS NOT NULL)),
    -- Activa = sin fecha de fin.
    CONSTRAINT family_members_ended_iff_not_active CHECK ((status = 'active') = (ended_at IS NULL)),
    -- El hijo tiene que ser de esa familia.
    CONSTRAINT family_members_child_of_the_family FOREIGN KEY (child_id, family_account_id) REFERENCES children (id, account_id)
);

-- Una sola familia activa como invitada por persona (research R9): para unirse a otra, primero sale.
CREATE UNIQUE INDEX uq_family_members_active_person ON family_members (account_id) WHERE status = 'active';

CREATE INDEX idx_family_members_family_active ON family_members (family_account_id) WHERE status = 'active';

-- Una invitacion a un correo. La liga lleva una ficha aleatoria que NUNCA se guarda: solo su SHA-256. Solo la cuenta con
-- ese correo verificado puede aceptarla. "Vencida" se deriva al leer (pendiente con `expires_at` pasado).
CREATE TABLE family_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_account_id UUID NOT NULL REFERENCES accounts (id),
    email TEXT NOT NULL CHECK (email = lower(email)),
    role TEXT NOT NULL CHECK (role IN ('tutor', 'caregiver', 'child')),
    child_id UUID NULL,
    token_hash BYTEA NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'canceled', 'expired')),
    invited_by_account_id UUID NOT NULL REFERENCES accounts (id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at TIMESTAMPTZ NULL,
    consent_by_account_id UUID NULL REFERENCES accounts (id),
    consent_at TIMESTAMPTZ NULL,
    -- La membresia que resulto de aceptarla.
    member_id UUID NULL REFERENCES family_members (id),
    CONSTRAINT family_invitations_child_only_for_role_child CHECK ((role = 'child') = (child_id IS NOT NULL)),
    CONSTRAINT family_invitations_child_of_the_family FOREIGN KEY (child_id, family_account_id) REFERENCES children (id, account_id)
);

-- No se duplica una invitacion pendiente al mismo correo en la misma familia.
CREATE UNIQUE INDEX uq_family_invitations_pending ON family_invitations (family_account_id, email) WHERE status = 'pending';

CREATE INDEX idx_family_invitations_family ON family_invitations (family_account_id);
