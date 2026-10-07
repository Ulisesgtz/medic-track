# Plan — Parte 2 de la spec 033: próxima cita (historias 4 y 5)

**Rama**: `feature/033b-proxima-cita` | **Fecha**: 2026-10-07 | **Spec**: [../spec.md](../spec.md) (FR-008 a FR-014, FR-017, FR-019, FR-020)
**Mock entregado**: [../referencia/Proxima Cita PediTrack.dc.html](../referencia/Proxima%20Cita%20PediTrack.dc.html) y [decisiones](../referencia/proxima-cita-decisiones.md).

## Resumen

Una **cita** es de la consulta pero **no es registro médico**: se crea, se edita y se marca (realizada / cancelada) sin tocar la consulta (FR-013, excepción
acotada a la spec 004). Se guarda en tablas nuevas (`consultation_appointments`, `appointment_notices`, `appointment_notice_reminders`, `appointment_muted`,
migración `0020`), con un paquete nuevo `internal/appointment`. Los avisos reutilizan el reclamo **por persona** de `internal/reminder` (un tercer reclamo
igual a los de medicamentos y suplementos). Una consulta tiene **a lo más una cita vigente** (`scheduled`); una cancelada o realizada queda en el historial y
se puede anotar otra. Sin cambios a `consultations`, `doses` ni a las tablas de suplementos.

## Decisiones

- **D1 Avisos.** Cada aviso es «tiempo antes» (`lead_minutes`, 1 a 43 200 = 30 días) o «a una hora fija» (`days_before` 0–30 + `at_time` local). Se guarda también su
  `fire_at` (instante real, calculado con la diferencia horaria de la cita) para reclamar con un índice. Máximo **5 por cita**, sin repetidos; el aviso debe caer **antes**
  de la cita. Por omisión (si el cuerpo no trae `notices`): 1 día antes (1440 min) y 2 horas antes (120 min). La lista enviada, aunque vacía, se respeta.
- **D2 Nada atrasado.** Un aviso con `fire_at <= created_at` (ya pasó al guardar) se guarda y se muestra como «ya pasó», pero **nunca se reclama** (`fire_at > created_at`
  en el reclamo). Al editar, los avisos **iguales** que ya existían conservan su fila (los ya enviados no se repiten); si cambia la fecha/hora de la cita, todos se vuelven a crear.
- **D3 Plan.** Crear y editar piden plan de pago (422 `freemium_consultation_limit_exceeded` `reason: "appointments"`, bajo el bloqueo de la cuenta dueña); **marcar
  realizada/cancelada, ver y «Tus avisos» nunca**. Cuenta que deja de pagar: los avisos ya creados siguen (FR-020).
- **D4 Nivel.** Ver y «Tus avisos»: `Mark`. Crear, editar y marcar estado: `Full` (Tutor/dueña); `access.OnAppointment` se resuelve por la consulta.
- **D5 Estado.** `scheduled | done | canceled` guardado; `unmarked` («Pasó sin marcar») **derivado**: `scheduled` cuya hora ya pasó **y** cuyo día local (con la diferencia horaria de la cita) ya terminó.
  Realizada se puede deshacer (`done → scheduled`); cancelada no (se anota otra cita). Quién y cuándo lo cambió se guarda y se muestra («marcada por Ana»).
- **D6 Dos llamadas.** «Nueva consulta» guarda la consulta y luego la cita (`POST /consultations/{id}/appointments`); la fecha anterior a la consulta se valida en el
  cliente **y** en el servidor. Si la cita falla tras guardar la consulta, la app lo dice y la consulta queda (la cita se agrega desde su detalle).
- **D7 Aviso push.** Misma carga que los demás con `source: "appointment"`, `appointmentId`, `startsAt`, `leadMinutes`; en modo con detalle también `child`, `medication`→ no:
  `doctor` y `note`. El texto lo arma el dispositivo (mock sección C): sin imperativos; el genérico no lleva hijo, doctor, hora exacta ni nota. **Sin acción «Tomada»** (no hay token).
- **D8 Pantallas** (móvil y web separadas): campo «Próxima cita» en «Nueva consulta»; tarjeta en el detalle del hijo (la más cercana de todas sus consultas) y de la
  consulta; `/citas/:id/editar`; `/consultations/:id/cita/nueva`; `/children/:id/citas` (historial); diálogo «Cancelar cita». **Desviación**: la pantalla de ajustes N3 del mock
  no se construye (la elección detalle/genérico ya existe en la tarjeta de recordatorios del home).
- **D9 Privacidad.** La nota, el doctor y la fecha nunca van en una dirección ni en `error_logs`; el aviso genérico no lleva datos de salud.

## Modelo (`migrations/0020_create_consultation_appointments.sql`)

`consultation_appointments(id, consultation_id, child_id, account_id, starts_at, utc_offset_minutes, note ≤ 500, status, status_by_account_id, status_at, created_by_account_id, created_at, updated_at)`
con FK compuestas `(consultation_id, child_id)` y `(child_id, account_id)`, único parcial `(consultation_id) WHERE status = 'scheduled'`; `appointment_notices(id, appointment_id, kind,
lead_minutes, days_before, at_time, fire_at, created_at)`; `appointment_notice_reminders(notice_id, account_id, sent_at)` PK pareja; `appointment_muted(appointment_id, account_id, created_at)` PK pareja.

## Contrato (todas por `*httpx.Responder`; fila por rol en `router_test.go`)

| Ruta | Nivel | Notas |
|---|---|---|
| `GET /children/{childId}/appointments` | `Mark` | `{ next, history, paidPlan }`: `next` = la cita vigente más cercana (no `unmarked`) de todas sus consultas; `history` = realizadas, canceladas y `unmarked`, la más reciente primero |
| `GET /consultations/{consultationId}/appointment` | `Mark` | `{ appointment: … \| null, paidPlan }`: la vigente (o `unmarked`) de esa consulta |
| `POST /consultations/{consultationId}/appointments` | `Full`, plan de pago | `{ startsAt, utcOffsetMinutes, note?, notices? }` → 201; 400 `validation_error` (`startsAt` anterior a la consulta, `notices`…); 409 `appointment_exists` si ya hay una vigente |
| `PATCH /appointments/{appointmentId}` | `Full`, plan de pago | misma forma; 409 `appointment_closed` si está realizada o cancelada |
| `POST /appointments/{appointmentId}/status` | `Full` | `{ status: "done" \| "canceled" \| "scheduled" }` (volver a `scheduled` solo desde `done`); 409 `appointment_closed` |
| `PUT /appointments/{appointmentId}/my-reminders` | `Mark` | `{ enabled }` → `{ myReminders }`; 409 si no está vigente |

Forma: `{ id, consultationId, childId, doctorName, consultDate, startsAt, utcOffsetMinutes, note, status (scheduled|done|canceled|unmarked), statusBy, statusAt, createdBy, notices:[{id, kind,
leadMinutes, daysBefore, atTime, label, fireAt, past}], myReminders, canEdit }`.
