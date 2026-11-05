# Modelo de Datos: Eliminar suplementos y actividades

Sin migración. Ninguna columna nueva.

## Suplemento / actividad (`supplement_routines`)

- **Nuevo dato derivado** `hasMarks: boolean` = existe una fila de `supplement_doses` de la rutina con `taken = true` (en este momento).
- **Nueva transición**: cualquier estado (`active`, `paused`, `ended`) → *no existe*, solo con `hasMarks = false`.

## Lo que se borra con la rutina

| Tabla | Filtro |
|---|---|
| `supplement_dose_reminders` | `dose_id` en las tomas de la rutina |
| `child_supplement_dose_reminders` | `dose_id` en las tomas de la rutina |
| `supplement_doses` | `routine_id` |
| `supplement_muted` | `routine_id` |
| `supplement_routines` | `id` |

## Reglas

- Una toma marcada (`taken = true`) impide borrar (409 `routine_has_marks`); no se borra nada.
- Nivel `Full` sobre la rutina; cualquier plan.
