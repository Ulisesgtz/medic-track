# Investigación — Spec 072: Monitoreo externo y errores del frontend

Fecha: 2026-11-17. Lo leído en el código lo hizo `Explore` (Haiku); las decisiones, la sesión principal.

## R1. Revisión de salud del API (`/healthz`) fuera del límite de peticiones

**Hallazgo**: en `internal/server/router.go` el límite general (`r.Use(d.RateLimit)`, l. 105-107) se aplica a **todas**
las rutas, también a las públicas; chi no permite `Use` después de registrar rutas. Hoy Railway revisa
`GET /catalog/countries` (`backend/railway.json:8`), que pasa por ese límite y lee la tabla de países.

**Decisión**: un router **raíz** nuevo, `server.NewHandler(d Deps) http.Handler`, que registra `GET /healthz` (y `HEAD`)
**antes** de todo y monta el router de siempre en `/` (`root.Mount("/", NewRouter(d))`). `/healthz` queda sin
`middleware.Logger` (el monitor pregunta cada 3 min: no llena la consola), sin CORS (no lo pide un navegador) y sin
límite. `cmd/api/main.go` pasa `server.NewHandler(deps)` a `http.Server.Handler`.

**Respuesta**: `200 {"status":"ok","version":"<commit>"}` o `503 {"status":"unavailable"}`, `Cache-Control: no-store`,
escrita con `Responder.WriteJSONUnlogged` (regla del repo: toda respuesta por `Responder`; *unlogged* porque un 503 no
debe dejar fila: si la base está caída tampoco podría escribirse). La versión es `RAILWAY_GIT_COMMIT_SHA` (la da
Railway en los despliegues desde GitHub) recortada a 12, o `dev`.

**La base**: `pool.Ping` con `context.WithTimeout` de **2 s**. Para que una ruta pública sin límite no sea una forma de
golpear la base, el resultado se **guarda 5 s** (como mucho un ping cada 5 s, sin importar cuántas peticiones lleguen;
las peticiones simultáneas comparten el ping en curso).

**Alternativas descartadas**: (a) eximir `/healthz` dentro de `ratelimit.Middleware` (mete un caso especial en
infraestructura compartida); (b) `http.ServeMux` en `main.go` (deja la ruta sin pruebas en `internal/server`, y `cmd/api`
está fuera del gate de cobertura); (c) mover todas las rutas a un `r.Group` con el límite (diff enorme en el router).

## R2. Servicio de monitoreo externo

| Servicio (plan gratuito, nov 2026) | Monitores | Intervalo | Avisos | Uso comercial |
|---|---|---|---|---|
| **Better Stack Uptime** | 10 + 10 heartbeats | **3 min**, desde varias regiones | correo, Slack | sí |
| UptimeRobot | 50 | 5 min (fijo) | correo | sí, desde mayo de 2026 (antes no) |
| HetrixTools | 15 | 1 min | correo | sí |

**Decisión**: **Better Stack Uptime**. Revisa cada 3 min desde varias regiones (confirma la caída en otra región antes de
avisar: menos falsas alarmas por un despliegue), avisa por correo al caer y al volver, y la app del teléfono da
notificaciones. Con 3 min y la confirmación, la caída se avisa en ≈ 6 min (SC-001 pide ≤ 10). Dos monitores:
`https://api-dev.pedi-track.com/healthz` (espera 200 y la palabra `ok`) y `https://dev.pedi-track.com/` (200); los de
producción cuando exista. **No se instala nada** en la app ni en el servidor; Better Stack solo conoce esas dos
direcciones y el correo del dueño (aprobado por el dueño, Principio II, 2026-11-17). Si Better Stack cambia su plan, se
cambia a UptimeRobot o HetrixTools sin tocar código. Paso del dueño en `DEPLOY.md`.

Fuentes: comparativas de Better Stack y de terceros (betterstack.com/uptime-robot-alternative,
host-tracker.com/blog/uptimerobot-alternative, dev.to «UptimeRobot commercial use free alternatives 2026»).

## R3. `POST /client-errors`: límites y forma

**Hallazgo**: el límite estricto existente (20/min) es **una sola instancia compartida** por invitaciones, «Tomada», canje
del hijo, exportaciones y el webhook (`cmd/api/main.go:259-269`). No hay tope global de cuerpo; cada handler usa
`http.MaxBytesReader`.

**Decisión**:
- Ruta pública `POST /client-errors` en el router normal (bajo el límite general de 240/min) **más un límite propio**
  `CLIENT_ERRORS_PER_MINUTE` (por omisión **10** por dirección y minuto; `0` apaga la ruta: responde 404). No comparte el
  estricto: una inundación de reportes nunca bloquea «Tomada» ni las invitaciones.
