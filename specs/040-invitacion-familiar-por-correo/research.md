# Investigación: Invitación a la familia por correo

**Spec**: [spec.md](./spec.md) | **Fecha**: 2026-10-12

Cada decisión dice qué se eligió, por qué y qué más se evaluó. No quedan incógnitas (`NEEDS CLARIFICATION`).

## R1 — Paquete común `internal/mailer`

**Decisión**: se **mueve** de `internal/errordigest` a un paquete nuevo `internal/mailer` lo que no es del digest: `Message`, `Sender`, `SendError`, `IsRetryable`, `ResendSender`/`NewResendSender`, la limpieza de texto (`sanitize.go` → `mailer.Clean(s, maxRunes)`) y el bucle de reintentos (`mailer.SendWithRetries`). `errordigest` los importa directamente (sin alias: no se deja una copia). Las pruebas de esas piezas se mudan con ellas; las del digest solo cambian de import. Se agregan dos cosas: `Message.HTML` (opcional; `ResendSender` manda `html` solo si no está vacío) y `DiscardSender` (ver R9).

**Justificación**: la spec 039 ya lo dejó anotado («extraer el adaptador a un paquete común»). Dos paquetes que importan un tercero evitan que `family` dependa de `errordigest`. Mover (no copiar) respeta la regla de no duplicar.

**Alternativas**: que `family` importe `errordigest` (acopla un dominio con otro, y el nombre miente); copiar el adaptador (dos lugares donde arreglar el mismo bug de seguridad).

## R2 — Cuota diaria compartida: reservar antes, devolver si falla

**Decisión**: tabla `mail_daily_counts (day date PK, sent int, warned boolean)`. El día es la fecha de **Ciudad de México** (`time/tzdata`, como el digest). Antes de enviar se **reserva** un cupo con un solo `INSERT … ON CONFLICT (day) DO UPDATE SET sent = sent + 1 WHERE mail_daily_counts.sent < $cap RETURNING sent`: si no devuelve fila, se llegó al tope (`ErrQuotaExceeded`). Es atómico en la base, así que varias copias del API comparten la cuota sin pasarse. Si el envío **falla de forma definitiva**, se **devuelve** el cupo (`UPDATE … SET sent = sent - 1 WHERE sent > 0`, en el mismo `day` de la reserva). Un proceso que muere entre reservar y enviar deja un cupo de más: sobrecuenta, nunca subcuenta (el lado seguro).

Dos clases con tope distinto: **invitación** (`MAIL_INVITATION_CAP`, 95) y **digest** (`MAIL_DAILY_CAP`, 100, el límite del proveedor). Por eso los últimos 5 correos del día solo los puede usar el digest (FR-013, SC-006). Si el digest encuentra el día lleno (100), no manda: libera su semana y reintenta al minuto siguiente (el proveedor lo rechazaría igual); es un caso extremo y queda reportado como falla de envío.

**Aviso a los 80**: después de reservar, si `sent >= MAIL_WARN_AT` se intenta `UPDATE … SET warned = true WHERE day = $1 AND NOT warned RETURNING true`; exactamente **un** llamador recibe la fila y es quien reporta (`jobreport` `job:mailer`, tipo `quota`, mensaje fijo con los conteos). Una vez por día aunque haya varias copias (FR-012, SC-007).

**Alternativas**: contar solo lo enviado (no es atómico: dos copias leen 94 y mandan las dos); un contador en memoria (cada copia ve el suyo, y un reinicio lo pierde); leer el panel del proveedor (otra credencial y otra dependencia; el dueño quiere ver el consumo «sin entrar al proveedor», SC-008).

## R3 — Límites por invitación y por familia: columnas, no tabla

**Decisión**: `family_invitations` gana `email_sends_day date` y `email_sends_count int`. El límite por **invitación** (3 al día) se lee de su propia fila; el de la **familia** (10 al día) es `SELECT coalesce(sum(email_sends_count),0) FROM family_invitations WHERE family_account_id = $1 AND email_sends_day = $today`. Las invitaciones nunca se borran (solo cambian de estado), así que la suma es exacta. La revisión y el incremento van **dentro de la transacción de crear/reenviar**, que ya bloquea la fila de la cuenta dueña (`lockOwner`), así que dos peticiones de una misma familia se atienden una tras otra.

