---

description: "Lista de tareas de la spec 040: invitación a la familia por correo"
---

# Tareas: Invitación a la familia por correo

**Entrada**: `/specs/040-invitacion-familiar-por-correo/` (plan.md, spec.md, research.md R1–R10, data-model.md, contracts/api.md, contracts/email.md, contracts/configuration.md, quickstart.md)

**Pruebas**: obligatorias (Principio VI): >90 % en Go y en el frontend; se escriben **antes** del código de la tarea que prueban cuando la tarea lo dice (TDD). Sin endpoints nuevos (se amplían respuestas existentes, siguen por `*httpx.Responder`). Un solo PR a `develop`, **un commit por fase**.

**Organización**: la migración, la extracción a `internal/mailer`, la cuota y el estado en el repositorio van primero (bloquean todo). Después, una fase por historia: **US1** (la persona invitada recibe el correo) es el MVP; **US3** (una falla nunca estorba) endurece el envío de US1; **US2** (la dueña ve el estado y puede copiar la liga) es la API ampliada y la pantalla; **US4** (vigilar la cuota y no abusar) agrega los límites por invitación y por familia y la reserva del digest.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos y sin depender de una tarea sin terminar).
- **[US1]…[US4]**: la historia de `spec.md` a la que sirve.
- **[DUEÑO]**: la hace el dueño del producto en un panel o en el servidor, **no es código**; no bloquea la implementación, solo la prueba real y el despliegue.
- Convenciones del repo: código y esquema en inglés, docs en español; archivos con CRLF (editar con cuidado de no mezclar finales de línea; para Go usar el script de formato CRLF de la sesión anterior o `gofmt` y revisar `git diff --stat`); base local: `DATABASE_URL="postgres://root:abcd1234@localhost:5432/pediTrack?sslmode=disable"` en `backend/.env.local`; aplicar migraciones con un script de `node` con `pg` (el `psql` se cuelga en esta máquina); `go test -race` no está disponible (sin cgo); la prueba de cuentas puede ser inestable bajo carga (repetir una vez antes de investigar).

---

## Fase 1: Configuración

- [X] T001 Línea base: `cd backend && set -a && . ./.env.local && set +a && go vet ./... && go test ./internal/... -cover` y `cd ../frontend && npx vitest run --coverage` en verde antes de empezar (anotar la cobertura de `internal/family`, `internal/errordigest` y `features/family`: no debe bajar de 90 %)
- [X] T002 Crear `backend/migrations/0025_invitation_email_and_mail_quota.sql` según `data-model.md`: (a) `CREATE TABLE mail_daily_counts (day DATE PRIMARY KEY, sent INTEGER NOT NULL DEFAULT 0 CHECK (sent >= 0), warned BOOLEAN NOT NULL DEFAULT false)`; (b) `ALTER TABLE family_invitations ADD COLUMN email_status TEXT NOT NULL DEFAULT 'none' CHECK (email_status IN ('none','sending','sent','failed')), ADD COLUMN email_status_at TIMESTAMPTZ NULL, ADD COLUMN email_sends_day DATE NULL, ADD COLUMN email_sends_count INTEGER NOT NULL DEFAULT 0 CHECK (email_sends_count >= 0)`; (c) `CREATE INDEX idx_family_invitations_email_sending ON family_invitations (email_status_at) WHERE email_status = 'sending'`; comentario de cabecera con la spec (sin acentos como las migraciones anteriores); aplicarla a la base local y comprobar con `node`/`pg` que la tabla, las cuatro columnas y el índice existen y que las invitaciones previas quedaron en `none`/`NULL`/`NULL`/`0`

**Punto de Control**: migración aplicada en local; línea base en verde. **Commit de fase**: «feat(040): migración 0025 (cuota diaria de correos y estado del correo de la invitación)».

---

## Fase 2: Base compartida (bloquea las cuatro historias)

**Objetivo**: el paquete común `internal/mailer`, la cuota y el estado del correo en el modelo y el repositorio de `family`.

### Extraer `internal/mailer` de `errordigest` (R1): mover, no copiar

