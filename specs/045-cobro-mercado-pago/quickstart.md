# Quickstart: validar el cobro de punta a punta

Guía de validación. Los detalles de implementación están en `plan.md`, `data-model.md` y `contracts/`.

## 1. En local, sin Mercado Pago (proveedor falso)

**Prerrequisitos**: base local con la migración `0027`; `backend/.env.local` con las llaves de Clerk de desarrollo.

```bash
cd backend
PAYMENTS_DRIVER=fake FRONTEND_ORIGIN=http://localhost:5173 go run ./cmd/api
cd ../frontend && npm run dev
```

1. Entra con una cuenta **gratuita** y abre `/planes`: el botón «Contratar plan completo» está activo (el servidor dice que el cobro está disponible).
2. Tócalo: el navegador va a la página de pago **falsa**; elige «Aprobar» (o llama `POST /payments/fake/{id}/approve`).
3. Vuelves a `/planes/regreso`: dice «Estamos confirmando tu pago» y, en segundos, «Tu plan completo está activo» con «Vigente hasta <fecha>». `GET /accounts/me` ya trae `plan: "paid"`.
4. **Rechazo**: contrata otra cuenta y rechaza el cobro de renovación (`/payments/fake/{id}/reject`): el plan sigue completo 7 días con el aviso neutral; al pasar `grace_until` (el barrido) vuelve a gratuito **y todo lo registrado sigue visible**.
5. **Cancelar**: «Cancelar renovación» → «No se renovará; tu plan sigue hasta <fecha>»; no vuelve a cobrarse; después de la fecha vuelve a gratuito.
6. **Invitada**: con una persona invitada a una familia con plan vigente, `/planes` dice «Incluido por la familia de Ana» y no ofrece pagar; `POST /accounts/{id}/subscription` responde **409** `covered_by_family`. Cancela la suscripción de la titular y deja pasar su `paid_through` (o ponlo en el pasado con SQL en local): la persona ya puede contratar.
7. **Plan a mano**: una cuenta con `plan_source = 'manual'` y plan completo no cambia con ningún aviso.

## 2. Pruebas automáticas

```bash
cd backend && go test ./internal/payments ./internal/server -cover   # >90 % en payments
cd ../frontend && npx vitest run --coverage
npx playwright test e2e/planes-pago.spec.ts    # con PAYMENTS_DRIVER=fake en el API y en el proceso de Playwright
```

Cubren: cobro aprobado, renovación, rechazo y gracia, gracia vencida, cancelación, aviso repetido y fuera de orden, firma inválida, suscripción desconocida, dos intentos a la vez, cuenta con plan a mano intacta, invitada bloqueada y liberada, y que **ninguna** respuesta, registro ni mensaje de error contiene un token, una clave, un correo o una dirección de pago.

## 3. En DEV con Mercado Pago de **prueba** (lo hace el dueño con el desarrollador)

**Prerrequisitos**: migración `0027` aplicada en DEV antes del backend; en Railway: `MERCADOPAGO_ACCESS_TOKEN` (de **prueba**), `MERCADOPAGO_WEBHOOK_SECRET`, `PAYMENTS_WEBHOOK_URL=https://api-dev.pedi-track.com/payments/webhooks/mercadopago`; en el panel de Mercado Pago, un **usuario comprador de prueba** y una **tarjeta de prueba** (nunca una tarjeta real). No pegues llaves en el chat.

1. En `https://dev.pedi-track.com/planes`, con una cuenta gratuita: «Contratar plan completo» → página de Mercado Pago → paga con la tarjeta de prueba.
2. Vuelve a `/planes/regreso`; confirma que el plan pasa a completo (revisa que llegó el aviso: una fila en `payment_events`).
3. Prueba un cobro rechazado (tarjeta de prueba que rechaza) y la cancelación desde la app **y** desde el panel de Mercado Pago.
4. Comprueba que en `error_logs` no hay fallas `job:payments` y que ninguna fila contiene datos de tarjeta, correos ni tokens.
5. **Antes del primer cobro real**: contador (RFC, facturación, nombre legal), términos y aviso de privacidad, y las credenciales reales en Railway.
