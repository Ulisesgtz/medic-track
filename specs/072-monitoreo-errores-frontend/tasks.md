---
description: "Tareas de la spec 072 — Monitoreo externo y errores del frontend"
---

# Tareas: Monitoreo externo y errores del frontend

**Entrada**: `specs/072-monitoreo-errores-frontend/` (spec, plan, research, data-model, contracts, quickstart, referencia)

**Prerrequisitos**: plan.md, spec.md, research.md (R1–R10), data-model.md, contracts/

**Pruebas**: obligatorias (Principio VI: > 90 % en Go y React, E2E de la pantalla de error a 390 y 1280 px). Cada tarea
de código lleva sus pruebas en la misma tarea o en la de prueba que la precede.

**Organización**: por historia de usuario de la spec (US1 caída del servicio · US2 errores del teléfono y pantalla de
error · US3 que nadie inunde el registro).

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [X] T001 Agregar `VITE_TEST_ERROR_ROUTE` a `frontend/src/vite-env.d.ts` (tipo `string | undefined`) y encenderla (`VITE_TEST_ERROR_ROUTE=true`) en el build de E2E de `scripts/e2e-local.sh` y del job de E2E de `.github/workflows/ci.yml`; nunca en DEV ni producción
- [X] T002 [P] Agregar `CLIENT_ERRORS_PER_MINUTE` (por omisión 10; `0` apaga la ruta) a `backend/.env.example` con su comentario en español (no existe `.env.example`: quedó en la tabla de Environment de `backend/CLAUDE.md`)

---

## Fase 2: Fundamental

**Propósito**: el router raíz y el filtro de `error_logs` que usan US1 y US2.

- [X] T003 En `backend/internal/server/router.go` agregar `NewHandler(d Deps) http.Handler`: un `chi.NewRouter()` raíz que registra lo de `Deps.Health` (si no es nil) **antes** de todo y monta `NewRouter(d)` en `/` (`root.Mount("/", …)`); sin `middleware.Logger`, sin CORS y sin límite para lo registrado en la raíz. Pruebas en `backend/internal/server/router_test.go`: una petición a una ruta de la API sigue pasando por CORS y límite; lo de la raíz no
- [X] T004 En `backend/cmd/api/main.go` usar `server.NewHandler(deps)` como `http.Server.Handler` (R1)
- [X] T005 [P] En `backend/internal/errorlog/query.go` reemplazar `Filter.ExcludeEndpointPrefix string` por `ExcludeEndpointPrefixes []string` (un `endpoint NOT LIKE $n ESCAPE '\'` por prefijo con `escapeLike`); actualizar los usos (`errordigest`, `ops` si aplica) y las pruebas de `backend/internal/errorlog/` (dos prefijos excluidos a la vez)

**Punto de control**: `go test ./...` en verde, ninguna respuesta de la API cambió.

---

## Fase 3: Historia de Usuario 1 — Saber en minutos que el servicio se cayó (P1) 🎯 MVP

**Objetivo**: `/healthz` fiel (proceso + base), barata, fuera del límite y sin filas; Railway la usa; el dueño tiene la guía del monitor.

**Prueba independiente**: `curl -i /healthz` → 200 `ok`; con la base caída → 503 `unavailable` en ≤ 2 s; cero filas en `error_logs` (quickstart §1).

- [X] T006 [P] [US1] Pruebas primero en `backend/internal/health/health_test.go`: 200 `{"status":"ok","version":…}` con `Cache-Control: no-store`; 503 `{"status":"unavailable"}` cuando el ping falla o tarda más de 2 s (pinger falso con espera); el resultado se reutiliza 5 s (reloj inyectable); N peticiones simultáneas hacen **un** ping; `HEAD` sin cuerpo; versión `RAILWAY_GIT_COMMIT_SHA` recortada a 12 o `dev`; nunca se llama al `Recorder` de `error_logs`
- [X] T007 [US1] Implementar `backend/internal/health/` (`checker.go`: interfaz `Pinger` que cumple `*pgxpool.Pool`, `context.WithTimeout` de 2 s, caché de 5 s, una sola consulta en curso con `sync.Mutex`/canal o `singleflight` de `golang.org/x/sync` solo si ya está en `go.mod`, si no a mano; `handler.go`: `GET` y `HEAD /healthz` que escriben **solo** por `Responder.WriteJSONUnlogged`; anotaciones Swagger) según `contracts/healthz.md`
- [X] T008 [US1] Conectar en `backend/cmd/api/main.go` (`health.NewChecker(pool, os.Getenv("RAILWAY_GIT_COMMIT_SHA"))`) y en `server.Deps.Health`; regenerar Swagger (`swag init` como lo hace el CI)
- [X] T009 [US1] Cambiar `backend/railway.json` a `"healthcheckPath": "/healthz"`
- [X] T010 [P] [US1] En `DEPLOY.md`: reemplazar la mención del healthcheck `GET /catalog/countries` por `/healthz` y agregar la sección **«Monitoreo externo (Better Stack)»** con los pasos del dueño: cuenta gratuita, dos monitores (`https://api-dev.pedi-track.com/healthz` con la palabra `ok`; `https://dev.pedi-track.com/`), intervalo 3 min, confirmación en otra región, avisos por correo al caer y al volver, app del teléfono opcional, cómo probarlo pausando el servicio en Railway, qué hacer en producción y alternativas (UptimeRobot 5 min, HetrixTools 1 min); que el monitor solo conoce las dos direcciones y el correo