- [X] T003 Crear `backend/internal/mailer/message.go` y `sender.go` **moviendo** (con `git mv` para conservar el historial) `backend/internal/errordigest/sender.go` y `sender_test.go`: `package mailer`; `Message{From, To, Subject, Text, HTML, IdempotencyKey string}` (campo `HTML` nuevo, opcional), `Sender`, `SendError`, `IsRetryable`, `ResendSender`, `NewResendSender`, `DefaultBaseURL`; en `ResendSender.Send` agregar `"html": m.HTML` al cuerpo **solo si `m.HTML != ""`**; sin ningún campo de seguimiento. Dejar el comentario de la interfaz `Sender` actualizado (ya no dice «una tarea posterior»)
- [X] T004 [P] Mover `backend/internal/errordigest/sanitize.go` y `sanitize_test.go` a `backend/internal/mailer/clean.go` y `clean_test.go`: la función pasa a ser `Clean(s string, maxRunes int) string` exportada (mismo comportamiento: controles y saltos a espacio, correo → `[correo]`, UUID → `[id]`, tokens largos con dígitos → `[token]`, recorte con «…» **después** de reemplazar); `maxMessageRunes = 160` se queda en `errordigest` como constante de su contenido
- [X] T005 [P] Crear `backend/internal/mailer/retry.go`: `SendWithRetries(ctx context.Context, sender Sender, m Message, waits []time.Duration, attemptTimeout time.Duration, sleep func(context.Context, time.Duration) error) error` con la lógica que hoy tiene `errordigest.Service.sendWithRetries` (intenta `len(waits)+1` veces, cada una con su `attemptTimeout`, devuelve de inmediato si el contexto se cancela o el error no es reintentable, espera `waits[i]` entre intentos con `sleep`); más `SleepContext` exportada (la de `errordigest.sleepContext`). Prueba `retry_test.go`: éxito al segundo intento, definitivo corta, agotado devuelve el último error, contexto cancelado, `sleep` falso
- [X] T006 Actualizar `backend/internal/errordigest` para usar `mailer`: borrar sus `sender.go`/`sanitize.go` (ya movidos), cambiar los tipos a `mailer.Message`/`mailer.Sender`/`mailer.IsRetryable`/`mailer.Clean(s, maxMessageRunes)`, y hacer que `Service.sendWithRetries` llame a `mailer.SendWithRetries(ctx, s.sender, m, retryWaits[:], attemptTimeout, s.sleep)`; ajustar los imports de `service.go`, `content.go`, `service_test.go`, `tick_test.go`, `failure_test.go`, `privacy_test.go`, `content_test.go` y de `backend/cmd/api/main.go` (`mailer.NewResendSender`). **Sin alias ni copias**: `grep -rn "errordigest.Message\|errordigest.NewResendSender\|func cleanMessage" backend` debe quedar vacío. `go test ./internal/errordigest/... ./internal/mailer/...` en verde con la misma cobertura de antes
- [X] T007 [P] Prueba nueva en `backend/internal/mailer/sender_test.go`: con `Message.HTML` el cuerpo JSON trae `html`; sin `HTML` no trae la clave; el cuerpo **no** trae ningún campo `tracking`, `open_tracking` ni `click_tracking`

### Configuración, envío descartado y cuota (R2, R9)

- [X] T008 [P] Crear `backend/internal/mailer/config.go` + `config_test.go`: `Config{APIKey, From, Driver string; DailyCap, InvitationCap, WarnAt, PerInvitationPerDay, PerFamilyPerDay int}` y `ConfigFromEnv()` según `contracts/configuration.md`: `RESEND_API_KEY`, `MAIL_FROM` (si falta, `ERROR_DIGEST_FROM`, y si falta, `PediTrack <alertas@pedi-track.com>`), `MAIL_DRIVER` (solo `discard` es válido; otro valor = vacío), `MAIL_DAILY_CAP` 100, `MAIL_INVITATION_CAP` 95, `MAIL_WARN_AT` 80, `INVITATION_EMAIL_PER_INVITATION_PER_DAY` 3, `INVITATION_EMAIL_PER_FAMILY_PER_DAY` 10; enteros ≥ 1; si algún valor es inválido o rompe `WarnAt <= InvitationCap <= DailyCap`, **los tres topes vuelven a 80/95/100** (los dos límites por día se validan solos). `Available() bool`: hay clave o `Driver == "discard"`. Pruebas: valores por omisión, inválidos, incoherencia, recorte de espacios, `Available`, y que nada se imprime ni se devuelve en texto
- [X] T009 [P] Crear `backend/internal/mailer/discard.go` + prueba: `DiscardSender` (`Send` devuelve `nil` sin hacer nada de red) y `NewSender(cfg Config, client *http.Client) Sender` que devuelve `DiscardSender` si `cfg.Driver == "discard"`, `ResendSender` si hay clave y `nil` si no hay ninguno
- [X] T010 [P] Crear `backend/internal/mailer/repository.go` (`Store` sobre `mail_daily_counts`, constructor `NewRepository(pool)`): `Reserve(ctx, day time.Time, cap int) (count int, ok bool, err error)` con **una sola sentencia** `INSERT INTO mail_daily_counts (day, sent) VALUES ($1, 1) ON CONFLICT (day) DO UPDATE SET sent = mail_daily_counts.sent + 1 WHERE mail_daily_counts.sent < $2 RETURNING sent` (sin fila → `ok=false`; con `cap < 1` el primer `INSERT` tampoco se acepta: comprobar `cap >= 1` antes); `Release(ctx, day)` (`UPDATE … SET sent = sent - 1 WHERE day = $1 AND sent > 0`); `MarkWarned(ctx, day, threshold int) (first bool, err error)` (`UPDATE … SET warned = true WHERE day = $1 AND NOT warned AND sent >= $2 RETURNING true`, `first` = devolvió fila). `day` se pasa como `date` (sin hora)
- [X] T011 Crear `backend/internal/mailer/quota.go`: `Class` (`ClassInvitation`, `ClassDigest`), `ErrQuotaExceeded`, interfaces `Store` (las tres operaciones de T010) y `Reporter` (`Report(kind, message string, accountID *uuid.UUID)` y `Recovered(kind string)`, el contrato de `jobreport.Reporter`), `Ticket{Day time.Time}` y `Quota` (`NewQuota(store Store, cfg Config, reporter Reporter)` con reloj inyectable `now func() time.Time`): `Reserve(ctx, class) (Ticket, error)` calcula el día en `America/Mexico_City` (`import _ "time/tzdata"`, respaldo `FixedZone("CST", -6*3600)`), usa el tope `cfg.InvitationCap` para `ClassInvitation` y `cfg.DailyCap` para `ClassDigest`, devuelve `ErrQuotaExceeded` cuando el almacén dice `ok=false`, y tras reservar con éxito y `count >= cfg.WarnAt` llama a `MarkWarned` y, **solo si `first`**, reporta kind `quota` con el mensaje fijo `daily e-mail quota reached the warning threshold: N of M` (N = conteo, M = `InvitationCap`); un error del almacén se reporta como kind `store` con `mail quota counter failed: could not read or update the daily count` y se devuelve envuelto (sin texto de la base en el reporte). `Refund(ctx, t Ticket)` llama a `Release` con **el día del ticket** (no el de hoy). Los kinds y mensajes son constantes del paquete
- [X] T012 `backend/internal/mailer/quota_test.go` (base real; días de prueba lejanos en el futuro, p. ej. 2099-xx, para no tocar el conteo real; limpiar al terminar): reserva hasta el tope y la siguiente da `ErrQuotaExceeded`; **dos o más goroutines** compitiendo por los últimos cupos nunca pasan el tope; `Refund` devuelve el cupo del día del ticket aunque el reloj ya sea otro día; el día en CDMX cambia a medianoche **de México** (23:59 −06:00 y 00:00 −06:00, con reloj falso); el aviso sale **una sola vez** por día aunque se reserve varias veces y desde goroutines; `ClassDigest` sigue reservando con el contador en `InvitationCap` hasta `DailyCap`; un `Store` falso que falla reporta `store` y no filtra su texto; el reporte `quota` no trae direcciones, ligas ni claves

