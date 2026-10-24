# Modelo de datos: Dispositivo del hijo (spec 047)

Migración **`0029_child_device.sql`**, solo aditiva: tablas nuevas y columnas nulas en tablas existentes. Se aplica **antes** del backend nuevo.

## `child_device_links` (nueva)

Un acceso de un teléfono a un hijo. Una sola fila recorre su ciclo de vida.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `child_id`, `account_id` | UUID NOT NULL | Llave compuesta `FOREIGN KEY (child_id, account_id) REFERENCES children (id, account_id)`: la base misma rechaza otro hijo u otra cuenta dueña |
| `name` | TEXT NOT NULL | El nombre que el padre le da al aparato. CHECK 1–40 caracteres. Texto libre: solo en cuerpos |
| `created_by_account_id` | UUID NOT NULL → `accounts` | Quién generó la liga |
| `status` | TEXT NOT NULL | `pending` \| `active` \| `revoked` (CHECK) |
| `token_hash` | BYTEA NULL | SHA-256 de la ficha de la **liga**; solo mientras `pending` (se anula al canjear) |
| `expires_at` | TIMESTAMPTZ NOT NULL | Vencimiento de la liga (24 h) |
| `redeemed_at` | TIMESTAMPTZ NULL | Cuándo se canjeó |
| `credential_hash` | BYTEA NULL | SHA-256 de la credencial vigente (solo `active`) |
| `credential_hash_previous` | BYTEA NULL | La anterior, válida 24 h tras rotar |
| `rotated_at` | TIMESTAMPTZ NULL | Última emisión de credencial |
| `last_seen_at` | TIMESTAMPTZ NULL | Se escribe a lo más cada 10 min |
| `reminder_detail` | TEXT NULL | `detailed` \| `generic`; nulo = genérico |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `revoked_at`, `revoked_by_account_id` | NULL | |

**CHECKs**: `pending` ⇒ `token_hash` no nulo y `credential_hash` nulo; `active` ⇒ `credential_hash` no nulo y `token_hash` nulo y `redeemed_at` no nulo; `revoked` ⇒ ambas huellas nulas y `revoked_at` no nulo.

**Índices**: único parcial sobre `token_hash` (`WHERE status = 'pending'`); único parcial sobre `credential_hash` y sobre `credential_hash_previous` (`WHERE status = 'active'`); `(child_id, status)` para la lista y el tope.

**Transiciones**
- `pending → active`: canje de la liga (una sentencia; dos canjes a la vez, uno gana).
- `pending → revoked`: la persona cancela la liga o genera otra para el mismo aparato.
- `active → revoked`: quitar el dispositivo (también desactiva sus `reminder_devices`).
- `pending` vencida se lee como «vencida» sin escribir; una credencial `active` con `last_seen_at` de hace más de 90 días se lee como «vencida» (se trata como inexistente en la autenticación).
- **El vínculo nunca se borra**: las marcas que hizo siguen apuntando a él.

**Tope**: vínculos `active` + `pending` sin vencer por hijo ≤ 3, revisado en la transacción de creación con la fila del hijo bloqueada.

## Cambios a tablas existentes

| Tabla | Cambio |
|---|---|
| `doses` | `taken_by_child_device_id UUID NULL REFERENCES child_device_links (id)`; el CHECK `doses_author_only_when_taken` pasa a: si no está marcada no hay ningún autor; y `doses_one_author` impide cuenta **y** dispositivo a la vez |
| `supplement_doses` | lo mismo |
| `reminder_devices` | `account_id` pasa a admitir nulo; `child_link_id UUID NULL REFERENCES child_device_links (id)`; `CHECK ((account_id IS NULL) <> (child_link_id IS NULL))`; índice parcial `(child_link_id) WHERE active` |

## Tablas nuevas de avisos

| Tabla | Llave | Para qué |
|---|---|---|
| `child_dose_reminders` | `(dose_id → doses, link_id → child_device_links)` + `sent_at` | A lo más un aviso por toma de medicamento y dispositivo |
| `child_supplement_dose_reminders` | `(dose_id → supplement_doses, link_id)` + `sent_at` | Lo mismo para suplementos y actividades |

## Lo que NO se guarda

Correo, nombre real distinto del que ya está en `children`, edad, ubicación, identificadores del aparato, la ficha de la liga ni la credencial en claro. Solo huellas, el nombre que escribió el padre y fechas (FR-020, SC-008).

## Reglas de validación

- `name`: se recorta, 1–40 caracteres, sin caracteres de control (`mailer.Clean`).
- La credencial y la ficha: 32 bytes aleatorios, base64url; cualquier otra forma es «desconocida» sin tocar la base.
- Crear: plan de pago (bajo bloqueo de la cuenta dueña), nivel `Full` sobre el hijo, tope de 3.
- Usar: el vínculo debe estar `active`, no caducado por falta de uso y su hijo debe existir; se consulta en cada petición.
