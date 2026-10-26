# Modelo de datos: Editar consultas (spec 051)

## Cambios en la base (migración `0030_consultation_edits.sql`)

| Tabla | Columna | Tipo | Regla |
|---|---|---|---|
| `consultations` | `edited_at` | `timestamptz NULL` | momento de la última edición; `NULL` = nunca editada |
| `consultations` | `edited_by_account_id` | `uuid NULL REFERENCES accounts (id)` | cuenta que editó por última vez |
| `consultations` | CHECK `consultations_edit_pair` | | `(edited_at IS NULL) = (edited_by_account_id IS NULL)` |

Nada más cambia de forma. No hay historial de versiones (decisión del dueño).

## Entidades y lo que la edición puede hacer

### Consulta
- Editable: `doctor_name` (requerido), `consult_date` (requerida, no futura), `notes`, `photo` (se reemplaza; no se quita),
  sus síntomas (`consultation_symptoms`: se reemplazan; activos del catálogo + los retirados que ya tenía).
- Fijo: `id`, `child_id`, `created_at`, `record_only`.
- Versión para el conflicto: `coalesce(edited_at, created_at)`.

### Medicamento
- Editable: `name` (requerido); `frequency_hours`, `duration_days` (enteros > 0) y `start_time` (`HH:MM`, requerida salvo en
  «solo registro», donde siempre es `NULL`) — **no** si `ended_at` no es nulo (FR-007).
- Nuevo: se inserta con `created_at = clock_timestamp()` (queda al final; el orden decide su número y color, spec 019).
- Quitado: solo si ninguna de sus tomas tiene `taken = true`; se borran sus filas de `dose_reminders`, `child_dose_reminders`,
  `doses` y `medication_extensions`, y la fila del medicamento. La consulta conserva al menos uno.
- Fijo: `ended_at` (spec 016), sus `medication_extensions` (spec 020).

### Toma (al cambiar el horario de su medicamento)
| Toma | Qué pasa |
|---|---|
| marcada (`taken`), pasada o futura | se conserva tal cual (hora, autor, `taken_at`) |
| sin marcar, `scheduled_at <= now` (pendiente que ya pasó, «por marcar», «sin registrar») | se conserva |
| sin marcar, `scheduled_at > now` (incluidas las de un recorrido) | se borra |
| hora del nuevo horario `> now` que no coincide con una conservada | se crea (`taken = false`) |
| hora del nuevo horario `<= now`, o igual a una conservada | no se crea |

Sin cambio de horario: ninguna toma se toca.

## Validación (igual que al crear, más)

| Campo | Regla | Error |
|---|---|---|
| `expectedVersion` | requerido, igual a la versión guardada | 400 si falta / 409 `edit_conflict` |
| `medications[i].id` | si viene, debe ser un medicamento de esta consulta y aparecer una sola vez | 400 `medications[i].id` `medication_not_found` |
| horario de un finalizado | sin cambios | 400 `medications[i].frequencyHours` (o el campo cambiado) `treatment_ended` |
| quitar un medicamento con marcas | no se permite | 409 `medication_has_marks` |
| `symptomCodes` | activos o ya presentes en la consulta | 400 `symptomCodes` `symptom_not_available` |
| plan gratuito | FR-015 | 422 `freemium_consultation_limit_exceeded` `reason: "active_treatment"` |
| foto nueva en una consulta sin foto con el tope lleno | spec 043 | 422 `photo_limit_exceeded` |
