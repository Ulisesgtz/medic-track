# Modelo de Datos: Curvas de crecimiento

Migración `backend/migrations/0034_growth_measurements.sql` (**aplicarla en DEV antes del merge**).

## `growth_measurements` (nueva)

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `child_id` | UUID NOT NULL | con `account_id`: FK `(child_id, account_id)` → `children (id, account_id)` |
| `account_id` | UUID NOT NULL | la cuenta dueña del hijo |
| `measured_on` | DATE NOT NULL | ≤ hoy del padre y ≥ `birth_date` (lo revisa el servicio) |
| `weight_kg` | NUMERIC(5,2) NULL | CHECK `weight_kg IS NULL OR weight_kg BETWEEN 0.3 AND 200` |
| `height_cm` | NUMERIC(4,1) NULL | CHECK `height_cm IS NULL OR height_cm BETWEEN 30 AND 220` |
| `note` | TEXT NULL | CHECK `note IS NULL OR char_length(note) BETWEEN 1 AND 300` |
| `created_by_account_id` | UUID NOT NULL | FK `accounts` |
| `created_at` | TIMESTAMPTZ NOT NULL | `now()` |
| `corrected_by_account_id` | UUID NULL | FK `accounts` |
| `corrected_at` | TIMESTAMPTZ NULL | CHECK juntos con `corrected_by_account_id` |

- CHECK `growth_measurements_some_value`: `weight_kg IS NOT NULL OR height_cm IS NOT NULL`.
- Índice `idx_growth_measurements_child (child_id, measured_on DESC, created_at DESC)`.
- Tope de 500 por hijo (servicio, con la fila del hijo `FOR UPDATE`).
- Borrar un hijo: no hay borrado de hijos hoy; la FK no lleva `ON DELETE`.

## `children` (cambia)

| Columna | Tipo | Reglas |
|---|---|---|
| `growth_reference_sex` | TEXT NULL | CHECK `growth_reference_sex IN ('female','male')`; solo elige la tabla de la OMS |

`height` y `weight` (del registro, sin fecha) no cambian.

## Referencia de la OMS (datos fijos, sin tabla)

`internal/growth/whodata_gen.go`: por indicador (`weight`, `height`) y sexo, una lista de puntos `{months, p3, p15, p50, p85,
p97}` mensual: peso 0–120 meses, talla 0–228 meses. Generado por `backend/tools/whogrowth/convert.py` con la cita de la fuente en la
cabecera. Sin LMS ni funciones de percentil (Principio I).

## Estados

Una medida no tiene estados: se crea, se corrige (sella la última corrección) o se borra.