- Cuerpo máximo **2 KiB**, `DisallowUnknownFields`, lista cerrada de campos (contrato). Responde **204** sin cuerpo.
- Todo rechazo (400 cuerpo inválido, 413, 429) con `WriteJSONErrorUnlogged`: **nunca** deja fila.
- **Sin sesión**: el handler ignora `Authorization`; `account_id` siempre `NULL`.
- **Tope del lado del servidor** (`internal/clienterror`, en memoria por proceso, como `jobreport`): **una fila por
  (ruta, tipo, mensaje) cada 5 min**; las repeticiones dentro de la ventana se cuentan y la siguiente fila dice
  «(+N más desde la última)». Y un **tope global de 30 filas por minuto** por proceso: un script que rota direcciones y
  mensajes no puede escribir más que eso. Lo que pasa los topes se descarta en silencio (204 igual: el cliente no aprende
  nada).

## R4. Qué se guarda y cómo cabe en `error_logs` (sin migración)

**Hallazgo**: `error_logs(message TEXT NOT NULL, http_status INT NULL, endpoint TEXT NOT NULL, file TEXT NOT NULL,
line INT NOT NULL, account_id UUID NULL)`. Las filas `job:` ya van sin estado ni cuenta. `Summary` (spec 021) y el
digest agrupan por endpoint + estado + mensaje.

**Decisión**: una fila por reporte aceptado:
- `endpoint = "client:" + <patrón de pantalla>` (p. ej. `client:/children/:childId`, `client:/hijo/hoy`, `client:other`).
- `http_status = NULL`, `account_id = NULL`, `file = "frontend"`, `line = 0`.
- `message = "<tipo> · <mensaje limpio> · <navegador>/<sistema>[ · instalada] · v<versión>"` y, si el teléfono lo vio
  repetido, «· repetido 2–9 veces» o «· repetido 10 o más veces» (en **rangos**, para no partir los grupos del resumen en
  un grupo por cada número). Tope total 300 caracteres.
- **Sin pila de llamadas** en esta entrega: el build va minificado y sin mapas de fuente publicados, así que la pila solo
  da `index-a1b2.js:1:48213` (poco útil) y es un vector más de texto sin control. Si hace falta, BACKLOG (mapas de fuente
  privados).

## R5. Limpieza del mensaje (dos veces: teléfono y servidor)

**Hallazgo**: `internal/mailer/clean.go` → `Clean(s, maxRunes)` cambia correos por `[correo]`, UUID por `[id]` y rachas
de 32+ con un dígito por `[token]`, quita controles y recorta.

**Decisión**: el servidor usa `mailer.Clean` y además (en `internal/clienterror/clean.go`): direcciones `http(s)://…`
→ `[url]`; números de 4+ dígitos → `[n]` (folios, teléfonos, fechas); texto entre comillas que **no** sea un
identificador corto (`[A-Za-z_$][\w$.]{0,40}`) → `[texto]` (así «reading 'childId'» se conserva y «Unexpected token
'Ana López'» no). Recorte a **200** runas. El teléfono aplica las mismas reglas antes de mandar (`shared/clientErrors/
clean.ts`) y las pruebas de los dos lados comparten una tabla de casos.

## R6. Patrón de pantalla sin ids

**Hallazgo**: no hay lista central de rutas; son 51 `<Route path>` en línea en `frontend/src/App.tsx`. Los parámetros
son `:childId`, `:consultationId`, `:accountId`, `:routineId`, `:itemId`, `:measurementId`, `:appointmentId`.

**Decisión**: `shared/clientErrors/routePatterns.ts` con la lista de patrones y `routePattern(pathname)` con `matchPath`
de React Router; lo que no coincide → `other`. Una prueba unitaria lee `App.tsx` como texto, extrae los `path="…"` y
exige que **la lista coincida** (si alguien agrega una pantalla y no la lista, la prueba falla). El servidor además valida
el patrón con una expresión (`^/$`, `other`, o segmentos de minúsculas/guiones o `:nombre`, ≤ 80 caracteres, **sin
dígitos**): un id real nunca entra aunque el cliente mienta.

## R7. Captura en el frontend

- `window.addEventListener('error')` y `('unhandledrejection')` instalados al arrancar (`main.tsx`, antes de
  `createRoot`), así se cubren todas las pantallas: papás, públicas y teléfono del hijo.
- **Descartes**: `Script error.` y errores cuyo archivo no es del mismo origen (extensiones, traductores);
  `ResizeObserver loop …`; `OfflineError` y `AbortError` (spec 067 y cancelaciones normales). Los fallos al cargar un
  pedazo de la app tras un despliegue **sí** se reportan (dicen qué versión quedó vieja).
