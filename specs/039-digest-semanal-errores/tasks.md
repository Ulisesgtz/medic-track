---

description: "Lista de tareas de la spec 039: digest semanal de errores por correo"
---

# Tareas: Digest semanal de errores por correo

**Entrada**: `/specs/039-digest-semanal-errores/` (plan.md, spec.md, research.md R1–R9, data-model.md, contracts/email.md, contracts/configuration.md, contracts/resend-request.md, quickstart.md)

**Pruebas**: obligatorias (Principio VI): >90 % en Go. Solo backend: sin rutas, sin pantallas, sin Playwright, sin tocar `server/router.go`. Un solo PR a `develop`, **un commit por fase**.

**Organización**: la base compartida (tabla, consultas de `errorlog`, configuración, programador y adaptador de envío) va primero; después una fase por historia. **US1** (recibir el resumen) es el MVP de contenido; **US2** (uno por semana, sin perderse) depende del servicio de US1; **US3** (fallas y arranque seguro) depende de US2.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos y sin depender de una tarea sin terminar).
- **[US1]/[US2]/[US3]**: la historia de `spec.md` a la que sirve.
- **[DUEÑO]**: la hace el dueño del producto en un panel, **no es código**; no bloquea la implementación, solo la prueba real y el despliegue.
- Convenciones del repo: código y esquema en inglés, docs en español; archivos con CRLF (editar con cuidado de no mezclar finales de línea); la base local: `DATABASE_URL="postgres://root:abcd1234@localhost:5432/pediTrack?sslmode=disable"`; para aplicar migraciones usar un script de `node` con `pg` (el `psql` se cuelga en esta máquina).

---

## Fase 1: Configuración

- [X] T001 Línea base: `cd backend && set -a && . ./.env.local && set +a && go vet ./... && go test ./internal/... -cover` en verde antes de empezar (anotar la cobertura total: no debe bajar de 90 %)
- [X] T002 Crear `backend/migrations/0024_create_error_digest_runs.sql` según `data-model.md`: tabla `error_digest_runs` con `week_key TEXT PRIMARY KEY CHECK (week_key ~ '^[0-9]{4}-W[0-9]{2}$')`, `status TEXT NOT NULL CHECK (status IN ('sending','sent','failed'))`, `claimed_at TIMESTAMPTZ NOT NULL`, `lease_until TIMESTAMPTZ NOT NULL`, `attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts >= 1)`, `sent_at TIMESTAMPTZ`, `failed_at TIMESTAMPTZ` y `CHECK ((status = 'sent') = (sent_at IS NOT NULL) AND (status = 'failed') = (failed_at IS NOT NULL))`; comentario de cabecera con la spec; aplicarla a la base local y comprobar con `\d error_digest_runs` (vía `node`/`pg`) que quedó

**Punto de Control**: migración aplicada en local; línea base en verde.

---

## Fase 2: Base compartida (bloquea las tres historias)

**Objetivo**: lo que necesitan US1, US2 y US3 antes de escribir el servicio.

### `errorlog` (lectura que el digest necesita; sin migración)

- [X] T003 [P] `backend/internal/errorlog/query.go`: agregar `Filter.ExcludeEndpointPrefix string` y en `where()` la condición `endpoint NOT LIKE $n ESCAPE '\'` con `escapeLike(prefix)+"%"` (misma técnica que `EndpointPrefix`)
- [X] T004 [P] `backend/internal/errorlog/query.go`: tipo `Stats{Entries, Groups, Accounts int}` y `Repository.Stats(ctx, Filter) (Stats, error)`: una consulta con `count(*)`, `count(DISTINCT account_id)` (las `NULL` no cuentan) y el número de grupos `(SELECT count(*) FROM (SELECT 1 FROM error_logs <where> GROUP BY endpoint, http_status, message) g)`; mismo `where()` que `Summary`
- [X] T005 [P] `backend/internal/errorlog/query.go`: `Repository.OldestEntry(ctx, Filter) (*time.Time, error)` (`SELECT min(created_at) FROM error_logs` con el mismo `where()`; `nil` si el filtro no selecciona nada; el digest lo llama con `Filter{}`)
- [X] T006 `backend/internal/errorlog/query_test.go` (base real, con endpoints de marcador propio como las pruebas existentes): `ExcludeEndpointPrefix` deja fuera `job:…` y escapa `%` y `_`; `Stats` cuenta entradas, grupos y cuentas distintas (una cuenta repetida cuenta una vez; sin cuenta no cuenta); `OldestEntry` devuelve la más vieja y `nil` con la tabla filtrada a vacío (si la tabla compartida no se puede vaciar, probar el helper interno con la consulta sobre un marcador)

