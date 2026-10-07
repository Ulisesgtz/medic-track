# Modelo de datos — Parte 1: rutinas de suplementos (spec 033)

Migración **`0019_create_supplement_routines.sql`** (se aplica a mano, antes del backend, como las anteriores). Sin cambios a `doses`, `dose_reminders` ni a
las tablas de la 032.

## `supplement_routines`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `account_id` | UUID NOT NULL → `accounts` | cuenta **dueña** (la del hijo); de ella sale el plan |
| `child_id` | UUID NULL | **la parte 1 siempre lo llena**; nulo queda para la rutina personal (parte 3). FK compuesta `(child_id, account_id) → children (id, account_id)`: la base no deja otro hijo ni otra cuenta |
| `name` | TEXT NOT NULL | 1–100 caracteres, recortado; dato del padre, nunca en direcciones |
| `note` | TEXT NOT NULL DEFAULT '' | ≤ 500 |
| `period` | TEXT NOT NULL | `daily` \| `weekdays` \| `interval` |
| `times` | TIME[] NOT NULL | horas locales del día (`daily`/`weekdays`: 1–6, sin repetidas, ordenadas); vacío en `interval` |
| `weekdays` | SMALLINT[] NOT NULL | 0 = lunes … 6 = domingo; 1–7 distintos en `weekdays`, vacío en los otros |
| `interval_hours` | SMALLINT NULL | 1–24 solo en `interval` |
| `first_date` | DATE NOT NULL | primer día (local) |
| `first_time` | TIME NULL | primera toma, solo `interval` |
| `end_date` | DATE NULL | último día incluido (local); nulo = sin fin; ≥ `first_date` |
| `utc_offset_minutes` | SMALLINT NOT NULL | la diferencia con la que se calcula la hora local (R3) |
| `status` | TEXT NOT NULL | `active` \| `paused` \| `ended` |
| `paused_at`, `ended_at` | TIMESTAMPTZ NULL | cuándo |
| `generated_until` | TIMESTAMPTZ NOT NULL | hasta dónde hay tomas generadas (R2) |
| `created_by_account_id` | UUID NOT NULL → `accounts` | quién la creó («Creada por Ana Morales, el 1 oct» muestra el nombre de pila) |
| `created_at`, `updated_at` | TIMESTAMPTZ NOT NULL | |

CHECKs: `period` coherente con `times`/`weekdays`/`interval_hours`/`first_time` (arriba); `status = 'paused'` ⇒ `paused_at` no nulo; `status = 'ended'` ⇒ `ended_at`
no nulo; `end_date >= first_date`. Índices: `(child_id) WHERE status = 'active'` (el tope), `(generated_until) WHERE status = 'active'` (el planificador).

**Transiciones**: `active → paused → active`; `active|paused → ended` (terminal: no se reanuda ni se edita). Reanudar y editar exigen plan de pago; pausar y finalizar no (R6).

## `supplement_doses`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `routine_id` | UUID NOT NULL → `supplement_routines` | |
| `scheduled_at` | TIMESTAMPTZ NOT NULL | instante real |
| `taken` | BOOLEAN NOT NULL DEFAULT false | |
| `taken_by_account_id` | UUID NULL → `accounts` | quién marcó; mismo CHECK que `doses`: sin marca no hay autor ni hora |
| `taken_at` | TIMESTAMPTZ NULL | |
| `created_at` | TIMESTAMPTZ NOT NULL | |

Único `(routine_id, scheduled_at)`: regenerar nunca duplica. Índices: `(routine_id, scheduled_at)` y `(scheduled_at) WHERE taken = false` (reclamo).

**Estado** (no se guarda, R5): `taken` / `pending` / `due` / `unregistered`, con el reloj del servidor.

## `supplement_dose_reminders`

`(dose_id → supplement_doses, account_id → accounts, sent_at)` con llave primaria `(dose_id, account_id)`: a lo más un aviso por toma y por persona. Índice por `account_id`.

## `supplement_muted`

`(routine_id → supplement_routines, account_id → accounts, created_at)` PK `(routine_id, account_id)`. Una fila = esa persona apagó **sus** avisos de esa rutina («Tus
avisos»). Sin fila = encendidos. Al salir de la familia no se borra (si vuelve, conserva su elección).

## Reglas de validación (servidor)

- Nombre obligatorio (1–100); nota ≤ 500; `times` 1–6 únicas para `daily`/`weekdays`; `weekdays` ≥ 1 para `weekdays`; `interval_hours` 1–24 para `interval` y `first_time` obligatoria;
  `first_date` no anterior a hoy menos 1 día local (se permite «desde ayer» por la hora local del cliente); `end_date` ≥ `first_date`.
- Tope: **10 rutinas `active` por hijo** (las pausadas no cuentan; reanudar con 10 activas → el mismo 422).
- Un hijo y una rutina de otra cuenta son 403 por el nivel de acceso, nunca por el cuerpo.

## Relaciones

`accounts 1—n supplement_routines`, `children 1—n supplement_routines` (parte 1), `supplement_routines 1—n supplement_doses`, `supplement_doses 1—n supplement_dose_reminders`,
`supplement_routines n—n accounts` (silencios). La parte 2 (cita) agregará `consultation_appointments` ligada a `consultations`; la parte 3 usará `child_id` nulo.