### Estado del correo en `family` (modelo y repositorio base)

- [X] T013 [P] `backend/internal/family/model.go`: tipo `EmailStatus string` con `EmailNone = "none"`, `EmailSending = "sending"`, `EmailSent = "sent"`, `EmailFailed = "failed"`; `Invitation` gana `EmailStatus EmailStatus` y `EmailStatusAt *time.Time`. `backend/internal/family/repository.go`: agregar las dos columnas a `invitationColumns` y a `scanInvitation` (todas las consultas que usan `invitationColumns` siguen funcionando: `ListInvitations`, `CreateInvitation`, `Resend`); prueba en `family_test.go` de que una invitación nueva sin proveedor queda en `none` con `EmailStatusAt == nil`
- [X] T014 `backend/internal/family/repository.go`: `SetEmailStatus(ctx, invitationID uuid.UUID, tokenHash []byte, from, to EmailStatus) (bool, error)` con `UPDATE family_invitations SET email_status = $4, email_status_at = now() WHERE id = $1 AND token_hash = $2 AND email_status = $3` (devuelve si cambió una fila: **condicional por `token_hash`**, así un envío viejo no pisa el de un reenvío); `StillCurrent(ctx, invitationID, tokenHash) (bool, error)` (`status = 'pending' AND expires_at > now() AND token_hash = $2`); `SweepStaleSending(ctx, olderThan time.Duration) (int64, error)` (`UPDATE … SET email_status = 'failed', email_status_at = now() WHERE email_status = 'sending' AND email_status_at < now() - $1::interval`, devuelve cuántas). Pruebas en `family_test.go`/`email_repository_test.go` con base real: cambio con el hash correcto y con uno viejo (no cambia), `StillCurrent` tras reenviar/cancelar/vencer, barrido solo de las viejas

**Punto de Control**: `go test ./internal/mailer/... ./internal/errordigest/... ./internal/family/... -cover` en verde, `go vet ./...` limpio. **Commit de fase**: «feat(040): internal/mailer (adaptador movido de errordigest, cuota diaria compartida) y estado del correo en family».

---

## Fase 3: US1 - La persona invitada recibe la invitación en su correo (Prioridad: P1) 🎯 MVP

**Objetivo**: al crear o reenviar, sale **un** correo con el hipervínculo a la liga; sin acortador, sin seguimiento y con solo lo que permite el Principio II.

**Prueba independiente**: con un `Sender` falso, crear una invitación deja un solo mensaje con el nombre de pila, el rol, el vencimiento y un `href` igual a la liga; reenviar manda el de la liga nueva; cancelar no manda nada.

### Pruebas (primero; deben fallar antes de la implementación)

- [X] T015 [P] [US1] `backend/internal/family/emailcontent_test.go`: el mensaje trae asunto `<Nombre> te invitó a PediTrack`, texto y HTML según `contracts/email.md` (rol Tutor / Cuidador con su frase `ROLE_CAN`, fecha «13 de octubre de 2026» en hora de CDMX con meses fijos —cuidar el cruce de día: 2026-10-13 02:00 UTC es 12 de octubre en México—, aviso «si no esperabas esta invitación, puedes ignorar este mensaje»); el `href` del HTML es **exactamente** la liga `FRONTEND_ORIGIN + "/familia/invitacion#" + ficha` (con y sin `/` final en el origen) y **ninguna otra URL** aparece en el texto ni el HTML; un nombre con `<script>`, saltos de línea, forma de correo o de ficha sale limpio y escapado y se recorta a 40 caracteres; un nombre vacío tras limpiar es «Alguien de tu familia»; **privacidad**: con una cuenta sembrada con hijos (nombres, fecha de nacimiento) y con apellido y correo de quien invita, ninguno de esos valores aparece en el asunto, el texto ni el HTML
- [X] T016 [P] [US1] `backend/internal/family/emaildispatch_test.go` (base real + `Sender` falso que registra los mensajes y una `Quota` real con día de prueba): un trabajo vigente sale una vez y la fila pasa a `sent`; un trabajo cuya invitación fue **reenviada** (otro `token_hash`) **no sale** y no cambia el estado de la fila (que ya es del reenvío); uno de una invitación **cancelada**, **aceptada** o **vencida** no sale; la clave de idempotencia es `family-invitation-<id>-<n.º de envío>` y no contiene la ficha ni el correo; con la cuota llena el trabajo termina `failed` sin llamar al `Sender`
- [X] T017 [P] [US1] `backend/internal/family/family_test.go` (servicio con despachador falso): `Invite` y `Resend` con proveedor disponible dejan `EmailStatus == sending`, entregan **un** trabajo al despachador (con la ficha dentro del texto) y regresan sin esperar; `Cancel` no entrega nada; sin proveedor (`nil`) o sin `FRONTEND_ORIGIN` el estado es `none` y nada se entrega; una dueña sin plan de pago sigue recibiendo `ErrPlanRequired` y no se entrega nada (FR de la spec 032)