### `errordigest`: configuración y programador

- [X] T007 [P] `backend/internal/errordigest/config.go`: `Config{APIKey, To, From string; Weekday, Hour int; EnvLabel string}`, `ConfigFromEnv()` leyendo `RESEND_API_KEY`, `ERROR_DIGEST_TO` (por omisión `soporte@pedi-track.com`), `ERROR_DIGEST_FROM` (por omisión `PediTrack <alertas@pedi-track.com>`), `ERROR_DIGEST_WEEKDAY` (ISO 1–7, por omisión 1; fuera de rango → 1), `ERROR_DIGEST_HOUR` (0–23, por omisión 8; fuera de rango → 8), `APP_ENV_LABEL` (vacío por omisión); `Available() bool` (clave, destinatario y remitente no vacíos) y `UnavailableReason() string` con la frase fija para la consola (`error digest unavailable: RESEND_API_KEY is not set` o `…: ERROR_DIGEST_TO and ERROR_DIGEST_FROM must not be empty`) que **nunca incluye valores**
- [X] T008 [P] `backend/internal/errordigest/config_test.go`: valores por omisión, valores inválidos de día y hora, recorte de espacios, `Available`/`UnavailableReason` (con y sin clave) y que ninguna de las dos funciones devuelve el texto de la clave ni de las direcciones
- [X] T009 [P] `backend/internal/errordigest/schedule.go`: `import _ "time/tzdata"`; `Location()` (`America/Mexico_City`, con respaldo `time.FixedZone("CST", -6*3600)` si no carga); `WeekKey(now time.Time) string` (`YYYY-Www` de la semana ISO de `now` en esa zona, p. ej. `2026-W42`); `Scheduled(now time.Time, weekday, hour int) time.Time` (el instante programado de la semana ISO de `now`, hora en punto); `Due(now time.Time, cfg Config) bool` (`now >= Scheduled`); `Window(now time.Time) (since, until, prevSince time.Time)` (`[now−7d, now)` y `[now−14d, now−7d)`)
- [X] T010 [P] `backend/internal/errordigest/schedule_test.go`: semana ISO en CDMX, borde de año (2026-12-28 → `2026-W53`/2027-01-01 según corresponda a ISO), lunes 07:59 no toca y 08:00 sí, el martes de la misma semana sigue tocando (recuperación), el lunes siguiente es otra clave, domingo y hora configurables, ventanas de 7 y 14 días, y que la zona carga con la base embebida

### `errordigest`: adaptador de envío

- [X] T011 [P] `backend/internal/errordigest/sender.go`: `Message{From, To, Subject, Text, IdempotencyKey string}`; `Sender interface{ Send(ctx, Message) error }`; `SendError{Retryable bool; Status int}` (con `Error()` que dice solo la clase y el estado numérico, **sin cuerpo ni direcciones ni clave**); `ResendSender` (`NewResendSender(apiKey string, client *http.Client, baseURL string)`; con `client == nil` usa `http.Client{Timeout: 15s, CheckRedirect: ErrUseLastResponse}`): `POST <baseURL>/emails` con `Authorization: Bearer`, `Content-Type: application/json`, `Idempotency-Key`, cuerpo `{from, to: [to], subject, text}` (solo `text`); 2xx = éxito (se descarta el `id`); error de red/timeout, `408`, `429` y `5xx` → `Retryable: true`; cualquier otro `4xx` → `Retryable: false`; el cuerpo de la respuesta nunca se lee a un error devuelto (ver `contracts/resend-request.md`)
- [X] T012 [P] `backend/internal/errordigest/sender_test.go` con `httptest.Server`: cabeceras y cuerpo exactos (incluida `Idempotency-Key`), éxito 200, `429` y `503` reintentables, `401`, `403` y `422` permanentes, error de red reintentable, **no sigue una redirección 302** (la segunda URL no recibe la petición), y que el texto del error devuelto no contiene la clave ni la dirección aunque la respuesta del servidor las repita

