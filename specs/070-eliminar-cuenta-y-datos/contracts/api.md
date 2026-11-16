# Contrato del API (spec 070)

Todas las rutas van en `internal/server/router.go`, detrás de `RequireSession`. Cada una lleva su fila en `router_test.go`. Los errores pasan por `*httpx.Responder`. **Ningún dato de salud ni el contenido del archivo viajan en la dirección**.

## `GET /accounts/{accountId}/deletion` — `ownsAccount`

Responde 200:

```json
{ "status": "none" }
```

o, con una solicitud abierta:

```json
{ "status": "pending", "requestedAt": "2026-11-12T18:00:00Z", "scheduledFor": "2026-12-12T18:00:00Z" }
```

## `POST /accounts/{accountId}/deletion` — `ownsAccount`

Cuerpo:

```json
{ "confirm": "ELIMINAR" }
```

1. **401**: sin sesión (como siempre, sin registrar).
2. **403** `reverification-error`: la sesión no se verificó en los últimos 10 minutos (R4). Va con la forma de error de Clerk que `useReverification` reconoce; tampoco se registra en `error_logs`, porque es el flujo normal.
3. **400** `validation_error` `confirm`: no es exactamente `ELIMINAR`.
4. **409** `account_deletion_pending`: ya hay una solicitud abierta (idempotencia: devuelve la misma `scheduledFor`).
5. **502** `subscription_cancel_failed`: Mercado Pago no respondió; **no se guarda nada** (R5).
6. **201**:

```json
{ "status": "pending", "requestedAt": "…", "scheduledFor": "…", "subscriptionCanceled": true, "familyNotified": 2 }
```

Efectos, en este orden:

1. Cancela la suscripción, si hay una abierta.
2. Guarda la solicitud.
3. Desactiva las ligas e invitaciones pendientes de la persona.
4. Pone en cola los correos (R9).

Lo demás se deriva (data-model, «Lo que se deriva…»).

## `POST /accounts/{accountId}/deletion/cancel` — `ownsAccount`

**200** `{ "status": "none" }`. Idempotente: sin solicitud abierta también responde 200. La suscripción cancelada **no** se reactiva sola; la app lo dice («Tu suscripción quedó cancelada; puedes contratarla de nuevo en Planes»).

## `POST /accounts/{accountId}/data-export` — `ownsAccount`, cualquier plan, límite estricto

- Cuerpo vacío.
- **200** `application/zip`, con `Content-Disposition: attachment; filename="peditrack-datos-AAAA-MM-DD.zip"`, enviado **en flujo**.
- Antes de empezar, los errores son JSON por `Responder` (401/403/429).
- Si falla a la mitad, `Responder.Stream` registra una fila fija (`The data export failed while it was being sent`) y corta la conexión: el cliente ve una descarga fallida (R8).

Funciona también con la eliminación programada.

## `POST /family/children-export` — integrante activo de una familia cuya dueña tiene la eliminación programada

- El mismo ZIP, limitado a los hijos de esa familia, sin los datos propios de la dueña: ni sus consultas propias ni sus rutinas personales.
- **404** si la persona no está en una familia con la eliminación programada (el mismo 404 en cualquier otro caso).

## Cambios en respuestas existentes

- `GET /accounts/me`:
  - `deletion: {scheduledFor} | null` para la propia cuenta;
  - `family.deletionScheduledFor: string | null` para una persona invitada.
- **Cualquier otra ruta con sesión** de una cuenta con eliminación programada responde **409** `{"error": "account_deletion_pending", "message": "…", "scheduledFor": "…"}`.
  - **Excepciones** (lista cerrada): las cuatro rutas de arriba que son de la propia cuenta, `GET /accounts/me` y el catálogo público.
  - Este 409 **no se registra** en `error_logs`: es el estado esperado y se repetiría en cada pantalla.
- **Invitar o aceptar** una invitación de una familia cuya dueña tiene la eliminación programada responde **409** `family_deletion_pending`.
- **El nivel de los invitados** sobre los hijos de esa dueña es como máximo `Mark`.
- **Las tomas y los registros sin autor** traen `takenBy: null` / `createdBy: null`; la pantalla no muestra ningún nombre.

## Proceso en segundo plano

`accountdeletion.RunEvery(10 min)` dentro del API. Sus fallas van a `error_logs` como `job:account-deletion`, con el `account_id` mientras la cuenta exista:

| Tipo | Mensaje |
|---|---|
| `clerk` | `The sign-in user could not be deleted` |
| `purge` | `The account data could not be deleted` |
| `notify` | `The account deletion e-mail could not be sent` |

## `cmd/accounts reconcile-deleted` (R7)

Solo de operación, para después de restaurar un respaldo. Lee `DATABASE_URL` y `CLERK_SECRET_KEY`. Imprime cuántas cuentas revisó y cuántas volvió a borrar; nunca imprime correos ni nombres.
