# Tareas: Suplementos y Actividades por separado (spec 035)

**Entrada**: [plan.md](./plan.md), [spec.md](./spec.md), [referencia/actividades-decisiones.md](./referencia/actividades-decisiones.md). Un solo PR; un commit por fase.

## Fase 1: Backend

- [x] T401 Migración `0022_activities_and_supplement_kinds.sql` (tipo, ventana, `CHECK`, conversión de las `interval`, tomas futuras regeneradas, índices por tipo); aplicarla a la base local
- [x] T402 `internal/supplement`: `Kind`, `PeriodWindow`, `Generate` por ventana, `validate.go` por tipo, se retira `interval`; pruebas de tabla
- [x] T403 Repositorio: tope y listas por tipo (hijo y personal), `Resume` por tipo, columnas nuevas en `routineSelect`/`insertRoutine`/`Update`; pruebas contra la base
- [x] T404 `POST /routines/{id}/done` (`MarkNext`), `kind` en las listas y en las respuestas, Swagger y fila en `router_test.go`
- [x] T405 `overview_supplements.go` solo suplementos; `internal/reminder`: tipo en el reclamo, `SourceActivity`, payload; pruebas
- [x] T406 Verificar: `cd backend && go vet ./... && go test ./... -cover`, commit

## Fase 2: Frontend

- [x] T411 Tipos, API, hooks por tipo; `scheduleText.ts`; se retiran `RoutineCalendar` y lo de «cada N horas»
- [x] T412 `RegistroSeccion`, `SuplementoTarjeta`, `ActividadTarjeta` y el bloque de progreso (`DayProgress`), con sus pruebas
- [x] T413 `SuplementoDetallePage` y `ActividadDetallePage` («Realizado», «Quitar la última marca»), diálogos de finalizar por tipo
- [x] T414 Formulario de suplemento (sin «cada N horas», horas vacías) y `ActividadForm` con vista previa de avisos; rutas nuevas y redirección por tipo
- [x] T415 Lo personal: `/mis-suplementos` y `/mis-actividades`, bloque del inicio («Tus actividades de hoy») y barra lateral; «Tus avisos» en lo personal; `notification.ts` para actividades
- [x] T416 Pruebas (>90 %), tsc y eslint, commit

## Fase 3: E2E y cierre

- [x] T421 `frontend/e2e/actividades.spec.ts` (390 y 1280 px; actividad del hijo y propia, «Realizado» y quitar, Cuidador con dos sesiones, plan caducado, tope por tipo) y actualizar las E2E de suplementos
- [x] T422 Documentación (`CLAUDE.md` ×3, `DEPLOY.md` con la `0022`, `README.md`, `BACKLOG.md`), Swagger, desviaciones, code review, PR a `develop`
