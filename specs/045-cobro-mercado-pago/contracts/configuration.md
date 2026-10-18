# Contrato: configuración

| Variable | Requerida | Valor por omisión | Notas |
|---|---|---|---|
| `PAYMENTS_DRIVER` | no | `mercadopago` | `mercadopago` o `fake`. `fake` corre todo el flujo con un proveedor en memoria y rutas de ayuda: **solo E2E y desarrollo, nunca en producción** (el API lo dice en la consola al arrancar). |
| `MERCADOPAGO_ACCESS_TOKEN` | para cobrar | — | El access token de la cuenta de Mercado Pago (en DEV, el de **prueba**). **Sin él y sin `fake`, el cobro queda «no disponible»**: `/planes` muestra «Pronto» y todo funciona como hoy (plan por SQL). Nunca se registra ni se devuelve. |
| `MERCADOPAGO_WEBHOOK_SECRET` | recomendada | — | La clave secreta del webhook que muestra el panel (Webhooks → Configurar notificaciones). Valida `x-signature`. Vacía = se acepta el aviso sin firma (riesgo R9 de `research.md`) y se consulta igual el recurso. |
| `PAYMENTS_WEBHOOK_URL` | para cobrar | — | Dirección pública del aviso que se manda al crear la suscripción (`notification_url`): `https://api-dev.pedi-track.com/payments/webhooks/mercadopago` en DEV. Debe ser https. |
| `FRONTEND_ORIGIN` | ya existe | — | De ahí sale la `back_url` (`<origen>/planes/regreso`). Sin ella, el cobro queda «no disponible». |
| `PAYMENTS_GRACE_DAYS` | no | `7` | Días de gracia tras un cobro fallido (1–30; inválido vuelve a 7). |
| `PAYMENTS_PRICE_MXN` | no | `499` | El monto de la suscripción (entero; el frontend dice el mismo número en `planCopy.ts`: si se cambia, se cambia en los dos). |

**Ya no hacen falta** (frente al borrador de la entrada): una llave pública de Mercado Pago y el id del plan del panel (la suscripción se crea con el monto y la frecuencia desde nuestro código; el plan «Peditrack» del panel puede quedarse como referencia o borrarse).

**Reglas**: las credenciales reales viven **solo** en las variables de Railway; nunca en el repositorio, en `DEPLOY.md` con valores, ni en el chat. Sin variables, el arranque dice una sola vez qué falta (como el correo) y todo lo demás funciona.

**Entornos**: DEV usa el access token y la clave **de prueba** (usuarios y tarjetas de prueba de Mercado Pago); producción, los reales, después de los pasos del dueño (contador, RFC, términos) de la spec.
