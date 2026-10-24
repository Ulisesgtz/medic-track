# Investigación: Cobro del plan completo con Mercado Pago

**Spec**: [spec.md](spec.md) · **Fecha**: 2026-10-15

Toda la documentación de Mercado Pago se leyó el 2026-10-15; las fuentes están al final. Donde la documentación no alcanza a responder, la decisión dice **«a verificar en el spike»** (tarea T001 del plan: una prueba corta contra el entorno de pruebas de Mercado Pago antes de construir lo demás).

## R1 — Cómo se contrata sin que la tarjeta toque el servidor

**Decisión**: **suscripción alojada por Mercado Pago**. El backend crea la suscripción con `POST /preapproval` en estado `pending` (sin tarjeta), con `payer_email` (el correo de la cuenta), `external_reference` (el id de la cuenta de PediTrack), `reason`, `auto_recurring` (frecuencia 12 meses, `transaction_amount` 499, `currency_id` MXN), `back_url` (la pantalla de regreso de la app) y `notification_url`. La respuesta trae el `init_point`: la dirección de la página de Mercado Pago donde la persona **captura su tarjeta**. El navegador se manda ahí; al terminar vuelve a `back_url`.

**Justificación**:
- La tarjeta se captura **solo en una página de Mercado Pago** (Principio II): ni siquiera pasa por un componente de PediTrack, así que no hay que cargar el SDK de Mercado Pago, la CSP del frontend no cambia y no hay formulario de tarjeta que mantener ni probar (PCI queda del lado del proveedor).
- La documentación de «suscripción sin plan asociado → pagos pendientes» describe exactamente este modelo: *el medio de pago no se define al crear la suscripción*, y se completa dejando que el comprador pague con el medio de su elección ([fuente 3](#fuentes)).
- Mantiene el precio y la frecuencia **en nuestro código** (una sola fuente: el servidor), sin depender de que el plan del panel coincida.

**Alternativas consideradas**:
- **Suscripción con el plan del panel** (`preapproval_plan_id`) y `card_token_id` generado en el navegador con el SDK/Bricks de Mercado Pago ([fuente 1](#fuentes)): la tarjeta tampoco toca nuestro servidor (la tokeniza el SDK), pero exige cargar el SDK en la PWA, ampliar la CSP, construir el formulario de tarjeta y ligar el id del plan. Se deja como **plan B** si el spike muestra que el modo alojado no sirve en México.
- **Enlace hospedado del plan** (`init_point` de `/preapproval_plan`): el enlace público del plan no lleva nuestra `external_reference`, así que no se sabría qué cuenta pagó. Descartada.

**A verificar en el spike**: (a) que `POST /preapproval` en `pending` devuelva `init_point` y que el comprador pueda dejar su tarjeta ahí (la documentación de pagos pendientes lo describe pero no muestra la respuesta); (b) qué parámetros agrega Mercado Pago a `back_url` al volver (la app **no** debe fiarse de ellos: solo consulta el estado a su propio servidor); (c) que se pueda pagar con tarjetas de prueba con usuarios de prueba.

**Qué datos recibe Mercado Pago**: el correo de la cuenta pagadora, el id de la cuenta de PediTrack (como referencia), el monto y la frecuencia, y las direcciones de regreso y de avisos. **Nunca** nombres de hijos, datos de salud, consultas ni nada de la familia.

## R2 — Los avisos (webhooks)

**Hechos de la documentación** ([fuentes 2 y 4](#fuentes)):
- Temas de suscripción: `subscription_preapproval` (creación y cambios), `subscription_authorized_payment` (cada cobro recurrente), `subscription_preapproval_plan` y `payment`.
- El aviso trae solo identificadores (`type`, `action`, `data.id`); el estado real se consulta a la API: `GET /preapproval/{id}`, `GET /authorized_payments/{id}`, `GET /v1/payments/{id}`.
- **Para suscripciones, el método «Tus integraciones» del panel no está disponible**: la dirección de avisos se manda **al crear** (`notification_url`) y esa tiene prioridad ([fuente 2](#fuentes)).
- Firma: cabecera `x-signature` con la forma `ts=<número>,v1=<hex>`; el mensaje firmado (manifest) es `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` (con la `;` final; se omite el pedazo cuyo valor no venga en el aviso; si el `data.id` es alfanumérico va en minúsculas), HMAC-SHA256 en hexadecimal con la **clave secreta** que muestra el panel (Webhooks → Configurar notificaciones), comparado con `v1`; `ts` sirve para fijar una tolerancia de tiempo ([fuente 4](#fuentes)).
- El receptor debe responder **200 o 201 en menos de 22 segundos**; si no, Mercado Pago reintenta cada 15 minutos (y luego con intervalos mayores).

**Decisión**: un endpoint público (`POST /payments/webhooks/mercadopago`) que **(1)** valida la firma con comparación en tiempo constante y una tolerancia de **5 minutos** en `ts`; **(2)** responde 200 de inmediato tras anotar el evento; **(3)** procesa **consultando el recurso a la API de Mercado Pago con el access token** y nunca usando el cuerpo del aviso como verdad; y **(4)** es idempotente: el resultado se calcula del estado actual del recurso (así un aviso repetido o fuera de orden da el mismo resultado) y cada evento se anota con una llave `tipo|id|estado|última_modificación` única.

**Justificación**: consultar el recurso es el patrón que el propio Mercado Pago recomienda y elimina la dependencia del orden; la firma evita que cualquiera nos haga gastar consultas; responder rápido evita reintentos.

**Fallo de la firma** → 401 sin escribir en `error_logs` (`WriteJSONErrorUnlogged`: cualquiera lo puede provocar), como el 403 de «Tomada»; y el límite estricto de peticiones del spec 037.

**A verificar en el spike (riesgo R9)**: que los avisos de **suscripción** vengan firmados con la clave de la aplicación aun sin usar «Tus integraciones». **Si no vinieran firmados**, el plan no se debilita en lo esencial porque el estado se consulta siempre al proveedor; en ese caso la firma pasa a ser una **defensa adicional opcional** (`MERCADOPAGO_WEBHOOK_SECRET` vacío ⇒ se acepta el aviso pero igual se consulta el recurso, con el límite de peticiones) y se anota la decisión en la spec.

## R3 — Modelo de datos y cómo se deriva el plan

**Decisión**: dos tablas nuevas y una marca de origen del plan (migración `0027`).
- `subscriptions`: la suscripción de una cuenta dueña con su estado **propio** (`pending`, `active`, `grace`, `canceled`, `ended`), `paid_through` (hasta cuándo está pagado), `next_renewal_at`, `grace_until`, el id del proveedor y la dirección de pago de la suscripción pendiente. Un índice único parcial: **una suscripción no terminada por cuenta**.
- `payment_events`: una fila por aviso procesado con su llave única; sin datos personales.
- `accounts.plan_source` (`manual` por omisión | `subscription`): quién decide el plan de esa cuenta.

**`accounts.plan` se materializa**: es lo que ya leen ~38 lugares (acceso por familia, límite de hijos, reglas del plan gratuito, planes, citas, suplementos). Cada vez que cambia el estado de una suscripción (aviso, cancelación, barrido) **en la misma transacción** y con la fila de la cuenta bloqueada, una función única (`payments.Recompute`) pone `accounts.plan` en `paid` o `free` **solo si** `plan_source = 'subscription'` (o si la cuenta pasa a serlo al activar su primera suscripción). Las cuentas con plan dado a mano (`manual`) **no se tocan** (FR-012).

**Regla de plan**: la cuenta es `paid` mientras tenga una suscripción en `active`, en `grace` (antes de `grace_until`) o en `canceled` con `paid_through` por delante; `free` en `ended` o sin suscripción.

**Barrido por reloj**: lo que depende solo del tiempo (la gracia que se acaba, el periodo cancelado que ya terminó) lo resuelve un proceso en segundo plano (`payments.RunSweeper`, cada minuto, en el proceso del API como `supplement.RunPlanner`): pone `ended` y recalcula el plan. Reporta fallas como `job:payments` (kind `sweep`).

**Justificación frente a «derivar en cada lectura»**: derivar el plan con `now()` obligaría a cambiar los ~38 lugares que leen `accounts.plan` (riesgo alto en código ya probado y compartido por todo el producto) y a añadir un `JOIN` a cada petición. Materializar con barrido deja **una sola** función que escribe el plan y todo el código existente intacto; el costo es un retraso máximo de un minuto en vencimientos, aceptable (un plan que vence hace un minuto no daña a nadie) y compatible con la regla «derivado en cada petición» de la spec 032 porque la familia sigue leyendo el plan del dueño en cada petición.

**Reconciliación**: cada 30 minutos el mismo proceso consulta al proveedor las suscripciones no terminadas (acotado a 50 por vuelta) para sanar avisos perdidos; kind `reconcile`.

## R4 — La regla de las personas invitadas (FR-003, FR-003b)

**Decisión**: una función única `payments.CanSubscribe(ctx, accountID)` que responde `ok`, o el motivo: `already_paid` (la cuenta ya tiene plan completo: propio, por suscripción o dado a mano), `covered_by_family` (con el nombre de pila de la dueña: la cuenta es integrante **activa** de la familia de **otra** cuenta cuyo `accounts.plan = 'paid'`), `pending` (ya tiene una suscripción pendiente reciente; se reutiliza su dirección de pago) o `unavailable` (cobro no configurado). Reutiliza la consulta que ya existe en `internal/family` (la membresía activa y el plan del dueño: `Repository.Owner`/la vista de familia) en lugar de duplicar SQL.

«Familia vigente» = `owner.plan = 'paid'`, y como el plan se materializa y **una cancelación con vigencia por delante deja el plan en `paid`** hasta que el barrido lo termina, la regla del dueño del producto (cancelada con tiempo pagado **todavía cuenta como vigente**) se cumple sola, sin código especial. Cuando la familia deja de ser vigente la persona vuelve a poder contratar en la siguiente consulta (no se guarda nada que «liberar»).

El servidor aplica la regla **dentro de la transacción de creación**, con la fila de la cuenta bloqueada (`FOR UPDATE`), para que dos intentos a la vez no creen dos suscripciones (FR-011, SC-006).

## R5 — Endpoints

Cuatro, todos por `*httpx.Responder`: `POST /accounts/{id}/subscription` (iniciar; `ownsAccount`), `GET /accounts/{id}/subscription` (estado: lo que necesita `/planes` y la pantalla de regreso; `ownsAccount`), `POST /accounts/{id}/subscription/cancel` (`ownsAccount`) y `POST /payments/webhooks/mercadopago` (público, límite estricto). Contratos en [contracts/api.md](contracts/api.md) y [contracts/webhook.md](contracts/webhook.md). `ownsAccount` es la guardia correcta: cada persona contrata **para su propia cuenta**; ser invitada se decide en `CanSubscribe`, no en la guardia.

## R6 — El proveedor falso

**Decisión**: una interfaz `Provider` (`CreateSubscription`, `GetSubscription`, `GetAuthorizedPayment`, `CancelSubscription`) con dos implementaciones: `MercadoPago` (HTTP con timeout, sin redirecciones, el access token solo en la cabecera) y `Fake` (en memoria), elegida con `PAYMENTS_DRIVER=fake` (como `MAIL_DRIVER=discard`: para las E2E y el desarrollo, **nunca** en producción). Con `fake` el API registra además rutas de ayuda `POST /payments/fake/{subscriptionId}/{approve|reject|cancel|renew}` (404 si el driver no es `fake`) que mueven el estado del falso y llaman al mismo procesamiento que el webhook. Las pruebas del backend usan un `httptest.Server` que imita a Mercado Pago para cubrir la implementación real (cuerpos, errores, tiempos de espera).

## R7 — Frontend

`/planes` pide `GET /accounts/{id}/subscription`: el servidor dice `available` (cobro configurado), `canSubscribe` con su motivo, el estado de la suscripción y las fechas; **`PAYMENT_AVAILABLE` deja de ser una constante** y pasa a ser lo que diga el servidor. Estados neutrales en `planCopy.ts` (lugar único de los textos), con una prueba de texto que impide urgencia, descuentos y consejos de salud. Nueva ruta `/planes/regreso` (consulta el estado cada 3 s hasta que deje de estar `pending`, con tope, sin ofrecer pagar de nuevo). Cancelar usa el `ConfirmDialog` de la familia. **La CSP no cambia** (la captura de tarjeta ocurre en la página de Mercado Pago; una navegación de página completa no la limita `connect-src`): se verifica en el spike.

## R8 — Configuración

`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `PAYMENTS_DRIVER` (`mercadopago` por omisión; `fake`), `PAYMENTS_WEBHOOK_URL` (la dirección pública del aviso, p. ej. `https://api-dev.pedi-track.com/payments/webhooks/mercadopago`) y `FRONTEND_ORIGIN` (ya existe: `back_url`). **Ya no hacen falta** una llave pública ni el id del plan (R1). Sin el token (y sin `fake`) el cobro queda «no disponible» y `/planes` muestra «Pronto» como hoy. Las reales viven solo en Railway; en DEV, las de **prueba**.

## R9 — Riesgos abiertos

1. **Modo alojado en México / firma de avisos de suscripción** (R1, R2): se resuelven en el spike T001; si falla, plan B del R1 (SDK + `card_token_id`), que agrega CSP y formulario de tarjeta pero conserva el resto del diseño (tablas, avisos, plan, pantallas de estado).
2. **Comisión de las suscripciones** no confirmada (el simulador solo lista Link de pago y Checkout; ambos 3.49 % + $4.64): no cambia el diseño.
3. **La cuenta cobradora es personal** (decisión del dueño): cambiarla después obliga a recrear las suscripciones. Está en los supuestos de la spec.
4. **Estado `paused`** de una suscripción: se trata como cobro fallido (gracia), a confirmar con el comportamiento real.

## Resultado de la revisión de CSP (T051)

`frontend/public/_headers` no define `form-action` ni `navigate-to`, y ir a la página de Mercado Pago es una **navegación de nivel superior** (`window.location.assign`), que la CSP no restringe; el regreso es una navegación normal a `/planes/regreso`. **No hace falta cambiar la CSP** con el modo alojado. Queda por confirmar en el navegador en DEV (T054); con el plan B del spike (SDK + `card_token_id`) habría que agregar los dominios del SDK.

## Resultado del spike (T003) — 2026-10-18 a 2026-10-20, DEV con credenciales de PRUEBA

Hecho por el dueño con el desarrollador contra Mercado Pago de prueba (aplicación `Pedi-track-dev`, México, cuenta vendedora y compradora de prueba). Lo que se comprobó y lo que se aprendió:

- **(a) `POST /preapproval` sin plan** (`status: "pending"`, `auto_recurring` 12 meses, MXN 499, `back_url` y `notification_url` https): funciona y devuelve `init_point`. El comprador de prueba llega a «Confirma tu suscripción» con el monto correcto.
- **El correo del pagador (hallazgo principal).** Con credenciales de **prueba** el sandbox rechaza un pagador real: `400 «Both payer and collector must be real or test users»`. Por eso existe `MERCADOPAGO_TEST_PAYER_EMAIL` (solo DEV; el correo de la cuenta compradora de prueba, con el formato `test_user_<número>@testuser.com`, **no** `TESTUSER<número>@…`: ese daba `400 «User bad request»`). El pago se hace en una ventana **de incógnito** y con la **sesión de la cuenta compradora de prueba**; con la sesión real de Mercado Pago el checkout dice «Una de las partes con la que intentas hacer el pago es de prueba».
- **(b) Regreso del navegador:** vuelve a `/planes/regreso` (la `back_url`).
- **Pago aprobado:** con una tarjeta de prueba de México del panel (la terminada en `3764`, con una suscripción **nueva**: reutilizar la pendiente anterior no sirvió) la suscripción se autorizó («Al día», próximo cobro un año después, «19/10/2027»). Con la Mastercard de prueba (`5474 …`, titular `APRO`) el checkout respondió «No pudimos procesar tu pago»; no se averiguó la causa (el formulario no tiene campo de documento).
- **(d) Avisos (webhook):** el **simulador** del panel sí llega a nuestra URL y recibe `200` (la firma se valida con la clave del **modo de prueba**; hay configuración separada para Prueba y Producción). **Los avisos reales del sandbox no llegaron** (la lista de notificaciones del panel, Ambiente «Prueba», quedó vacía). Por eso se agregó la **revisión al momento** (`Service.CheckNow`, PR 61): al abrir `/planes` o `/planes/regreso` con un pago pendiente, el servidor le pregunta a Mercado Pago (como máximo cada 5 s) y aplica la respuesta; la reconciliación cada 30 min queda de red de seguridad. En producción el aviso debería llegar, pero el diseño ya no depende de él.
- **(c) `GET /preapproval/{id}`** devuelve el estado y `next_payment_date`; la reconciliación y la revisión al momento lo usan.
- **(f) Cancelar:** funciona desde la app (`PUT /preapproval/{id}` con `status: "cancelled"`) y también se detecta una cancelación hecha desde el panel de Mercado Pago.
- **Diagnóstico:** `error_logs` (`job:payments`) ahora trae `(status N slug, causes …: "mensaje limpio")` cuando Mercado Pago rechaza crear la suscripción (PR 58 y 59); nunca correos, tokens ni descripciones por causa.

**Pruebas de la tarea T054 hechas por el dueño, todas bien:** pago aprobado (plan activo, «Vigente hasta …»), cancelar la renovación desde la app y desde el panel de Mercado Pago (el plan sigue hasta la fecha pagada), cobro rechazado (el plan no se activa) y persona invitada a una familia con plan vigente («Incluido por la familia de …», sin botón de pagar).

**Pendiente antes del primer cobro real (no es código):** pasos legales de T053 (contador, términos, aviso de privacidad) y las credenciales reales **solo** en el entorno de producción, sin `MERCADOPAGO_TEST_PAYER_EMAIL`. DEV de Railway nunca lleva credenciales reales.

## Fuentes

1. Mercado Pago, «Subscription with an associated plan»: <https://mercadopago.com.mx/developers/en/docs/subscriptions/integration-configuration/subscription-associated-plan>
2. Mercado Pago, «Webhooks de suscripciones»: <https://www.mercadopago.com.mx/developers/en/docs/subscriptions/additional-content/your-integrations/notifications/webhooks>
3. Mercado Pago, «Subscription without an associated plan — pending payments»: <https://mercadopago.com.ar/developers/en/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments>
4. Mercado Pago, «Notificaciones Webhooks» (firma `x-signature`, manifest, reintentos): <https://www.mercadopago.com/developers/en/docs/your-integrations/notifications/webhooks>
5. Referencia de la API de suscripciones (`/preapproval`, `/preapproval_plan`): <https://www.mercadopago.com/developers/en/reference/subscriptions/_preapproval/post>
