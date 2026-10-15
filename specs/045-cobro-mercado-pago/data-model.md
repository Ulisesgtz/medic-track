# Modelo de datos: Cobro del plan completo con Mercado Pago

**Migración**: `backend/migrations/0027_subscriptions.sql` (solo agrega; no borra ni cambia filas existentes). Se aplica en DEV **antes** de desplegar el backend.

## `accounts` (cambio mínimo)

| Columna | Tipo | Notas |
|---|---|---|
| `plan_source` | `TEXT NOT NULL DEFAULT 'manual' CHECK (plan_source IN ('manual','subscription'))` | Quién decide `accounts.plan`. Todas las cuentas existentes quedan `manual` (el plan dado a mano no cambia con avisos del proveedor, FR-012). Pasa a `subscription` cuando la cuenta activa su primera suscripción. |

`accounts.plan` **sigue siendo el valor que lee todo el código**. Solo `payments.Recompute` lo escribe cuando `plan_source = 'subscription'`.

## `subscriptions`

Una fila por suscripción de una cuenta dueña.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `UUID PK DEFAULT gen_random_uuid()` | |
| `account_id` | `UUID NOT NULL REFERENCES accounts(id)` | La cuenta que paga (siempre su propia cuenta). |
| `provider` | `TEXT NOT NULL DEFAULT 'mercadopago' CHECK (provider IN ('mercadopago','fake'))` | |
| `provider_subscription_id` | `TEXT NOT NULL` | Id que da el proveedor. `UNIQUE (provider, provider_subscription_id)`. |
| `status` | `TEXT NOT NULL CHECK (status IN ('pending','active','grace','canceled','ended'))` | Ver «Estados». |
| `paid_through` | `TIMESTAMPTZ NULL` | Hasta cuándo está pagado el periodo vigente. |
| `next_renewal_at` | `TIMESTAMPTZ NULL` | Fecha del próximo cobro, si se renovará (`NULL` si está cancelada). |
| `grace_until` | `TIMESTAMPTZ NULL` | Fin de la gracia tras un cobro fallido (`now + 7 días` al entrar en `grace`). |
| `checkout_url` | `TEXT NOT NULL DEFAULT ''` | Dirección de la página de pago del proveedor (solo mientras está `pending`); **no es un secreto ni lleva datos de tarjeta**. Permite reutilizarla desde otra pestaña. |
| `last_checked_at` | `TIMESTAMPTZ NULL` | Última vez que se consultó el estado al proveedor (la reconciliación). |
| `created_at`, `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |

**Restricciones e índices**
- `CREATE UNIQUE INDEX uq_subscriptions_one_open_per_account ON subscriptions (account_id) WHERE status <> 'ended'` — **una** suscripción no terminada por cuenta (FR-011, SC-006). Dos intentos a la vez: el segundo falla con la violación y se resuelve como «ya hay una».
- `CHECK (status <> 'grace' OR grace_until IS NOT NULL)`.
- `CREATE INDEX idx_subscriptions_sweep ON subscriptions (status, paid_through, grace_until) WHERE status IN ('active','grace','canceled','pending')` — para el barrido y la reconciliación.
- **No se guarda nada de tarjeta, ni correo, ni nombre**: el correo de la cuenta ya está en `accounts`.

### Estados y transiciones

```
 (crear) ─► pending ──pago aprobado──► active ──cobro rechazado/pausa──► grace ──pago──► active
              │                          │  ▲                              │
   cancelar/  │                          │  └────── renovación aprobada ───┘
   expira 24h │              cancelar────┤
              ▼                          ▼                                 │ gracia vencida
            ended                     canceled ──paid_through vencido──► ended ◄┘
                                         │
                                         └─ (la persona vuelve a contratar: otra fila `pending`, no se pierde el tiempo pagado)
```

- `pending`: creada, la persona aún no termina de pagar. **No** da plan completo. Expira a las **24 h** sin pago (→ `ended`; el barrido).
- `active`: cobro aprobado; `paid_through = próxima fecha de cobro del proveedor`; el plan es completo.
- `grace`: cobro de renovación rechazado (o suscripción pausada); `grace_until = ahora + 7 días`; el plan sigue siendo completo. Si el proveedor reporta un cobro aprobado → `active`.
- `canceled`: la renovación se canceló (desde la app o el proveedor); el plan sigue completo hasta `paid_through`; después → `ended`.
- `ended`: no da plan. Es terminal (una nueva contratación crea **otra fila** `pending`).

**Plan resultante** (`payments.Recompute`): `paid` si hay una fila en `active`, en `grace` con `grace_until > now()`, o en `canceled` con `paid_through > now()`; `free` en cualquier otro caso. (Solo escribe si `plan_source = 'subscription'`.)

**Reglas de contratación nueva con tiempo pagado**: si la cuenta tiene una fila `canceled` con `paid_through` por delante y vuelve a contratar, la nueva fila `pending` convive hasta que la anterior termine **solo si** el índice único lo permite: como la anterior no está `ended`, no lo permite; por eso al contratar de nuevo la fila `canceled` se **cierra** (`ended`) conservando su `paid_through` en la nueva (`paid_through` de la nueva = el mayor de los dos al activarse), de modo que no se pierden días (historia 3, escenario 4). Esto se hace en la misma transacción bloqueando la fila de la cuenta.

## `payment_events`

Un registro por aviso del proveedor ya procesado (idempotencia y auditoría).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `UUID PK DEFAULT gen_random_uuid()` | |
| `provider` | `TEXT NOT NULL` | |
| `event_key` | `TEXT NOT NULL` | `tipo\|id_del_recurso\|estado\|última_modificación` de lo **consultado** al proveedor (no del cuerpo del aviso). `UNIQUE (provider, event_key)`. |
| `resource_type` | `TEXT NOT NULL` | `subscription_preapproval`, `subscription_authorized_payment`, `payment`. |
| `resource_id` | `TEXT NOT NULL` | El id del recurso en el proveedor. |
| `subscription_id` | `UUID NULL REFERENCES subscriptions(id)` | La suscripción afectada, si se conoce. |
| `processed_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |

Sin cuerpo del aviso, sin cabeceras, sin correos ni datos de tarjeta. Retención: la misma que `error_logs` si algún día hace falta (no se purga en esta spec: crece una fila por aviso, poco volumen).

## Lo que NO cambia

- `family_members`, `family_invitations`, la consulta de familia de `internal/access` y `internal/family`: la regla de invitadas (`CanSubscribe`) **lee** lo que ya existe.
- Ninguna tabla de datos de los hijos (consultas, citas, suplementos…): vencer un plan nunca las toca (Principio IV).
