# Contrato: el aviso del proveedor (webhook)

## `POST /payments/webhooks/mercadopago`

**Público** (sin sesión de Clerk, como `POST /reminders/actions/taken`), con el **límite estricto** de peticiones (`StrictRateLimit`, spec 037). Se registra en `server/router.go` con `r.With(strict)` y lleva su fila en el test de rutas públicas. Si el cobro no está configurado, la ruta **no se registra** (404 como una ruta desconocida).

### Entrada

Cabeceras de Mercado Pago: `x-signature` (`ts=<número>,v1=<hex>`) y `x-request-id`. Dirección: `?data.id=<id>&type=<tema>` (y/o cuerpo JSON `{ "type": "...", "action": "...", "data": { "id": "..." } }`). Cuerpo máximo 64 KiB.

Temas que se procesan: `subscription_preapproval`, `subscription_authorized_payment`, `payment`. Cualquier otro tema → **200** sin hacer nada.

### Verificación (antes de todo)

1. Existen `x-signature`, `x-request-id` y `data.id`; si no → **401**.
2. `ts` dentro de ±5 minutos del reloj del servidor; si no → 401.
3. `manifest = "id:" + <data.id en minúsculas si es alfanumérico> + ";request-id:" + <x-request-id> + ";ts:" + <ts> + ";"` (se omite el pedazo cuyo valor falte).
4. HMAC-SHA256 hex de `manifest` con `MERCADOPAGO_WEBHOOK_SECRET`; comparado con `v1` en **tiempo constante** (`subtle.ConstantTimeCompare`). Si no coincide → **401** con `WriteJSONErrorUnlogged` (**sin** escribir en `error_logs`: cualquiera lo puede provocar). Nada de la cabecera ni de la clave se registra.

(Riesgo R9 de `research.md`: si el spike muestra que los avisos de suscripción no vienen firmados, `MERCADOPAGO_WEBHOOK_SECRET` vacío acepta el aviso sin firma —seguirá bajo el límite de peticiones— y de todos modos se consulta el recurso al proveedor.)

### Procesamiento

1. **Consultar el recurso** al proveedor con el access token (`GET /preapproval/{id}`, `GET /authorized_payments/{id}` o `GET /v1/payments/{id}` según el tema). **El cuerpo del aviso nunca decide nada.**
2. Ubicar la suscripción: por `provider_subscription_id` (o, para un pago, por la suscripción a la que pertenece). Si no se conoce → se ignora y se reporta `job:payments` `webhook` («suscripción desconocida»), **200**.
3. `event_key = tipo|id|estado|última_modificación` del recurso **consultado**; `INSERT … ON CONFLICT DO NOTHING` en `payment_events`; si ya existía → **200** (idempotente, nada cambia).
4. En una transacción con la fila de la cuenta bloqueada: aplicar el estado (tabla de abajo) y `payments.Recompute(account)`.
5. Responder **200 en menos de 22 s** (el procesamiento es corto: una consulta y una transacción). Si la consulta al proveedor falla → se reporta (`verify`) y se responde **500** para que Mercado Pago **reintente** (cada 15 min); si ya se recibió y el estado fue aplicado → 200.

### Estados del proveedor → estados propios

| Recurso (estado del proveedor) | Efecto |
|---|---|
| `preapproval` `authorized` con cobro aprobado | `active`; `paid_through = next_payment_date` del proveedor; `next_renewal_at` igual |
| `preapproval` `pending` | sin cambio (sigue `pending`) |
| `preapproval` `paused` | `grace` (`grace_until = ahora + 7 d` si no estaba en gracia) |
| `preapproval` `cancelled` | `canceled` si había periodo pagado (`paid_through > ahora`); `ended` si nunca se pagó |
| `authorized_payment` / `payment` `approved` | `active` y extiende `paid_through` |
| `authorized_payment` / `payment` `rejected` o `recycling` | `grace` (si estaba `active`); no vuelve a empezar la gracia si ya estaba en ella |
| cualquier otro | se anota el evento y no cambia nada |

Como el estado se calcula del recurso consultado, **un aviso repetido o fuera de orden da el mismo resultado** (SC-002).

### Lo que nunca se registra

Cuerpo del aviso, cabeceras, la clave, el access token, correos, direcciones de pago ni cualquier dato del pagador. Los reportes de falla usan mensajes fijos con conteos (`job:payments`; kinds `webhook`, `verify`, `reconcile`, `sweep`, `create`).

## Rutas de ayuda del proveedor falso (solo `PAYMENTS_DRIVER=fake`)

`POST /payments/fake/{subscriptionId}/{approve|reject|cancel|renew}` mueven el estado del falso y ejecutan el mismo procesamiento del webhook. Con cualquier otro driver **no existen** (404). Solo para E2E y desarrollo.
