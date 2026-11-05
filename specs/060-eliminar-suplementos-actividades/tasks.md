# Tareas: Eliminar suplementos y actividades

**Entrada**: documentos de diseño de `specs/060-eliminar-suplementos-actividades/`
**Prerrequisitos**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Pruebas**: obligatorias (Principio VI): backend contra la base real, frontend > 90 %, E2E a 390 y 1280 px.

**Commits**: uno por fase, en `feature/060-eliminar-suplementos-actividades`. Archivos CRLF: editar con scripts que preserven los finales de línea.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [X] T001 Crear la carpeta de la spec con spec.md, plan.md, research.md, data-model.md, contracts/api.md y quickstart.md en specs/060-eliminar-suplementos-actividades/

---

## Fase 2: Fundamental (backend, bloquea todas las historias)

- [X] T002 `ErrRoutineHasMarks` en backend/internal/supplement/errors.go
- [X] T003 `RoutineView.HasMarks` (backend/internal/supplement/model.go) y columna derivada `EXISTS (SELECT 1 FROM supplement_doses sd WHERE sd.routine_id = r.id AND sd.taken)` en `routineSelect`/`scanRoutine` (backend/internal/supplement/repository.go)
- [X] T004 `Repository.Delete` en backend/internal/supplement/mutations.go: `lockRoutine`, tomas `FOR UPDATE`, `bool_or(taken)` → `ErrRoutineHasMarks`; si no, borrar `supplement_dose_reminders`, `child_supplement_dose_reminders`, `supplement_doses`, `supplement_muted` y `supplement_routines` en ese orden, en la misma transacción
- [X] T005 `Service.Delete` en backend/internal/supplement/service.go
- [X] T006 `hasMarks` en `routineResponse` (backend/internal/supplement/handler.go); handler `DeleteRoutine` (204) con Swagger y 409 `routine_has_marks` en `writeMutationError` (backend/internal/supplement/handler_mutations.go)
- [X] T007 Ruta `r.With(fullRoutine).Delete("/routines/{routineId}", …)` en backend/internal/server/router.go (no bajo `/child-device`) y fila «delete routine» + `fullRoutes` en backend/internal/server/router_test.go
- [X] T008 Registrar `DELETE /routines/{routineId}` en los routers de prueba de backend/internal/supplement/handler_test.go y backend/internal/supplement/personal_test.go, y una entrada «delete» en las dos tablas de backend/internal/supplement/unavailable_test.go (500 con la base caída, 404 con un id desconocido)
- [X] T009 Pruebas del repositorio en backend/internal/supplement/delete_test.go contra la base real: sin marcas borra la rutina, todas sus tomas, sus `supplement_dose_reminders`, `child_supplement_dose_reminders` y `supplement_muted` (contar filas antes y después); con una marca → `ErrRoutineHasMarks` y no se borra nada; marcada y desmarcada → se borra; rutina desconocida → `ErrRoutineNotFound`; finalizada y pausada sin marcas → se borran; personal → se borra; cuenta en plan gratuito → se borra; `HasMarks` del detalle `false`/`true`; marca y borrado concurrentes nunca dejan una marca perdida
- [X] T010 Pruebas del handler en backend/internal/supplement/delete_test.go: 204 y luego `GET` 404; 409 con `{"error":"routine_has_marks"}`; 404 con un id desconocido y con `not-a-uuid`; `hasMarks` en la respuesta JSON del detalle
- [X] T011 Regenerar Swagger (`go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd`) en backend/internal/docs/; `go vet ./...` y `go test ./internal/supplement/ ./internal/server/` con y sin `pool_max_conns=4`

**Punto de control**: el API borra según la regla. Commit «feat(060): eliminar suplementos y actividades — backend».

---

## Fase 3: Historia de Usuario 1 - Quitar lo capturado por error (P1) 🎯 MVP

**Objetivo**: desde el detalle, «Eliminar» → confirmar → vuelve al hijo o a `/yo#…` y ya no aparece.

**Prueba independiente**: un suplemento sin marcas se elimina y desaparece de la lista del hijo.

