# Guía de validación: Digest semanal de errores por correo

Cómo comprobar de punta a punta que el digest funciona. Los contratos están en [contracts/](./contracts/) y la tabla en [data-model.md](./data-model.md).

## Prerrequisitos

- Base local de PostgreSQL con las migraciones hasta la **`0024`** aplicadas (`backend/migrations/0024_create_error_digest_runs.sql`).
- `DATABASE_URL="postgres://root:abcd1234@localhost:5432/pediTrack?sslmode=disable"` (credenciales locales de `backend/CLAUDE.md`).
- Para el envío real: una cuenta de **Resend** (plan gratis) con un dominio verificado y una clave de API **de solo enviar**. Sin ella, las pruebas automáticas cubren todo con un envío falso.

## 1. Pruebas automáticas (sin cuenta de Resend)

```bash
cd backend && go test ./internal/errordigest/... ./internal/errorlog/... -cover
```

Esperado: todo verde, cobertura >90 % en `errordigest` y en lo nuevo de `errorlog`. Cubren:
- semana ISO en hora de CDMX, borde de año, 07:59 vs 08:00, recuperación el martes y semana nueva (Historia 2);
- un solo ganador entre dos procesos a la vez, lease vencido que se retoma, `sent`/`failed` que no se reclaman;
- contenido: totales, diez grupos, procesos aparte, cuentas como conteo, semana vacía, con y sin comparación;
- **ningún correo, UUID ni token en el asunto o el cuerpo** (SC-004);
- reintentos (3 intentos, esperas inyectadas), error permanente sin reintento, agotado → `failed` + un `job:error-digest`;
- el adaptador contra un servidor falso: cabeceras, `Idempotency-Key`, clasificación de errores, sin redirecciones, sin la clave en los errores.

## 2. Un correo real, a mano (local)

1. Siembra algunos errores (cualquier petición inválida a la API local, o inserta filas en `error_logs`), y al menos uno de proceso (`endpoint = 'job:reminders'`).
2. Arranca el API con el día y la hora **de ahora** para que toque ya, y tu propio correo como destinatario:

```bash
RESEND_API_KEY=re_... ERROR_DIGEST_TO=tu-correo@gmail.com \
ERROR_DIGEST_FROM="PediTrack <alertas@tu-dominio-verificado>" \
ERROR_DIGEST_WEEKDAY=<día de hoy, 1-7> ERROR_DIGEST_HOUR=<hora de CDMX actual> \
APP_ENV_LABEL=LOCAL go run ./cmd/api
```

3. En el siguiente minuto debe llegar **un** correo con el formato de [contracts/email.md](./contracts/email.md). Comprueba:
   - el asunto trae `[PediTrack LOCAL]`, el periodo y el total;
   - las secciones **Peticiones** y **Procesos** están separadas;
   - no aparece ningún correo, id ni token;
   - `SELECT * FROM error_digest_runs;` tiene **una** fila `sent` con la semana de hoy.

## 3. No se duplica ni se pierde (Historia 2)

1. **Reinicia** el API (Ctrl+C y vuelve a arrancarlo con las mismas variables) → **no llega otro correo**.
2. Borra la fila (`DELETE FROM error_digest_runs;`) y arranca **dos copias** a la vez en puertos distintos (`PORT=8081` y `PORT=8082`) → llega **un solo** correo.
3. Cambia la hora a una futura, arranca, y confirma que **no** manda; cámbiala a una pasada del mismo día → manda al arrancar (recuperación).

## 4. Fallas (Historia 3)

1. **Sin clave**: arranca sin `RESEND_API_KEY` → la consola dice **una vez** `error digest unavailable: RESEND_API_KEY is not set`, la API funciona normal y no hay filas nuevas en `error_logs`.
2. **Clave inválida**: pon una clave falsa y borra la fila de la semana → no reintenta (error permanente), `error_digest_runs` queda `failed` y en `error_logs` aparece **una** entrada `job:error-digest` con el mensaje fijo, sin la clave ni la dirección:
   `SELECT endpoint, message FROM error_logs WHERE endpoint = 'job:error-digest';`
3. La API siguió respondiendo todo el tiempo.

## 5. En DEV (una sola vez)

1. En Resend: crear la cuenta, **verificar el dominio de envío** y crear una clave con permiso de solo enviar (ver `contracts/resend-request.md`: confirmar los registros que muestra el panel).
2. En **Cloudflare** (DNS de `pedi-track.com`): agregar los registros que indique Resend. **No tocar** el SPF ni los MX de la raíz (Email Routing).
3. En **Railway**: `RESEND_API_KEY` y `APP_ENV_LABEL=DEV` (y las opcionales si quieres cambiar destinatario, día u hora). **Aplicar la migración `0024` antes del backend.**
4. Para ver uno sin esperar al lunes: poner temporalmente `ERROR_DIGEST_WEEKDAY` y `ERROR_DIGEST_HOUR` en el momento actual, comprobar que llega a `soporte@pedi-track.com` (y a tu Gmail por Email Routing), y **dejarlos otra vez en los valores por omisión**.

## Criterios de salida

Las pruebas automáticas en verde con cobertura >90 %; un correo real con el formato esperado y sin datos sensibles; reinicio y dos copias sin duplicados; falla controlada sin efectos en la API; y la documentación (`CLAUDE.md`, `backend/CLAUDE.md`, `DEPLOY.md`, `BACKLOG.md`) al día.
