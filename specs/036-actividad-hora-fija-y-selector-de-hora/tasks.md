# Tareas: Actividad a una hora fija y selector de hora (spec 036)

**Entrada**: [plan.md](./plan.md), [spec.md](./spec.md). Un solo PR; un commit.

## Fase 1: Backend

- [x] T501 Migración `0023_activities_at_fixed_hours.sql` y aplicarla a la base local
- [x] T502 `internal/supplement/validate.go`: horas fijas válidas para una actividad; pruebas de tabla y de la actividad a una hora fija
- [x] T503 Prueba HTTP: crear la actividad a horas fijas, «Realizado», casos inválidos; `go vet` y `go test ./... -cover`

## Fase 2: Frontend

- [x] T511 `shared/ui/TimeField.tsx`, `timeField.test-utils.ts` y su prueba
- [x] T512 `RoutineForm.tsx` (modo «A una hora fija», `HoursEditor`, fechas sin desbordar), `routineValues.ts`, `scheduleText.ts`
- [x] T513 `AppointmentFields.tsx` con `TimeField`; actualizar las pruebas de cita y de consulta
- [x] T514 Pruebas del formulario, de los valores y de los textos; `tsc`, `eslint`, cobertura

## Fase 3: E2E y cierre

- [x] T521 `pickTime` en `e2e/helpers.ts`; actualizar `actividades`, `suplementos`, `suplementos-personales` y `proxima-cita`; nueva E2E de la «práctica de fut»
- [x] T522 Documentación (`CLAUDE.md` ×3, `DEPLOY.md`, `README.md`, `BACKLOG.md`), PR