### Implementación

- [X] T018 [US1] Crear `backend/internal/family/emailcontent.go`: `type inviteMail struct{...}` y `buildInviteMessage(from, to, origin, token, inviterFirstName string, role Role, expiresAt time.Time, idemKey string) mailer.Message` que devuelve asunto, `Text` y `HTML` mínimo (un `<p>` por párrafo, un único `<a href="…">Aceptar invitación</a>` y la liga en texto debajo, `html.EscapeString` para el nombre y el href; sin imágenes, CSS externo, píxeles ni `<script>`); nombre limpio con `mailer.Clean(name, 40)` y respaldo «Alguien de tu familia»; fecha con meses fijos en español en `America/Mexico_City`; frases de rol copiadas de `frontend/src/features/family/roles.ts` (`ROLE_CAN`) como constantes con un comentario que nombra el archivo del frontend; liga `strings.TrimRight(origin, "/") + "/familia/invitacion#" + token`
- [X] T019 [US1] `backend/internal/family/repository.go`: `AccountFirstName(ctx, accountID) (string, error)` (`SELECT first_name FROM accounts WHERE id = $1`); y en `CreateInvitation`/`Resend` un parámetro `emailWanted bool` (el servicio sabe si hay despachador): dentro de la transacción, ya con la fila bloqueada, si `emailWanted` el `INSERT`/`UPDATE` deja `email_status = 'sending'`, `email_status_at = now()`, `email_sends_day = <hoy en CDMX>` y `email_sends_count` (reinicia a 1 si el día cambió, suma 1 si es el mismo) y `RETURNING` lo trae; si no, `none`. (Los **límites** por invitación y por familia son de US4: aquí `emailWanted` siempre da `sending`.) Actualizar las llamadas existentes y sus pruebas
- [X] T020 [US1] Crear `backend/internal/family/emaildispatch.go`: `EmailJob{InvitationID uuid.UUID; TokenHash []byte; Message mailer.Message}` (comentario: contiene la ficha, vive solo en memoria y **nunca** se registra ni serializa; sin `String()`/`Format` que lo imprima) y `EmailDispatcher` con `NewEmailDispatcher(repo *Repository, sender mailer.Sender, quota *mailer.Quota, reporter mailer.Reporter)`: cola `chan EmailJob` de **64**, `Enqueue(job) bool` no bloqueante (devuelve `false` si está llena), y 2 trabajadores (`Start(ctx)`) que por cada trabajo ejecutan `deliver`: (1) `StillCurrent`; si no, lo sueltan sin tocar nada; (2) `quota.Reserve(ctx, ClassInvitation)`: `ErrQuotaExceeded` o error → `SetEmailStatus(sending→failed)`; (3) `sender.Send` **una vez** con `attemptTimeout` de 15 s (los reintentos son de US3); éxito → `SetEmailStatus(sending→sent)`; falla → `quota.Refund` + `sending→failed`. Todas las escrituras de estado con un contexto propio corto para que sigan aunque el trabajo se cancele
- [X] T021 [US1] `backend/internal/family/service.go`: `Service` gana `SetEmail(d *EmailDispatcher, from, origin string)` (sin llamarlo, el servicio actúa como hoy); `Invite` y `Resend` leen el nombre de pila de quien invita (`AccountFirstName(actorID)`), arman el mensaje con `buildInviteMessage` (la clave de idempotencia usa el id de la invitación y su `email_sends_count`), llaman a la creación con `emailWanted = dispatcher != nil && origin != ""` y, **después** del commit y solo si el estado quedó `sending`, `Enqueue`; si `Enqueue` devuelve `false` (cola llena) marcan `sending→failed` y devuelven la invitación con ese estado. Un error al leer el nombre **no** impide la invitación: se usa «Alguien de tu familia». `Cancel` no cambia
- [X] T022 [US1] `backend/cmd/api/main.go`: leer `mailer.ConfigFromEnv()`; si `cfg.Available()` y hay `FRONTEND_ORIGIN`: `quota := mailer.NewQuota(mailer.NewRepository(pool), cfg, jobreport.New(errorLogRepo, "mailer"))`, `dispatcher := family.NewEmailDispatcher(...)`, `go dispatcher.Start(ctx)`, `familyService.SetEmail(dispatcher, cfg.From, frontendOrigin)`; si no, una línea de consola que nombra la variable que falta y **nunca** un valor (`invitation e-mails unavailable: RESEND_API_KEY (or MAIL_DRIVER=discard) and FRONTEND_ORIGIN must be set`). Mover la lectura de `FRONTEND_ORIGIN` antes de armar `familyService` si hace falta. Respetar el orden: el despachador se arma antes del handler de `family`

