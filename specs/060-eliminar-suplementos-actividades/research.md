# Investigación: Eliminar suplementos y actividades

## R1 — Una ruta `DELETE /routines/{routineId}`

- **Decisión**: `DELETE` sin cuerpo, `204` al borrar. Registrada con `fullRoutine` (`RequireAccess("routineId", Full, OnRoutine)`),
  junto a las demás acciones de la rutina; no se agrega a la lista cerrada de `/child-device`.
- **Justificación**: es el verbo natural para borrar; `fullRoutine` ya da exactamente el nivel decidido: la dueña y un Tutor de
  familia de pago (un Tutor de familia vencida baja a `Mark`), y en lo personal solo la dueña (`onRoutineQuery`).
- **Alternativas**: `POST /routines/{id}/delete` (como `finish`): se descartó, el `DELETE` no necesita cuerpo ni respuesta.

## R2 — La regla «sin marcas» y la concurrencia

- **Decisión**: `lockRoutine` (cuenta dueña y rutina `FOR UPDATE`), luego `SELECT … FROM supplement_doses WHERE routine_id = $1
  FOR UPDATE` y `bool_or(taken)`; con una marca, `ErrRoutineHasMarks` → 409 `routine_has_marks`; sin marcas, se borra en la misma
  transacción.
- **Justificación**: marcar (`UpdateDoseStatus`, «Realizado») bloquea la fila de la toma. Con las tomas bloqueadas, una marca
  simultánea o termina antes (y eliminar la ve) o espera y luego no encuentra la toma (404 `dose_not_found`). Se miran las marcas
  actuales: una toma desmarcada no cuenta (spec, escenario 2.3).
- **Alternativas**: revisar las marcas sin bloquear las tomas (deja una carrera); una columna «tuvo marcas» (más esquema sin necesidad).

## R3 — Qué se borra y en qué orden

- **Decisión**: `supplement_dose_reminders` y `child_supplement_dose_reminders` de sus tomas, luego `supplement_doses`,
  `supplement_muted` y por último `supplement_routines`.
- **Justificación**: son todas las tablas con llave hacia la rutina o sus tomas (sin `ON DELETE CASCADE`); el orden respeta las llaves.
  El planificador (`RunPlanner`) solo genera tomas para rutinas que existen: una rutina borrada no vuelve a generar nada.

## R4 — `hasMarks` en la rutina

- **Decisión**: columna derivada en `routineSelect` (`EXISTS (… sd.taken)`), en `RoutineView.HasMarks` y en la respuesta
  `hasMarks`. Sale en el detalle y en las listas (mismo `scanRoutine`).
- **Justificación**: la app decide si mostrar el botón sin pedir todas las tomas (el detalle trae solo las del día).

## R5 — Frontend

- **Decisión**: botón de texto «Eliminar suplemento» / «Eliminar actividad» en la tarjeta de datos del detalle, debajo de
  «Finalizar», visible con `canManage && !routine.hasMarks` **en cualquier estado** (también finalizado o pausado y con el plan
  vencido). Diálogo `DeleteRoutineDialog` sobre `ConfirmDialog` (`tone` neutral `ink`, no rojo: corregir no es un error). Al
  terminar: `removeQueries(['routine', id])`, invalida `['routines']` y `['overview']`, y `navigate(backTo, { replace: true })`.
  Un 409 `routine_has_marks` cierra el diálogo, vuelve a leer la rutina (el botón desaparece) y dice «… ya tiene tomas marcadas, así
  que no se puede eliminar. Puedes finalizarlo.».
- **Justificación**: reutiliza el patrón de «Finalizar» (mismo diálogo de tres filas, mismo foco de regreso).
- **Alternativas**: en el encabezado junto a «Editar» (se descartó: «Editar» solo aparece con plan, eliminar en cualquiera).

## R6 — Textos

- **Decisión**: `deleteCopy.ts` con el título, las filas, los botones y los mensajes; `deleteCopy.test.ts` revisa que no evalúen
  (sin «error», «olvid», «incumpl», «debes», etc.) y que digan que no se puede deshacer.
