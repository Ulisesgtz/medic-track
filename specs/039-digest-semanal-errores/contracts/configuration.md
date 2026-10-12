# Contrato: configuración del digest

Todo por variables de entorno (en Railway para DEV y producción; en `backend/.env.local` para pruebas locales). Lo lee `errordigest.ConfigFromEnv`, en el mismo estilo que `retention.ConfigFromEnv` y `reminder.ConfigFromEnv`.

| Variable | ¿Obligatoria? | Por omisión | Qué hace |
|---|---|---|---|
| `RESEND_API_KEY` | **Sí, para que corra** | — | La clave de API de Resend (`re_…`), con permiso de solo enviar. **Sin ella el digest no corre** y la consola lo dice una vez. Es la misma que reutilizarán las invitaciones por correo. |
| `ERROR_DIGEST_TO` | No | `soporte@pedi-track.com` | Dirección que recibe el digest (una sola). |
| `ERROR_DIGEST_FROM` | No | `PediTrack <alertas@pedi-track.com>` | Remitente. Su dominio tiene que estar **verificado en Resend**. |
| `ERROR_DIGEST_WEEKDAY` | No | `1` | Día de envío, ISO: `1` = lunes … `7` = domingo. Fuera de 1–7 vuelve a `1`. |
| `ERROR_DIGEST_HOUR` | No | `8` | Hora de envío, 0–23, **hora de Ciudad de México**. Fuera de rango vuelve a `8`. |
| `APP_ENV_LABEL` | No | *(vacío)* | Etiqueta del entorno para el asunto y el cuerpo (`DEV`, `producción`). Vacía: solo «PediTrack». |

Dos variables que **ya existen** y que el digest lee sin cambiarlas:

- `ERROR_LOGS_RETENTION_DAYS` (spec 021): decide si hay comparación con la semana anterior (hace falta una retención de **14 días o más**).

## Reglas

1. **Arranque**: el proceso corre solo si `Config.Available()` es verdadero (hay `RESEND_API_KEY`, y `To` y `From` no están vacíos). Si no, `cmd/api` escribe **una vez**:
   `error digest unavailable: RESEND_API_KEY is not set` (o `ERROR_DIGEST_TO / ERROR_DIGEST_FROM are empty`). El servicio sigue funcionando. **No** se escribe en `error_logs`: es una configuración ausente, no una falla.
2. **Secretos y datos**: ni la clave, ni el destinatario, ni el remitente se imprimen en la consola, se guardan en `error_logs`, `error_digest_runs` o salen en un mensaje de error.
3. **Valores inválidos** de día u hora no detienen nada: se usa el valor por omisión.
4. **Zona horaria fija**: `America/Mexico_City` (no hay variable).
5. **Sin variables nuevas del lado del frontend ni del navegador.**

## Ejemplo (Railway, DEV)

```text
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
APP_ENV_LABEL=DEV
# opcionales:
ERROR_DIGEST_TO=soporte@pedi-track.com
ERROR_DIGEST_FROM=PediTrack <alertas@pedi-track.com>
ERROR_DIGEST_WEEKDAY=1
ERROR_DIGEST_HOUR=8
```
