# Modelo de datos: Cartilla de vacunación

Migración `backend/migrations/0028_vaccination_card.sql` (se aplica a mano antes del backend, como las anteriores). No cambia ninguna tabla existente.

## `vaccine_catalog` (público, mantenido con SQL)

| Columna | Tipo | Reglas |
|---|---|---|
| `code` | `TEXT` PK | estable, minúsculas con guion bajo; nunca cambia ni se borra |
| `name` | `TEXT NOT NULL` | nombre que ve el padre (puede renombrarse con `UPDATE`) |
| `sort_order` | `INTEGER NOT NULL UNIQUE` | orden de la lista; las nuevas toman un número libre |
| `active` | `BOOLEAN NOT NULL DEFAULT true` | `false` = ya no se ofrece, sigue verse en lo registrado |

Solo nombres: **ninguna** columna de edad, dosis objetivo o calendario (Principio I). Semilla de unos 16 nombres a validar con la Cartilla Nacional de Salud (`research.md` R3).

## `vaccine_records` (una fila por dosis aplicada)

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | `UUID` PK, `gen_random_uuid()` | |
| `child_id` | `UUID NOT NULL` | |
| `account_id` | `UUID NOT NULL` | cuenta dueña del hijo |
| `vaccine_code` | `TEXT NULL` → `vaccine_catalog(code)` | |
| `custom_name` | `TEXT NULL` | 1–100 caracteres; texto libre tal cual lo escribió el padre |
| `applied_on` | `DATE NOT NULL` | no futura, no anterior al nacimiento (validada en el servicio) |
| `dose_number` | `INTEGER NULL` | 1–20 |
| `lot` | `TEXT NULL` | ≤ 60 |
| `place` | `TEXT NULL` | ≤ 120 |
| `notes` | `TEXT NULL` | ≤ 500 |
| `created_by_account_id` | `UUID NOT NULL` → `accounts(id)` | quien lo registró |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |
| `corrected_by_account_id` | `UUID NULL` → `accounts(id)` | última corrección |
| `corrected_at` | `TIMESTAMPTZ NULL` | `corrected_by` y `corrected_at` van juntos (CHECK) |

**Restricciones**: `CHECK ((vaccine_code IS NULL) <> (custom_name IS NULL))` (exactamente uno); `FOREIGN KEY (child_id, account_id) REFERENCES children (id, account_id)` (la base impide otro hijo/cuenta); `CHECK` de longitudes; `CHECK` de que `corrected_by_account_id` y `corrected_at` sean ambos nulos o ambos presentes. Índice `(child_id, applied_on, created_at)` para la lista y `(account_id)`.

**Ciclo de vida**: se crea, puede corregirse varias veces (cada una sobrescribe, sin historial) y se borra de verdad. No hay estados.

## `vaccine_card_photos` (una fila por foto)

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | `UUID` PK | |
| `child_id`, `account_id` | `UUID NOT NULL` | `FOREIGN KEY (child_id, account_id) REFERENCES children (id, account_id)` |
| `photo` | `BYTEA NOT NULL` | `CHECK (octet_length(photo) > 0)`; el servicio exige imagen reconocible y ≤ 5 MiB |
| `created_by_account_id` | `UUID NOT NULL` → `accounts(id)` | |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |

Índice `(child_id, created_at)`. **Tope de 10 por hijo**: no es una restricción de la base; se aplica en la transacción de la subida con la fila del hijo bloqueada (`research.md` R5). Se borra de verdad.

## Relaciones

```text
accounts 1 ── n children 1 ── n vaccine_records  ── 0..1 vaccine_catalog
                         1 ── n vaccine_card_photos
```

`vaccine_records` y `vaccine_card_photos` **no se relacionan entre sí** (decisión de la spec). `accounts` aparece solo para decir quién creó/corrigió (se expone el nombre de pila).

## Respuestas (resumen; detalle en `contracts/api.md`)

- **Registro**: `id`, `vaccineCode|null`, `name` (el del catálogo o el escrito), `customName|null`, `appliedOn` (`AAAA-MM-DD`), `doseNumber|null`, `lot|null`, `place|null`, `notes|null`, `createdByName`, `createdAt`, `correctedByName|null`, `correctedAt|null`.
- **Foto (lista)**: `id`, `createdAt`, `createdByName`. La imagen (`photoBase64`) solo en el `GET` de una foto.

## Datos que nunca se guardan ni se registran

Correos en las respuestas de esta función; los textos libres en direcciones, en `error_logs` o en mensajes de error; copias de fotos fuera de la tabla.
