# Investigación: Consultar y depurar los errores registrados

## R1 — Lectura y depuración viven en `errorlog`; la clave de operación y las rutas en un paquete `ops`

**Decisión**: `errorlog.Repository` (hoy solo `Create`, spec 002) gana tres operaciones de la tabla: `List`, `Summary` y
`DeleteOlderThan`. Un paquete nuevo `internal/ops` tiene el `Handler` de las dos consultas y el middleware de la clave
de operación; la depuración diaria vive en `internal/retention`.

**Justificación**: `errorlog` es el único que conoce la tabla. `ops` es quien habla HTTP con el equipo (no con un padre:
ni sesión de Clerk ni `RequireOwner`). `retention` tiene que importar `jobreport`, y `jobreport` ya importa `errorlog`:
si la depuración viviera dentro de `errorlog` habría un ciclo de importaciones.

## R2 — Clave de operación: `Authorization: Bearer <OPS_API_KEY>`, sin la variable la ruta no existe

**Decisión**: la clave sale de `OPS_API_KEY`. `cmd/api` crea el `ops.Handler` **solo si la variable existe y no está
vacía**; `server.Deps.Ops` es `nil` si no y entonces `NewRouter` no registra las rutas (chi responde 404 como a
cualquier ruta desconocida, FR-004). El middleware compara los SHA-256 de la clave enviada y la configurada con
`subtle.ConstantTimeCompare` (FR-003: sin ataque de tiempo y sin filtrar la longitud). Falta, está mal o no es `Bearer`
→ `http.NotFound` (el mismo cuerpo que una ruta desconocida): sin pista de que la ruta existe ni de por qué falló.

**Las fallas de clave NO se escriben en `error_logs`** (no pasan por `Responder`): de lo contrario cualquiera podría
inundar la tabla mandando claves malas. Solo las respuestas a quien sí trae la clave (p. ej. un filtro inválido) van por
el `Responder` (FR-009); la excepción está documentada en el código.

**Alternativas**: Clerk con un rol de administrador (no hay roles ni panel todavía: sería una spec de administración
completa); un subcomando de línea de comandos (obliga a entrar al servidor; la API se puede usar desde cualquier lado).

## R3 — Índices para que leer y depurar no recorran toda la tabla

**Decisión**: migración `0015`: `idx_error_logs_created_at` sobre `(created_at DESC, id DESC)` (lista, paginación por
cursor, resumen por periodo y depuración por antigüedad) e `idx_error_logs_endpoint` sobre `(endpoint, created_at DESC)`
(filtro por endpoint o prefijo, que con `text_pattern_ops` sirve a `LIKE 'job:%'`). La tabla no tenía más que la llave.

## R4 — Lista con paginación por cursor (keyset), no por `OFFSET`

**Decisión**: `GET /ops/error-logs` ordena `created_at DESC, id DESC`; el cursor es la pareja `(created_at, id)` del
último elemento, codificada en base64 sin relleno (`<nanosegundos>.<uuid>`), y la siguiente página es
`WHERE (created_at, id) < ($cursorTime, $cursorID)`. Pide `limit + 1` filas para saber si hay más y responde
`nextCursor` (o `null`). Los errores siguen entrando mientras se pagina: con `OFFSET` se repetirían o saltarían filas;
con el cursor no. Filtros: `since` (por omisión, hace 7 días) y `until` en RFC 3339, `endpoint` (exacto) o
`endpointPrefix` (LIKE con el prefijo escapado), `status` (entero), `accountId` (UUID); `limit` 1–500 (100); cursor o
fechas inválidos → 400 `validation_error` sin consultar.

## R5 — Resumen

**Decisión**: `GET /ops/error-logs/summary?since=&until=` agrupa por `(endpoint, http_status, message)` con `count(*)`,
`min(created_at)` y `max(created_at)`, ordenado por `count DESC, max(created_at) DESC` y limitado a 100 grupos (los
mensajes de procesos son frases fijas —spec 018— y los HTTP vienen de un conjunto pequeño de errores, así que los grupos
son pocos). Es la base del digest futuro.

## R6 — Depuración diaria, por lotes, en el proceso del API

**Decisión**: `retention.Run(ctx, purger, reporter, cfg)` borra al arrancar y luego cada 24 h, como el ticker de
recordatorios (spec 011); `cfg` = retención en días desde `ERROR_LOGS_RETENTION_DAYS` (por omisión 90; un valor menor a 7
o inválido se sube/cae a los límites: 7 y 90) y lote de 1000. Cada lote es
`DELETE … WHERE id IN (SELECT id … WHERE created_at < $cutoff ORDER BY created_at LIMIT 1000)`: bloqueos cortos, no frena
las escrituras de errores nuevos (SC-004); se repite hasta que un lote borra menos de 1000. Un ciclo cancelado por el cierre
del servidor no es una falla. Una falla real se imprime y se reporta con `jobreport` (`job:error-logs-retention`, tipo
`purge`); se imprime cuántas filas borró cuando borró alguna (sin ruido si no hay nada).

## R7 — Qué no se toca

Nada del lado del padre: sin pantallas, sin cambios en las rutas existentes (FR-010). `Responder` y `jobreport` no
cambian. El digest por correo sigue en `BACKLOG.md`.
