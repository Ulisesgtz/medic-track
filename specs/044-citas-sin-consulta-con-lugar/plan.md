# Plan de Implementación: Citas sin consulta previa, con doctor y lugar

**Spec**: `specs/044-citas-sin-consulta-con-lugar/spec.md` · **Rama**: `bugfix/044-backlog-campos-proxima-cita` · PR a `develop`

## Resumen

Se reutiliza `internal/appointment` casi entero: la cita deja de exigir consulta, gana doctor y lugar, y hay un endpoint más para crearla desde el hijo. El frontend reutiliza `AppointmentFields`, `AppointmentFormPage` y `AppointmentCard`; solo agrega el botón en la página del hijo y la ruta.

## Contexto técnico

Go + PostgreSQL (`pgx`), chi, React 19 + TanStack Query, Tailwind v4. Sin dependencias nuevas. Constitución: Principio I (nada médico), II (nada a terceros salvo el toque del padre), V (pieza pequeña), VI (>90 %).

## Decisiones (research)

- **R1 — Una cita sin consulta**: `consultation_id` pasa a ser `NULL`-able (migración `0026`); la llave compuesta `(consultation_id, child_id)` solo se revisa cuando trae consulta (MATCH SIMPLE); el índice único parcial de «una vigente por consulta» no estorba (los `NULL` son distintos). Alternativa descartada: crear una consulta «vacía» para colgarla (ensucia el historial y rompe la inmutabilidad de las consultas).
- **R2 — Doctor y lugar en la cita**: columnas `doctor_name`, `location`, `location_url` con `DEFAULT ''` y `CHECK` de largo. El doctor mostrado es `COALESCE(NULLIF(ap.doctor_name,''), co.doctor_name, '')`.
- **R3 — Liga**: solo `https` con host y sin usuario, ≤ 500 (se valida en el cliente y en el servidor; se muestra detrás de un `<a>`, así que nunca `javascript:`).
- **R4 — Google Maps**: enlace `https://www.google.com/maps/search/?api=1&query=…` (documentado por Google, sin llave) + pegar la liga de «Compartir». Selector integrado (Places) descartado: llave y cobro, scripts de Google en la PWA y CSP, y manda lo que se teclea a Google (Principio II).
- **R5 — Avisos**: la consulta de reclamos (`ClaimDueAppointmentNotices`) pasa a `LEFT JOIN consultations`; el payload omite `consultationId` si no hay y el dispositivo abre `/home`.
- **R6 — Accesos**: `access.OnAppointment` ya resuelve por `child_id`, sin tocar.
- **R7 — Layout móvil de fecha y hora**: apilados en móvil (la fecha nativa de iOS mide más que su mitad de la fila y tapaba la hora), lado a lado en web.

## Modelo de datos (migración `0026_standalone_appointments.sql`)

`consultation_appointments`: `consultation_id` NULL-able; `+ doctor_name TEXT NOT NULL DEFAULT '' CHECK (≤200)`, `+ location TEXT NOT NULL DEFAULT '' CHECK (≤300)`, `+ location_url TEXT NOT NULL DEFAULT '' CHECK (≤500)`.

## Contrato (Swagger regenerado)

- `POST /children/{childId}/appointments` (Full sobre el hijo): body = `AppointmentRequest` con `doctor`, `location`, `locationUrl`; 201 `AppointmentResponse`; 400 validación; 404 hijo; 422 `appointments` plan gratuito.
- `AppointmentRequest` y `AppointmentResponse` ganan `doctor` (solo petición), `location` y `locationUrl`; `consultationId` es nulo sin consulta.
- Todo por `*httpx.Responder`; fila nueva en `router_test.go`.

## Estructura

Backend: `migrations/0026…`, `internal/appointment/{model,notices,repository,service,handler}.go`, `internal/reminder/{appointment,service}.go`, `internal/server/router.go`. Frontend: `features/appointments/{types,api,hooks,appointmentValues,appointmentText,AppointmentFields,AppointmentFormPage,AppointmentCard,AppointmentSections}`, `App.tsx` (`/children/:childId/citas/nueva`), `features/reminders/notification.ts`.

## Verificación de la Constitución

I: sin consejos ni interpretación; el aviso sigue sin imperativos. II: el lugar y el doctor solo viajan al API propio; a Google solo si el padre toca el enlace. V: sin tablas nuevas ni dependencias. VI: pruebas con base real (repositorio, handler, router) y Vitest/E2E.

## Quickstart (validación)

1. Aplicar `0026`; arrancar API y frontend. 2. Con un hijo sin consultas y plan de pago: «Agregar cita» → doctor, fecha, hora, lugar → guardar → aparece en «Próxima cita». 3. Tocar «Buscar … en Google Maps» (abre Maps), pegar la liga y guardar → «Abrir en Maps» en la tarjeta. 4. Con un Cuidador no aparece el botón; con plan gratuito aparece el aviso del plan.