**Punto de Control**: `go test ./internal/errorlog/... ./internal/errordigest/...` en verde. **Commit de fase**: «feat(039): base del digest (errorlog, configuración, programador y adaptador de envío)».

---

## Fase 3: US1 - Recibir cada semana el resumen de errores (Prioridad: P1) 🎯 MVP de contenido

**Objetivo**: con errores registrados, `SendWeek` arma y entrega **un** correo con el formato de `contracts/email.md`; con la tabla vacía, el de «No hubo errores esta semana».

**Prueba Independiente**: sembrar errores de peticiones y de un proceso, llamar `SendWeek` con un `Sender` falso y comprobar el asunto, las secciones, los diez grupos y el pie; repetirlo con la tabla vacía.

### Pruebas primero

- [X] T013 [P] [US1] `backend/internal/errordigest/sanitize_test.go`: limpieza de un mensaje: quita `\r`, `\n` y caracteres de control, recorta a 160 caracteres terminando en `…`, reemplaza un correo por `[correo]`, un UUID por `[id]` y una cadena larga de token (≥ 32 caracteres base64url/hex) por `[token]`; no altera un mensaje normal como `Account not found`
- [X] T014 [P] [US1] `backend/internal/errordigest/content_test.go`: con una `Source` falsa (y una prueba con la base real y marcadores propios) comprobar: total = peticiones + procesos; los diez primeros grupos de más a menos frecuente con conteo, primera y última vez; `MoreGroups = Stats.Groups − 10`; los endpoints `job:` solo en la sección de procesos; **cuentas afectadas solo como número**; semana vacía; comparación con la semana anterior disponible (retención ≥ 14 y datos) y `sin comparación` (retención < 14, o servicio nuevo sin entradas antes de la ventana previa); asunto con y sin `APP_ENV_LABEL`, con `+N`, `-N`, `igual` y sin paréntesis cuando no hay comparación
- [X] T015 [US1] `backend/internal/errordigest/privacy_test.go` (SC-004): sembrar entradas cuyos mensajes parecen correos, UUID y tokens, y comprobar con expresiones regulares que **ni el asunto ni el cuerpo** contienen un correo (salvo el de ninguno), un UUID ni una cadena de token; que no aparece ningún `account_id` sembrado; y que el pie fijo siempre está

### Implementación

