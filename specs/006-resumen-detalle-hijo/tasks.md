# Tareas: Resumen del detalle del hijo

**Spec**: [spec.md](./spec.md) | **Contrato**: [contracts/get-overview.md](./contracts/get-overview.md)

## Backend (`internal/consultation`)

- [x] **T001** Modelo: `DoseOverview`, `ActiveTreatment`, `ChildOverview`, `Consultation.MedicationCount`, `Consultation.ScheduleLocation`.
- [x] **T002** Repositorio: `GetOverview` (tomas del rango + tratamiento vigente); `GetByChild` cuenta medicamentos; el horario de inicio se lee en `ScheduleLocation`.
- [x] **T003** Servicio: `GetChildOverview` valida el rango (positivo, máximo 48 h); `UTCOffsetMinutes` validado entre -840 y 840.
- [x] **T004** Handler `GET /children/{childId}/overview` por `*httpx.Responder`; `symptoms`/`medicationCount` en la lista; `utcOffsetMinutes` en el alta; ruta en `cmd/api/main.go`; Swagger regenerado.
- [x] **T005** Pruebas: repositorio (rango, tratamiento, sin tratamiento, zona horaria, conteo, error de conexión), servicio (rango, desfase), handler (200, sin tratamiento, 400, 404, 500). Cobertura del paquete 91.8 %.

## Frontend (`features/consultations`)

- [x] **T006** Tipos y `fetchChildOverview`; `utcOffsetMinutes` en el payload del formulario.
- [x] **T007** `shared/date.ts`: `formatTime`, `formatDayMonth`, `localDayRange`; día siempre a dos dígitos.
- [x] **T008** `SummaryCard` con tonos (`plain`, `pending`, `confirmed`, `ink`) y nota; `TodayDosesPanel` con chip marcar/desmarcar.
- [x] **T009** `ConsultationCard` con subtítulo; `ChildDetailPage` con las tres tarjetas y la columna de consultas junto al panel.
- [x] **T010** Pruebas de unidad y E2E; verificación visual contra el mock a 1240 px.

## Verificación

`go test ./... -cover` · `npx vitest run --coverage` · `npx tsc --noEmit && npx eslint .` · `npx playwright test`.
