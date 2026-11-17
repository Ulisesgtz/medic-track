# Plan de Implementación: Monitoreo externo y errores del frontend

**Rama**: `feature/072-monitoreo-errores-frontend` | **Fecha**: 2026-11-17 | **Especificación**: [spec.md](spec.md)

**Entrada**: Especificación de la funcionalidad desde `specs/072-monitoreo-errores-frontend/spec.md`

## Resumen

Tres piezas, para que el dueño se entere de una caída o de una pantalla rota sin esperar al correo del lunes y sin
mandar datos de familias a terceros:

1. **`GET /healthz`** en un router raíz nuevo (fuera del límite de peticiones y del log de consola): ping a la base con
   2 s de tope y resultado guardado 5 s; Railway la usa como revisión de despliegue. **Better Stack Uptime** (gratis,
   cada 3 min, avisos por correo) vigila `/healthz` y la página; lo da de alta el dueño con la guía de `DEPLOY.md`.
2. **`POST /client-errors`** (paquete nuevo `internal/clienterror`): público, límite propio (10/min por dirección),
   2 KiB, campos cerrados, limpieza en el servidor, topes en memoria (1 fila por grupo cada 5 min, 30 por minuto) y una
   fila en `error_logs` con `endpoint = client:<patrón>` y sin cuenta. El correo semanal le da su propia sección.
3. **Frontend** (`shared/clientErrors/` y `shared/errorScreen/`): captura de `error`, `unhandledrejection` y errores al
   dibujar; limpieza, patrón de pantalla sin ids, agrupado (máx. 5 por carga), nada sin conexión; y la **pantalla de
   error** del mock de Claude Design (estados A–F) en lugar de la página en blanco.

Sin migración. Investigación y decisiones en [research.md](research.md).

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27.2 (backend); TypeScript + React 19 (frontend, Vite, PWA).

**Dependencias Principales**: chi, pgx, `internal/httpx` (`Responder`), `internal/ratelimit`, `internal/mailer.Clean`,
`internal/errorlog`, `internal/errordigest`; React Router (`matchPath`), `shared/offline` (`isOffline`),
`shared/install` (`isRunningInstalled`). **Ninguna dependencia nueva** (ni Sentry ni SDK del monitor).

**Almacenamiento**: PostgreSQL, tabla `error_logs` existente (sin migración).

**Pruebas**: `go test` (unidad + repositorio contra Postgres local), Vitest (> 90 %), Playwright E2E a 390 y 1280 px con
`scripts/e2e-local.sh`.

**Plataforma Objetivo**: API en Railway; PWA en Cloudflare Pages (iPhone Safari/instalada, Android Chrome, escritorio).

**Tipo de Proyecto**: aplicación web (backend + frontend).

**Objetivos de Rendimiento**: `/healthz` < 50 ms con la base sana y como mucho un ping cada 5 s; `/client-errors` no
agrega trabajo a la carga de la página (se manda después, con `keepalive`, sin esperar).

**Restricciones**: nada de datos personales ni de salud en los reportes (limpieza en el teléfono y en el servidor);
ningún rechazo de estas rutas escribe en `error_logs`; sin conexión no se manda nada; la CSP no cambia.

**Escala/Alcance**: 2 rutas nuevas, 1 sección nueva del correo, 2 módulos de frontend, 1 pantalla (6 estados × 2
diseños, C solo teléfono), guía del dueño en `DEPLOY.md`.

## Verificación de la Constitución

| Principio | ¿Cumple? | Cómo |
|---|---|---|
| I. Registra, nunca interpreta | ✅ | No toca datos de salud; la pantalla de error no habla de salud. |
| II. Privacidad | ✅ con aprobación | Reportes sin cuenta, ids, IP, UA completo ni texto del papá; sin SDK de terceros. **Better Stack** solo conoce dos direcciones públicas y el correo del dueño: **aprobado por el dueño el 2026-11-17** (cambio que toca el Principio II). Pendiente del dueño (no bloquea): nombrarlo en el aviso de privacidad. |
| III. Stack fijo | ✅ | Go + React PWA + PostgreSQL; sin dependencias nuevas. |
| IV. Freemium | ✅ | No depende del plan. |
| V. Simplicidad | ✅ | Sin migración, sin pila de llamadas ni mapas de fuente, sin panel propio; reusa `error_logs`, `/ops` y el correo. |
| VI. Pruebas | ✅ | Unidad > 90 % en los paquetes nuevos; E2E de la pantalla de error y del reporte (ruta de prueba solo con `VITE_TEST_ERROR_ROUTE`). |
| Regla del repo: respuestas por `Responder` | ✅ | `/healthz` y `/client-errors` escriben solo por `Responder` (variantes *unlogged*). |
| Regla del repo: mocks tal cual | ✅ | `contracts/ui-error-screen.md`; medir a 390/1280 y listar desviaciones en `referencia/desviaciones.md`. |
| Regla del repo: web y teléfono no se mezclan | ✅ | `useIsDesktop` decide el marco (barra lateral web vs. encabezado del teléfono). |