- [X] T016 [P] [US1] `backend/internal/errordigest/sanitize.go`: `cleanMessage(s string) string` según T013 (expresiones regulares compiladas una vez en variables de paquete)
- [X] T017 [US1] `backend/internal/errordigest/content.go`: tipos `Digest`, `Section`, `Group` (de `data-model.md`); la interfaz `Source` con `Summary`, `Stats` y `OldestEntry` (satisfecha por `*errorlog.Repository`); `Build(ctx, src Source, now time.Time, retentionDays int) (Digest, error)`: dos secciones con `Filter{Since, Until}` + `ExcludeEndpointPrefix: "job:"` (peticiones) y `EndpointPrefix: "job:"` (procesos), diez grupos como máximo con `cleanMessage`, `Stats` para los totales/grupos/cuentas, el total de la semana anterior con `Stats` de `[now−14d, now−7d)`, y `HasComparison` = `retentionDays >= 14 && (previous.Entries > 0 || oldest != nil && !oldest.After(prevSince))`
- [X] T018 [US1] `backend/internal/errordigest/content.go`: `Render(d Digest, envLabel string) (subject, text string)` según `contracts/email.md` (asunto `[PediTrack <ENTORNO>] Errores del <d mes> al <d mes año>: <N> (<±M> vs. semana anterior)`, bloque RESUMEN, secciones numeradas con `primera:`/`última:` en hora de CDMX y nombres fijos de mes, `y N grupos más que no caben aquí.`, «No hubo errores esta semana.», `sin comparación (no hay datos suficientes)` y el pie fijo de dos líneas); texto plano, sin enlaces
- [X] T019 [US1] `backend/internal/errordigest/service.go`: `Service{src Source, sender Sender, cfg Config, retentionDays int, now func() time.Time}`, `NewService(...)` y `SendWeek(ctx, now time.Time) error` (arma con `Build`, `Render`, y manda un `Message` con `From`/`To` de `cfg` e `IdempotencyKey: "error-digest-"+WeekKey(now)`; **todavía sin reclamo ni reintentos**, eso es US2 y US3)
- [X] T020 [US1] `backend/internal/errordigest/service_test.go`: `SendWeek` con un `fakeSender`: sale **un** mensaje con el destinatario, remitente y llave de idempotencia esperados; la semana vacía también manda; un fallo de `Source` devuelve error y no manda; el `Sender` que falla propaga el error

**Punto de Control US1**: el correo se arma completo y limpio y se entrega a un `Sender`. **Commit de fase**: «feat(039): contenido del digest y su prueba de privacidad».

---

## Fase 4: US2 - Un solo correo por semana, sin perderse (Prioridad: P1)

**Objetivo**: la misma semana no se manda dos veces (reinicio ni dos copias) y no se pierde si el servicio estuvo apagado dentro de ella.

**Prueba Independiente**: dos procesos a la vez para la misma semana → un correo; un lease vencido se retoma con la misma llave de idempotencia; el martes de una semana con el lunes perdido manda; el lunes siguiente manda el de la semana nueva.

### Pruebas primero

- [X] T021 [P] [US2] `backend/internal/errordigest/repository_test.go` (base real; `week_key` únicos por prueba): el primer `Claim` gana y el segundo no; **dos goroutines** a la vez → exactamente un ganador; un `sending` con lease vencido se reclama (y `attempts` sube a 2) y con lease vigente no; `MarkSent` y `MarkFailed` ponen el estado y su marca de tiempo; una fila `sent` o `failed` **no se reclama nunca**, aunque su lease sea viejo; el `CHECK` rechaza `sent` sin `sent_at`
- [X] T022 [US2] `backend/internal/errordigest/service_test.go` (ampliar): `Tick` con reloj inyectable: antes de la hora no hace nada y no toca la base; a la hora manda **una** vez y deja `sent`; un segundo `Tick` y un `Service` nuevo (reinicio) con la misma base no mandan otra; **dos `Service` a la vez** → un solo envío; apagado el lunes y arrancado el martes manda; arrancado el lunes siguiente manda la semana nueva y no recupera la vieja; un reclamo con lease vencido (primer proceso «murió») manda con la **misma** `IdempotencyKey`

### Implementación

- [X] T023 [US2] `backend/internal/errordigest/repository.go`: `Repository` sobre `*pgxpool.Pool`; `Claim(ctx, weekKey string, lease time.Duration) (ClaimResult, error)` (`Claimed`, `Busy` o `Done`, para no preguntar cada minuto por una semana que otra copia ya terminó) con la sentencia de `research.md` R2 (`INSERT … ON CONFLICT (week_key) DO UPDATE … WHERE status = 'sending' AND lease_until < now() RETURNING week_key`; sin fila devuelta = `false`), `MarkSent(ctx, weekKey)` y `MarkFailed(ctx, weekKey)` (solo si `status = 'sending'`); constante `LeaseDuration = 30 * time.Minute`
- [X] T024 [US2] `backend/internal/errordigest/service.go`: la interfaz `Claimer` (`Claim`, `MarkSent`, `MarkFailed`, satisfecha por `*Repository`) y `Tick(ctx, now) error`: si `!Due(now, cfg)` o la semana ya está en memoria como terminada, no hace nada; `Claim`; si no ganó, no manda (y si la fila ya es `sent`/`failed` la recuerda como terminada); si ganó, `SendWeek` y `MarkSent`, y recuerda la semana
- [X] T025 [US2] `backend/internal/errordigest/service.go`: `Run(ctx)` y `RunEvery(ctx, interval)` (por omisión cada `time.Minute`, primer `Tick` inmediato, se detiene con `ctx.Done()`), en el mismo estilo que `retention.RunEvery`

