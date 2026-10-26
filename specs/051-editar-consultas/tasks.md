# Tareas: Editar consultas ya guardadas

**Entrada**: Documentos de diseño de `specs/051-editar-consultas/`
**Prerrequisitos**: plan.md, spec.md, research.md (R1–R9), data-model.md, contracts/api.md, quickstart.md

**Pruebas**: obligatorias (constitución, Principio VI: > 90 % y E2E de los flujos críticos).

**Organización**: un commit por fase en `feature/051-editar-consultas`. Reglas del repo: dentro de una transacción solo `tx`
(spec 045), todo endpoint por `*httpx.Responder`, textos libres solo en el cuerpo, archivos CRLF editados preservando sus
finales de línea, vitest con `--testTimeout=30000 --maxWorkers=4`, `DATABASE_URL` local de `backend/CLAUDE.md`.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración — migración

- [X] T001 Crear `backend/migrations/0030_consultation_edits.sql`: `ALTER TABLE consultations ADD COLUMN edited_at timestamptz NULL, ADD COLUMN edited_by_account_id uuid NULL REFERENCES accounts (id), ADD CONSTRAINT consultations_edit_pair CHECK ((edited_at IS NULL) = (edited_by_account_id IS NULL));` sin relleno. Aplicarla en la base local y en la de pruebas.
- [X] T002 Mostrar al usuario el SQL completo de la `0030` y recordarle aplicarlo en DEV **antes** de hacer merge (lección del digest del 19–26 oct). Anotar la migración en la tabla de `backend/CLAUDE.md` («`migrations/*.sql`»).

**Punto de control**: la base local tiene las dos columnas y el CHECK.

---

## Fase 2: Fundamental — el endpoint de edición (bloquea las historias)