- [X] T012 [P] [US1] `hasMarks: boolean` en `Routine` (frontend/src/features/supplements/types.ts) y en el fixture de frontend/src/features/supplements/supplements.test-utils.ts (por omisión `false`)
- [X] T013 [P] [US1] `deleteRoutine(routineId, token)` (`DELETE /routines/{id}`, 204) y el kind `routine_has_marks` (409) en frontend/src/features/supplements/api.ts, con pruebas en frontend/src/features/supplements/api.test.ts
- [X] T014 [P] [US1] Textos en frontend/src/features/supplements/deleteCopy.ts (botón «Eliminar suplemento»/«Eliminar actividad», título «¿Eliminar <nombre>?», tres filas: qué se borra —tomas y avisos, para la familia o solo para ti—, que no se puede deshacer, y que para guardar el registro se usa «Finalizar»; «Eliminar», «Eliminando…», el mensaje del 409 y el error genérico) con prueba de redacción en frontend/src/features/supplements/deleteCopy.test.ts (sin palabras que evalúen; dice «No se puede deshacer»)
- [X] T015 [US1] `useDeleteRoutine(routineId)` en frontend/src/features/supplements/hooks.ts: al terminar `removeQueries(['routine', routineId])` e invalida `['routines']` y `['overview']`
- [X] T016 [US1] frontend/src/features/supplements/DeleteRoutineDialog.tsx sobre `ConfirmDialog` (`tone="ink"`, foco de regreso al botón) con su prueba frontend/src/features/supplements/DeleteRoutineDialog.test.tsx (personal y familia, suplemento y actividad)
- [X] T017 [US1] En frontend/src/features/supplements/RoutineDetailPage.tsx: botón de texto «Eliminar …» en la tarjeta de datos, visible con `canManage && !routine.hasMarks` en cualquier estado; abre el diálogo; al confirmar `navigate(backTo, { replace: true })`; pruebas en frontend/src/features/supplements/RoutineDetailPage.test.tsx (hijo → `/children/:id`, personal → `/yo#suplementos` y `/yo#actividades`, cancelar no llama al API, error genérico)

**Punto de control**: MVP usable.

---

## Fase 4: Historia de Usuario 2 - Con marcas se finaliza (P2)

- [X] T018 [US2] En frontend/src/features/supplements/RoutineDetailPage.tsx: un 409 `routine_has_marks` cierra el diálogo, vuelve a leer la rutina y muestra el mensaje que sugiere finalizar; pruebas en frontend/src/features/supplements/RoutineDetailPage.test.tsx (con `hasMarks: true` no hay botón; 409 → mensaje)

---

## Fase 5: Historia de Usuario 3 - Solo quien puede todo (P3)

- [X] T019 [US3] Pruebas en frontend/src/features/supplements/RoutineDetailPage.test.tsx: un Cuidador (`canManage` falso) no ve «Eliminar»; con el plan vencido la dueña sí lo ve
- [X] T020 [US3] Pruebas de nivel en backend/internal/supplement/delete_test.go: Cuidador → 403, la rutina personal de otra persona → 403; la tabla de backend/internal/server/router_test.go cubre los roles

---

## Fase 6: Pulido

- [X] T021 E2E frontend/e2e/eliminar-suplementos.spec.ts (Chromium, 390 y 1280 px): crear un suplemento de un hijo, eliminarlo, ya no está; marcar una toma de otro y comprobar que no hay botón; una actividad personal eliminada vuelve a `/yo#actividades`
- [X] T022 [P] Docs: entrada en CLAUDE.md (raíz), backend/CLAUDE.md, frontend/CLAUDE.md; BACKLOG.md marca «Editar y eliminar suplementos y actividades» y «Editar consultas y medicamentos» (spec 051) como hechos
- [ ] T023 Verificación: `go vet`, `go test ./...` con y sin `pool_max_conns=4`, Swagger sin cambios, `npx vitest run --coverage --testTimeout=30000 --maxWorkers=4` (> 90 %), `npx tsc -b`, `npm run build`, `npx eslint .`, `npx playwright test --list`
- [ ] T024 `/code-review`, push y PR a `develop` (ccd_pr `get_status` + `set_monitor`); no se fusiona

---

## Dependencias

- Fase 2 bloquea todo. US1 → US2 y US3 (mismo archivo `RoutineDetailPage.tsx`, en orden). Pulido al final.
- Paralelo: T012, T013 y T014 (archivos distintos); T009/T010 y T008 tocan archivos distintos; T022 junto con T021.

## Estrategia

MVP = Fases 2 y 3. US2 y US3 son una pieza chica cada una sobre el mismo detalle.
