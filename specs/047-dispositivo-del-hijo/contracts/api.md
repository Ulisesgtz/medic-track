# Contrato de la API: Dispositivo del hijo (spec 047)

Todas las respuestas se escriben con `*httpx.Responder`. Errores 4xx/5xx de las rutas con sesión de padre se registran como siempre; los de la credencial del hijo (401) se escriben **sin registrar** (`WriteJSONErrorUnlogged`: cualquiera los provoca). La ficha, la credencial y el nombre del dispositivo **nunca** van en una dirección, en `error_logs` ni en un mensaje.

## A. Rutas del padre (sesión de Clerk, `Authorization: Bearer`)

### `POST /children/{childId}/device-links` — `fullChild`
Genera la liga de un dispositivo. Plan de pago decidido **bajo el bloqueo de la cuenta dueña**.

Petición: `{ "name": "Teléfono de Mateo" }`

`201`:
```json
{ "id": "…", "name": "Teléfono de Mateo", "status": "pending",
  "token": "<ficha, solo aquí>", "expiresAt": "2026-10-23T14:00:00Z" }
```
`token` solo se devuelve esta vez; el cliente arma `${origin}/hijo#<token>`.

| Estado | Cuerpo |
|---|---|
| 400 | `validation_error` (`name` vacío o > 40) |
| 403 | sin nivel `Full` |
| 422 | `freemium_consultation_limit_exceeded`, `reason: "child_device"` (plan no pagado) |
| 422 | `child_device_limit_exceeded`, `limit: 3` (quita uno primero) |

### `GET /children/{childId}/device-links` — `seesChild`
Lista (también para un Cuidador, que no puede cambiar nada).

`200`: `{ "links": [{ "id", "name", "status": "pending|active|revoked|expired", "createdAt", "redeemedAt", "lastSeenAt", "expiresAt", "reminderDetail": "generic|detailed" }], "limit": 3, "canManage": true }`

Nunca devuelve huellas ni fichas. Los vínculos `revoked` de más de 30 días no se listan.

### `POST /children/{childId}/device-links/{linkId}/revoke` — `fullChild`
Quita un dispositivo o cancela una liga pendiente. Idempotente. Desactiva sus avisos en la misma transacción. `204`. `404` si el vínculo no es de ese hijo.

### `PATCH /children/{childId}/device-links/{linkId}` — `fullChild`
`{ "reminderDetail": "generic" | "detailed" }` → `200` con el vínculo. Solo cambia lo que dicen los avisos de ese dispositivo.

## B. Públicas (sin sesión)

### `POST /child-device/redeem` — límite estricto
Petición: `{ "token": "<ficha>" }`

`200`: `{ "credential": "<se guarda en el aparato>", "childId": "…", "childFirstName": "Mateo", "rotateAfter": "…" }`

`404` con el **mismo** cuerpo `{ "error": "not_found" }` para liga desconocida, usada, vencida o cancelada. `429` por límite.

## C. Rutas del dispositivo (`Authorization: Device <credencial>`)

Resueltas contra la base en **cada** petición (nada en caché). Credencial desconocida, quitada, vencida o con esquema `Bearer` → `401 unauthorized` (sin registrar). Recurso de otro hijo → `403`.

| Método y ruta | Qué hace | Reutiliza |
|---|---|---|
| `GET /child-device/me` | `{ childId, childFirstName, deviceName, rotateAfter, reminderDetail }` | nuevo |
| `POST /child-device/rotate` | `{ credential, rotateAfter }` (la anterior vale 24 h más) | nuevo |
| `GET /child-device/children/{childId}/overview?from&to` | tomas de hoy | `Consultation.GetChildOverview` |
| `GET /child-device/children/{childId}/routines?kind&from&to` | sus suplementos y actividades | `Supplement.ListRoutines` |
| `PATCH /child-device/consultations/{consultationId}/doses/{doseId}` | marcar / desmarcar **su** marca | `Consultation.UpdateDose` |
| `PATCH /child-device/routines/{routineId}/doses/{doseId}` | ídem para suplementos | `Supplement.UpdateDose` |
| `POST /child-device/routines/{routineId}/done` | «Realizado» | `Supplement.MarkRoutineDone` |
| `GET /child-device/reminders/config` | llave pública de push y disponibilidad | `Reminder.GetConfig` |
| `POST /child-device/reminder-devices` / `…/remove` | registrar o quitar la suscripción push del aparato | nuevos, delgados |

Las respuestas de marcar llevan `takenBy: { name: "Mateo", at, mine: true }` para el hijo. **Ninguna otra ruta existe en `/child-device`**; el resto de la API responde 401 a esta credencial.

## D. Cambios compatibles hacia atrás en rutas existentes

- `takenBy` de una marca hecha por un dispositivo trae `name` = nombre de pila del hijo; las marcas de cuentas no cambian.
- `GET /accounts/me` y `GET /family` no cambian.
- `reminder_devices` ya existente: ninguna ruta de padres cambia su forma.

## E. Aviso push al dispositivo

Mismo formato que los avisos de tomas (`source`: `medication` | `supplement` | `activity`, con la acción «Tomada»/«Realizado» y su token firmado). Texto genérico por omisión; con detalle solo si la persona Tutora lo eligió para ese dispositivo. No hay avisos de citas ni de familia para el hijo.
