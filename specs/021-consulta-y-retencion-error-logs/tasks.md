---

description: "Lista de tareas de la spec 021: consultar y depurar los errores registrados"
---

# Tareas: Consultar y depurar los errores registrados

**Entrada**: `/specs/021-consulta-y-retencion-error-logs/` (plan.md, spec.md, research.md, data-model.md, contracts/ops-error-logs.md, quickstart.md)

**Pruebas**: obligatorias (Principio VI): >90 % en Go. Solo backend, sin pantallas ni Playwright.

**Organización**: US1 (consultar) y US2 (depurar) comparten la base en `errorlog` y son independientes entre sí.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [X] T001 Línea base: `cd backend && set -a && . ./.env.local && set +a && go vet ./... && go test ./internal/... -cover` en verde
- [X] T002 Crear `backend/migrations/0015_add_error_logs_indexes.sql` (`idx_error_logs_created_at` sobre `(created_at DESC, id DESC)` e `idx_error_logs_endpoint` sobre `(endpoint text_pattern_ops, created_at DESC)`) y aplicarla a la BD local

## Fase 2: Base en `errorlog` (US1 y US2)

- [X] T003 [US1] `backend/internal/errorlog/model.go` y `repository.go`: `Filter` (`Since`, `Until`, `Endpoint`, `EndpointPrefix`, `Status`, `AccountID`, `Limit`, `After` = `(CreatedAt, ID)`), `List(ctx, Filter) ([]Entry, error)` ordenada `created_at DESC, id DESC` con `limit + 1` para saber si hay más (el prefijo se escapa para `LIKE`), `SummaryRow` y `Summary(ctx, Filter) ([]SummaryRow, error)` (agrupa por endpoint, estado y mensaje; `count`, `min`, `max`; hasta 100, `count DESC, max DESC`), y `DeleteOlderThan(ctx, cutoff, batch) (int, error)` (un lote: `DELETE … WHERE id IN (SELECT id … WHERE created_at < $1 ORDER BY created_at LIMIT $2)`)
- [X] T004 [P] [US1] Pruebas en `backend/internal/errorlog/repository_test.go` (BD real, filas con un marcador propio): orden, filtros (periodo, endpoint exacto, prefijo con `%` y `_` escapados, estado, cuenta), paginación con cursor sin repetir ni saltar aunque entren filas durante la paginación, `Summary` agrupa y ordena, `DeleteOlderThan` borra solo lo más viejo y respeta el lote, `Create` sigue igual

**Punto de Control**: el repositorio lista, resume y borra por antigüedad.

## Fase 3: US1 - Consultar los errores (P1) 🎯 MVP

- [X] T005 [US1] Crear `backend/internal/ops/key.go`: `RequireKey(key string) func(http.Handler) http.Handler` compara los SHA-256 de la clave enviada (`Authorization: Bearer …`) y la configurada con `subtle.ConstantTimeCompare`; falta, mal o no `Bearer` → `http.NotFound` (mismo cuerpo que una ruta desconocida), **sin pasar por el `Responder`** (se documenta: si no, cualquiera inundaría `error_logs`); la clave nunca se imprime
- [X] T006 [US1] Crear `backend/internal/ops/cursor.go` y `handler.go`: `ListErrorLogs` y `ErrorLogSummary` con `*httpx.Responder` (200 `{entries, nextCursor}` y `{groups}`; 400 `validation_error` con `details` para `since`/`until` mal formadas, `limit` fuera de 1–500, `status` no entero, `accountId` no UUID, cursor inválido, o `endpoint` con `endpointPrefix`; por omisión `since` = hace 7 días y `limit` = 100); cursor `base64url(<ns>.<uuid>)`; anotaciones Swagger; ningún campo de correo
- [X] T007 [US1] `backend/internal/server/router.go` y `cmd/api/main.go`: `Deps.Ops *ops.Handler` y `Deps.OpsKey string`; si `Ops` no es nil, registrar `GET /ops/error-logs` y `/ops/error-logs/summary` con `ops.RequireKey`; `main.go` lee `OPS_API_KEY` y crea el `Handler` solo si no está vacía (con un aviso en la consola de que las consultas de operación están desactivadas cuando falta); CORS no cambia
- [X] T008 [P] [US1] Pruebas `backend/internal/ops/*_test.go` (BD real) y filas en `router_test.go`: con clave buena devuelve la lista y el resumen; sin clave, con clave mala, sin `Bearer` y con clave de otro largo dan el mismo 404 que `/ruta-que-no-existe` y nada de datos; las fallas de clave no crean filas en `error_logs`; con `Ops` nil las rutas no existen; filtros y cursor por HTTP; 400 por cada entrada inválida; nada de correos ni de la clave en ninguna respuesta; las rutas de padres siguen igual (401 sin sesión)
- [X] T009 [US1] Regenerar Swagger (`go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd`), `gofmt` del código nuevo, `go vet` y `go test ./internal/... -cover` (>90 %)