**Justificación**: sin tabla nueva (Principio V). El conteo es de correos *pedidos* (cuenta aunque luego falle): protege la reputación del dominio aunque el proveedor falle.

**Alternativas**: tabla `invitation_email_sends` (una fila por envío: más escritura, un índice y una purga para lo mismo).

## R4 — Estado del correo y envío en segundo plano

**Decisión**: columnas `email_status text NOT NULL DEFAULT 'none'` (`none`/`sending`/`sent`/`failed`, con `CHECK`) y `email_status_at timestamptz`. Se guardan los cuatro estados de la spec (`no pedido`, `enviándose`, `enviado`, `no enviado`); la API usa los valores en inglés.

Flujo: `Service.Invite`/`Resend` arman el mensaje **en ese momento** (la ficha existe en claro solo ahí; la base guarda su hash) y, si la transacción dejó el estado en `sending`, lo entregan a un **despachador en memoria** (`family.EmailDispatcher`: cola acotada de 64 y 2 trabajadores) y responden sin esperar (SC-004). El trabajador, por cada intento: (1) comprueba que la invitación siga **vigente** —misma `token_hash`, pendiente y no vencida— y si no, **suelta el mensaje sin enviar** (un reenvío, una cancelación o una aceptación lo vuelven obsoleto: «gana la liga nueva»); (2) reserva el cupo (R2); (3) manda con hasta 3 intentos y esperas cortas **5 s y 20 s** (la política de la spec 039 con esperas más cortas, para cumplir «menos de 1 minuto», SC-002); (4) marca `sent` o `failed` **solo si la fila sigue con esa misma `token_hash`** (`UPDATE … WHERE id = $1 AND token_hash = $2 AND email_status = 'sending'`), así un envío viejo nunca pisa el estado de un reenvío.

**Por qué una cola en memoria y no sondear la base**: el mensaje contiene la ficha, que no se guarda; reconstruirlo desde la base es imposible por diseño (spec 032). Si el proceso muere con mensajes en cola, esos correos se pierden —y **eso es aceptable y está resuelto**—: la fila queda `sending`, y un **barrido** (al arrancar y cada minuto) pasa a `failed` toda fila `sending` con más de 3 minutos de antigüedad (más que los 3 intentos con sus esperas: peor caso ≈ 15 s × 3 + 25 s ≈ 70 s). La dueña ve «no se pudo enviar, copia la liga» y puede reenviar. Al **apagar el servicio**, los trabajadores terminan lo que traen en curso con la señal de cierre y lo que quede en cola se marca `failed` con un contexto fresco y corto (FR-010).

**Alternativas**: guardar el mensaje cifrado en una tabla outbox (guarda la ficha en la base, contra el diseño de la spec 032); mandar de forma síncrona en el handler (hace esperar a la dueña hasta ~70 s: contra SC-004); `FOR UPDATE SKIP LOCKED` sobre filas `sending` (no hay de dónde sacar la ficha).

## R5 — Contenido del correo

**Decisión**: texto plano **y** HTML mínimo (un párrafo y un enlace `<a href>` con el texto «Aceptar invitación»; sin imágenes, sin CSS externo, sin píxel). Lleva **solo**: nombre de pila de quien invita, rol (Tutor / Cuidador) con lo que podrá hacer, vencimiento de la liga, el enlace y el aviso «si no lo esperabas, puedes ignorarlo». Detalle en [contracts/email.md](./contracts/email.md).

- **Nombre de pila**: el de la cuenta que invita (la dueña o un Tutor), recortado a 40 caracteres y pasado por `mailer.Clean` (sin saltos de línea ni caracteres de control, sin parecer correo/UUID/ficha); en HTML con `html.EscapeString`. Un nombre vacío tras limpiar se reemplaza por «Alguien de tu familia».
- **Descripción del rol**: las frases de `ROLE_CAN` del frontend (`roles.ts`), copiadas como constantes en español en Go. Se acepta la copia (son dos líneas; un cambio de redacción en un lado se ve en la revisión) y una prueba fija el texto del correo.
- **Vencimiento**: fecha en hora de Ciudad de México con nombres de mes fijos («13 de octubre de 2026»), sin hora.
- **Liga**: `FRONTEND_ORIGIN` (sin barra final) + `/familia/invitacion#` + ficha. Sin `FRONTEND_ORIGIN` (vacío), no se manda correo (estado `none`): la liga no se puede armar bien.
- **Asunto**: «<Nombre> te invitó a PediTrack». Sin el nombre de la dueña completo ni de los hijos.

