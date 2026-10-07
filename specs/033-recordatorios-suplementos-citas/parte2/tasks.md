---

description: "Lista de tareas de la spec 033, parte 2: próxima cita (historias 4 y 5)"
---

# Tareas: Próxima cita (parte 2 de la spec 033)

**Entrada**: [plan.md](./plan.md), [../spec.md](../spec.md), [../referencia/proxima-cita-decisiones.md](../referencia/proxima-cita-decisiones.md) y el mock `Proxima Cita PediTrack.dc.html`.
**Pruebas** obligatorias (Principio VI, >90 %), E2E a 390 y 1280 px con dos sesiones. Formato `[ID] [P?] [Historia] Descripción`. Un solo PR; un commit por fase.

## Fase 1: Backend (US4 y US5)

- [x] T101 Migración `backend/migrations/0020_create_consultation_appointments.sql` (cuatro tablas del plan, con CHECK de forma de aviso, nota ≤ 500, estado, único parcial de la cita vigente por consulta); aplicarla a la base local
- [x] T102 [P] [US4] `backend/internal/appointment/{model,errors,notices,validate}.go` puros: `FireAt` de cada tipo de aviso con la diferencia horaria de la cita, etiqueta en español («2 horas antes», «El mismo día a las 07:00»), validación (máximo 5, sin repetidos, antes de la cita, cita no anterior a la consulta, nota ≤ 500), avisos por omisión, `DerivedStatus` («Pasó sin marcar»); pruebas de tabla
- [x] T103 [US4] `repository.go`: `Create` (bloquea la cuenta dueña, plan de pago, una vigente por consulta, avisos), `Get`, `NextForChild`/`HistoryForChild`, `Update` (conserva los avisos iguales y sus recordatorios enviados, recrea los demás), `SetStatus` (con quién y cuándo), `SetMuted`/`MutedAmong`; pruebas contra la base (carreras, plan, estado, avisos conservados)
- [x] T104 [US4] `service.go` y `handler.go` + rutas en `server/router.go` con `access.OnAppointment` (nuevo) y filas por rol en `router_test.go`; Swagger regenerado; la nota y el doctor nunca en `error_logs`
- [x] T105 [US4] `internal/reminder`: reclamo por persona de avisos de cita (`ClaimDueAppointmentNotices`: cita vigente, `fire_at > created_at`, sin quien apagó «Tus avisos»), carga con `source: "appointment"`, sin acción «Tomada»; pruebas
- [x] T106 Verificar: `cd backend && go vet ./... && go test ./... -cover` (>90 %), commit de la fase

## Fase 2: Frontend (US4 y US5)

- [x] T111 [P] `frontend/src/features/appointments/{types,api,hooks,appointmentText}` (+ pruebas): API sin datos del padre en direcciones; cuenta regresiva y fechas en español
- [x] T112 `AppointmentFields.tsx` (CitaCampos): fecha, hora, nota, chips de aviso editables, «+ Agregar aviso» con ejemplos, máximo de 5, aviso que ya pasó, cuenta gratuita deshabilitada con enlace al plan; usado por «Nueva consulta», editar y agregar
- [x] T113 `AppointmentCard.tsx` (CitaTarjeta) en el detalle del hijo y de la consulta (móvil y web), «Tus avisos de esta cita», Editar / Marcar realizada / Cancelar cita, nota para el Cuidador, aviso `role=status` tras marcar
- [x] T114 Páginas `/citas/:id/editar`, `/consultations/:id/cita/nueva`, `/children/:id/citas` (historial), diálogo «Cancelar cita» (ConfirmDialog en `ink`); campo en `ConsultationForm` y guardado en dos llamadas
- [x] T115 Texto del aviso en `reminders/notification.ts` (con detalle y genérico, sin imperativos) y destino al abrir; `FreemiumLimitModal` motivo `appointments`
- [x] T116 Verificar: `npx tsc -p tsconfig.app.json --noEmit && npx eslint . && npx vitest run --coverage` (>90 %), commit de la fase

## Fase 3: E2E y cierre

- [x] T121 `frontend/e2e/proxima-cita.spec.ts` (390 y 1280 px; Tutor, Cuidador con dos sesiones, plan gratuito)
- [ ] T122 Documentación (`CLAUDE.md` ×3, `DEPLOY.md` con la `0020`, `README.md`, `BACKLOG.md`), Swagger, desviaciones del mock, code review, PR a `develop`
