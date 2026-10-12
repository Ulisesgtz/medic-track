# Guía de validación: Invitación a la familia por correo

Prerrequisitos: Postgres local con `DATABASE_URL`, migraciones aplicadas hasta la `0025`, `FRONTEND_ORIGIN=http://localhost:5173`. Contratos: [api.md](./contracts/api.md), [email.md](./contracts/email.md), [configuration.md](./contracts/configuration.md); tablas en [data-model.md](./data-model.md).

## 1. Automático (sin correo real)

```bash
cd backend && go test ./internal/mailer/... ./internal/errordigest/... ./internal/family/... -cover
cd ../frontend && npx vitest run --coverage
cd ../frontend && MAIL_DRIVER=discard npx playwright test familia   # con backend y frontend en marcha
```

Esperado: todo en verde y > 90 % en los paquetes tocados. Las pruebas del backend usan un envío falso y la base real (cuota con goroutines, un día nuevo, aviso una sola vez, límites, reenvío que invalida un envío en cola, barrido).

## 2. Manual con `MAIL_DRIVER=discard` (flujo completo, sin enviar)

1. Con la cuenta de pago, en **Familia** invita a `prueba@ejemplo.com` como Cuidador → la tarjeta «Liga lista» dice «Enviando la invitación a prueba@ejemplo.com…» y a los segundos «Invitación enviada…»; «Copiar liga» sigue ahí.
2. Reenvía 3 veces seguidas (con la creación son 4 correos pedidos) → el cuarto ya dice «No se pudo enviar el correo. Copia la liga y mándala tú.» (límite de 3), y la liga nueva sí se genera.
3. `SELECT day, sent, warned FROM mail_daily_counts;` → una fila de hoy con los correos pedidos; ninguna dirección ni liga en ninguna tabla nueva.
4. Con `MAIL_INVITATION_CAP=2`: la tercera invitación del día queda `failed` y existe.

## 3. Real, una vez (requiere `RESEND_API_KEY` en `backend/.env.local`)

1. Invita a un buzón propio → llega un solo correo de «PediTrack» con el nombre de pila, el rol, el vencimiento y un enlace. **Pasa el cursor sobre el enlace: debe ser `…/familia/invitacion#…` de tu frontend, no un dominio de seguimiento de Resend.**
2. Ábrelo con una sesión de **otro** correo → no se puede aceptar (la regla de la spec 032 no cambió); con el correo invitado → se acepta.
3. Reenvía → el correo nuevo trae la liga nueva; la vieja ya no sirve.
4. `SELECT * FROM error_logs WHERE endpoint = 'job:mailer';` → vacío si todo salió bien.

## 4. Falla del proveedor

Con una clave inválida: la invitación se crea, la tarjeta pasa a «No se pudo enviar…» y hay **una** fila `job:mailer` con mensaje fijo (sin correo, liga ni clave).

## 5. Cuota

Con `MAIL_WARN_AT=2`: al segundo correo del día hay una fila `job:mailer` de aviso y no se repite con el tercero. Con el contador en el tope de invitaciones, el digest semanal sí se manda.