**Alternativas**: solo texto (la liga larga con `#` se ve fea y algunos clientes la parten); plantilla HTML elaborada (fuera de alcance).

## R6 — Sin seguimiento ni acortador (verificado en la documentación de Resend)

Resend configura el seguimiento **por dominio, no por petición**: `open_tracking`, `click_tracking` y `tracking_subdomain` (en el panel, pestaña *Configuration*, o por `PATCH /domains/{id}`), y está **desactivado por omisión en todos los dominios**. El seguimiento de clics reescribe los enlaces a un subdominio de seguimiento, que expondría la ficha a un tercero.

**Decisión**: no se hace nada en el código (no existe campo por petición); es un **paso manual del dueño** —confirmar que ambos estén apagados en el dominio `pedi-track.com`— y queda en `DEPLOY.md` y en el quickstart. Una prueba del adaptador comprueba que el cuerpo enviado no trae ningún campo de seguimiento y que el enlace del HTML es exactamente la liga. Tampoco se agrega `List-Unsubscribe`: es correo transaccional de una acción de la dueña, no una lista.

## R7 — Respuestas y API: sin endpoint nuevo

**Decisión**: `createdInvitationResponse` e `invitationResponse` ganan `emailStatus` (`none`/`sending`/`sent`/`failed`) y `emailStatusAt` (instante o `null`); campos nuevos, así quien no los lee no se rompe (FR-018). La lista ya existe (`GET /family`) y sirve para refrescar el estado. Swagger se regenera.

## R8 — Frontend

**Decisión**: cambios mínimos en `features/family/`: `InviteLink` («Liga lista») muestra «Enviamos la invitación a <correo>» y el estado de **esa** invitación, que se lee de `useFamily` por `id` (no del cuerpo de la respuesta de crear, que solo trae el estado inicial); `useFamily` refresca cada 3 s **mientras alguna invitación esté `sending`** (`refetchInterval` de TanStack Query) y se detiene sola; `InvitationsList` muestra una línea de estado por pendiente. Con `none` no se muestra nada de correo (funciona como hoy). Textos en `features/family/` sin culpar: «Enviando la invitación a …», «Invitación enviada a …», «No se pudo enviar el correo. Copia la liga y mándala tú.». Web y móvil comparten los componentes que ya usan los dos diseños de la pantalla; no hay mock nuevo.

## R9 — Configuración y correo falso para pruebas

**Decisión**: variables nuevas con valor por omisión: `MAIL_DAILY_CAP` (100), `MAIL_INVITATION_CAP` (95), `MAIL_WARN_AT` (80), `INVITATION_EMAIL_PER_INVITATION_PER_DAY` (3), `INVITATION_EMAIL_PER_FAMILY_PER_DAY` (10), `MAIL_FROM` (por omisión el de `ERROR_DIGEST_FROM`, y si no, `PediTrack <alertas@pedi-track.com>`). Un valor inválido o incoherente (tope de invitaciones mayor que el diario, aviso mayor que el tope) vuelve al valor por omisión sin detener el servicio. Reutiliza `RESEND_API_KEY` y `FRONTEND_ORIGIN`.

`MAIL_DRIVER=discard` activa un `DiscardSender` que **no manda nada** y responde éxito: sirve para las E2E y el desarrollo local (el flujo completo —cola, cuota, estados— corre de verdad). En producción no se pone. Sin `RESEND_API_KEY` y sin `MAIL_DRIVER`, no hay despachador y el estado de toda invitación es `none` (FR-016).

## R10 — Reportes y privacidad

**Decisión**: `jobreport.New(errorLogRepo, "mailer")` con tipos y mensajes fijos: `send` («invitation e-mail failed: could not send»), `quota` («daily e-mail quota reached the warning threshold: N of M»), `store` («mail quota counter failed: could not read or update the daily count»). Una cancelación por cierre del servicio no es falla. Nada de direcciones, ligas, fichas, clave ni texto del proveedor llega a un log, `error_logs`, un error o el contador (FR-015); una prueba lo comprueba (R8 de la spec 039 como modelo). La clave de idempotencia es `family-invitation-<id de la invitación>-<n.º de envío del día>` (sin la ficha ni el correo).
