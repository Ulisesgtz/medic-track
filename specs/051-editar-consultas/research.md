# Investigación: Editar consultas ya guardadas (spec 051)

Lo que hay hoy en el código (rama `develop` al 2026-10-26) y las decisiones que se toman a partir de eso.

## R1. Un solo `PUT` con la consulta entera

- **Decisión**: `PUT /consultations/{consultationId}` con la consulta completa en el cuerpo (doctor, fecha, `utcOffsetMinutes`,
  síntomas, notas, foto opcional y la lista de medicamentos: con `id` los existentes, sin `id` los nuevos; un medicamento
  existente que **no viene** se quita). Más `expectedVersion` para el conflicto (R6). Sin `recordOnly` en el cuerpo: el tipo
  de la consulta no cambia (FR-006).
- **Justificación**: el formulario ya arma la consulta entera; un solo pedido hace que la edición sea atómica (FR-014) y la
  regla del plan gratuito (FR-015) se evalúa sobre el resultado final, no sobre pasos sueltos. Es la forma de la creación
  (`createConsultationRequest`) más los `id`, así el handler y la validación se reutilizan.
- **Alternativas**: `PATCH` por partes (datos / un medicamento / quitar): varios pedidos, ediciones a medias si falla uno, y la
  regla del plan habría que evaluarla por partes. Descartado.

## R2. La transacción del repositorio

`Repository.Update(ctx, consultationID, in, actor)` en `internal/consultation`, un solo `tx` (lección de la spec 045: dentro
de la transacción solo `tx`, nunca el pool):

1. **Bloqueos, en este orden**: la cuenta dueña (`accountPlanOf(…, lock=true)`, el mismo de `Create`/`checkPlan`/`checkPhotoCap`),
   luego `consultations … FOR UPDATE`, luego sus `medications … FOR UPDATE` (el mismo bloqueo que toman `EndTreatment` y
   `ExtendTreatment`). Así dos ediciones, o una edición y un fin/recorrido, van una tras otra.
2. **Versión** (R6): si `coalesce(edited_at, created_at)` ≠ `expectedVersion` → `ErrEditConflict`.
3. **Datos**: `UPDATE consultations SET doctor_name, consult_date, notes[, photo], edited_at = now(), edited_by_account_id`.
4. **Síntomas**: `DELETE FROM consultation_symptoms WHERE consultation_id` + el mismo `INSERT … SELECT` de `Create`, pero aceptando
   `s.active OR s.code IN (los que la consulta ya tenía)` (un retirado que ya tenía se conserva; uno retirado nuevo →
   `ErrSymptomNotAvailable`).
5. **Medicamentos quitados**: si alguno tiene una toma `taken` → `ErrMedicationHasMarks` (409). Si no: se borran las filas
   que lo referencian (`dose_reminders` y `child_dose_reminders` de sus tomas, sus `doses`, sus `medication_extensions`) y el
   medicamento. Ninguna FK es `ON DELETE CASCADE` (migraciones 0007/0008/0014/0018/0029), así que el orden es explícito.
6. **Medicamentos existentes**: se actualiza el nombre siempre; si cambió el horario (R3) y está finalizado (`ended_at`) →
   error de validación `treatment_ended`; si no, se aplica R3.
7. **Medicamentos nuevos**: `INSERT` con `clock_timestamp()` (el orden y el color siguen estables, spec 019) y sus tomas futuras
   (R3, sin tomas conservadas).
8. **Plan gratuito** (R5) sobre el resultado, antes del `COMMIT`.
9. **Foto**: si viene, `imagecheck` en el handler y `checkPhotoCap` solo cuando la consulta no tenía foto (reemplazar no ocupa
   otro lugar del tope de la spec 043).

«Ahora» es `r.now()` (el reloj del repositorio, el mismo de `StatusAt` y de `SetNow` en las pruebas).

## R3. Rehacer las tomas de un horario que cambió

- **Cuándo cambió**: frecuencia, duración o primera toma distintas, **o** la fecha de la consulta distinta (la primera toma
  se lee en esa fecha, `generateDoseSchedule`). No se compara el `utcOffsetMinutes` (no se guarda; mismo texto = mismo
  horario).
- **Qué se quita**: `DELETE FROM doses WHERE medication_id = $1 AND NOT taken AND scheduled_at > now` (con sus filas de
  recordatorio por si acaso; en la práctica una toma futura no tiene aviso: se reclaman cuando ya llegó su hora). Esto incluye
  las tomas futuras que agregó un recorrido (spec 020); el registro `medication_extensions` se queda.
- **Qué se conserva**: toda toma marcada (aunque sea futura, marcada por adelantado) y toda toma con `scheduled_at <= now`
  (pasadas, «por marcar», «sin registrar»).
- **Qué se agrega**: `generateDoseSchedule(nuevaFecha, zona del padre, medicamento con datos nuevos)` y se insertan solo los
  instantes `> now` que **no** están ya entre los conservados (comparación exacta del instante). El `DELETE` con `NOT taken`
  vuelve a evaluar la fila bajo el bloqueo en `READ COMMITTED`: si alguien la marcó y confirmó antes, se conserva; si la marca
  llega después, encuentra la toma borrada (404 de la toma, la app recarga).