**Punto de Control**: `go test ./internal/family/... -cover` y `go vet ./...` en verde; con `MAIL_DRIVER=discard` en local, crear una invitación deja la fila en `sent` en unos segundos. **Commit de fase**: «feat(040): US1 - correo de invitación al crear y reenviar (contenido, despachador y servicio)».

---

## Fase 4: US3 - Una falla de correo nunca estorba a la invitación (Prioridad: P1)

**Objetivo**: reintentos acotados, estado que no se queda en «enviándose», reportes `job:mailer` sin datos personales, y la invitación siempre intacta.

**Prueba independiente**: con un proveedor que falla dos veces y acepta la tercera, el correo sale; con uno que falla siempre, la invitación existe, su estado es `failed` y hay **una** fila `job:mailer` sin ningún dato personal.

### Pruebas (primero)

- [X] T023 [P] [US3] `backend/internal/family/emaildispatch_failure_test.go` (base real, `Sender` falso programable, `sleep` falso): falla temporal dos veces y éxito a la tercera → `sent` y **un** cupo gastado; falla siempre → 3 intentos, `failed`, cupo devuelto y **una** entrada de reporte kind `send` con el mensaje fijo `invitation e-mail failed: could not send`; rechazo definitivo (4xx) → un intento y `failed`; **409 de idempotencia** (usar el `ResendSender` real contra `httptest` que responde 409 con «idempotent») → `sent` sin segundo envío; un reenvío que ocurre **entre intentos** hace que el siguiente intento no salga (vigencia revisada antes de cada intento) y no pisa el estado nuevo; el contexto cancelado no cuenta como falla del proveedor ni se reporta; un fallo del reporte o de la base no se propaga a quien invitó
- [X] T024 [P] [US3] `backend/internal/family/emaildispatch_lifecycle_test.go`: `Stop`/cierre con trabajos en cola → todos quedan `failed` (contexto fresco y corto) y ninguno queda `sending`; el barrido corre al arrancar y cada intervalo, deja en `failed` solo las filas `sending` con más de 3 minutos (reloj/intervalo inyectables) y no toca las recientes; un `Enqueue` con la cola llena devuelve `false`
- [X] T025 [P] [US3] `backend/internal/family/privacy_test.go`: se ejecuta el flujo completo (crear, reenviar, falla del proveedor, cuota llena) capturando la salida de `log`, las filas de `error_logs` con `endpoint = 'job:mailer'` y los errores devueltos: **ni el correo del invitado, ni la liga, ni la ficha, ni la clave de API** aparecen en ninguno; `mail_daily_counts` solo tiene `day`, `sent` y `warned`; y `invitation_*` no guarda el texto del mensaje (las columnas de `family_invitations` son las del `data-model.md`)

### Implementación

- [X] T026 [US3] `backend/internal/family/emaildispatch.go`: cambiar el envío de un solo intento por `mailer.SendWithRetries(ctx, sender, msg, []time.Duration{5*time.Second, 20*time.Second}, 15*time.Second, sleep)` **con la revisión de vigencia dentro de cada intento** (envolver el `Sender` en un adaptador que, antes de cada `Send`, llama a `StillCurrent` y devuelve un error interno «obsoleto» no reintentable si ya no lo es; ese error suelta el trabajo sin marcar nada); `sleep` y las esperas son campos para que las pruebas no esperen; fallas definitivas o agotadas → `quota.Refund`, `sending→failed` y `reporter.Report("send", "invitation e-mail failed: could not send", nil)`; éxito → `reporter.Recovered("send")`; un error por cierre del servidor no se reporta
- [X] T027 [US3] `backend/internal/family/emaildispatch.go`: barrido y cierre — `Start(ctx)` llama a `SweepStaleSending(ctx, 3*time.Minute)` al arrancar y cada minuto (intervalo campo del despachador); cuando `ctx` se cancela los trabajadores terminan el intento en curso con ese contexto, y lo que quede en la cola (y el trabajo cancelado) se marca `sending→failed` con `context.WithTimeout(context.WithoutCancel(ctx), 2*time.Second)`; `Start` regresa solo cuando los trabajadores terminaron (`sync.WaitGroup`). Un error del barrido se reporta con un kind `sweep` y mensaje fijo `invitation e-mail failed: could not resolve stuck sends` (agregarlo a las constantes de mensajes)
- [X] T028 [US3] `backend/cmd/api/main.go`: confirmar que el cierre del servidor espera al despachador un máximo de pocos segundos (el mismo patrón de apagado que ya usa el digest) y que un fallo al arrancar el despachador no impide que el API arranque

**Punto de Control**: `go test ./internal/family/... ./internal/mailer/... -cover` en verde (≥ 90 %). **Commit de fase**: «feat(040): US3 - reintentos acotados, barrido de envíos atorados, cierre limpio y reportes job:mailer».

---

## Fase 5: US2 - La dueña ve qué pasó con el correo y puede copiar la liga (Prioridad: P1)

**Objetivo**: la API devuelve el estado del correo y la pantalla Familia lo muestra (web y móvil), conservando «Copiar liga».

**Prueba independiente**: se crea una invitación con el envío disponible (se ve «enviándose» y luego «enviado»), una con el proveedor caído («no se pudo enviar, copia la liga») y una sin proveedor (la pantalla funciona como hoy): en los tres casos la liga se puede copiar.

### Pruebas (primero)

