-- Cobro del plan completo con Mercado Pago (spec 045).
-- Una suscripcion por cuenta duenia (una sola abierta a la vez), los avisos del proveedor ya procesados (para que repetirlos
-- no cambie nada) y quien decide el plan de cada cuenta: las cuentas que ya existen quedan 'manual' (plan dado a mano, los
-- avisos del proveedor no las tocan). No se guarda ningun dato de tarjeta ni de personas: el correo ya esta en accounts.

ALTER TABLE accounts
    ADD COLUMN plan_source TEXT NOT NULL DEFAULT 'manual' CHECK (plan_source IN ('manual', 'subscription'));

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- La cuenta que paga (siempre su propia cuenta).
    account_id UUID NOT NULL REFERENCES accounts (id),
    provider TEXT NOT NULL DEFAULT 'mercadopago' CHECK (provider IN ('mercadopago', 'fake')),
    provider_subscription_id TEXT NOT NULL,
    -- pending: creada, aun sin pagar (no da plan). active: cobro aprobado. grace: cobro de renovacion fallido, el plan sigue
    -- unos dias. canceled: sin renovacion, el plan sigue hasta paid_through. ended: terminada.
    status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'grace', 'canceled', 'ended')),
    paid_through TIMESTAMPTZ NULL,
    next_renewal_at TIMESTAMPTZ NULL,
    grace_until TIMESTAMPTZ NULL,
    -- Direccion de la pagina de pago del proveedor, solo mientras esta pending (no es un secreto ni lleva datos de tarjeta).
    checkout_url TEXT NOT NULL DEFAULT '',
    last_checked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_subscription_id),
    CONSTRAINT subscriptions_grace_has_end CHECK (status <> 'grace' OR grace_until IS NOT NULL)
);

-- Una suscripcion no terminada por cuenta: dos intentos a la vez no crean dos.
CREATE UNIQUE INDEX uq_subscriptions_one_open_per_account ON subscriptions (account_id) WHERE status <> 'ended';

-- Para el barrido (gracia, periodos terminados, pendientes viejas) y la reconciliacion.
CREATE INDEX idx_subscriptions_sweep ON subscriptions (status, paid_through, grace_until)
    WHERE status IN ('active', 'grace', 'canceled', 'pending');

-- Un registro por aviso ya procesado: la llave es tipo|id|estado|ultima modificacion de lo CONSULTADO al proveedor.
-- Sin cuerpo del aviso, sin cabeceras, sin correos ni datos de tarjeta.
CREATE TABLE payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    event_key TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    subscription_id UUID NULL REFERENCES subscriptions (id),
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, event_key)
);
