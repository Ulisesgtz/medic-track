# Contrato: la llamada a Resend

Lo que `errordigest.ResendSender` manda y cómo interpreta la respuesta. Verificado contra la documentación pública de Resend el 2026-10-12 (`POST /emails`); lo que esa documentación no detalla está marcado.

## Petición

```text
POST https://api.resend.com/emails
Authorization: Bearer <RESEND_API_KEY>
Content-Type: application/json
Idempotency-Key: error-digest-2026-W42
```

```json
{
  "from": "PediTrack <alertas@pedi-track.com>",
  "to": ["soporte@pedi-track.com"],
  "subject": "[PediTrack DEV] Errores del 5 oct al 12 oct 2026: 38 (+12 vs. semana anterior)",
  "text": "PediTrack · DEV\nErrores del 5 oct …"
}
```

- Solo `text` (sin `html`): Resend no genera HTML y el correo es texto plano.
- `to` va como arreglo de un elemento (el máximo de Resend es 50).
- **`Idempotency-Key`**: única por petición, caduca a las 24 h, máximo 256 caracteres. Es `error-digest-<semana ISO>`, así que un reintento de la misma semana (tras reiniciar, o por un lease vencido) **no manda un segundo correo** mientras no pasen 24 h.
- Cliente HTTP: `Timeout` de 15 s, **no sigue redirecciones** (`http.ErrUseLastResponse`), un solo `http.Client` reutilizado.

## Respuesta

| Resultado | Cómo se trata |
|---|---|
| **2xx** con `{"id": "…"}` | Éxito. El `id` se descarta (no se guarda ni se loguea). |
| **409** (la llave de idempotencia ya se usó) | **Se trata como éxito**: o esa petición sigue en curso o ya se aceptó antes con otro cuerpo (una semana retomada se rearma unos minutos después y su texto cambia); en los dos casos el correo de la semana ya salió o va en camino, así que no se marca `failed` ni se reporta. *(La documentación leída no detalla los códigos de error; confirmar en la primera prueba real.)* |
| **408**, **429**, **5xx**, error de red o *timeout* | **Reintentable** (hasta 3 intentos en total, esperas de 30 s y 2 min). |
| Otro **4xx** (p. ej. 401/403 clave inválida o dominio sin verificar, 422 dirección rechazada) | **Permanente**: no se reintenta; esa semana queda `failed` (la documentación leída no detalla los códigos de error; se tratan por su clase). |

El cuerpo de la respuesta de error **nunca** se devuelve, se loguea ni se guarda: podría repetir la dirección o la clave. El error que sube del adaptador es un tipo propio con solo la clase (`retryable` o `permanent`) y el código de estado numérico; el reporte a `jobreport` usa el mensaje fijo `error digest failed: could not send the weekly e-mail`.

## Verificación del dominio (se hace una vez, en los paneles; no es código)

Resend exige **verificar un dominio propio** antes de enviar y recomienda hacerlo con un **subdominio**. La documentación pública leída no lista los registros; lo esperado y a **confirmar en el panel de Resend** al dar de alta:

- **DKIM**: un TXT en `resend._domainkey.<dominio>`.
- **SPF y MX de rebote**: en un subdominio de Resend (normalmente `send.<dominio>`), no en la raíz.

Esto debe dejar **intactos el SPF y los MX de la raíz** `pedi-track.com`, que administra Cloudflare Email Routing y están bloqueados («Locked»). Si el panel propusiera tocar la raíz, se verifica un subdominio (p. ej. `mail.pedi-track.com`) y el remitente pasa a `alertas@mail.pedi-track.com` cambiando solo `ERROR_DIGEST_FROM`. Los registros se agregan en Cloudflare (DNS de `pedi-track.com`).

## Límites del plan gratis (2026-10-12)

3,000 correos al mes, **máximo 100 al día**, un dominio. El digest manda uno por semana (≈ 4–5 al mes); los correos **recibidos** también cuentan para la cuota en Resend, y aquí no se usan.
