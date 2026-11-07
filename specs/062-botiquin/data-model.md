# Modelo de Datos: Botiquín de la casa

## Migración `0033_medicine_cabinet.sql` (aplicar en DEV antes del merge)

### `medicine_cabinet_items`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `account_id` | UUID NOT NULL → `accounts(id)` | la cuenta dueña de la familia |
| `name` | TEXT NOT NULL | 1–120 caracteres (recortado) |
| `strength` | TEXT NOT NULL DEFAULT '' | ≤ 60 |
| `quantity` | INTEGER NOT NULL | 0–999 |
| `unit` | TEXT NOT NULL | `box` / `tablet` / `bottle` / `ml` |
| `expires_year` | INTEGER NOT NULL | 2000–2100 |
| `expires_month` | INTEGER NOT NULL | 1–12 |
| `expires_day` | INTEGER NULL | 1–31 y una fecha válida para su mes (lo revisa el servicio) |
| `note` | TEXT NOT NULL DEFAULT '' | ≤ 500 |
| `photo` | BYTEA NULL | ≤ 5 MiB, una imagen (`imagecheck`) |
| `created_by_account_id` | UUID NOT NULL → `accounts(id)` | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_by_account_id` | UUID NULL → `accounts(id)` | junto con `updated_at` (CHECK) |
| `updated_at` | TIMESTAMPTZ NULL | |

Índice: `(account_id)`. Tope de 200 por `account_id`, revisado en la transacción con la fila de la cuenta `FOR UPDATE`.

Sin borrado lógico: quitar es `DELETE`.

## Reglas de acceso (sin columnas: `access.OnAccount`)

| Quién | Ver | Agregar | Editar / quitar |
|---|---|---|---|
| Dueña (cualquier plan) | ✓ | solo `paid` | ✓ |
| Tutor de familia `paid` | ✓ | ✓ | ✓ |
| Tutor de familia vencida | ✓ | — | — |
| Cuidador | ✓ | — | — |
| Integrante Hijo, teléfono del hijo, otra persona | — | — | — |
