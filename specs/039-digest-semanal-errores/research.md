# Investigación: Digest semanal de errores por correo

Cada decisión sigue el formato **Decisión / Justificación / Alternativas**. Fecha de la investigación: 2026-10-12. Lo de Resend se verificó contra su documentación pública ese día; lo que no estaba en las páginas leídas queda marcado como **«confirmar en el panel»** (no afecta al código).

## R1. Proveedor y adaptador de envío

**Decisión**: una interfaz mínima `Sender` (`Send(ctx, Message) error`, con `Message{From, To, Subject, Text, IdempotencyKey}`) y una implementación `ResendSender` por HTTP, sin SDK:

- `POST https://api.resend.com/emails`, `Authorization: Bearer <clave>`, `Content-Type: application/json`.
- Cuerpo: `from`, `to` (cadena o arreglo, máx. 50), `subject`, `text` (sin `html`: el correo es texto plano).
- Cabecera opcional `Idempotency-Key` (única por petición, caduca a las 24 h, máx. 256 caracteres): se usa **`error-digest-<semana ISO>`**.
- Éxito: respuesta 2xx con `{"id": "…"}`. No se lee ni se guarda nada más.
- Cliente `http.Client` con `Timeout` de 15 s y `CheckRedirect` que devuelve `http.ErrUseLastResponse` (el mismo criterio que el cliente de Web Push, spec 037: un API de correo no necesita redirigir).
- Un doble `fakeSender` para pruebas del servicio, y `httptest.Server` para probar el adaptador.

**Justificación**: la petición es una sola llamada; un SDK sería una dependencia nueva para 40 líneas (Principio V). La interfaz permite cambiar de proveedor (o reutilizar el adaptador para las invitaciones por correo, otra tarea pendiente) sin tocar el servicio. El plan gratis de Resend (**3,000 correos al mes y máximo 100 al día**, un dominio) sobra para uno por semana.

**Alternativas**: SDK oficial de Go (dependencia sin necesidad); SMTP de Resend (más superficie: TLS, autenticación, no hay llave de idempotencia); Brevo o Amazon SES (más configuración para el mismo resultado); el SMTP de Gmail con contraseña de aplicación (acopla el servicio a la cuenta personal y a su contraseña: descartado por seguridad).

**Lo que no estaba en la documentación leída** (confirmar al dar de alta, ver quickstart): los registros DNS exactos y en qué nombres los pone el panel. Lo esperado es DKIM (TXT en `resend._domainkey.<dominio>`) y SPF/MX de rebote en un subdominio `send.<dominio>`, de modo que **el SPF y el MX de la raíz —que administra Email Routing— no se tocan**. Si el panel propusiera algo en la raíz que choque, se verifica en su lugar un subdominio (p. ej. `mail.pedi-track.com`, remitente `alertas@mail.pedi-track.com`); el código solo lee el remitente de una variable.

## R2. Unicidad por semana y recuperación

**Decisión**: tabla `error_digest_runs` con la **semana ISO** (`'2026-W42'`) como llave primaria y un *lease*:

| Columna | Para qué |
|---|---|
| `week_key` (PK) | la semana ISO de la hora programada, en hora de CDMX |
| `status` | `sending`, `sent` o `failed` |
| `claimed_at`, `lease_until` | quién lo tomó y hasta cuándo es suyo |
| `attempts` | cuántas veces se reclamó (se reporta, no se muestra) |
| `sent_at` / `failed_at` | cuándo terminó |

**Reclamar** es una sola sentencia atómica:

```sql
INSERT INTO error_digest_runs (week_key, status, claimed_at, lease_until, attempts)
VALUES ($1, 'sending', now(), now() + $2::interval, 1)
ON CONFLICT (week_key) DO UPDATE
   SET claimed_at = now(), lease_until = now() + $2::interval, attempts = error_digest_runs.attempts + 1
 WHERE error_digest_runs.status = 'sending' AND error_digest_runs.lease_until < now()
RETURNING week_key
```

Si no devuelve fila, alguien más lo tiene o ya terminó (`sent`/`failed`): no se manda. Una fila `sent` o `failed` **nunca se reclama de nuevo** (una semana perdida no se recupera, spec Historia 2.4).

**Si el proceso muere entre reclamar y marcar `sent`**: el lease vence (30 min) y otra copia, o la misma tras reiniciar, reclama la semana y reintenta. Si el primer envío sí había salido, el reintento lleva la **misma `Idempotency-Key`** y Resend (dentro de 24 h) no manda un segundo correo. Así se obtiene *a lo sumo uno* sin perder el de una caída a medio envío, **sin bloqueos asesores ni transacciones largas** durante la llamada HTTP.

**Justificación**: «reclamar antes de enviar» solo garantiza a lo sumo una vez pero pierde el correo si el proceso cae después; «enviar y luego registrar» puede duplicar. El lease con llave de idempotencia cubre las dos cosas con un único dato duradero. Una fila por semana (52 al año) no necesita retención.