**Re-verificación tras el diseño**: sin violaciones; nada que justificar en «Seguimiento de complejidad».

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/072-monitoreo-errores-frontend/
├── spec.md
├── plan.md                 # este archivo
├── research.md             # R1–R10
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── healthz.md
│   ├── client-errors.md
│   └── ui-error-screen.md
├── referencia/
│   └── Pantalla de error PediTrack.dc.html   # mock de Claude Design (2026-11-17)
├── checklists/requirements.md
└── tasks.md                # /speckit-tasks
```

### Código Fuente

```text
backend/
├── internal/health/                 # NUEVO: Checker (ping 2 s, caché 5 s, singleflight) + Handler GET/HEAD /healthz
├── internal/clienterror/            # NUEVO: Handler POST /client-errors, validate.go, clean.go (sobre mailer.Clean),
│                                    #        throttle.go (5 min por grupo, 30/min), format.go (mensaje de la fila)
├── internal/server/router.go        # NewHandler(d): raíz con /healthz + Mount("/", NewRouter(d)); ruta /client-errors
├── internal/errorlog/query.go       # ExcludeEndpointPrefixes []string
├── internal/errordigest/content.go  # Digest.Clients + sección «ERRORES EN LOS TELÉFONOS Y NAVEGADORES»
├── cmd/api/main.go                  # health checker, CLIENT_ERRORS_PER_MINUTE, srv.Handler = server.NewHandler
└── railway.json                     # healthcheckPath: /healthz

frontend/
├── src/shared/clientErrors/         # NUEVO: install.ts (listeners), report.ts (agrupar/enviar), clean.ts,
│                                    #        routePatterns.ts (+ prueba que compara con App.tsx), environment.ts
├── src/shared/errorScreen/          # NUEVO: RenderErrorBoundary, ErrorScreen (A–F), errorScreenText.ts, reloadMemory.ts
├── src/main.tsx                     # installClientErrors() antes de createRoot
├── src/App.tsx                      # boundary alrededor de <Routes> (B); ruta /__prueba-error con VITE_TEST_ERROR_ROUTE
├── src/shared/ui/AppShell.tsx       # boundary alrededor del contenido (A)
└── e2e/errores-cliente.spec.ts      # NUEVO: pantalla de error A/B/C/D/E/F a 390 y 1280 + filas en error_logs

DEPLOY.md                             # «Monitoreo externo» (Better Stack, paso del dueño) y /healthz
scripts/e2e-local.sh, .github/workflows/ci.yml  # VITE_TEST_ERROR_ROUTE=true en el build de E2E
```

**Decisión de Estructura**: aplicación web existente (backend Go + frontend React); dos paquetes nuevos de backend
siguiendo el patrón de `internal/catalog` (handler + tests) y dos carpetas en `frontend/src/shared/`. Se actualizan
`CLAUDE.md`, `backend/CLAUDE.md` y `frontend/CLAUDE.md`.

## Orden sugerido

1. Backend `health` + router raíz + `railway.json` (independiente; desbloquea el monitor).
2. Backend `clienterror` + ruta + límite propio.
3. Correo semanal y filtro (`ExcludeEndpointPrefixes`).
4. Frontend `clientErrors` (captura y envío).
5. Frontend `errorScreen` del mock + ruta de prueba + E2E; medir contra el mock.
6. `DEPLOY.md`, mapas `CLAUDE.md`, BACKLOG (lo que quedó fuera).

## Pendientes del dueño

- Dar de alta los dos monitores en Better Stack (guía en `DEPLOY.md`) después del despliegue a DEV.
- Revisar las desviaciones del mock que salgan al medirlo (`referencia/desviaciones.md`); las 4 ya vistas están
  resueltas en `contracts/ui-error-screen.md` (la frase quedó «El aviso del problema se envía solo.», 2026-11-17).
- (Opcional) nombrar los errores del navegador y Better Stack en el aviso de privacidad.

## Seguimiento de Complejidad

Sin violaciones.
