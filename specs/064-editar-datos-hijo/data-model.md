# Modelo de datos: Editar los datos del hijo (spec 064)

## Migración `0035_child_corrections.sql`

```sql
ALTER TABLE children
    ADD COLUMN corrected_by_account_id UUID NULL REFERENCES accounts (id),
    ADD COLUMN corrected_at TIMESTAMPTZ NULL,
    ADD CONSTRAINT children_correction_together CHECK ((corrected_by_account_id IS NULL) = (corrected_at IS NULL));
```

No cambia ningún dato existente. Aplicarla en DEV antes del merge.

## Hijo (`children`, ya existe)

| Campo | Regla | Quién lo cambia |
|---|---|---|
| `first_name`, `last_name` | 1–100 caracteres (CHECK de la `0004`); solo letras (con acentos y ñ), espacios, guiones y apóstrofes (aplicación) | Nivel completo + **plan completo** de la cuenta dueña |
| `birth_date` | No futura; no después de ninguna `growth_measurements.measured_on` ni `vaccine_records.applied_on` del hijo | Nivel completo + **plan completo** |
| `height`, `weight` | `NULL` o `> 0` | Nivel completo, **cualquier plan** |
| `corrected_by_account_id`, `corrected_at` | Juntos; se sellan solo si algún campo cambió | El servidor |
| `growth_reference_sex` | Sin cambios aquí (spec 063, desde la gráfica) | — |

**No cambia**: `id`, `account_id`, `created_at`. Un hijo sigue sin poder borrarse.

## Medida de crecimiento (`growth_measurements`, spec 063)

La casilla crea una fila con:
- `measured_on`: la fecha del teléfono.
- `weight_kg` y `height_cm`: los valores nuevos que no estén vacíos, en los rangos 0.3–200 y 30–220.
- `note`: `NULL`.
- `created_by_account_id`: quien edita.

Se crea en la misma transacción que la corrección y respeta el tope de 500 por hijo.

## Invariantes

1. Después de cualquier escritura, para todo hijo: `min(measured_on) >= birth_date` y `min(applied_on) >= birth_date`. Lo garantizan la revisión de la edición y la revisión bajo bloqueo de las escrituras de medidas y vacunas (research R4).
2. Un hijo cuya cuenta dueña no es `paid` nunca cambia `first_name`, `last_name` ni `birth_date` por esta ruta.
3. `corrected_*` cambia solo cuando cambia algún campo del hijo.

## Bloqueos

| Escritura | Bloqueo de la fila del hijo |
|---|---|
| `PUT /children/{childId}` | `FOR UPDATE` |
| `growth` Create | `FOR UPDATE` (ya lo tenía, por el tope) + lee `birth_date` |
| `growth` Update | `FOR SHARE` (nuevo) + lee `birth_date` |
| `vaccination` Create / Update | `FOR SHARE` (nuevo) + lee `birth_date` |
