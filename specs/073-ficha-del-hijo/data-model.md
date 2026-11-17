# Modelo de datos — Spec 073

Migración **`0039_child_records.sql`** (aplicarla en DEV **antes** del merge).

## `child_records` — una por hijo

| Columna | Tipo | Reglas |
|---|---|---|
| `child_id` | UUID PK | |
| `account_id` | UUID NOT NULL | FK compuesta `(child_id, account_id)` → `children (id, account_id)` (como `growth_measurements`) |
| `blood_type` | TEXT NULL | CHECK ∈ `O+`,`O-`,`A+`,`A-`,`B+`,`B-`,`AB+`,`AB-`,`unknown` |
| `general_note` | TEXT NULL | CHECK `char_length ≤ 1000` |
| `pediatrician_name` | TEXT NULL | ≤ 120 |
| `pediatrician_phone` | TEXT NULL | ≤ 30 |
| `pediatrician_office` | TEXT NULL | ≤ 300 |
| `version` | INTEGER NOT NULL | ≥ 1; sube en cada cambio real |
| `updated_at` | TIMESTAMPTZ NOT NULL | |
| `updated_by_account_id` | UUID NULL | FK `accounts`; NULL si esa cuenta se borró (spec 070) |

## `child_record_allergies`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `child_id` | UUID NOT NULL | FK → `child_records (child_id)` |
| `account_id` | UUID NOT NULL | para el borrado y la descarga por cuenta |
| `position` | SMALLINT NOT NULL | 0–29, UNIQUE `(child_id, position)` |
| `name` | TEXT NOT NULL | 1–120 |
| `kind` | TEXT NULL | CHECK ∈ `medication`,`food`,`other` |
| `note` | TEXT NULL | ≤ 300 |

## `child_record_conditions`

Igual que las alergias sin `kind`.

## Reglas

- Los topes (30 y 30) se revisan en la transacción del `PUT` con la fila del hijo bloqueada.
- Sin `ON DELETE CASCADE` (convención del repo): el borrado sigue el orden de `purgeSteps`.
- Una ficha «vacía» (todo nulo, listas vacías) se guarda igual si antes había algo (para poder borrar todo); si nunca
  hubo ficha y llega vacía, no se crea.

## Lo que la app recibe (lectura)

`{ exists, version, bloodType, generalNote, pediatrician: {name, phone, office} | null, allergies: [{name, kind, note}],
conditions: [{name, note}], updated: {at, by} | null }` — `by` = nombre de pila; `canEdit` (nivel Full).