- [X] T003 [P] `backend/internal/consultation/model.go`: `Consultation.EditedAt *time.Time` y `EditedBy *string` (nombre de pila); actualizar el comentario «Immutable once created» (cuarta excepción, spec 051). `backend/internal/consultation/repository.go`: `getByID` lee `edited_at` y `COALESCE(first_name)` de `edited_by_account_id` (`LEFT JOIN accounts`).
- [X] T004 [P] `backend/internal/consultation/errors.go`: `ErrEditConflict` y `ErrMedicationHasMarks`; mensajes fijos en inglés sin datos del pedido.
- [X] T005 `backend/internal/consultation/handler.go`: `consultationDetailResponse` gana `createdAt` (RFC 3339) y `edited` (`null` o `{ at, by }`) en el detalle, en el `POST` y en el `PUT`.
- [X] T006 `backend/internal/consultation/edit.go`: `UpdateMedicationInput {ID *uuid.UUID; Name; FrequencyHours; DurationDays; StartTime}` y `UpdateConsultationInput {ExpectedVersion time.Time; DoctorName; ConsultDate; Photo []byte (nil = no cambia); Notes; SymptomCodes; Medications; UTCOffsetMinutes}`; `Service.UpdateConsultation(ctx, consultationID, in, actorAccountID)` que valida con las mismas reglas de `validateCreateConsultationInput` (doctor requerido, fecha requerida y no futura, foto ≤ 8 MiB, `utcOffsetMinutes` entre -840 y 840, al menos un medicamento, nombre requerido, frecuencia y duración enteros > 0, `startTime` `HH:MM` requerida salvo en «solo registro») más `expectedVersion` requerido y cada `medications[i].id` presente una sola vez (400 `medications[i].id` `medication_not_found` si se repite).
- [X] T007 `backend/internal/consultation/edit.go`: `Repository.Update(ctx, consultationID, in, actor)` en **un** `tx` (solo `tx` dentro): (1) `accountPlanOf(…, lock=true)` desde el hijo de la consulta, luego `SELECT … FROM consultations WHERE id = $1 FOR UPDATE` (404 `ErrConsultationNotFound`) y `SELECT … FROM medications WHERE consultation_id = $1 ORDER BY created_at, id FOR UPDATE`; (2) `coalesce(edited_at, created_at) <> expectedVersion` → `ErrEditConflict`; (3) ids que no son de esta consulta → `ValidationErrors{medications[i].id: medication_not_found}`; (4) quitados: si alguno tiene `doses.taken` → `ErrMedicationHasMarks`; si no, `DELETE` de `dose_reminders` y `child_dose_reminders` de sus tomas, `doses`, `medication_extensions` y la fila; (5) existentes: `UPDATE medications SET name, frequency_hours, duration_days, start_time` (en «solo registro» `start_time` siempre `NULL`); cambio de horario = frecuencia, duración, primera toma o fecha de la consulta distintas; si cambió y `ended_at IS NOT NULL` → `ValidationErrors{medications[i].<campo>: treatment_ended}`; si cambió, borrar `doses` con `NOT taken AND scheduled_at > now` (y sus filas de recordatorio) y crear con `generateDoseSchedule(nuevaFecha, FixedZone(utcOffset), med)` solo los instantes `> now` que no estén entre los conservados; (6) nuevos: `INSERT … created_at = clock_timestamp()` y sus tomas `> now`; (7) `UPDATE consultations SET doctor_name, consult_date, notes[, photo], edited_at = now(), edited_by_account_id = actor`; (8) síntomas: `DELETE` + `INSERT … SELECT` aceptando `s.active OR s.code = ANY(los que ya tenía)` → menos filas = `ErrSymptomNotAvailable`; (9) foto nueva en una consulta sin foto → `checkPhotoCap`; (10) plan gratuito (R5): cuenta no `paid`, esta consulta con una toma `> now` en un medicamento sin finalizar y otra consulta de la cuenta (`co.id <> $1`) con tratamiento activo → `*PlanLimitError{Reason: PlanLimitActiveTreatment}`. «Ahora» = `r.now()`. Devolver la consulta leída con `getByID` sobre el `tx` o después del `COMMIT`.
- [X] T008 `backend/internal/consultation/edit_handler.go`: `PUT /consultations/{consultationId}` con `http.MaxBytesReader` (11 MiB), id mal formado → 404, JSON malo → 400, `consultDate` y `photoBase64` como en `CreateConsultation` (base64 + `looksLikeImage`), `expectedVersion` RFC 3339; mapeo: `ValidationErrors` 400, `ErrConsultationNotFound` 404, `ErrEditConflict` 409 `edit_conflict`, `ErrMedicationHasMarks` 409 `medication_has_marks`, `*PlanLimitError` 422 (`planLimitBody`), `ErrPhotoLimit` 422, `ErrSymptomNotAvailable` 400; cada `case` llama al `Responder` en su propia línea; anotaciones Swagger completas (`@Router /consultations/{consultationId} [put]`). El autor es `access.FromContext(ctx).ActorAccountID`.
- [X] T009 `backend/internal/server/router.go`: `r.With(fullConsultation).Put("/consultations/{consultationId}", d.Consultation.UpdateConsultation)`; **no** agregarla a `/child-device`. `backend/internal/server/router_test.go`: fila nueva en `routes()` (dueña 200, Tutor de pago 200, Tutor de familia vencida 403, Cuidador 403, Hijo 403, extraño 403, sin sesión 401) y comprobar que `childdevice_router_test.go` sigue pasando.
- [X] T010 [P] Pruebas `backend/internal/consultation/edit_test.go` contra la base real (`SetNow` para el reloj): solo datos no toca tomas; cambio de frecuencia conserva marcadas (con autor) y pasadas (pendiente pasada, «por marcar», «sin registrar»), conserva una futura marcada por adelantado, borra las futuras sin marcar (incluidas las de un recorrido, el registro del recorrido queda), crea las nuevas `> now` sin duplicar ninguna hora conservada y ninguna en el pasado; cambio de fecha = cambio de horario; finalizado con horario cambiado → `treatment_ended` y el nombre sí cambia; «solo registro» sin tomas; agregar medicamento con sus tomas y orden estable; quitar sin marcas (también uno con recordatorios ya enviados en tomas pasadas) y con marcas → `ErrMedicationHasMarks`; último medicamento → validación; id de otra consulta → `medication_not_found`; síntoma retirado que ya tenía se conserva y uno retirado nuevo → `ErrSymptomNotAvailable`; foto reemplazada y tope de fotos; plan gratuito (rechazo con otro tratamiento activo, se permite editar el que ya es el activo, «solo registro» de cuenta gratuita); `expectedVersion` vieja → `ErrEditConflict` sin cambios; dos `Update` a la vez con la misma versión → uno gana y el otro `ErrEditConflict`; una marca concurrente se conserva.
- [X] T011 [P] Pruebas `backend/internal/consultation/edit_handler_test.go`: 200 con `edited {at, by}` y `createdAt`; cada error del contrato (400 campos, 404, 409 ×2, 422 ×2); `error_logs` nunca contiene el doctor, las notas ni el nombre de un medicamento enviados.
- [X] T012 Regenerar Swagger (`go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd`), `go vet ./...`, `go test ./internal/consultation/... ./internal/server/... -cover` con y sin `pool_max_conns=4`; cobertura total > 90 %.

