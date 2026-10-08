# Plan: Actividad a una hora fija y selector de hora (spec 036)

**Rama**: `feature/036-actividad-hora-fija-y-selector-de-hora` · **Spec**: [spec.md](./spec.md) · **Opciones del selector**: [referencia/selector-de-hora-opciones.md](./referencia/selector-de-hora-opciones.md)

## Backend

- **Migración `0023_activities_at_fixed_hours.sql`**: se rehace `supplement_routines_period_shape`: `daily` y `weekdays` valen con 1–6 horas **sin importar el tipo**; `window` solo para `kind = 'activity'`. Es solo relajar un CHECK: ningún dato cambia, el backend anterior sigue funcionando.
- **`validate.go`**: el caso `daily`/`weekdays` (horas fijas) ya no pide ser suplemento; una actividad con otro periodo da `period: must be daily, weekdays or window`; un suplemento con `window`, `period: must be daily or weekdays`. Pruebas de tabla y una de «actividad a una hora fija» (descarta los campos de ventana).
- `Generate`, `MarkNext`, el tope por tipo, los avisos y el plan no cambian (dependen de `kind`). Prueba HTTP: crear la actividad a horas fijas, «Realizado» marca la más temprana, los casos inválidos dan 400.

## Frontend

- **`shared/ui/TimeField.tsx`** (+ `timeField.test-utils.ts` con `pickTime`): campo de 148 px, panel con `role="dialog"` «Elegir hora», grupos «Hora» (6 columnas) y «Minutos» (4), `aria-pressed`, Escape / «Listo» / toque fuera, foco de vuelta al campo, `align="end"` para el campo del lado derecho. Vacío = «Elegir hora».
- **`RoutineForm.tsx`**: los tres campos de hora usan `TimeField`; actividades con «Cuándo se hace» (`activityMode` `window` | `fixed`) y el editor de «Horas» compartido con el suplemento (`HoursEditor`); «Desde las / Hasta las» en una fila que se acomoda sola; las fechas con `dateField` (sin desbordar en iOS).
- **`routineValues.ts` / `scheduleText.ts`**: `activityMode`, validación y `toInput` del modo fijo (`daily` o `weekdays` según `daysMode`); `activityRule`, `activityRange` y `detailRows` dicen «Mar, Jue · a las 17:00», «Días / Horas / Fechas». Mensajes «Elige la hora…» (ya no «Escribe»).
- **Próxima cita**: `AppointmentFields` usa `TimeField` en «Hora de la cita» y «Hora del aviso».

## Verificación de la constitución

I (el campo empieza vacío, ningún ejemplo de hora), II (nada nuevo se guarda ni se registra), VI (pruebas unitarias de `TimeField`, del formulario en los dos modos, del servidor, y E2E a 390 y 1280 px: la «práctica de fut» en la cuadrícula).