**Punto de Control US2**: sin duplicados ni semanas perdidas en las pruebas de reinicio, de dos procesos y de recuperación. **Commit de fase**: «feat(039): una sola vez por semana con lease y recuperación».

---

## Fase 5: US3 - Falla de envío y arranque seguro (Prioridad: P2)

**Objetivo**: los fallos del proveedor no afectan al servicio, se reintentan de forma acotada y se reportan sin secretos; sin la clave el digest no corre.

**Prueba Independiente**: un `Sender` que falla dos veces y acepta la tercera → sale el correo; uno que falla siempre → `failed` y una sola entrada `job:error-digest`; uno con error permanente → sin reintentos; sin clave → no arranca.

### Pruebas primero

- [X] T026 [US3] `backend/internal/errordigest/service_test.go` (ampliar): con un `fakeSender` por secuencia y esperas inyectadas (`sleep` falso que registra las duraciones): falla 2 veces y acierta a la 3.ª → un envío, `sent`, esperas de 30 s y 2 min, `Recovered("send")`; falla siempre (reintentable) → exactamente 3 intentos, `failed`, **un** `Report("send", …)` con el mensaje fijo `error digest failed: could not send the weekly e-mail`; error permanente (`Retryable:false`) → 1 intento, `failed`; fallo al **armar** → `Report("build", …)` y la fila **no** queda `failed` (el siguiente `Tick` lo reintenta); fallo al **reclamar** → `Report("claim", …)`; ninguno de los mensajes de reporte contiene la clave, el destinatario, el remitente ni el texto del error del proveedor
- [X] T027 [US3] `backend/internal/errordigest/service_test.go` (ampliar): cancelar el `ctx` durante una espera entre reintentos y durante un envío en curso → `Tick` vuelve de inmediato, **no** marca `failed` (la fila queda `sending` y el lease vence solo) y no reporta una falla; el envío tiene su propio límite de 15 s (`context.WithTimeout`)

### Implementación

- [X] T028 [US3] `backend/internal/errordigest/service.go`: la interfaz `Claimer` gana `Release` (da la semana de vuelta sin terminarla; se usa si falla el armado y al apagar) y `FailureReporter` (`Report(kind, message string, accountID *uuid.UUID)` y `Recovered(kind string)`, como la de `retention` y `reminder`; satisfecha por `*jobreport.Reporter`) y `SetReporter`; el bucle de envío de `Tick`: hasta 3 intentos con esperas `30 s` y `2 min` (campo `sleep func(ctx, time.Duration) error` inyectable que respeta `ctx.Done()`), reintenta solo si `SendError.Retryable` (o un error que no sea `SendError`); al agotarse o ser permanente → `MarkFailed` + `Report("send", "error digest failed: could not send the weekly e-mail", nil)`; éxito → `MarkSent` + `Recovered("send")`; los fallos de `Build` y de `Claim` se reportan con kinds `build` y `claim` (mensajes fijos `error digest failed: could not build the summary` y `error digest failed: could not claim the week`) sin marcar `failed`
- [X] T029 [US3] `backend/cmd/api/main.go`: junto a `retention.Run`, `digestCfg := errordigest.ConfigFromEnv()`; si `digestCfg.Available()` crear `errordigest.NewService(errorLogRepo, errordigest.NewResendSender(digestCfg.APIKey, nil, "https://api.resend.com"), errordigest.NewRepository(pool), digestCfg, retention.ConfigFromEnv().Days)`, `SetReporter(jobreport.New(errorLogRepo, "error-digest"))` y `go svc.Run(ctx)`; si no, `log.Printf("%s", digestCfg.UnavailableReason())` **una sola vez** (sin valores, sin escribir en `error_logs`); `go build ./...` y `go vet ./...`