**Punto de control**: US1 completa y desplegable sola.

---

## Fase 4: Historia de Usuario 2 — Ver los errores del teléfono y no dejar la página en blanco (P2)

**Objetivo**: reportes limpios en `error_logs` (`client:`), su sección en el correo semanal y la pantalla de error del mock (A–F).

**Prueba independiente**: `/__prueba-error` con `VITE_TEST_ERROR_ROUTE=true` muestra la pantalla de error y deja una fila `client:/__prueba-error` limpia (quickstart §2–§4).

### Backend

- [X] T011 [P] [US2] Pruebas primero en `backend/internal/clienterror/clean_test.go` con una **tabla de casos compartida** (copiada en el frontend por T018): correos → `[correo]`, UUID → `[id]`, tokens → `[token]`, `http(s)://…` → `[url]`, 4+ dígitos → `[n]`, comillas con un identificador corto se conservan (`'doses'`), comillas con otro texto → `[texto]`, controles fuera, recorte a 200 runas con «…»
- [X] T012 [US2] Implementar `backend/internal/clienterror/clean.go` sobre `mailer.Clean` (R5)
- [X] T013 [P] [US2] Pruebas primero en `backend/internal/clienterror/validate_test.go` y `format_test.go`: campos y reglas de `contracts/client-errors.md` (`kind`, `route` sin dígitos ≤ 80, `version`, `browser`, `os`, `installed`, `count` 1–1000, `message` 1–300); mensaje de la fila `«<tipo> · <mensaje> · <navegador>/<sistema>[ · instalada] · v<versión>[ · repetido 2–9 veces|10 o más veces]»` ≤ 300; `endpoint = "client:"+route`, `file = "frontend"`, `line = 0`, `http_status` y `account_id` nulos
- [X] T014 [US2] Implementar `backend/internal/clienterror/validate.go`, `format.go` y `handler.go`: `POST /client-errors` con `http.MaxBytesReader` de 2 KiB, `json.Decoder.DisallowUnknownFields`, ignora `Authorization`, 204 en éxito; 400 `invalid_client_error` y 413 `body_too_large` con `Responder.WriteJSONErrorUnlogged` (**nunca** una fila por un rechazo); escribe la fila con el `Recorder` de `error_logs` sin bloquear la respuesta (goroutine con 2 s, como `httpx`); anotaciones Swagger. Pruebas en `handler_test.go` (incluye: un rechazo no llama al `Recorder`; `Authorization` presente no cambia nada)
- [X] T015 [US2] Registrar la ruta en `backend/internal/server/router.go` (pública, fuera del grupo de sesión, solo si `Deps.ClientErrors != nil`) y conectarla en `backend/cmd/api/main.go`; regenerar Swagger
- [X] T016 [P] [US2] Correo semanal en `backend/internal/errordigest/content.go`: `Digest.Clients Section`; «Peticiones» excluye `job:` y `client:` (T005); sección nueva **«ERRORES EN LOS TELÉFONOS Y NAVEGADORES»** después de «PROCESOS EN SEGUNDO PLANO» con el mismo `writeSection`; `Total()` y la comparación la incluyen; «No hubo errores esta semana» solo si las tres están vacías. Pruebas en `content_test.go` (filas `client:` no caen en «Peticiones»; ningún id ni correo en el texto)

### Frontend — captura y envío

