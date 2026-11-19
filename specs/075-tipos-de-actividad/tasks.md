---
description: "Tareas de la spec 075 — Tipos de actividad"
---

# Tareas: Tipos de actividad

**Entrada**: `specs/075-tipos-de-actividad/` (spec, plan, research R1–R9, data-model, contracts/api.md,
contracts/ui.md, referencia/ con el prompt y, cuando llegue, el mock de Claude Design)

**Pruebas**: obligatorias (Principio VI: > 90 % en Go y React; E2E a 390 y 1280 px).

**Organización**: US1 elegir el tipo al crear · US2 segmentos por tipo · US3 cambiar el tipo y las existentes.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [X] T001 Migración `backend/migrations/0041_activity_types.sql` según `data-model.md`: tabla `activity_types` (`code TEXT PRIMARY KEY`, `name TEXT NOT NULL`, `sort_order INTEGER NOT NULL UNIQUE`, `active BOOLEAN NOT NULL DEFAULT true`) con las seis filas (`school` Escolar 10, `sports` Deportiva 20, `arts` Artística y cultural 30, `therapy` Terapia y seguimiento 40, `habits` Hábitos y cuidado diario 50, `other` Otra 60); `supplement_routines.activity_type TEXT NULL REFERENCES activity_types (code)` (sin `ON DELETE`); relleno `habits` en `kind = 'activity'`; después el CHECK `supplement_routines_activity_type_only_activities` `((kind = 'activity') = (activity_type IS NOT NULL))`; aplicarla en la base local

---

## Fase 2: Fundamental

- [X] T002 [P] `backend/internal/catalog`: `ActivityType {Code, Name, Active}`, `Repository.ListActivityTypes` (**todos**, `ORDER BY sort_order`), handler `ListActivityTypes` (`GET /catalog/activity-types`, público, por `*httpx.Responder`, 500 `internal_error`), Swagger; pruebas de repositorio (orden, incluye retirados) y de handler
- [X] T003 [P] Prueba de la migración (paquete `internal/supplement` o `internal/migrations`, con Postgres): una actividad sin tipo y un suplemento con tipo violan el CHECK; las actividades anteriores quedan en `habits`; un tipo usado no se puede borrar
- [X] T004 `backend/internal/supplement`: `Routine`/`RoutineView` ganan `ActivityType *string` (`json:"activityType"`, `null` en suplementos) leído en todas las consultas de rutina (lista del hijo, personal, una rutina, respuestas de crear/editar/pausar/reanudar/finalizar); pruebas
- [X] T005 Registrar `GET /catalog/activity-types` en `backend/internal/server/router.go` junto a los otros catálogos (fuera de la sesión); fila en `router_test.go`; Swagger regenerado
- [X] T006 [P] `frontend/src/shared/catalog/`: `fetchActivityTypes` y `useActivityTypes()` (`queryKey ['catalog','activity-types']`, staleTime 10 min, como `useVaccines`); tipo `ActivityType {code, name, active}`; pruebas
- [X] T007 [P] `frontend/src/features/supplements/types.ts`: `Routine.activityType: string | null`; `RoutineInput.activityType?: string`; ajustar fixtures de pruebas

**Punto de control**: el catálogo y el campo viajan de punta a punta.

---

## Fase 3: US1 — Elegir el tipo al crear (P1) 🎯 MVP

- [X] T008 [US1] `backend/internal/supplement/validate.go` + `handler.go`: `createRoutineRequest`/`Input` ganan `activityType`; con `kind = activity` obligatorio (400 campo `activityType` `required`); con `kind = supplement` debe venir vacío (400 `not_allowed`); en `Repository.Create` y `CreatePersonal` revisar dentro de la transacción que el código exista y esté **activo** (400 `invalid`); pruebas de los tres errores y del alta correcta (hijo y personal)
- [X] T009 [P] [US1] `frontend/src/features/supplements/activityTypeText.ts` (+ prueba de redacción sin juicios ni consejos): «Tipo de actividad», «Elige el tipo de actividad.», «Tipo», «Cambiar», textos del diálogo
- [X] T010 [US1] `routineValues.ts` (`activityType` en `FormValues`, vacío al crear, el guardado al editar; `validateValues` lo exige en actividades; `toInput` lo manda; el 400 de campo `activityType` se mapea al campo) y `RoutineForm.tsx` (el control del mock con los tipos **activos** en su orden; si el guardado está retirado se muestra elegido; un 400 `invalid` recarga el catálogo con `staleTime: 0`); suplementos sin el campo; pruebas a 390 y 1280 px

**Punto de control**: una actividad nueva se guarda con su tipo y no se puede guardar sin él.

---

## Fase 4: US2 — Segmentos por tipo (P1)

