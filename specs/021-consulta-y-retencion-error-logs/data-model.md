# Modelo de Datos: Consultar y depurar los errores registrados

La tabla `error_logs` (migración `0005`) no cambia de columnas. Solo se agregan dos índices.

## Migración `0015_add_error_logs_indexes.sql`

```sql
CREATE INDEX idx_error_logs_created_at ON error_logs (created_at DESC, id DESC);
CREATE INDEX idx_error_logs_endpoint ON error_logs (endpoint text_pattern_ops, created_at DESC);
```

- `idx_error_logs_created_at`: la lista (más reciente primero y cursor por `(created_at, id)`), el resumen por periodo y la
  depuración por antigüedad.
- `idx_error_logs_endpoint`: el filtro por endpoint exacto o por prefijo (`LIKE 'job:%'`, que necesita `text_pattern_ops`).

## Derivados (no se guardan)

| Concepto | Forma |
|---|---|
| Página de errores | hasta `limit` (1–500, por omisión 100) entradas `{id, createdAt, message, httpStatus?, endpoint, file, line, accountId?}` y `nextCursor` |
| Cursor | `base64url(<created_at en ns>.<id>)` del último elemento de la página; opaco para quien consulta |
| Resumen | por `(endpoint, httpStatus?, message)`: `count`, `firstSeen`, `lastSeen`; hasta 100 grupos, de más a menos frecuente |
| Corte de retención | `ahora − retención` (90 días por omisión, mínimo 7); se borra `created_at < corte` |

Ninguna respuesta incluye correos (la tabla no los guarda) ni nada que no esté ya en la tabla.