**Alternativas**: `pg_try_advisory_lock` (el bloqueo vive en la conexión; con un pool y un envío de segundos es frágil y no recuerda qué semana se mandó); solo `INSERT … ON CONFLICT DO NOTHING` sin lease (pierde el correo si cae a medio envío); un archivo o variable en memoria (no sobrevive a reinicios ni a varias copias).

## R3. Programador y zona horaria

**Decisión**:

- La semana de envío es la **semana ISO de «ahora» en `America/Mexico_City`**; su instante programado es el día de la semana y la hora configurados (por omisión lunes 08:00) de esa semana. Si `ahora >= programado` y la semana no está registrada, **toca**.
- Un ticker de **1 minuto**. Para no consultar la base cada minuto, el servicio recuerda en memoria la última semana que vio terminada (`sent` o `failed`) y solo reclama cuando toca y no la recuerda.
- **Recuperación**: como la semana se calcula con «ahora», un API apagado el lunes a las 08:00 que arranca el martes ve la misma semana ISO, `ahora >= programado`, y manda; uno que arranca el lunes siguiente ve una semana nueva. Nunca se recupera una semana pasada.
- **Zona**: se importa `time/tzdata` (biblioteca estándar, ~450 KB) para que `LoadLocation("America/Mexico_City")` funcione **también en la imagen distroless y en Windows** (que no traen base de zonas), y como respaldo, si aun así fallara, `time.FixedZone("CST", -6*3600)` (Ciudad de México no tiene horario de verano desde 2022). La zona no es configurable (YAGNI).

**Justificación**: sin dependencias, determinista en pruebas con un reloj inyectable, y cubre el cambio de semana y el reinicio sin lógica especial.

**Alternativas**: una librería de cron (dependencia por un solo horario); calcular con la zona del servidor (Railway corre en UTC); dormir hasta la próxima hora exacta (más frágil ante reinicios y relojes).

## R4. Armado del contenido

**Decisión**: ventanas `[ahora−7d, ahora)` (esta semana) y `[ahora−14d, ahora−7d)` (la anterior), ambas con `Since`/`Until` del `errorlog.Filter` de la spec 021. Se reutiliza `Summary` (agrupa por endpoint, estado y mensaje) y se agregan tres piezas pequeñas a `errorlog`:

- `Filter.ExcludeEndpointPrefix` (`endpoint NOT LIKE 'job:%'`, con el mismo escape que `EndpointPrefix`) para separar **peticiones** de **procesos**.
- `Stats(ctx, Filter) (Stats{Entries, Groups, Accounts}, error)`: una consulta con `count(*)`, `count(DISTINCT account_id)` y el número de grupos (subconsulta `GROUP BY endpoint, http_status, message`). Es lo que da el «+N grupos más» y el «N cuentas afectadas» **sin listar ids**.
- `OldestEntry(ctx) (*time.Time, error)` (el índice por `created_at` ya existe, spec 021).

Con eso: total esta semana (peticiones + procesos), total de la anterior, los **diez primeros grupos** de peticiones (`Summary` ya viene ordenado y limitado a 100, se toman 10), los de procesos (también diez como máximo), y cuántos quedaron fuera (`Stats.Groups − 10`).

**Comparación con la semana anterior**: se muestra solo si la **retención configurada cubre 14 días** (`retention.ConfigFromEnv().Days >= 14`; por omisión 90) **y** (la semana anterior tuvo errores **o** hay una entrada anterior a su inicio, para no presentar un «0» engañoso en un servicio recién nacido). Si no, el correo dice «sin comparación» (spec, escenario 1.5 y caso límite de retención).

**Justificación**: una sola definición de «el mismo error» (la de la spec 021) y datos solo agregados: los ids de cuenta nunca salen de la base.

**Alternativas**: pedir `List` y agrupar en memoria (traería filas con ids de cuenta y rompe con tablas grandes); una segunda consulta de comparación por grupo (el correo no la necesita: solo el total).

## R5. Formato del correo y privacidad

**Decisión**: **texto plano** (sin HTML, imágenes ni enlaces), con asunto `[PediTrack <ENTORNO>] Errores del <d> al <d>: <N> (<±M> vs. semana anterior)`. El cuerpo (contratos/email.md) lleva: resumen, sección de peticiones, sección de procesos y pie. Las fechas usan los nombres fijos de mes del proyecto (sin `Intl`).

**Limpieza defensiva** al armar cada línea: se quitan saltos de línea y caracteres de control, se **recorta a 160 caracteres** y se reemplazan por `[correo]` y `[id]` cualquier coincidencia con un correo electrónico o un UUID, y por `[token]` cualquier cadena larga de caracteres de token (≥ 32 base64url/hex). Los mensajes de `error_logs` ya son fijos (specs 002/018) y no llevan nada de eso; esto es **cinturón y tirantes** por si un mensaje futuro lo trajera.

**Justificación**: Principio II: lo único que sale del servicio hacia un tercero son frases fijas, rutas y conteos. Texto plano se lee en cualquier cliente y no depende de que se carguen imágenes.