**Punto de Control US3**: el servicio sigue sano ante cualquier falla y sin la clave el digest simplemente no corre. **Commit de fase**: «feat(039): reintentos, reporte de fallas y arranque seguro del digest».

---

## Fase 6: Documentación y cierre

- [X] T030 [P] `CLAUDE.md` (raíz): viñeta de la spec 039 en «Current features» (digest semanal por correo: `internal/errordigest`, tabla `error_digest_runs`, migración `0024`, `RESEND_API_KEY` y demás variables, un correo por semana con lease e idempotencia, mensajes sin datos de personas) y ajustar la línea de la spec 021 que dice que el digest sigue en `BACKLOG.md`
- [X] T031 [P] `backend/CLAUDE.md`: fila nueva de `internal/errordigest/` en el mapa (config, schedule, content, repository, sender, service y el patrón del lease), lo nuevo de `errorlog` (`Stats`, `OldestEntry`, `ExcludeEndpointPrefix`), la `0024` en la lista de migraciones y las variables de entorno nuevas en la tabla «Environment»
- [X] T032 [P] `DEPLOY.md`: aplicar la `0024` **antes** del backend nuevo; sección «Digest semanal de errores» con el alta de Resend, la verificación del dominio con los registros que muestre su panel puestos en Cloudflare **sin tocar el SPF ni los MX de la raíz** (alternativa: subdominio `mail.pedi-track.com` y `ERROR_DIGEST_FROM`), las variables de Railway (`RESEND_API_KEY`, `APP_ENV_LABEL=DEV`, y las opcionales) y cómo probarlo sin esperar al lunes (`quickstart.md` §5)
- [X] T033 [P] `BACKLOG.md`: marcar el «Digest semanal de errores por correo» como **hecho en `specs/039-digest-semanal-errores/`**; agregar el pendiente «Invitaciones a la familia por correo» (spec 032) que **reutiliza el adaptador `errordigest.ResendSender` o lo extrae a un paquete común** y la misma `RESEND_API_KEY`
- [X] T034 Verificación completa: `cd backend && go vet ./... && go test ./internal/... -coverprofile=/tmp/c.out && go tool cover -func=/tmp/c.out | grep total` (>90 % total y alta en `errordigest` y lo nuevo de `errorlog`); `go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd` **sin cambios** en `internal/docs` (no hay rutas nuevas); `govulncheck ./...` con 0 alcanzables; `gofmt -l` sobre los archivos nuevos
- [ ] T035 Prueba real local según `quickstart.md` §2–§4 (un correo, reinicio y dos copias sin duplicados, sin clave, clave inválida): **requiere T038 y T039** (la clave y el dominio de Resend); mientras tanto las pruebas automáticas ya cubren cada escenario con un envío falso
- [X] T036 Revisión de código (`/code-review`) del diff completo y corregir lo que salga
- [ ] T037 Abrir el PR a `develop` con el resumen, los pendientes del dueño (abajo) y la nota de la migración `0024`; esperar el CI en verde (**no** hacer polling; el app avisa) y fusionar solo si el usuario lo pide

### Tareas del dueño del producto (no son código; no bloquean la implementación)