- [X] T017 [P] [US2] Pruebas primero en `frontend/src/shared/clientErrors/routePatterns.test.ts`: `routePattern('/children/3e34…')` → `/children/:childId`, `/hijo/hoy` → `/hijo/hoy`, desconocida → `other`; **la lista de patrones coincide con los `path="…"` de `frontend/src/App.tsx`** (lee el archivo como texto; excluye `*`)
- [X] T018 [US2] Implementar `frontend/src/shared/clientErrors/routePatterns.ts` (lista + `matchPath`) y `clean.ts` (mismas reglas y **misma tabla de casos** que T011, en `clean.test.ts`)
- [X] T019 [P] [US2] Implementar `frontend/src/shared/clientErrors/environment.ts` (`browserFamily()`, `osFamily()` desde el UA reducido a familias; `installed` con `isRunningInstalled()` de `shared/install`; `__APP_VERSION__`) con `environment.test.ts`
- [X] T020 [US2] Pruebas primero en `frontend/src/shared/clientErrors/report.test.ts` (fetch y reloj falsos): agrupa iguales y manda **uno** con `count` a los 3 s; máximo 5 por carga; sin conexión (`isOffline()`) no llama a `fetch` ni guarda; `fetch` que falla o rechaza no lanza ni reintenta ni genera otro reporte; descarta `Script error.`, errores de otro origen, `ResizeObserver loop…`, `OfflineError` y `AbortError`; el cuerpo nunca trae la URL real, ids ni la cadena del UA
- [X] T021 [US2] Implementar `frontend/src/shared/clientErrors/report.ts` (`reportClientError(kind, error)`; `fetch(VITE_API_BASE_URL + '/client-errors', {method:'POST', keepalive:true, credentials:'omit', headers:{'Content-Type':'application/json'}})`, sin `await` del llamador) e `install.ts` (`installClientErrors()`: listeners de `error` y `unhandledrejection`, idempotente); `index.ts` exporta lo público
- [X] T022 [US2] Llamar `installClientErrors()` en `frontend/src/main.tsx` antes de `createRoot` (cubre papás, pantallas públicas y el teléfono del hijo)

### Frontend — pantalla de error (mock A–F)

- [X] T023 [P] [US2] Textos en `frontend/src/shared/errorScreen/errorScreenText.ts` exactamente como `contracts/ui-error-screen.md` (con «El aviso del problema se envía solo.»), y `errorScreenText.test.ts` que vigila: sin «error», sin rojo/ámbar en clases, sin culpas ni pedir reportar, sin palabras de salud
- [X] T024 [US2] Pruebas primero en `frontend/src/shared/errorScreen/ErrorScreen.test.tsx`: variante por contexto (`/hijo…` → C con «Ir a Hoy»; sin sesión → D con «Ir a iniciar sesión»; con sesión → A; armazón → B), E si hubo «Volver a cargar» hace ≤ 30 s (`reloadMemory` con `sessionStorage` en `try/catch`, también cuando lanza), F con `isOffline()` (sin nota gris), un solo botón sólido, el `h1` recibe el foco, el contenido va antes que el marco en el DOM, «Volver a cargar» llama a `location.reload` y guarda la hora, las salidas navegan a `/home`, `/hijo/hoy`, `/login`; ambos diseños con `useIsDesktop` (C sin diseño web propio: usa el de teléfono centrado)
- [X] T025 [US2] Implementar `frontend/src/shared/errorScreen/ErrorScreen.tsx` y `reloadMemory.ts` **tal cual el mock** (`referencia/Pantalla de error PediTrack.dc.html`: tarjeta, ícono en círculo `hint`, tamaños 28/30/34 px y 16/18/17 px, botones 52/56/48 px, verde sólido + contorno `action`, orden con `order`), con tokens de `@theme` (sin colores literales: `noColorLiterals.test.ts`) y los íconos SVG del mock (decorativos)
- [X] T026 [US2] Implementar `frontend/src/shared/errorScreen/RenderErrorBoundary.tsx` (clase; `getDerivedStateFromError`; `componentDidCatch` → `reportClientError('render', …)`; se reinicia al cambiar `pathname`; prop `frame: 'shell' | 'page'`) con `RenderErrorBoundary.test.tsx`
- [X] T027 [US2] Montar la frontera: alrededor de `<Routes>` en `frontend/src/App.tsx` (B, página completa) y alrededor del contenido en `frontend/src/shared/ui/AppShell.tsx` (A: la barra lateral web y el encabezado del teléfono siguen); agregar la ruta de prueba `/__prueba-error` (truena al dibujar; `?tipo=asincrono` lanza un error y una promesa rechazada desde código de la app) **solo** si `import.meta.env.VITE_TEST_ERROR_ROUTE === 'true'`, como `/planes/pago-de-prueba`; sumar `/__prueba-error` a `routePatterns.ts`
- [X] T028 [US2] E2E en `frontend/e2e/errores-cliente.spec.ts` (390 y 1280 px; Ciudad de México): papá con sesión en `/__prueba-error` → estado A (web con barra lateral) y fila `client:/__prueba-error` `render` en `error_logs` (helper `pg` de los seeds) sin `account_id`; «Volver a cargar» → E; sin sesión → D; teléfono del hijo (credencial sembrada) → C; `context.setOffline(true)` → F y **ninguna** petición a `/client-errors`; `?tipo=asincrono` → filas `error` y `rejection`; «Ir al inicio» lleva a `/home`. Correr con `scripts/e2e-local.sh e2e/errores-cliente.spec.ts`
- [X] T029 [US2] Medir contra el mock (regla del repo): renderizar la app a 390 y 1280 px junto al mock, comparar sección por sección (A–F) y escribir `specs/072-monitoreo-errores-frontend/referencia/desviaciones.md` con las 4 ya resueltas de `contracts/ui-error-screen.md` y cualquier otra con su motivo

