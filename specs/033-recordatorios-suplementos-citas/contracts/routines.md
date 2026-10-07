# Contrato — Rutinas de suplementos (parte 1 de la spec 033)

Todas las rutas van detrás de `RequireSession`; cada una con su nivel de acceso (`access.OnChild` / `access.OnRoutine`) y su fila por rol en
`router_test.go`. Todo se escribe por `*httpx.Responder`. **El nombre y la nota de una rutina solo viajan en cuerpos JSON, nunca en la dirección.**
Errores comunes: `401` sin sesión, `403 forbidden` sin acceso (también para lo que no existe), `404` para un id mal formado.

## Forma de una rutina

```json
{
  "id": "…", "childId": "…", "name": "Vitamina D", "note": "",
  "period": "daily|weekdays|interval",
  "times": ["08:00"], "weekdays": [0, 2, 4], "intervalHours": null,
  "firstDate": "2026-10-01", "firstTime": null, "endDate": null,
  "status": "active|paused|ended", "pausedAt": null, "endedAt": null,
  "createdBy": "Ana", "createdAt": "2026-10-01T14:00:00Z",
  "myReminders": true,
  "canEdit": true,
  "progress": { "taken": 12, "elapsed": 13, "total": 14 },
  "doses": [ { "id": "…", "scheduledAt": "…", "taken": false, "status": "pending|due|taken|unregistered",
               "takenBy": { "name": "Ana", "at": "…", "mine": true } } ]
}
```

`times` en `HH:MM` locales de la rutina; `weekdays` 0 = lunes. `canEdit` = el nivel de la sesión es `Full` **y** la cuenta dueña es de pago (para no ofrecer un botón que daría 422/403).
`progress.total` cuenta las tomas hasta hoy más, si hay fin, las que faltan; `elapsed` = tomas que ya llegaron; `taken` = marcadas.

## `GET /children/{childId}/routines?from=&to=` — nivel `Mark`

La ventana es el «hoy» local que manda el cliente (como el resumen del hijo; ≤ 48 h). Responde `{ "routines": [ … ], "activeCount": 3, "limit": 10, "paidPlan": true }`:
cada rutina con **solo las tomas de la ventana** en `doses` y la siguiente toma (`nextDose`) cuando hoy no le toca. Orden: activas por hora de su primera toma de hoy,
luego pausadas y terminadas. `paidPlan` es el plan de la cuenta dueña (para mostrar la tarjeta «Plan completo» sin adivinar).

## `POST /children/{childId}/routines` — nivel `Full`, plan de pago

Cuerpo: `{ name, note?, period, times?, weekdays?, intervalHours?, firstDate, firstTime?, endDate?, utcOffsetMinutes }`. `201` con la rutina (sus tomas de hoy).
- `400 validation_error` con `details[{field, message}]` (campos del formulario: `name`, `times`, `weekdays`, `intervalHours`, `firstTime`, `firstDate`, `endDate`).
- `422 freemium_consultation_limit_exceeded` con `reason: "supplements"` — cuenta no de pago.
- `422 routine_limit_exceeded` con `limit: 10` — ya hay 10 activas.

## `GET /routines/{routineId}?from=&to=` — nivel `Mark`

La rutina con sus tomas del rango (un mes del calendario; ≤ 62 días) y su `progress`. `404 routine_not_found` si no existe (tras el 403 de acceso).

## `PATCH /routines/{routineId}` — nivel `Full`, plan de pago, rutina no terminada

Mismo cuerpo que crear (todos los campos; se manda la rutina completa). Aplica **desde la siguiente toma**: borra las tomas futuras sin marcar y regenera; las pasadas y
las marcadas no cambian. `409 routine_ended` si está terminada; mismos `400`/`422` por plan que crear (el tope no aplica a editar).

## `POST /routines/{routineId}/pause` · `/resume` · `/finish` — nivel `Full`

- **pause** (activa → pausada): borra tomas futuras sin marcar; `409 routine_not_active` si no está activa. **No exige plan de pago.**
- **resume** (pausada → activa): regenera desde ahora; exige plan de pago (422 `supplements`) y tope (422 `routine_limit_exceeded`); cuerpo `{ utcOffsetMinutes }`.
- **finish** (activa|pausada → terminada): borra las tomas futuras sin marcar; terminal; idempotente (`200` si ya estaba terminada). **No exige plan de pago.**
Todas responden `200` con la rutina.

## `PATCH /routines/{routineId}/doses/{doseId}` — nivel `Mark`

Cuerpo `{ "taken": true|false }`. Marcar: la primera marca gana; responde `200` con la toma como quedó. Desmarcar: el autor o quien puede todo; si no, `403 forbidden`.
Una toma de otra rutina → `404 dose_not_found`. **Nunca depende del plan** (marcar es seguridad).

## `PUT /routines/{routineId}/my-reminders` — nivel `Mark`

Cuerpo `{ "enabled": true|false }`: apaga o enciende **los avisos de esta rutina para la sesión** (no para los demás). `200 { "myReminders": bool }`. Idempotente. No aplica a
rutinas pausadas o terminadas (`409 routine_not_active`).

## Cambios a contratos existentes

- **`GET /children/{childId}/overview`**: `doses[]` agrega las tomas de suplemento de la ventana con `kind: "supplement"`, `routineId` y el nombre de la rutina en `medicationName`; las de
  medicamento llevan `kind: "medication"`. Los clientes anteriores ignoran lo nuevo. `consultationId` va vacío en las de suplemento.
- **Aviso push** (payload): agrega `routineId` y `source: "supplement"`; en las de suplemento no hay `consultationId`. El genérico sigue sin llevar nombre ni hijo.
- **`POST /reminders/actions/taken`**: sin cambio de forma; la toma puede ser de medicamento o de suplemento.
- **`GET /accounts/me`**: sin cambio.
