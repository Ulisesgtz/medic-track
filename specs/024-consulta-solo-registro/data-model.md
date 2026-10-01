# Modelo de datos: Consulta «solo como registro»

## Cambio de esquema (migración `0016_add_consultation_record_only.sql`)

```sql
ALTER TABLE consultations ADD COLUMN record_only BOOLEAN NOT NULL DEFAULT false;
```

| Tabla | Columna | Tipo | Regla |
|---|---|---|---|
| `consultations` | `record_only` | `BOOLEAN NOT NULL DEFAULT false` | Se escribe una vez al crear; no hay `UPDATE` (inmutabilidad, spec 004). `true` = sin horarios ni tomas. Las filas existentes quedan en `false` |

Sin cambios en `medications` (su `start_time` ya admite `NULL`) ni en `doses` (una consulta solo-registro no tiene filas).

## Reglas

- Con `record_only = true`: ningún medicamento de la consulta tiene `start_time` y ninguna tiene filas en `doses`
  (lo garantiza el servicio al crear: anula la hora de inicio; sin hora de inicio no se generan tomas).
- Una consulta con `record_only = false` sigue exigiendo la hora de inicio al crearse (spec 012, FR-010).
- No hay restricción en la fecha: cualquier día (`consult_date`).

## Forma de la API (ver contracts/)

`recordOnly: boolean` en la petición de creación (opcional, `false` por omisión) y en las respuestas de listado y detalle.
