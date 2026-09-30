# Plan de Implementación: Consultar y depurar los errores registrados

**Rama**: `feature/021-consulta-y-retencion-error-logs` | **Fecha**: 2026-09-30 | **Especificación**: [spec.md](./spec.md)

## Resumen

Solo backend, sin pantallas. (1) Dos rutas de solo lectura para el equipo, `GET /ops/error-logs` (lista con cursor y
filtros) y `GET /ops/error-logs/summary`, detrás de una clave de operación (`OPS_API_KEY`, comparación en tiempo
constante) que, si no está configurada, hace que las rutas no existan (research R2, R4, R5); `errorlog.Repository` gana
`List`, `Summary` y `DeleteOlderThan` y la migración `0015` los índices que necesitan (R1, R3). (2) Una depuración diaria
por lotes (`internal/retention`, 90 días por omisión, mínimo 7) que reporta sus fallas por `jobreport` (R6).

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27. **Dependencias**: ninguna nueva (`crypto/sha256`, `crypto/subtle`, `encoding/base64`).
**Almacenamiento**: PostgreSQL, tabla `error_logs` existente + migración `0015` con dos índices.
**Pruebas**: `go test` con BD real (lista, filtros, cursor, resumen, borrado por lotes), handler y clave (acierto, falta,
mal, no `Bearer`, sin configurar), router, depuración con un borrador falso; >90 %. Sin frontend ni Playwright.
**Restricciones**: sin clave no hay datos ni pistas; nunca el correo ni la clave en respuestas, logs o consola; las fallas
de clave no se escriben en `error_logs` (amplificación); la depuración no frena las escrituras; `*httpx.Responder` en las
respuestas a quien trae la clave; Swagger regenerado.

## Verificación de la Constitución

- **I**: no toca contenido médico ni de pantalla. ✅
- **II**: es lo que más protege: expone solo lo que ya está en `error_logs` (sin correo, spec 002/018), detrás de una clave,
  y la depuración **reduce** los datos guardados (retención de 90 días, mínimo 7). ✅
- **III, IV**: sin cambios de cuentas ni de planes; la clave de operación no es una sesión de padre. ✅
- **V**: dos paquetes chicos, dos índices y dos variables de entorno; sin dependencias. ✅ **VI**: unitarias >90 %. ✅
- **Regla del router**: es la excepción razonada a «todo lo que no es catálogo va detrás de una sesión de Clerk»: las rutas
  `ops` van detrás de la clave de operación y solo existen si está configurada; `router_test` las cubre aparte. ✅

## Estructura del Proyecto

```text
backend/
├── migrations/0015_add_error_logs_indexes.sql
├── cmd/api/main.go                  # OPS_API_KEY → ops.Handler (nil si no hay); retention.Run en segundo plano
└── internal/
    ├── errorlog/                    # model.go (Filter, SummaryRow), repository.go (List, Summary, DeleteOlderThan) + pruebas
    ├── ops/                         # handler.go (ListErrorLogs, ErrorLogSummary), key.go (RequireKey), cursor.go + pruebas
    ├── retention/                   # retention.go (Config, Run) + pruebas con un borrador falso
    ├── server/router.go (+ test)    # Deps.Ops; rutas /ops/... solo si no es nil, detrás de ops.RequireKey
    └── docs/                        # Swagger
CLAUDE.md, backend/CLAUDE.md, BACKLOG.md (lectura y retención hechas; digest sigue), specs/002 (nota), DEPLOY.md (variables)
```

## Seguimiento de Complejidad

Sin violaciones; la excepción al «todo con sesión» está acotada a las dos rutas de solo lectura de `ops` y documentada.
