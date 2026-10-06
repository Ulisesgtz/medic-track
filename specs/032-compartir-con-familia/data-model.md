# Modelo de datos (Fase 1): Compartir con la familia

Migraciones **nuevas** (a mano, en orden, antes del backend; ver research R15). Los hijos, consultas y tomas **no cambian de
dueño**: siguen colgando de la cuenta dueña. Lo que ya existe y se reutiliza: `accounts` (plan, `reminder_detail`, aviso),
`reminder_devices` (por cuenta), `children.account_id`.

## `0017_create_family.sql`

### `family_members` — una persona con acceso a la familia de una cuenta dueña

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | UUID PK | |
| `family_account_id` | UUID NOT NULL → `accounts` | la **cuenta dueña** (de quien paga) |
| `account_id` | UUID NOT NULL → `accounts` | la **persona** (su propia cuenta) |
| `role` | TEXT NOT NULL | `CHECK IN ('tutor','caregiver','child')` |
| `child_id` | UUID NULL → `children` | solo el rol `child`; `CHECK ((role = 'child') = (child_id IS NOT NULL))`; el hijo debe ser de esa familia (llave compuesta `(child_id, family_account_id)` → `children (id, account_id)`) |
| `status` | TEXT NOT NULL DEFAULT `'active'` | `CHECK IN ('active','removed','left')` |
| `invited_by_account_id` | UUID NOT NULL → `accounts` | |
| `created_at`, `accepted_at` | TIMESTAMPTZ | |
| `ended_at` | TIMESTAMPTZ NULL | cuándo salió o la quitaron |
| `ended_by_account_id` | UUID NULL → `accounts` | quién la quitó (o ella misma si salió) |
| `consent_by_account_id` | UUID NULL → `accounts` | solo rol `child`: el tutor que dio el consentimiento |
| `consent_at` | TIMESTAMPTZ NULL | |

Reglas de base de datos:
- `CHECK (account_id <> family_account_id)`: la dueña no es miembro de su propia familia.
- **Una sola familia activa como invitada por persona**: índice único parcial `ON family_members (account_id) WHERE status = 'active'`.
- **Una persona no se repite activa en la misma familia** (lo cubre el índice anterior).
- Índice `(family_account_id) WHERE status = 'active'` para listar y contar.
- Las filas **no se borran**: `ended_at`/`ended_by_account_id` son la auditoría y permiten volver a invitar.

### `family_invitations` — una invitación

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | UUID PK | |
| `family_account_id` | UUID NOT NULL → `accounts` | |
| `email` | TEXT NOT NULL | en minúsculas; **solo la cuenta con este correo verificado puede aceptar** |
| `role` | TEXT NOT NULL | `tutor`, `caregiver`, `child` |
| `child_id` | UUID NULL → `children` | solo `child` (mismo `CHECK` y llave compuesta) |
| `token_hash` | BYTEA NOT NULL UNIQUE | SHA-256 de la ficha de la liga; **la ficha nunca se guarda** |
| `status` | TEXT NOT NULL DEFAULT `'pending'` | `pending`, `accepted`, `declined`, `canceled`, `expired` |
| `invited_by_account_id` | UUID NOT NULL → `accounts` | |
| `expires_at` | TIMESTAMPTZ NOT NULL | creación + 7 días (se renueva al reenviar) |
| `created_at`, `responded_at` | TIMESTAMPTZ | |
| `consent_by_account_id`, `consent_at` | | solo `child` |
| `member_id` | UUID NULL → `family_members` | la membresía que resultó de aceptar |

- Índice único parcial `ON family_invitations (family_account_id, email) WHERE status = 'pending'`: no se duplica una pendiente.
- `expired` se **deriva** al leer (`status = 'pending' AND expires_at < now()`); una tarea no es necesaria.

## `0018_dose_marks_and_reminders.sql`

### `doses` — quién marcó

| Columna nueva | Tipo | Reglas |
|---|---|---|
| `taken_by_account_id` | UUID NULL → `accounts` | quién la marcó; **nulo** en las marcadas antes de esta función |
| `taken_at` | TIMESTAMPTZ NULL | cuándo |

Invariantes (se prueban): `taken = false ⇒ taken_by_account_id IS NULL AND taken_at IS NULL` (`CHECK`); **marcar solo actúa si no
estaba marcada** (la primera gana, research R6); desmarcar la deja sin autor.

### `dose_reminders` — «ya se le avisó a esta persona de esta toma»

| Columna | Tipo | Reglas |
|---|---|---|
| `dose_id` | UUID NOT NULL → `doses` | |
| `account_id` | UUID NOT NULL → `accounts` | la **persona** avisada |
| `sent_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| PK | `(dose_id, account_id)` | **la garantía de «a lo más un aviso por toma y por persona»** |

**Relleno de la migración**: por cada `doses.reminder_sent_at IS NOT NULL`, una fila `(dose, cuenta dueña de su hijo, reminder_sent_at)`,
para que **nada ya avisado se reenvíe** al desplegar. `doses.reminder_sent_at` se sigue escribiendo (compatibilidad) pero ya no
decide. Índice `ON doses (scheduled_at) WHERE taken = false` para buscar candidatas.

## Objetos derivados (no se guardan)

- **Nivel de acceso** de una sesión sobre un hijo: `none | mark | full` (research R3): dueña/Tutor `full`; Cuidador `mark`; Hijo
  `mark` solo para su hijo; **invitada con la cuenta dueña sin plan de pago** ⇒ `mark`.
- **Familia de una persona**: la cuenta dueña de su membresía activa (o ella misma si es dueña); su **plan** es el de la dueña.
- **Invitación vencida**: pendiente con `expires_at` pasado.

## Respuestas (resumen; detalle en `contracts/family.md`)

- `GET /accounts/me`: cada hijo gana `accountId`, `role`, `plan`, `readOnly`; la respuesta gana `family` (`role`, `ownerAccountId`,
  `ownerName`, `plan`) cuando la persona es miembro.
- Cada toma (detalle, resumen, `PATCH`): `takenBy: { name, at } | null`.

## Transiciones de estado

- Invitación: `pending → accepted | declined | canceled | expired`; `pending → pending` (reenviar: ficha y vencimiento nuevos).
- Membresía: `active → left | removed`; no regresa (volver es **otra** fila por una invitación nueva).
- Toma: `sin marcar → marcada(autor, hora) → sin marcar`; la marcada por A no la reescribe B.
- Las consultas siguen siendo inmutables (spec 004).