- **Alternativas**: regenerar todo y perder marcas (decisión vieja del backlog, rechazada por el dueño); «continuar» el horario
  viejo desde la última toma conservada (no corresponde a lo que el padre escribió). Descartadas.

## R4. Quién edita

- `fullConsultation` (`authmw.RequireAccess(…, access.Full, OnConsultation)`) en `server/router.go`, como fin y recorrido:
  dueña y Tutor de familia de pago; un Tutor de una familia vencida baja a `Mark` → 403; Cuidador y rol Hijo → 403. **No** va en
  `/child-device` (lista cerrada `phoneRoutes`, la prueba de `chi.Walk` lo vigila). Filas nuevas en `router_test.go`.
- El autor es `access.FromContext(ctx).ActorAccountID` (siempre una cuenta: el teléfono del hijo no llega).
- Sin revisión de plan para editar (FR-002): solo R5.

## R5. Plan gratuito

- Si la cuenta no es `paid` **y** después de la edición esta consulta tiene alguna toma `> now` en un medicamento sin finalizar
  **y** otra consulta de la cuenta (`co.id <> $consulta`) tiene un tratamiento activo (la misma consulta de `checkPlan`,
  excluyendo esta) → `*PlanLimitError{Reason: active_treatment}` → 422 como al crear. Editar la que ya es el tratamiento activo,
  o una sin tomas por delante, pasa.
- Una consulta «solo registro» de una cuenta gratuita (creada cuando pagaba) se edita sin problema: no se crea nada nuevo.

## R6. Conflicto entre dos ediciones

- **Decisión**: `expectedVersion` = el `editedAt` del detalle, o su `createdAt` si nunca se editó (el detalle trae los dos).
  Distinto del de la base → 409 `edit_conflict` sin cambios. La app avisa «Alguien guardó cambios en esta consulta mientras la
  editabas…» y vuelve a cargar.
- Marcar una toma, finalizar o recorrer **no** cambian la versión: no chocan con lo que edita el formulario (las marcas se
  protegen solas, R3; un fin concurrente se ve como `treatment_ended` si se tocó el horario).

## R7. Respuesta y lectura

- El `PUT` responde el detalle (`consultationDetailResponse`) con dos campos nuevos, también en `GET /consultations/{id}`:
  `createdAt` y `edited` (`null` o `{ at, by }`, `by` = nombre de pila de la cuenta, nunca el correo).
- La lista, el historial (spec 031), «Tomas de hoy» (spec 006), el calendario y los recordatorios leen las mismas tablas: no
  cambian. El PDF (spec 050, ya en `develop`) podrá mostrar «Editada el…» cuando se termine su frontend; aquí no se toca.

## R8. Frontend

- Ruta `/consultations/:consultationId/editar` (`EditConsultationPage`, `RequireSession` + `AppShell`, dos diseños con
  `useIsDesktop`), botón «Editar consulta» (contorno) en el encabezado de `ConsultationDetailPage` en ambos diseños, solo si
  `useChildAccess(...).canAdd`.
- **`ConsultationForm` gana un modo edición** (`edit` prop con los valores iniciales, la versión y la información por
  medicamento: `id`, `ended`, `hasMarks`): sin la sección «Próxima cita» (la cita se edita en su propia página, spec 033), la
  foto actual se muestra y el OCR solo corre si el padre elige otra, la casilla «solo registro» se ve fija, de un medicamento
  finalizado se bloquean frecuencia, duración y primera toma, «Quitar» solo en los que no tienen marcas (y nunca deja la
  consulta sin medicamentos), «Guardar cambios» en vez de «Guardar consulta». `MedicationFormValues` gana `id?`.
- Confirmación (FR-012): el formulario compara horario y fecha con los valores iniciales; si cambió alguno, un `ConfirmDialog`
  (el de familia, tono neutro) con el texto de la spec antes de enviar.
- Errores: 409 `edit_conflict` → aviso + recarga del detalle; 409 `medication_has_marks` → aviso y se vuelve a cargar; 422
  `active_treatment` → `FreemiumLimitModal` sin perder lo escrito; 422 `photo_limit_exceeded` como al crear.
- `useUnsavedWork(dirty)` y `navigate(…, { replace: true })` al guardar; invalidar `['consultation', id]`, `['consultations',
  childId]`, `['overview', childId]`, `['history', childId]`.
- «Editada el 26 oct por Ana» bajo el encabezado del detalle (`formatDateShort`), ambos diseños.
- Textos nuevos en `features/consultations/editText.ts` con una prueba de redacción como `vaccineText.test.ts` (Principio I).

## R9. Migración `0030`

`ALTER TABLE consultations ADD COLUMN edited_at timestamptz NULL, ADD COLUMN edited_by_account_id uuid NULL REFERENCES
accounts (id)` con `CHECK ((edited_at IS NULL) = (edited_by_account_id IS NULL))`. Sin relleno. **Se aplica en DEV antes de
hacer merge** (lección del digest semanal del 19–26 oct: el backend de la 047 corrió 18 h sin su migración).
