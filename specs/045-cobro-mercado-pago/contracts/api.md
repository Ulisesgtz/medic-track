# Contrato: API de la suscripción

Todas las rutas escriben **solo** por `*httpx.Responder`. Las tres de `/accounts/{accountId}/subscription…` van detrás de `RequireSession` y `ownsAccount` (cada persona contrata para **su propia cuenta**; el hecho de ser invitada se decide en la regla `CanSubscribe`, no en la guardia). Un `accountId` mal formado es 404. Cada una lleva su fila en `server/router_test.go` (401 sin sesión, 403 en la cuenta de otra persona, llega al handler con la dueña).

## `GET /accounts/{accountId}/subscription`

El estado para `/planes` y la pantalla de regreso. Nunca depende del plan para leerse.

**200**
```json
{
  "available": true,
  "price": { "amount": 499, "currency": "MXN", "period": "year" },
  "canSubscribe": true,
  "blockedReason": null,
  "coveredBy": null,
  "subscription": {
    "status": "active",
    "paidThrough": "2027-10-15T18:00:00Z",
    "renews": true,
    "nextRenewalAt": "2027-10-15T18:00:00Z",
    "graceUntil": null
  }
}
```
- `available`: el cobro está configurado en este entorno (si es `false`, `/planes` muestra «Pronto» como hoy).
- `canSubscribe` y `blockedReason`: `null` o `already_paid` | `covered_by_family` | `pending` | `unavailable`; con `covered_by_family`, `coveredBy` trae **el nombre de pila** de la dueña de la familia (`"Ana"`; nunca correo).
- `subscription`: `null` si nunca contrató; si no, el estado público (`pending | active | grace | canceled | ended`) con las fechas. **Sin** el id del proveedor, sin direcciones de pago ni datos de tarjeta.
- Una cuenta con plan dado a mano (`plan_source = manual`) y plan completo: `canSubscribe=false`, `blockedReason=already_paid`, `subscription=null`.

**403** la cuenta de otra persona · **401** sin sesión.

## `POST /accounts/{accountId}/subscription`

Inicia el pago. Sin cuerpo.

Dentro de una transacción con la fila de la cuenta bloqueada: aplica `CanSubscribe`, cierra una `canceled` con tiempo pagado si la hay (conservando sus días), reutiliza una `pending` de menos de 24 h (misma dirección de pago) y, si no hay, crea la suscripción en el proveedor y su fila `pending`.

**201** (o **200** si se reutilizó una `pending`)
```json
{ "checkoutUrl": "https://www.mercadopago.com.mx/subscriptions/checkout?...", "status": "pending" }
```
La app manda el navegador a `checkoutUrl`. La dirección vuelve **solo en esta respuesta y en el `GET` mientras esté `pending`** (no es secreta, pero no se escribe en registros).

**Errores**
- **409** `{"error":"subscription_not_allowed","reason":"already_paid"|"covered_by_family","coveredBy":"Ana"}` — la regla de la spec (FR-003, FR-011). Con `covered_by_family`, el mensaje dice solo el nombre de pila.
- **503** `{"error":"payments_unavailable"}` — el cobro no está configurado o el proveedor no respondió (reintentable; fallo registrado como `job:payments` `create`).
- **403**/**401** como arriba.

## `POST /accounts/{accountId}/subscription/cancel`

Cancela la renovación. Sin cuerpo; **idempotente**.

- Una suscripción `active` o `grace` → se cancela en el proveedor y pasa a `canceled` (el plan sigue hasta `paid_through`). **200** con el mismo cuerpo que el `GET`.
- Una `pending` (nunca pagó) → pasa a `ended` y se cancela en el proveedor.
- Ya `canceled`/`ended`, o ninguna: **200** sin cambios (la pantalla dice lo que corresponde).
- **502** `{"error":"provider_error"}` si el proveedor rechaza o no responde: **no se cambia nada** y la persona puede reintentar (nunca queda «cancelada» en PediTrack pero cobrándose en el proveedor).

## Reglas de lectura para el resto del producto

El plan de cualquier cuenta sigue siendo `accounts.plan`; `GET /accounts/me` no cambia de forma. Lo nuevo es solo este recurso.
