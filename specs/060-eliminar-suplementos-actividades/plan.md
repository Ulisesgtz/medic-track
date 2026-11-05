# Plan de Implementación: Eliminar suplementos y actividades

**Rama**: `feature/060-eliminar-suplementos-actividades` | **Fecha**: 2026-11-04 | **Spec**: [spec.md](spec.md)
**Entrada**: especificación de `specs/060-eliminar-suplementos-actividades/spec.md`

## Resumen

Una ruta nueva `DELETE /routines/{routineId}` (nivel `Full`, cualquier plan) borra un suplemento o una actividad **solo si ninguna de
sus tomas está marcada**; si no, 409 `routine_has_marks`. Todo en una transacción con la cuenta dueña y la rutina bloqueadas
(`lockRoutine`, el mismo de pausar/editar/finalizar) y sus tomas `FOR UPDATE`. La rutina gana `hasMarks` (derivado, sin columna)
para que el detalle ofrezca «Eliminar» solo cuando se puede. Frontend: botón «Eliminar …» en `RoutineDetailPage` (ambos diseños),
un diálogo neutral `DeleteRoutineDialog` sobre el `ConfirmDialog` de la familia, regreso al hijo o a `/yo#…` y textos en
`deleteCopy.ts` con su prueba de redacción. Sin migración.

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27 (backend), TypeScript + React 19 (frontend PWA)
**Dependencias principales**: pgx v5, chi; TanStack Query, React Router, Tailwind v4
**Almacenamiento**: PostgreSQL — tablas existentes `supplement_routines`, `supplement_doses`, `supplement_dose_reminders`,
`child_supplement_dose_reminders`, `supplement_muted` (sin cambios de esquema)
**Pruebas**: `go test` contra la base real (con y sin `pool_max_conns=4`), Vitest + Testing Library, Playwright (CI)
**Plataforma**: API en Railway, PWA en Cloudflare Pages
**Tipo de proyecto**: web (backend + frontend)
**Metas de rendimiento**: una transacción corta; ninguna consulta extra en las listas (`hasMarks` es un `EXISTS` sobre el índice de `routine_id`)
**Restricciones**: todo por `*httpx.Responder`; nada de texto libre en `error_logs`; la ruta no existe bajo `/child-device`
**Escala**: una rutina tiene a lo más cientos de tomas (14 días de horizonte)

## Verificación de la Constitución

| Principio | Cómo se cumple |
|---|---|
| I. Registra, nunca interpreta | Los textos solo describen qué se borra; ninguno evalúa. Prueba de redacción en `deleteCopy.test.ts`. |
| II. Privacidad | Solo el id va en la dirección; los mensajes de error son fijos, sin el nombre de la rutina. |
| III. El servidor decide | Nivel, marcas y borrado en el servidor, en una transacción con bloqueos; `hasMarks` solo decide si se muestra el botón. |
| IV. Sin barreras por corregir | Cualquier plan: la ruta no consulta el plan. |
| V. Piezas pequeñas | Un endpoint, un diálogo, un archivo de textos. |
| VI. Pruebas | Repo y handler contra la base real, frontend > 90 %, E2E a 390 y 1280 px. |

**Gate**: pasa, sin violaciones. Se revisa igual después del diseño: sin cambios.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/060-eliminar-suplementos-actividades/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Código fuente

```text
backend/internal/supplement/
├── errors.go               # ErrRoutineHasMarks (hecho)
├── model.go, repository.go # RoutineView.HasMarks + EXISTS en routineSelect (hecho)
├── mutations.go            # Repository.Delete (hecho)
├── service.go              # Service.Delete (hecho)
├── handler.go              # hasMarks en la respuesta (hecho)
├── handler_mutations.go    # DeleteRoutine + 409 routine_has_marks (hecho)
├── delete_test.go          # NUEVO: repo y handler
├── handler_test.go, personal_test.go, unavailable_test.go  # la ruta en los routers de prueba
backend/internal/server/router.go, router_test.go          # ruta fullRoutine (hecho) + filas por rol
backend/internal/docs/                                      # Swagger regenerado

frontend/src/features/supplements/
├── types.ts                # hasMarks
├── api.ts, api.test.ts     # deleteRoutine + kind routine_has_marks
├── hooks.ts                # useDeleteRoutine (quita la rutina de la caché, invalida listas y overview)
├── deleteCopy.ts (+ .test.ts)          # NUEVO: textos y prueba de redacción
├── DeleteRoutineDialog.tsx (+ .test)   # NUEVO: ConfirmDialog neutral
├── RoutineDetailPage.tsx (+ .test)     # botón, diálogo, navegación, 409
├── supplements.test-utils.ts           # hasMarks en el fixture
frontend/e2e/eliminar-suplementos.spec.ts   # NUEVO
```

**Decisión de estructura**: todo vive en los módulos que ya tienen suplementos y actividades; no hay paquete nuevo.

## Seguimiento de Complejidad

Sin violaciones que justificar.
