# Modelo de Datos: Recorrer el tratamiento

## Migración `0014_create_medication_extensions.sql`

```sql
CREATE TABLE medication_extensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medication_id UUID NOT NULL REFERENCES medications (id),
    account_id UUID NOT NULL REFERENCES accounts (id),
    proposed_doses INTEGER NOT NULL CHECK (proposed_doses >= 1),
    added_doses INTEGER NOT NULL CHECK (added_doses BETWEEN 1 AND 60),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_medication_extensions_medication_id ON medication_extensions (medication_id);

ALTER TABLE doses
    ADD COLUMN added_by_extension_id UUID NULL REFERENCES medication_extensions (id),
    ADD COLUMN covered_by_extension_id UUID NULL REFERENCES medication_extensions (id);
```

| Campo | Significado |
|---|---|
| `medication_extensions.proposed_doses` | Lo que la app proponía: las tomas sin registrar aún no recorridas en ese momento |
| `medication_extensions.added_doses` | Lo que el padre confirmó (1 a 60); `added ≠ proposed` = «número ingresado manualmente» |
| `medication_extensions.account_id` | La cuenta dueña de la consulta (quien lo decidió; `RequireOwner` ya lo garantiza) |
| `doses.added_by_extension_id` | La toma la trajo ese recorrido (`NULL` en las originales) |
| `doses.covered_by_extension_id` | Esa toma «sin registrar» ya fue recorrida; no se vuelve a proponer |

Solo se agregan filas y se llenan esas dos columnas al recorrer; nunca se editan ni se borran (excepción acotada a la
inmutabilidad de la spec 004). Las tomas agregadas nacen con `taken = false` y su estado se deriva como cualquier otra.

## Derivados (no se guardan)

- `Medication.ExtendableDoses`: tomas con estado `unregistered`, `covered_by_extension_id IS NULL`, y el medicamento sin
  `ended_at`.
- `Extension.manual`: `added_doses <> proposed_doses`.
- El fin del tratamiento y el «termina el …»: el último día con tomas (ya incluye las agregadas).