**Punto de control**: `PUT` completo y probado; el frontend puede empezar.

---

## Fase 3: Historia de Usuario 1 — corregir los datos de la consulta (P1) 🎯 MVP

**Objetivo**: «Editar consulta» abre el formulario con los datos; doctor, fecha, síntomas, notas, nombre del medicamento y foto se guardan sin tocar tomas; el detalle dice «Editada el … por …».

**Prueba independiente**: editar los datos de una consulta con tomas marcadas y ver el detalle, la lista y el historial actualizados con las tomas iguales.

- [X] T013 [P] [US1] `frontend/src/features/consultations/types.ts` y `api.ts`: `ConsultationDetail` gana `createdAt` y `edited: { at: string; by: string } | null`; `updateConsultation(consultationId, body, token)` (`PUT`, todo en el cuerpo); `ConsultationApiError` kinds `edit_conflict` y `medication_has_marks` (además de los de la creación).
- [X] T014 [P] [US1] `frontend/src/features/consultations/editText.ts` (+ `editText.test.ts`): «Editar consulta», «Guardar cambios», «Editada el {día} por {nombre}» (`formatDateShort`), la confirmación de horario («Las tomas que ya marcaste no cambian; las que aún no llegan se acomodan al nuevo horario.»), el aviso de conflicto («Alguien guardó cambios en esta consulta mientras la editabas. Te mostramos la versión guardada.»), el de «no se puede quitar» y el de tratamiento terminado; la prueba falla con palabras de evaluación (`toca`, `atraso`, `falta`, `debes`, `alerta`, `recomend`, `corrige tu`, porcentajes) como `vaccineText.test.ts`.
- [X] T015 [P] [US1] `frontend/src/features/consultations/editValues.ts` (+ `editValues.test.ts`): `valuesOfDetail(detail)` → `ConsultationFormValues` (medicamentos con `id`, frecuencia y duración como texto, `startTime`), `medicationFlags(detail)` (`ended`, `hasMarks` por id), `hasScheduleChange(initial, current)` (frecuencia, duración, primera toma de un existente o la fecha), `toUpdateBody(values, version, photoBase64?)` (`expectedVersion` = `edited?.at ?? createdAt`, `utcOffsetMinutes` del dispositivo, `startTime: null` en «solo registro»).
- [X] T016 [US1] `frontend/src/features/consultations/ConsultationForm.tsx`: prop `edit?: { values, version, flags, existingPhotoUrl }` — con ella: valores iniciales, sin la sección «Próxima cita», la foto actual visible y el OCR solo si el padre elige otra, la casilla «solo registro» fija (deshabilitada con su valor), el botón dice «Guardar cambios», `onSubmit` llama a `updateConsultation`; sin ella todo igual que hoy (las pruebas actuales siguen pasando). `MedicationFormValues` gana `id?: string`.
- [X] T017 [US1] `frontend/src/features/consultations/EditConsultationPage.tsx` (+ prueba): `/consultations/:consultationId/editar`, `RequireSession` + `AppShell`, dos diseños con `useIsDesktop` (encabezado como `NewConsultationPage`), carga el detalle, `useChildAccess(...).canAdd` falso → vuelve al detalle; `useUnsavedWork(dirty)`, «← Cancelar» con `confirmLeave`; al guardar invalida `['consultation', id]`, `['consultations', childId]`, `['overview', childId]`, `['history', childId]` y `navigate(detalle, { replace: true })`; 409 `edit_conflict` → `Notice` con el texto de `editText.ts` y vuelve a cargar los valores.
- [X] T018 [US1] `frontend/src/App.tsx`: la ruta nueva. `frontend/src/features/consultations/ConsultationDetailPage.tsx`: botón de contorno «Editar consulta» (un `Link`) en el encabezado de ambos diseños solo con `canAdd`, y «Editada el … por …» bajo el encabezado cuando `edited` no es `null`; pruebas en ambos diseños para dueña, Tutor de pago, Cuidador y Tutor de familia vencida.

**Punto de control**: la Historia 1 funciona sola (sin cambiar horarios).

---

## Fase 4: Historia de Usuario 2 — corregir el horario de un medicamento (P2)

**Objetivo**: cambiar frecuencia, duración, primera toma o fecha con la confirmación neutral; lo marcado y lo pasado no cambian.

**Prueba independiente**: con tomas pasadas y marcadas, cambiar la frecuencia, confirmar, y ver que solo cambian las futuras sin marcar.