**Punto de control**: US2 completa; los E2E existentes siguen pasando (SC-008).

---

## Fase 5: Historia de Usuario 3 — Que nadie inunde ni ensucie el registro (P3)

**Objetivo**: límite propio por dirección y topes del servidor; los rechazos nunca escriben.

**Prueba independiente**: 11 reportes seguidos desde una dirección → el 11.º da 429 y ninguna fila de más; un script que rota mensajes no pasa de 30 filas por minuto (quickstart §2).

- [X] T030 [P] [US3] Pruebas primero en `backend/internal/clienterror/throttle_test.go` (reloj inyectable): una fila por (`endpoint`, `kind`, mensaje) cada 5 min y la siguiente con «(+N más desde la última)»; tope global de 30 filas por minuto; mapa con tope de 1 000 llaves (olvida las más viejas); lo descartado responde 204 igual
- [X] T031 [US3] Implementar `backend/internal/clienterror/throttle.go` y usarlo en `handler.go`
- [X] T032 [US3] Límite propio: en `backend/cmd/api/main.go` leer `CLIENT_ERRORS_PER_MINUTE` (10; `0` = no registrar la ruta) y crear un `ratelimit.New(n, time.Minute)` **separado** del estricto compartido; aplicarlo con `r.With(...)` solo a `POST /client-errors` en `router.go`; prueba en `router_test.go`: el 11.º da 429 con `Retry-After` y no escribe en `error_logs`, y no consume el cupo de `/reminders/actions/taken`

---

## Fase 6: Pulido y transversales

- [X] T033 [P] Actualizar `CLAUDE.md` (fila de la spec 072), `backend/CLAUDE.md` (`internal/health`, `internal/clienterror`, `NewHandler`, `CLIENT_ERRORS_PER_MINUTE`, `client:` en `error_logs`) y `frontend/CLAUDE.md` (`shared/clientErrors`, `shared/errorScreen`, `VITE_TEST_ERROR_ROUTE`, mantener `routePatterns.ts` al agregar una pantalla)
- [X] T034 [P] `BACKLOG.md`: lo que quedó fuera (mapas de fuente privados para ver la pila de llamadas; aviso inmediato al dueño por errores del cliente; métricas de rendimiento del frontend; mover el ítem «Monitoreo externo y errores del frontend» a hecho) y el pendiente del dueño (aviso de privacidad: errores del navegador y Better Stack)
- [ ] T035 Correr todo como CI antes del push: `cd backend && go test ./... -cover` (> 90 % en `health` y `clienterror`), `cd frontend && npx vitest run --coverage` (> 90 %), `scripts/e2e-local.sh` completo (Chromium) y `E2E_PROJECT=webkit scripts/e2e-local.sh e2e/errores-cliente.spec.ts`; `govulncheck` sin hallazgos
- [ ] T036 Revisión de código final (`/code-review`) y validar `quickstart.md` §1–§4 contra el API local

---

## Dependencias y orden

- Fase 1 → Fase 2 → historias. **US1** depende solo de T003–T004. **US2** depende de T003–T005. **US3** depende de T014 (el handler).
- Dentro de US2: backend (T011–T016) y frontend de captura (T017–T022) son independientes entre sí; la pantalla de error (T023–T029) necesita `reportClientError` (T021).
- T029 (medir) después de T025–T027. T035–T036 al final.

### Paralelo

- T001 ∥ T002; T005 ∥ T003.
- US1: T006 ∥ T010.
- US2: T011 ∥ T013 ∥ T016 ∥ T017 ∥ T019 ∥ T023 (archivos distintos).
- US3: T030 en paralelo con el frontend de US2.

## Estrategia

1. **MVP = US1** (T001–T010): ya cierra el riesgo más grande (caída sin aviso) y se puede desplegar sola; el dueño da de alta Better Stack.
2. Luego US2 (reportes + pantalla de error) y US3 (topes) en el mismo PR, porque `/client-errors` no debe salir sin sus límites.
3. Todo en un solo PR a `develop` (`feature/072-monitoreo-errores-frontend`), sin migración.