**Punto de Control**: quien opera consulta errores y resumen con la clave; sin ella no obtiene nada ni pistas.

## Fase 4: US2 - Depuración diaria (P1)

- [X] T010 [US2] Crear `backend/internal/retention/retention.go`: `Purger` (`DeleteOlderThan`), `FailureReporter` (`Report`/`Recovered`, el de la spec 018), `ConfigFromEnv()` (`ERROR_LOGS_RETENTION_DAYS`: 90 por omisión, mínimo 7, inválido → 90), `Purge(ctx, purger, now, cfg)` que repite lotes de 1000 hasta que uno borra menos, y `Run(ctx, purger, reporter, cfg)` que depura al arrancar y cada 24 h; un ciclo cancelado por el cierre no es una falla; una falla real se imprime y se reporta (`job:error-logs-retention`, tipo `purge`); imprime cuántas filas borró solo si borró alguna
- [X] T011 [US2] `backend/cmd/api/main.go`: `go retention.Run(ctx, errorLogRepo, jobreport.New(errorLogRepo, "error-logs-retention"), retention.ConfigFromEnv())`
- [X] T012 [P] [US2] Pruebas `backend/internal/retention/retention_test.go` con un borrador y un reporter falsos: borra solo lo más viejo que el corte, por lotes (varios ciclos hasta terminar), sin nada que borrar no imprime ni reporta, el mínimo de 7 días y el valor inválido, una falla se reporta y el `Run` sigue, cancelar el contexto no reporta; una prueba contra la BD real con filas de 10, 100 y 200 días y retención de 90

**Punto de Control**: la tabla deja de crecer sin fin y una falla de la depuración queda registrada.

## Fase 5: Pulido

- [X] T013 [P] Documentación: `CLAUDE.md` (feature 021), `backend/CLAUDE.md` (`errorlog` con `List`/`Summary`/`DeleteOlderThan`, `internal/ops`, `internal/retention`, `OPS_API_KEY` y `ERROR_LOGS_RETENTION_DAYS` en la tabla de entorno, la excepción del router), `DEPLOY.md` (las dos variables), `BACKLOG.md` (lectura y retención hechas; el digest por correo sigue pendiente) y nota en `specs/002-registro-log-errores/spec.md` (FR-007 queda atendido por la spec 021)
- [X] T014 Calidad: `gofmt`, `go vet ./...`, `go test ./... -cover` (>90 %); quickstart §2 a §5 contra la BD local
- [ ] T015 Commit, push, PR a `develop` y code review

## Dependencias

Fase 1 → Fase 2 (T003→T004) → US1 (T005, T006→T007→T008→T009) e independiente US2 (T010→T011, T012) → Pulido. T005 y T006 en paralelo.

## Estrategia

MVP = US1 (consultar); US2 (depurar) va en el mismo PR porque comparten `errorlog` y la documentación, pero puede entregarse
aparte.