- [X] T019 [US2] `ConsultationForm.tsx` en modo edición: si `hasScheduleChange`, antes de enviar abre el `ConfirmDialog` de `features/family/` (tono neutro, «Guardar cambios» / «Volver») con el texto de `editText.ts`; sin cambio de horario envía directo. Pruebas: cambio de nombre no pregunta; cambio de frecuencia y de fecha preguntan; «Volver» no envía.
- [X] T020 [US2] `frontend/src/features/consultations/MedicationFieldset.tsx`: prop `ended` deshabilita frecuencia, duración y primera toma con la nota de `editText.ts` («El tratamiento terminó: su horario ya no cambia.»); el nombre sigue editable. Pruebas en ambos diseños.

**Punto de control**: Historias 1 y 2 funcionan.

---

## Fase 5: Historia de Usuario 3 — agregar o quitar un medicamento (P3)

**Objetivo**: agregar un medicamento a una consulta existente y quitar uno sin marcas, respetando el plan gratuito.

**Prueba independiente**: agregar un medicamento y verlo en el detalle y en «Tomas de hoy»; quitar uno sin marcas; uno con marcas no se puede.

- [ ] T021 [US3] `ConsultationForm.tsx`/`MedicationFieldset.tsx` en modo edición: «+ Otro medicamento» agrega uno sin `id`; «Quitar» solo en los que no tienen marcas (`hasMarks` falso) y nunca cuando queda uno; uno con marcas muestra «Tiene tomas marcadas: no se puede quitar.».
- [ ] T022 [US3] `EditConsultationPage.tsx`/`ConsultationForm.tsx`: 409 `medication_has_marks` → `Notice` y recarga; 422 `freemium_consultation_limit_exceeded` `active_treatment` → `FreemiumLimitModal reason="active_treatment"` sin perder lo escrito; 422 `photo_limit_exceeded` como al crear. Pruebas de los tres.

**Punto de control**: las tres historias funcionan.

---

## Fase Final: Pulido y aspectos transversales

- [ ] T023 [P] E2E `frontend/e2e/editar-consulta.spec.ts` (Chromium, `designs` a 390 y 1280 px): corregir datos de una consulta con tomas marcadas y ver «Editada el … por …» y las marcas iguales; cambiar la frecuencia con la confirmación y comprobar las tomas (por API); agregar y quitar un medicamento; un Cuidador (dos sesiones) no ve el botón y recibe 403 por API; plan gratuito con otro tratamiento activo ve el aviso del plan.
- [ ] T024 [P] Documentar: `CLAUDE.md` raíz (spec 051 en «Current features»), `backend/CLAUDE.md` (el `PUT`, `Repository.Update`, la migración `0030`, cuarta excepción a la inmutabilidad), `frontend/CLAUDE.md` (`EditConsultationPage`, el modo edición del formulario, `editText.ts`/`editValues.ts`), nota en `specs/004-detalle-consulta-hijo/spec.md` (FR-014: excepciones 016, 020, 033 y 051) y `BACKLOG.md` (el pendiente «Editar consultas y medicamentos» pasa a hecho).
- [ ] T025 Verificación completa: `go vet ./...`; `go test ./internal/... -cover` con y sin `pool_max_conns=4`; Swagger sin cambios; `govulncheck ./...`; `npx vitest run --coverage --testTimeout=30000 --maxWorkers=4`; `npm run build`; `npx eslint src e2e`; `npx playwright test --list e2e/editar-consulta.spec.ts`.
- [ ] T026 `/code-review` y corregir; marcar las tareas hechas y la spec «Implementada».
- [ ] T027 Push y PR a `develop`, recordando en la descripción aplicar la `0030` en DEV antes del merge; vigilar el CI.

---

## Dependencias y orden

- Fase 1 → Fase 2 (las columnas) → Historias.
- US1 bloquea US2 y US3 (la página y el modo edición del formulario). US2 y US3 tocan `ConsultationForm.tsx`/`MedicationFieldset.tsx`: en serie.
- Fase final después de las tres historias.

## Ejecución en paralelo

- Fase 2: T003 y T004 juntos; T010 y T011 juntos después de T009.
- US1: T013, T014 y T015 juntos (archivos distintos); luego T016 → T017 → T018.
- Final: T023 y T024 juntos.

## Estrategia

MVP = Fases 1–3 (corregir datos sin tocar horarios): ya resuelve el error más común. Luego US2 (horario) y US3 (agregar/quitar),
cada una con su commit, y la fase final con E2E, docs, revisión y PR.