- [X] T029 [P] [US2] `backend/internal/family/handler_test.go` (o el archivo de pruebas de handler existente): `POST /family/invitations`, `POST /family/invitations/{id}/resend` y `GET /family` devuelven `emailStatus` (`none|sending|sent|failed`) y `emailStatusAt` (instante RFC 3339 o `null`) según `contracts/api.md`; los campos viejos no cambian de nombre ni de tipo; `GET /family` de un Cuidador sigue sin listar invitaciones
- [ ] T030 [P] [US2] `frontend/src/features/family/emailStatus.test.ts`: la función de textos devuelve, por estado, el mensaje de la tarjeta y de la lista según el diseño de abajo; `none` devuelve `null` (no se muestra nada de correo)
- [ ] T031 [P] [US2] `frontend/src/features/family/InviteLink.test.tsx` y `InvitationsList.test.tsx` (ya existen o se crean junto a `FamilyPage.test.tsx`): la tarjeta «Liga lista» dice «Enviando la invitación a <correo>…» con `sending`, «Invitación enviada a <correo>» con `sent` y «No se pudo enviar el correo. Copia la liga y mándala tú.» con `failed`, **toma el estado de `useFamily` por id** (no del cuerpo de la respuesta de crear) y cambia solo cuando el listado cambia; «Copiar liga» está presente en los cuatro estados; con `none` no hay línea de correo; la lista de pendientes muestra el estado de cada invitación con la hora relativa/fija ya usada (`formatInstant`); el aviso legal no cambia. `useFamily.test.ts`: `refetchInterval` es 3000 ms mientras alguna invitación tenga `emailStatus === 'sending'` y `false` si no (y se detiene sola)

### Implementación

- [X] T032 [US2] `backend/internal/family/handler.go`: `invitationResponse` y `createdInvitationResponse` ganan `EmailStatus string` (`json:"emailStatus" enums:"none,sending,sent,failed" example:"sending"`) y `EmailStatusAt *string` (`json:"emailStatusAt" example:"2026-10-12T14:00:00Z"`), llenados en `toInvitationResponse` y `toCreatedResponse`; actualizar las anotaciones swag de `CreateInvitation`/`ResendInvitation`/`GetFamily` (descripción: el correo no bloquea la respuesta; `emailStatus` inicial); regenerar Swagger (`swag init` con la versión fijada en CI: `go run github.com/swaggo/swag/cmd/swag@v1.16.6` o la que use `backend/CLAUDE.md`) y comprobar que el diff de `docs/` solo trae estos campos
- [ ] T033 [P] [US2] `frontend/src/features/family/types.ts`: `EmailStatus = 'none' | 'sending' | 'sent' | 'failed'`; `FamilyInvitation` y `CreatedInvitation` ganan `emailStatus: EmailStatus` y `emailStatusAt: string | null`. Crear `frontend/src/features/family/emailStatus.ts` con `emailStatusText(status, email)` → `{ tone, text } | null` (textos de T031; tonos neutros, nunca rojo ni "culpa": usar los tokens existentes `text-body`/`text-ink-muted`, el punteado o el ámbar del sistema sin tratarlo como error)
- [ ] T034 [US2] `frontend/src/features/family/useFamily.ts`: `refetchInterval: (query) => query.state.data?.invitations.some((i) => i.emailStatus === 'sending') ? 3000 : false`. `frontend/src/features/family/InviteLink.tsx`: recibe también el `FamilyView`/lista (o usa `useFamily`) para leer el estado de **esa** invitación por `invitation.id` (si no aparece aún, usa `invitation.emailStatus` de la respuesta), muestra la línea de estado bajo el título «Liga lista» (`role="status"`, `aria-live="polite"` para que el cambio a «enviado» se anuncie), y ajusta el título/lead: con `sending`/`sent` «Enviamos la invitación a <correo>» y «Copiar liga» como botón conservado; con `failed` el texto de falla; con `none` el texto de hoy («Envíale esta liga por mensaje»). Sin cambios de estructura ni de estilos fuera de esa línea (mock de la spec 032 intacto)
- [ ] T035 [US2] `frontend/src/features/family/InvitationsList.tsx`: una línea de estado del correo bajo cada pendiente (`emailStatusText`), en los dos diseños que ya usa el componente (`variant`); `none` no pinta nada. Revisar que el texto no desborda a 390 px
- [ ] T036 [US2] E2E `frontend/e2e/familia.spec.ts` (a 390 y 1280 px, como los flujos que ya tiene, con dos sesiones): con el backend en `MAIL_DRIVER=discard`, la dueña invita y la tarjeta pasa a «Invitación enviada a <correo>» sin recargar, «Copiar liga» sigue funcionando y la lista de pendientes muestra el estado. Agregar `MAIL_DRIVER: discard` al `env` del paso que arranca el backend en `.github/workflows/ci.yml` (junto a `FRONTEND_ORIGIN`) y documentarlo en `frontend/CLAUDE.md`/`backend/CLAUDE.md` (T047); para correr en local, `MAIL_DRIVER=discard` al levantar el backend. Si el estado `sent` llega tan rápido que no se alcanza a ver `sending`, la prueba solo exige el estado final

**Punto de Control**: `go test ./internal/family/... -cover`, `cd frontend && npx vitest run --coverage` y `npx playwright test familia` en verde. **Commit de fase**: «feat(040): US2 - estado del correo en la API y en la pantalla Familia».

---

## Fase 6: US4 - Se vigila la cuota diaria y no se abusa del envío (Prioridad: P2)

