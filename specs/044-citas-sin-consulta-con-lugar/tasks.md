---

description: "Lista de tareas de la spec 044: citas sin consulta previa, con doctor y lugar"
---

# Tareas: Citas sin consulta previa, con doctor y lugar

**Entrada**: `specs/044-citas-sin-consulta-con-lugar/` (spec.md, plan.md). **Pruebas obligatorias** (Principio VI, >90 %). Un solo PR a `develop`, un commit por fase.

**Estado (2026-10-13)**: todas las fases hechas; el CI del PR decide el cierre (las E2E nuevas solo corren allá).

## Fase 1: Backend (bloquea todo)

- [X] T001 Migración `backend/migrations/0026_standalone_appointments.sql` (`consultation_id` NULL-able, `doctor_name`, `location`, `location_url`) y aplicada a la base local
- [X] T002 `internal/appointment`: `Input`/`Normalized`/`Appointment` con doctor, lugar y liga; `ValidateInput` (largos, liga https con host y sin usuario); `appointmentSelect` con `LEFT JOIN consultations`; `Create` compartido (`insertAndCommit`); `CreateForChild` bajo el bloqueo de la cuenta y el plan; `Update` guarda doctor y lugar; deshacer «realizada» sin la regla por consulta si no hay consulta; `Service.CreateForChild`
- [X] T003 `Handler.CreateForChild` + ruta `POST /children/{childId}/appointments` (`fullChild`) + respuesta con `consultationId` nulo, `location`, `locationUrl`; Swagger regenerado
- [X] T004 `internal/reminder`: reclamo con `LEFT JOIN consultations`, doctor propio y `consultationId` omitido si no hay
- [X] T005 Pruebas: `standalone_test.go` (repositorio y reglas), `handler_test.go` (201, 403, 400, 422, 404), fila en `router_test.go`; `go test ./...` en verde (la de `server` es inestable bajo carga: repetir una vez)

## Fase 2: Frontend, datos y formulario

- [X] T006 `types.ts`, `api.ts` (`createChildAppointment`), `hooks.ts` (`useCreateChildAppointment`), `appointmentValues.ts` (doctor, lugar, liga, `isHttpsLink`, validación), `appointmentText.ts` (`mapsSearchUrl`, `placeLink`)
- [X] T007 `AppointmentFields`: doctor (`withDoctor`), Lugar, Liga de Google Maps, enlace «Buscar … en Google Maps»; fecha y hora apiladas en móvil
- [X] T008 `AppointmentFormPage` modo `standalone` (ruta `/children/:childId/citas/nueva`), `App.tsx`, `notification.ts` (`/home` sin consulta)
- [X] T009 Revisar el plan del modo `standalone` en `AppointmentFormPage` (hoy lo deduce de la cuenta y del hijo; debe usar el del hijo con `useChildAccess`) y dejar `tsc` y `eslint` limpios

## Fase 3: Frontend, pantallas y pruebas

- [X] T010 `AppointmentCard`: mostrar lugar y «Abrir en Maps» (`placeLink`), ocultar «De la consulta del…» si `consultationId` es nulo
- [X] T011 `AppointmentSections` (`ChildAppointmentSection`): botón «Agregar cita» (a `/children/:id/citas/nueva`) en el bloque vacío y bajo la tarjeta, solo si `access.canEdit`; la cuenta gratuita ve el aviso del plan; el texto del bloque vacío deja de decir que solo se anotan desde una consulta
- [X] T012 «Nueva consulta» y el historial: lugar y liga también en el formulario de la consulta (el doctor no: es el de la consulta); el historial de citas muestra el lugar si lo hay
- [X] T013 Pruebas Vitest: valores y validación (liga), campos (doctor, lugar, enlace de Maps, apilado móvil/web), tarjeta (lugar y enlace, sin consulta), sección (botón por rol y plan), página standalone (guarda con `POST /children/…`, 422 abre el plan), `notification.ts`; cobertura > 90 %
- [X] T014 E2E `frontend/e2e/proxima-cita.spec.ts` a 390 y 1280 px: agregar una cita desde un hijo sin consultas (doctor, lugar, liga), verla en «Próxima cita», «Abrir en Maps», Cuidador sin botón, plan gratuito con aviso; y que **no hay peticiones a Google al escribir el lugar** (SC-002)

## Fase 4: Documentación y cierre

- [X] T015 Documentar: `CLAUDE.md` raíz (spec 044), `backend/CLAUDE.md` (`internal/appointment`, migración `0026`, ruta nueva), `frontend/CLAUDE.md` (`features/appointments`), `BACKLOG.md` (quitar el traslape de fecha y hora —resuelto aquí— y anotar el selector de lugar integrado con Places como futuro)
- [X] T016 Verificación completa (`go vet`, `go test ./...`, `swag` sin cambios, `vitest --coverage`, `tsc`, `eslint`), revisión de código, commits por fase y PR a `develop`