**Alternativas**: HTML con tabla (más bonito pero más superficie y peor en clientes sin HTML); adjuntar un CSV (datos de más en un tercero); mandar solo un enlace al panel (no hay panel, spec fuera de alcance).

## R5b. «Semana sin errores»

**Decisión**: si no hay errores en la ventana, el correo se manda con el asunto `[PediTrack DEV] Errores del … : 0` y el cuerpo «No hubo errores esta semana.», más las líneas de comparación si aplica. (spec FR-005)

## R6. Configuración

**Decisión**: variables de entorno (contratos/configuration.md): `RESEND_API_KEY` (**la misma que reutilizarán las invitaciones por correo**, por eso no lleva el prefijo `ERROR_DIGEST_`), `ERROR_DIGEST_TO` (por omisión `soporte@pedi-track.com`), `ERROR_DIGEST_FROM` (por omisión `PediTrack <alertas@pedi-track.com>`), `ERROR_DIGEST_WEEKDAY` (1 = lunes … 7 = domingo; por omisión 1), `ERROR_DIGEST_HOUR` (0–23; por omisión 8) y `APP_ENV_LABEL` (texto libre para el asunto; por omisión vacío = solo «PediTrack»). Un valor inválido de día u hora vuelve al valor por omisión.

El proceso **solo arranca si hay `RESEND_API_KEY`**; si falta, `cmd/api` escribe **una vez** «error digest unavailable: RESEND_API_KEY is not set» (la misma forma que los recordatorios sin VAPID). Nunca se imprime ninguno de los valores.

**Justificación**: coincide con `retention.ConfigFromEnv` y `reminder.ConfigFromEnv`; los valores no secretos tienen defaults razonables y se pueden ajustar en Railway sin publicar.

## R7. Reintentos y reporte de fallas

**Decisión**: una ejecución hace hasta **3 intentos** con esperas de 30 s y 2 min entre ellos (inyectables en pruebas; se interrumpen si el contexto se cancela). Se reintenta solo lo **reintentable**: error de red/timeout, `408`, `429` y `5xx`. Un `4xx` distinto (clave inválida `401/403`, dominio sin verificar `403`, destinatario rechazado `422`) **no** se reintenta. Al agotarse o ser permanente:

1. `error_digest_runs.status = 'failed'` (esa semana ya no se reclama).
2. `jobreport` con kind `send` y el mensaje fijo **«error digest failed: could not send the weekly e-mail»**; sin la respuesta del proveedor, sin direcciones, sin la clave. Una falla al **armar** el contenido (base de datos) reporta kind `build` con otro mensaje fijo, y una al **reclamar**, kind `claim`; en esos dos casos la semana **no** se marca `failed` (se reintenta en el siguiente ticker, porque aún no se mandó nada).
3. `Recovered(kind)` tras un envío correcto.

**Justificación**: la regla de la spec (una semana perdida no se recupera) se limita a fallas de **envío** del proveedor; una caída momentánea de la base de datos no debe costar el correo de la semana. Los mensajes fijos y el agrupamiento de `jobreport` evitan llenar `error_logs` si el proveedor cae durante días.

## R8. Apagado y tiempos

**Decisión**: cada petición lleva `context.WithTimeout(ctx, 15 s)` y el servicio se detiene con el `ctx` del API (`SIGINT`/`SIGTERM`): una espera entre reintentos y una petición en curso se cancelan al apagar, por lo que el apagado no queda atado al proveedor (spec Historia 3.5). Si el apagado interrumpe un envío, la fila queda `sending` y el lease vence solo (R2).

## R9. Pruebas y cobertura

**Decisión** (Principio VI, >90 %):

- `schedule_test`: semana ISO en CDMX, borde de año (semana 53/01), lunes a las 07:59 vs 08:00, recuperación el martes, semana nueva el lunes siguiente, reloj inyectado.
- `repository_test` (base real): primer reclamo sí, segundo no; dos goroutines a la vez → un solo ganador; lease vencido → se reclama; `sent` y `failed` no se reclaman jamás.
- `content_test`: con datos sembrados, totales, diez grupos y «+N», sección de procesos aparte, cuentas como conteo, semana vacía, comparación disponible/no disponible (retención corta, servicio nuevo), recorte, limpieza defensiva, y **una prueba que busca correos, UUID y tokens en el cuerpo y el asunto** (SC-004).
- `sender_test`: `httptest.Server` (cabeceras, cuerpo, `Idempotency-Key`, éxito, 429/5xx reintentable, 401/422 permanente, no sigue redirecciones, la clave nunca aparece en el error devuelto).
- `service_test`: un `Sender` falso (reintentos con esperas inyectadas, permanente sin reintento, agotado → `failed` + reporte, éxito → `sent` + `Recovered`, fallo al armar no marca `failed`, cancelación del contexto).
- `config_test`: defaults, valores inválidos, `Available()`.
- `errorlog` (base real): `Stats`, `OldestEntry`, `ExcludeEndpointPrefix`.
- `cmd/api` queda fuera del gate de cobertura (la excepción ya conocida del repo); el arranque se prueba con `Available()`.
