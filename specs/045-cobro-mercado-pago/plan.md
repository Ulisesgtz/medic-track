# Plan de Implementación: Cobro del plan completo con Mercado Pago

**Rama**: `feature/045-cobro-mercado-pago` · **Fecha**: 2026-10-15 · **Spec**: [spec.md](spec.md)
**Entrada**: la spec, la constitución, [research.md](research.md) (R1–R9), [data-model.md](data-model.md), [contracts/](contracts/) y [quickstart.md](quickstart.md).

## Resumen

El padre dueño de su cuenta toca «Contratar plan completo», el backend crea una **suscripción pendiente en Mercado Pago** y lo manda a la **página de pago de Mercado Pago** (la tarjeta nunca toca PediTrack). Mercado Pago avisa los resultados a un **webhook público firmado**; el backend **consulta el recurso** al proveedor, guarda el estado en `subscriptions` y recalcula `accounts.plan` con **una sola función** (`payments.Recompute`), que es lo que ya lee todo el producto. Un **barrido por reloj** resuelve gracia y vencimientos. Una regla compartida (`CanSubscribe`) impide contratar a quien ya es cubierta por la familia de otra cuenta con plan vigente. El frontend activa `/planes`, agrega la pantalla de regreso y los estados neutrales.

## Contexto técnico

- **Backend**: Go 1.27, `chi`, PostgreSQL (`pgx`), paquete nuevo `internal/payments`; reutiliza `httpx.Responder`, `ratelimit`, `jobreport`, `access`/`family` (lectura), `errordigest` (ya lee `job:*`).
- **Frontend**: React 19 + TanStack Query + Tailwind v4; `features/plans/`, ruta nueva `/planes/regreso`.
- **Pruebas**: Go con base real y un `httptest.Server` que imita a Mercado Pago; Vitest; Playwright a 390 y 1280 px con `PAYMENTS_DRIVER=fake`.
- **Dependencias nuevas**: ninguna (HTTP estándar, `crypto/hmac`).
- **Restricciones**: la tarjeta nunca toca el servidor; sin datos de salud ni de hijos hacia el proveedor; el plan vencido no oculta nada; sin urgencia ni descuentos.
- **Sin incógnitas abiertas** que bloqueen el diseño; los riesgos **R9** (modo alojado en México, firma de avisos de suscripción) se cierran en el **spike T001** y tienen plan B documentado.

## Verificación de la Constitución

| Principio | Cumplimiento |
|---|---|
| **I — Registra, nunca interpreta** | Ninguna pantalla ni mensaje opina sobre la salud; los textos de estado describen el plan y no urgen (prueba de texto, SC-005). |
| **II — Privacidad** | La tarjeta se captura **solo** en la página de Mercado Pago; al proveedor solo van el correo de la cuenta pagadora, el id de la cuenta, el monto y las direcciones; **nada** de hijos ni de salud. Los registros y `error_logs` nunca llevan tokens, claves, correos ni cuerpo de avisos. El aviso de privacidad y los términos se actualizan antes del primer cobro real (paso del dueño). |
| **III — Stack** | Go + PostgreSQL + React PWA; sin dependencias nuevas; ninguna compra dentro de tienda (PWA). |
| **IV — Freemium disciplinado** | Lo ya registrado **nunca se oculta ni se borra** al vencer (FR-007, SC-003); el plan gratuito sigue siendo de por vida. |
| **V — Simplicidad** | Un paquete, dos tablas y una columna; sin SDK de Mercado Pago en el navegador; sin descuentos, planes mensuales ni medios extra. |
| **VI — Cobertura >90 %** | Proveedor falso + base real para cada caso de la spec; E2E con el falso. |

Reevaluación tras el diseño: **sin violaciones**. La única decisión con costo es **materializar** `accounts.plan` (research R3), justificada porque evita tocar ~38 lugares ya probados.

## Estructura del proyecto

```
backend/
├── migrations/0027_subscriptions.sql        # subscriptions, payment_events, accounts.plan_source
├── internal/payments/
│   ├── model.go          # Status, Subscription, errores (ErrNotAllowed…), Config
│   ├── config.go         # ConfigFromEnv / Available (PAYMENTS_*, MERCADOPAGO_*)
│   ├── provider.go       # interfaz Provider + tipos de respuesta
│   ├── mercadopago.go    # cliente HTTP (timeout, sin redirecciones, token solo en cabecera)
│   ├── fake.go           # proveedor en memoria + rutas de ayuda (PAYMENTS_DRIVER=fake)
│   ├── signature.go      # verificación de x-signature (manifest, HMAC, ts ±5 min)
│   ├── repository.go     # SQL: crear, reutilizar, aplicar estado, Recompute, barrido
│   ├── service.go        # Subscribe/State/Cancel/ProcessNotification + CanSubscribe
│   ├── handler.go        # 3 rutas de la cuenta + webhook (todo por Responder)
│   └── sweeper.go        # RunSweeper (gracia, vencimientos, expiración de pending, reconciliación)
├── internal/server/router.go                # rutas + guardias + (fake) ayudas
├── cmd/api/main.go                          # cableado condicionado a la configuración
frontend/
├── public/_headers                          # sin cambios previstos (se verifica en el spike)
└── src/
    ├── App.tsx                              # /planes/regreso
    └── features/plans/
        ├── api.ts, hooks.ts                 # GET/POST subscription, cancelar
        ├── planCopy.ts                      # textos de estado; PAYMENT_AVAILABLE sale de aquí
        ├── PlansPage.tsx, PlanTarjeta.tsx   # botón activo, «Vigente hasta…», cancelar
        ├── PaymentReturnPage.tsx            # /planes/regreso: consulta y se actualiza sola
        └── subscriptionText.ts              # los estados dichos en palabras neutras
```

## Fases (para `/speckit-tasks`)

1. **Spike T001** (contra el entorno de pruebas de Mercado Pago, con credenciales de prueba que pone el dueño): confirmar R1 (`init_point` en `pending`, pago con tarjeta de prueba, a dónde vuelve) y R2 (firma de avisos de suscripción, `notification_url`). Resultado en `research.md`. Si falla → plan B.
2. **Base de datos y regla de plan**: migración `0027`, `Recompute`, `CanSubscribe`, pruebas con base real (plan manual intacto, invitada bloqueada y liberada, cancelada con tiempo pagado sigue vigente).
3. **Proveedor y firma**: interfaz, cliente real (con `httptest`), falso, verificación de firma.
4. **Servicio y webhook**: crear, estado, cancelar, procesar avisos con idempotencia, carreras; rutas, guardias, `router_test.go`.
5. **Barrido y reconciliación**: `RunSweeper`, reportes `job:payments`, cableado en `cmd/api`.
6. **Frontend**: `/planes` activo, estados neutrales con prueba de texto, cancelar, `/planes/regreso`; unitarias y E2E (390 y 1280 px, proveedor falso).
7. **Documentación y cierre**: `CLAUDE.md` ×3, `DEPLOY.md` (migración antes del backend, variables, webhook), `BACKLOG.md`, verificación completa, revisión de código y PR a `develop`.

## Pasos del dueño del producto (no son código)

- Credenciales **de prueba** de Mercado Pago y su clave secreta de webhook en Railway (DEV) para el spike y las pruebas manuales.
- Antes del primer cobro real: contador (RFC, facturación, nombre legal), términos y aviso de privacidad, credenciales **reales** en Railway.
- Aplicar la migración `0027` en DEV antes de desplegar el backend.