**Objetivo**: límites por invitación (3/día) y por familia (10/día), aviso a los 80 una sola vez, tope de invitaciones en 95 y el digest que sigue pudiendo salir.

**Prueba independiente**: con el contador en 79, 80, 94 y 95: el aviso sale una vez en el 80; en 95 no se manda la invitación (queda `failed`) y el digest sí; una invitación reenviada el cuarto correo del día ya no manda correo.

### Pruebas (primero)

- [X] T037 [P] [US4] `backend/internal/family/email_limits_test.go` (base real): la 1.ª, 2.ª y 3.ª petición de correo de una misma invitación en el día quedan `sending`; la 4.ª queda `failed` **sin** sumar al conteo y **la liga nueva sí se genera** (el hash cambia); el conteo se reinicia al día siguiente en CDMX (reloj del repositorio `r.now()`); una familia con 10 correos pedidos entre sus invitaciones deja la 11.ª `failed` aunque su invitación tenga cupo; **otra familia** no se ve afectada; cancelar e invitar de nuevo al mismo correo no reinicia el conteo de la familia; los límites vienen de `mailer.Config` (cambiar el valor cambia el comportamiento)
- [X] T038 [P] [US4] `backend/internal/errordigest/quota_test.go` (o en `tick_test.go`): con un `Quota` real y el contador de hoy en `InvitationCap` (95), `Tick` del digest **sí** envía (SC-006) y el contador sube; si el envío falla del todo se devuelve el cupo (`Refund`); con el día en `DailyCap` (100) `Tick` no envía, **libera la semana** (se puede reclamar de nuevo) y reporta el kind `send`; sin `Quota` (nil) el digest se comporta exactamente como antes
- [X] T039 [P] [US4] `backend/internal/mailer/quota_test.go` (ampliar T012 si falta): escenarios 79 / 80 / 94 / 95 con aviso exacto una vez (`warned`), y el aviso persiste aunque el reporte falle (un fallo de `Report` no se propaga)

### Implementación

- [X] T040 [US4] `backend/internal/family/repository.go`: las firmas de `CreateInvitation`/`Resend` reciben `limits EmailLimits{PerInvitation, PerFamily int}` (cero = sin despachador) en lugar de `emailWanted`; dentro de la transacción con la dueña bloqueada, calcular `today` (CDMX) con el reloj `r.now`, el conteo de la invitación (0 si `email_sends_day` ≠ hoy) y el de la familia (`coalesce(sum(email_sends_count),0) … WHERE family_account_id = $1 AND email_sends_day = $today`); si ambos están por debajo del límite → `sending` y `email_sends_count + 1`; si no → `failed` con `email_status_at = now()` y sin tocar el conteo; sin despachador → `none`. El servicio pasa `cfg.PerInvitationPerDay`/`PerFamilyPerDay`; un estado `failed` por límite **no** encola trabajo. Pasarse nunca devuelve error
- [X] T041 [US4] `backend/internal/errordigest/service.go`: `Service` gana `SetQuota(q Quota)` (interfaz mínima con `Reserve(ctx, class)` y `Refund(ctx, ticket)`; evita importar la implementación concreta en las pruebas) y en `Tick`, justo antes de `sendWithRetries`: `ticket, err := quota.Reserve(ctx, mailer.ClassDigest)`; `ErrQuotaExceeded` → `release(week)` + `report(failureSend)` + devolver el error (se reintenta al minuto siguiente); otro error → seguir enviando sin cupo (la cuota nunca debe impedir el digest por un fallo de contador); si el envío falla del todo → `Refund`. Conectarlo en `backend/cmd/api/main.go` con la misma `Quota` que usa `family` (crear la `Quota` una sola vez, fuera del `if` de las invitaciones, cuando `mailer.ConfigFromEnv().Available()`)
- [X] T042 [US4] Revisar el cableado en `cmd/api/main.go`: una sola `mailer.Quota` compartida; sin `RESEND_API_KEY` y sin `MAIL_DRIVER`, ni digest ni invitaciones hacen nada nuevo; con solo `MAIL_DRIVER=discard` las invitaciones corren con `DiscardSender` y el digest sigue necesitando su clave real (el digest **no** usa el `DiscardSender`)

**Punto de Control**: `go test ./internal/mailer/... ./internal/errordigest/... ./internal/family/... -cover` en verde. **Commit de fase**: «feat(040): US4 - límites por invitación y por familia, aviso de cuota y reserva del digest».

---

## Fase 7: Documentación, verificación y PR