- **Agrupar**: en memoria por (tipo, mensaje limpio, patrón); se manda 3 s después del primero con el conteo; **máximo 5
  reportes por carga de página**; lo demás se descarta.
- **Enviar**: `fetch(API/client-errors, {method:'POST', keepalive:true, credentials:'omit'})`, sin esperar ni reintentar;
  cualquier falla se ignora (`catch` vacío) y nunca genera otro reporte (bandera de reentrada). **Sin conexión**
  (`isOffline()` de `shared/offline`) no se manda ni se guarda. `sendBeacon` se descarta: con `application/json` es una
  petición CORS no simple y el navegador la bloquea.
- **Navegador y sistema**: familias derivadas del UA en el teléfono (`safari|chrome|firefox|edge|samsung|other` y
  `ios|android|windows|macos|linux|other`) más `isRunningInstalled()` (spec 071); nunca la cadena completa.
- **Versión**: `__APP_VERSION__` (spec 017).
- La CSP ya permite el API en `connect-src` (`*.pedi-track.com` y el host de producción de Railway): sin cambios
  (FR-019).

## R8. Pantalla de error (FR-007a)

**Hallazgo**: no hay `ErrorBoundary` en `frontend/src`; un error al dibujar deja la página en blanco. `AppShell` lo
monta cada pantalla por dentro.

**Decisión**: `shared/errorScreen/`:
- `RenderErrorBoundary` (componente de clase; React 19 no tiene uno funcional) **alrededor de `<Routes>`** en `App.tsx`
  (estado B, página completa) y **dentro de `AppShell`, alrededor del contenido** (estado A: la barra lateral web sigue).
  Se reinicia al cambiar de dirección (`key` = `pathname`). `componentDidCatch` reporta tipo `render`.
- Variante por contexto: dirección `/hijo…` → teléfono del hijo (C, «Ir a Hoy» → `/hijo/hoy`); sin sesión → (D, «Ir a
  iniciar sesión» → `/login`); si no → papás («Ir al inicio» → `/home`). Sin conexión (F) cambia el texto.
- «Volver a cargar» = `location.reload()` y guarda la hora en `sessionStorage`; si vuelve a tronar en menos de 30 s, el
  estado E (texto distinto, el botón sólido pasa a «Ir al inicio»). `sessionStorage` en `try/catch`.
- **Textos, tamaños y orden: los del mock de Claude Design**, entregado el 2026-11-17 (`referencia/Pantalla de error
  PediTrack.dc.html`, estados A–F; detalle en `contracts/ui-error-screen.md`). Se construye tal cual y se mide a 390 y
  1280 px; 4 desviaciones ya vistas quedan para que decida el dueño.
- **Prueba E2E**: una ruta de prueba `/__prueba-error` que truena al dibujar (y `?tipo=asincrono` lanza un error y una
  promesa rechazada desde código de la app) **solo** si `VITE_TEST_ERROR_ROUTE === 'true'` (como
  `/planes/pago-de-prueba` con `VITE_PAYMENTS_FAKE`); `scripts/e2e-local.sh` y CI lo encienden; nunca en DEV ni
  producción. Las E2E leen `error_logs` con el helper de `pg` que ya usan los seeds.

## R9. Correo semanal (spec 039) y consulta de operación (spec 021)

**Hallazgo**: `errordigest.Build` arma «Peticiones» con `ExcludeEndpointPrefix = "job:"` y «Procesos en segundo plano»
con `EndpointPrefix = "job:"`; `Filter.ExcludeEndpointPrefix` es un solo `string` (`errorlog/query.go:29, 74-76`). Un
`client:` caería hoy en «Peticiones».

**Decisión**: `Filter.ExcludeEndpointPrefixes []string` (reemplaza al campo singular; un `NOT LIKE` por prefijo);
`Digest.Clients Section`; «Peticiones» excluye `job:` y `client:`; nueva sección **«ERRORES EN LOS TELÉFONOS Y
NAVEGADORES»** después de procesos, con el mismo formato (10 grupos más frecuentes, total). `Total()` y la comparación
con la semana anterior la incluyen. `/ops/error-logs?endpointPrefix=client:` ya funciona sin cambios. La retención
(spec 021) borra estas filas como las demás.

## R10. Privacidad

Nada de lo guardado identifica a una persona: sin cuenta, sin ids, sin dirección IP (el límite la usa en memoria y no
se guarda), sin cadena completa del navegador. El aviso de privacidad ya habla de registros técnicos de errores; si el
dueño quiere nombrar los del navegador y Better Stack, es un pendiente suyo (no bloquea).
