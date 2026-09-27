# Contratos: API de recordatorios

Todas las respuestas pasan por `*httpx.Responder` (spec 002). Salvo `POST /reminders/actions/taken`, todo exige
`Authorization: Bearer <token de sesión de Clerk>` (401 sin él). Las rutas con `{accountId}` llevan `RequireOwner`
(403 si la sesión no es dueña; 404 si el id está mal formado), como en la spec 008. Se registran en
`internal/server/router.go` y cada una tiene su fila en `router_test.go`.

Los mensajes de error son textos fijos; ninguno incluye el `endpoint`, las claves del dispositivo ni el token de acción.

---

## `GET /reminders/config`

Lo necesario para suscribir un dispositivo.

**200**
```json
{ "available": true, "vapidPublicKey": "BEl62iUY…" }
```
**200** (el backend no tiene claves VAPID, research R3)
```json
{ "available": false, "vapidPublicKey": null }
```

---

## `POST /accounts/{accountId}/reminder-devices`

Activa los recordatorios en el dispositivo actual. Idempotente por `endpoint`: activar otra vez actualiza la fila; si el
`endpoint` era de otra cuenta, pasa a esta (research R10).

**Petición** (la `PushSubscription` del navegador, `toJSON()`)
```json
{ "endpoint": "https://fcm.googleapis.com/fcm/send/…", "keys": { "p256dh": "BNc…", "auth": "tBH…" } }
```
**201** creado · **200** ya existía y se reactivó
```json
{ "id": "5f0c…", "active": true, "activatedAt": "2026-09-27T18:04:05Z" }
```
**400** `validation_error` — falta `endpoint`, `keys.p256dh` o `keys.auth`, el `endpoint` no es `https://` (en
desarrollo se acepta `http://localhost`/`127.0.0.1`), o JSON mal formado.
**401** · **403** · **404** · **503** `reminders_unavailable` si el backend no tiene claves VAPID.

---

## `POST /accounts/{accountId}/reminder-devices/remove`

Desactiva el dispositivo actual (FR-011, FR-012). Idempotente.

**Petición**
```json
{ "endpoint": "https://fcm.googleapis.com/fcm/send/…" }
```
**204** — desactivado, o no existía para esta cuenta (no se revela si el `endpoint` es de otra cuenta).
**400** `validation_error` · **401** · **403** · **404**

---

## `PATCH /accounts/{accountId}/reminder-settings`

Cambia el texto de los avisos para toda la cuenta (FR-008).

**Petición**
```json
{ "reminderDetail": "generic" }
```
**200** — la cuenta completa (misma forma que `GET /accounts/me`), con el campo nuevo:
```json
{ "id": "…", "…": "…", "reminderDetail": "generic" }
```
**400** `validation_error` — valor distinto de `"detailed"` o `"generic"`. · **401** · **403** · **404**

---

## Respuestas de cuenta (cambio)

`GET /accounts/me`, `GET /accounts/{id}`, `POST /accounts`, `POST /accounts/{id}/children` y
`PATCH /accounts/{id}/reminder-settings` agregan:
```json
{ "reminderDetail": null }
```
`null` = el padre aún no eligió (la primera activación se lo pide).

---

## `POST /reminders/actions/taken` — pública, sin sesión

La acción "Tomada" del aviso (research R7). Solo marca la toma del token.

**Petición**
```json
{ "token": "eyJk…" }
```
**204** — la toma quedó marcada (o ya lo estaba).
**400** `validation_error` — falta el token o está mal formado.
**403** `invalid_action_token` — firma inválida, vencido, dispositivo inactivo o de otra cuenta. Mismo mensaje para
todos los casos.

---

## Contenido cifrado del aviso (backend → service worker)

No es un endpoint: es lo que el backend cifra y envía al `endpoint` de cada dispositivo (`TTL: 3600`,
`Urgency: high`, `Content-Encoding: aes128gcm`).

```json
{
  "kind": "detailed",
  "doseId": "…",
  "consultationId": "…",
  "scheduledAt": "2026-09-27T14:00:00Z",
  "medication": "Amoxicilina",
  "child": "Mateo",
  "actionToken": "eyJk…"
}
```
Con `"kind": "generic"` no van `medication` ni `child`.

El service worker muestra: título **"Toma programada"**; cuerpo **"Amoxicilina · 8:00 · Mateo"** o
**"Hay una toma programada · 8:00"** (hora en la zona del dispositivo); `tag: "dose-<doseId>"`; acción
**"Tomada"** donde el sistema la admite; al tocarlo abre `/consultations/{consultationId}`.