- [ ] T043 [P] Raíz `CLAUDE.md`: agregar la viñeta de `specs/040-invitacion-familiar-por-correo/` (qué hace, `internal/mailer`, límites, `MAIL_DRIVER=discard`, sin acortador ni seguimiento, pasos del dueño) y aclarar en la de `specs/032` que la invitación **también** sale por correo (ya no «el correo saliente queda para después»); en la de `specs/039` que el adaptador se mudó a `internal/mailer`
- [ ] T044 [P] `backend/CLAUDE.md`: fila de `internal/mailer` en el mapa (archivos y qué hace cada uno), actualizar `internal/errordigest` (usa `mailer`, reserva cuota) y `internal/family` (`emailcontent.go`, `emaildispatch.go`, estado del correo), la tabla de variables de entorno (las seis nuevas + `MAIL_DRIVER`), la migración `0025` y la regla «el mensaje con la ficha vive solo en memoria»
- [ ] T045 [P] `frontend/CLAUDE.md`: `features/family/` (`emailStatus.ts`, `InviteLink` con el estado, `useFamily` con el refresco de 3 s mientras haya `sending`) y la nota de E2E con `MAIL_DRIVER=discard`
- [ ] T046 [P] `DEPLOY.md`: sección «Invitaciones por correo»: aplicar la migración `0025` **antes** del backend; reutiliza `RESEND_API_KEY` y el dominio verificado; variables opcionales (`MAIL_FROM`, topes, límites); **[DUEÑO]** confirmar en Resend → Domains → `pedi-track.com` → Configuration que *Open tracking* y *Click tracking* estén apagados (lo están por omisión; si se encienden, Resend reescribe la liga y expone la ficha); cómo ver el consumo diario (`SELECT day, sent, warned FROM mail_daily_counts ORDER BY day DESC LIMIT 14;`) y qué hacer si el aviso a los 80 aparece en el digest (decidir plan de pago de Resend)
- [ ] T047 [P] `BACKLOG.md`: marcar «Invitaciones a la familia por correo» como hecha (spec 040); dejar pendientes: remitente propio para invitaciones (hoy `alertas@`; crear `invitaciones@` o `hola@` con respuesta por Email Routing), recordatorio de invitaciones sin responder y correo de aviso a la dueña cuando alguien acepta (fuera de alcance), purga de `mail_daily_counts` viejos (≈ 365 filas al año), y la decisión de pasar Resend a plan de pago si el contador lo pide
- [ ] T048 Verificación completa: `cd backend && go vet ./... && go test ./... -cover` (cobertura de `mailer`, `family` y `errordigest` ≥ 90 %), `govulncheck ./...`, `swag` sin diff inesperado; `cd frontend && npx tsc --noEmit && npx eslint . && npx vitest run --coverage` (≥ 90 %) y `npx playwright test familia` a 390 y 1280 px con `MAIL_DRIVER=discard`; recorrer `quickstart.md` secciones 1 y 2
- [ ] T049 Revisión de código (skill `code-review`) del diff completo de la rama, corregir lo que salga y volver a correr T048; después `git push -u origin feature/040-invitacion-familiar-por-correo` y abrir el PR a `develop` (cuerpo en español con resumen, pasos del dueño y resultado de las pruebas); luego `mcp__ccd_pr__get_status` una sola vez (no sondear el CI) y avisar al dueño. **No fusionar** hasta que el dueño lo pida

**Commit de fase**: «docs(040): CLAUDE.md, DEPLOY.md y BACKLOG.md de la invitación por correo».

---

## Tareas del dueño del producto (no son código)

- [ ] T050 [DUEÑO] Aplicar la migración `0025` en la base de DEV (Railway) **antes** de desplegar el backend de esta rama (misma forma que la `0024`).
- [ ] T051 [DUEÑO] En Resend → Domains → `pedi-track.com` → Configuration: confirmar que *Open tracking* y *Click tracking* estén **apagados** (FR-003).
- [ ] T052 [DUEÑO] (Opcional) Fijar `MAIL_FROM` en Railway si se quiere un remitente distinto de `alertas@pedi-track.com`.
- [ ] T053 [DUEÑO] Prueba real (`quickstart.md` §3): invitar a un buzón propio, comprobar que el enlace apunta a `dev.pedi-track.com/familia/invitacion#…` y no a un dominio de seguimiento, y que aceptar con otro correo no deja entrar.

---

## Dependencias y orden de ejecución

- **Fase 1 → Fase 2 → (Fase 3 → Fase 4)**; la **Fase 5 (US2)** necesita la Fase 3 (el estado existe en el modelo y el despachador lo cambia) y es independiente de la Fase 4; la **Fase 6 (US4)** necesita la Fase 3 (cambia la firma de `CreateInvitation`/`Resend`) y toca `errordigest`, así que va después de la 4 para no pelear por `emaildispatch.go`. La **Fase 7** va al final.
- Dentro de la Fase 2: T003 → T006 (y T007 después de T003); T004, T005, T008, T009, T010 son independientes entre sí; T011 necesita T008 y T010; T012 necesita T011; T013 → T014.
- Dentro de cada historia: las pruebas (marcadas «primero») se escriben y se ven fallar antes de la implementación.

## Oportunidades de paralelización

- Fase 2: `T004 ∥ T005 ∥ T007 ∥ T008 ∥ T009 ∥ T010 ∥ T013` (archivos distintos).
- Fase 3: `T015 ∥ T016 ∥ T017` (pruebas); luego `T018` y `T019` en paralelo, antes de `T020 → T021 → T022`.
- Fase 4: `T023 ∥ T024 ∥ T025`.
- Fase 5: backend (`T029`, `T032`) en paralelo con frontend (`T030`, `T031`, `T033`) hasta `T034–T036`.
- Fase 6: `T037 ∥ T038 ∥ T039`.
- Fase 7: `T043 ∥ T044 ∥ T045 ∥ T046 ∥ T047`.

## Estrategia de implementación

- **MVP = Fases 1–3 (US1)**: con `MAIL_DRIVER=discard` ya se ve todo el flujo; con la clave real llega el correo. Se puede probar solo.
- Entrega incremental sobre el mismo PR: US3 (robustez) → US2 (pantalla) → US4 (cuota y límites). No se debe desplegar sin T050.
- Cada fase termina con sus pruebas en verde y su commit; si una fase rompe `errordigest`, se arregla antes de seguir (la Fase 2 es la de mayor riesgo por mover código existente).