- [X] T011 [P] [US2] `frontend/src/features/supplements/groupByActivityType.ts` (puro) + prueba: segmentos en el orden del catálogo (incluidos los retirados por su `sort_order`), sin vacíos, conservando el orden recibido dentro de cada uno; un código desconocido va al final bajo su código; sin catálogo → `null` (lista sin segmentos)
- [X] T012 [US2] `RegistroCompacto.tsx` con `kind = "activity"`: título por segmento y las mismas filas, en los dos `variant` (teléfono y web) según el mock; sin catálogo, la lista de hoy; también en `/yo` (`ProfilePage`); pruebas
- [X] T013 [P] [US2] Sin conexión: comprobar que `['catalog','activity-types']` se persiste (`frontend/src/shared/offline/persistPolicy.ts`, agregar `catalog` si no está) y prueba de que la sección se agrupa con la copia

**Punto de control**: el detalle del hijo y `/yo` muestran las actividades por tipo.

---

## Fase 5: US3 — Cambiar el tipo y las existentes (P2)

- [X] T014 [US3] `backend/internal/supplement`: `PATCH /routines/{id}` acepta `activityType` opcional (ausente o `null` = conserva; presente = activo y solo actividades); `Repository.SetActivityType(ctx, routineID, code)` que solo escribe `activity_type` y `updated_at`, **sin `requirePaid`**, en cualquier estado; 400 `not_allowed` en un suplemento, `invalid` si no existe o está retirado salvo que sea el actual (idempotente); handler `PUT /routines/{routineId}/activity-type`; pruebas: plan vencido → 200, finalizada y pausada → 200, Cuidador → sin permiso, las tomas, marcas y avisos de la rutina iguales antes y después
- [X] T015 [US3] Registrar `PUT /routines/{routineId}/activity-type` en `router.go` con `fullRoutine` (sesión, `RequireNotPending`, **no** en `AllowedWhilePending`, **nunca** bajo `/child-device`); fila en `router_test.go`; Swagger
- [X] T016 [P] [US3] `frontend/src/features/supplements/api.ts` + `hooks.ts`: `setActivityType(routineId, code)` y su mutación (invalida `['routine', id]` y las listas `['routines', …]`); errores mapeados
- [X] T017 [US3] `RoutineDetailPage.tsx`: fila «Tipo» con el nombre; «Cambiar» para quien es `Full` (también con el plan vencido y en pausada o finalizada) que abre `ActivityTypeDialog.tsx` (tipos activos, el actual marcado, «Guardar»/«Cancelar»; hoja en el teléfono, diálogo en la web, según el mock); pruebas

**Punto de control**: el tipo se cambia sin plan y la actividad pasa de segmento sin tocar nada más.

---

## Fase 6: Pulido y transversales

- [X] T018 [P] `backend/internal/dataexport/collect.go`: columna `tipo_de_actividad` (nombre del tipo, `LEFT JOIN activity_types`, vacía en suplementos) en `suplementos_y_actividades`; prueba
- [X] T019 [P] `backend/internal/accountdeletion`: `activity_types` en la lista de tablas sin cuenta de `TestPurge_KnowsEveryTable` (como `symptoms`); `childmerge`: prueba de que una actividad unida conserva su tipo
- [X] T020 Con el mock: completar `contracts/ui.md`, copiar el mock a `referencia/`, medir a 390 y 1280 px y comparar sección por sección; `referencia/desviaciones.md` con cada diferencia y su motivo
- [X] T021 E2E `frontend/e2e/tipos-de-actividad.spec.ts` (390 y 1280 px): crear sin tipo no guarda; crear con tipo; tres tipos → tres segmentos en orden; cambiar el tipo desde el detalle con el plan vencido; `/yo` agrupa; «Hoy» del hijo sin segmentos. Correrla con `scripts/e2e-local.sh e2e/tipos-de-actividad.spec.ts`
- [X] T022 Suites completas: `cd backend && go test ./... -cover` (> 90 % en lo nuevo), `cd frontend && npx vitest run --coverage` y `npx tsc --noEmit`
- [X] T023 Mapas: línea de la spec 075 en `CLAUDE.md`; `backend/CLAUDE.md` (catálogo `activity_types`, ruta de cambio de tipo, migración `0041`); `frontend/CLAUDE.md` (`groupByActivityType`, `ActivityTypeDialog`); BACKLOG: el ítem pasa a «en spec / hecho en `specs/075-tipos-de-actividad/`» (commit directo a `develop`)

---

## Dependencias

- T001 → todo el backend. T002, T004 → T005. T006, T007 → frontend.
- US1 (T008–T010) y US2 (T011–T013) son independientes entre sí tras la Fase 2; US2 se ve con las actividades rellenadas en `habits` aunque US1 no esté.
- US3 (T014–T017) depende de la Fase 2; el diálogo usa los textos de T009.
- T012, T010 y T017 esperan el mock para la forma final (la lógica no).
- T020–T023 al final.

## Paralelo

- Fase 2: T002, T003, T006, T007 a la vez.
- Tras la Fase 2: backend (T008, T014–T015) en paralelo con frontend puro (T009, T011, T016).

## Estrategia

MVP = Fases 1–4 (crear con tipo y ver segmentos). Después US3 y el pulido. El backend completo (T001–T008, T014–T015,
T018–T019) no depende del mock y puede hacerse primero.
