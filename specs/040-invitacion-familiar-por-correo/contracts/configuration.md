# Configuración: variables de entorno

Todas opcionales salvo lo ya existente. Un valor inválido o incoherente vuelve al valor por omisión; **nunca** detiene el servicio ni se imprime.

| Variable | Por omisión | Qué hace |
|---|---|---|
| `RESEND_API_KEY` | — (ya existe, spec 039) | La clave del proveedor. Sin ella (y sin `MAIL_DRIVER`) no se manda ningún correo de invitación; todo funciona como hoy. |
| `FRONTEND_ORIGIN` | — (ya existe) | Origen de la liga del correo. Si falta, no se manda correo (no se puede armar la liga). |
| `MAIL_FROM` | `ERROR_DIGEST_FROM`, y si no, `PediTrack <alertas@pedi-track.com>` | Remitente de las invitaciones. Su dominio debe estar verificado en el proveedor. |
| `MAIL_DAILY_CAP` | `100` | Tope duro del día (el del plan gratis de Resend). Lo usa el digest. |
| `MAIL_INVITATION_CAP` | `95` | Tope de las invitaciones; deja `MAIL_DAILY_CAP − MAIL_INVITATION_CAP` correos al día para el digest. Debe ser ≤ `MAIL_DAILY_CAP`. |
| `MAIL_WARN_AT` | `80` | Al llegar a este conteo en el día se avisa una vez (`job:mailer`). Debe ser ≤ `MAIL_INVITATION_CAP`. |
| `INVITATION_EMAIL_PER_INVITATION_PER_DAY` | `3` | Correos por invitación por día (el primero cuenta). |
| `INVITATION_EMAIL_PER_FAMILY_PER_DAY` | `10` | Correos por familia por día. |
| `MAIL_DRIVER` | vacío | `discard`: no manda nada y responde éxito (E2E y desarrollo). No se usa en producción. |

Rangos válidos: topes y límites enteros ≥ 1; un valor fuera de rango o que rompa `WARN_AT ≤ INVITATION_CAP ≤ DAILY_CAP` devuelve **los tres** a sus valores por omisión.

## Pasos del dueño (no son código)

1. Aplicar la migración `0025` en el servidor **antes** de desplegar el backend.
2. En Resend → *Domains* → `pedi-track.com` → *Configuration*: confirmar que **Open tracking** y **Click tracking** estén apagados (lo están por omisión). Es lo que impide que Resend reescriba la liga.
3. (Opcional) Poner `MAIL_FROM` si se quiere otro remitente.
4. En CI/E2E: `MAIL_DRIVER=discard` para el backend de Playwright.