- [ ] T038 [P] [DUEÑO] Crear la cuenta de **Resend** (plan gratis: 3,000 correos al mes, 100 al día, un dominio) y una **clave de API de solo enviar**; guardarla fuera del repositorio y del chat
- [ ] T039 [P] [DUEÑO] **Verificar el dominio** en Resend y agregar en Cloudflare (DNS de `pedi-track.com`) los registros que indique su panel. Confirmar antes que **no toquen el SPF ni los MX de la raíz** (los administra Email Routing y están bloqueados); si el panel propone cambiar la raíz, verificar el subdominio `mail.pedi-track.com` y usar `ERROR_DIGEST_FROM=PediTrack <alertas@mail.pedi-track.com>`
- [ ] T040 [DUEÑO] Aplicar la migración **`0024`** en la base de **DEV** (Railway) **antes** de desplegar el backend nuevo (con el script de `node`/`pg`, no con `psql`)
- [ ] T041 [DUEÑO] En **Railway** (servicio `medic-track`) agregar `RESEND_API_KEY` y `APP_ENV_LABEL=DEV`, desplegar y hacer la prueba de `quickstart.md` §5 (poner temporalmente día y hora actuales, comprobar que llega a `soporte@pedi-track.com` y a tu Gmail, y **volver a los valores por omisión**)

---

## Dependencias y orden de ejecución

- **Fase 1 → Fase 2 → US1 → US2 → US3 → Fase 6**, un commit por fase.
- **Fase 2**: T003, T004 y T005 tocan el mismo archivo (`query.go`): hacerlas **en orden**; T007–T012 son de archivos distintos y se pueden paralelizar entre sí y con `errorlog`. T006 va después de T003–T005.
- **US1**: T013, T014 y T015 (pruebas) en paralelo y **antes** de T016–T019; T016 es independiente de T017; T017 → T018 → T019 → T020 en orden (mismo archivo `content.go`/`service.go`).
- **US2** depende de US1 (`SendWeek` y `Service`). T021 y T022 antes de T023–T025; T023 (`repository.go`) es independiente de T024–T025 (`service.go`).
- **US3** depende de US2 (el `Tick` con reclamo). T026 y T027 antes de T028; T029 (`main.go`) después de T028.
- **Fase 6**: T030–T033 en paralelo entre sí; T034 después de todo el código; T035 necesita las tareas del dueño T038 y T039; T036 → T037 al final.
- **Dueño (T038–T041)**: T038 y T039 pueden hacerse **desde ya, en paralelo con todo el código**; T040 y T041 son del despliegue, después de fusionar.

## Ejemplos de paralelización

```text
Fase 2 (tras T001–T002):  T003→T004→T005→T006   ‖   T007+T008   ‖   T009+T010   ‖   T011+T012
US1 (pruebas primero):    T013 ‖ T014 ‖ T015     →   T016 ‖ (T017→T018→T019→T020)
Fase 6:                   T030 ‖ T031 ‖ T032 ‖ T033   →   T034 → T035 → T036 → T037
Dueño, desde el día 1:    T038 ‖ T039    (T040 y T041 al desplegar)
```

## Estrategia de implementación

- **MVP**: Fase 1 + Fase 2 + **US1 + US2**. Con eso el digest arma, manda y **no se duplica ni se pierde**; sería publicable aunque US3 se difiriera, pero sin reintentos ni reporte de fallas, así que **no se despliega sin US3** (una falla silenciosa del propio digest lo volvería inútil).
- **Entrega incremental** dentro del mismo PR: cada fase termina en verde y con su commit; si algo se atora, la fase anterior ya está completa y probada.
- **Qué se prueba con qué**: la unicidad y el lease, contra la **base real**; el programador, con un **reloj inyectado**; los reintentos, con **esperas inyectadas** y un `Sender` falso; el adaptador, con `httptest.Server`; el correo real de Resend solo en T035/T041 (requiere las tareas del dueño).
- **Fuera de alcance** (no hacer aquí): rutas o pantallas, alertas en tiempo real, invitaciones por correo, que los padres reciban algo, otro proveedor además de Resend, HTML en el correo.

## Resumen

| | Tareas |
|---|---|
| Fase 1: Configuración | T001–T002 (2) |
| Fase 2: Base compartida | T003–T012 (10) |
| Fase 3: US1 | T013–T020 (8) |
| Fase 4: US2 | T021–T025 (5) |
| Fase 5: US3 | T026–T029 (4) |
| Fase 6: Documentación y cierre | T030–T037 (8) |
| Del dueño (no son código) | T038–T041 (4) |
| **Total** | **41** |
