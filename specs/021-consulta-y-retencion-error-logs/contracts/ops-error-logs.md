# Contrato: consulta de errores para quien opera

Sin sesión de Clerk ni `RequireOwner`: estas rutas son del equipo. Solo existen si el servidor tiene `OPS_API_KEY`.

## Autenticación

`Authorization: Bearer <OPS_API_KEY>`. Falta, está mal o no es `Bearer` → **404 con el mismo cuerpo que una ruta
desconocida** (`404 page not found`), sin más pistas. Sin `OPS_API_KEY` configurada las rutas no están registradas (404 igual).
Esas respuestas no se escriben en `error_logs`.

## `GET /ops/error-logs`

| Parámetro | Tipo | Notas |
|---|---|---|
| `since`, `until` | RFC 3339 | por omisión `since` = hace 7 días, `until` = ahora |
| `endpoint` | texto | exacto (`/accounts`, `job:reminders`) |
| `endpointPrefix` | texto | por prefijo (`job:`); no se combina con `endpoint` |
| `status` | entero | estado HTTP (los de procesos no tienen) |
| `accountId` | UUID | |
| `limit` | 1–500 | por omisión 100 |
| `cursor` | texto | el `nextCursor` de la página anterior |

200:

```json
{
  "entries": [
    { "id": "…", "createdAt": "2026-09-30T14:02:11Z", "message": "reminder tick failed: could not read the due doses",
      "httpStatus": null, "endpoint": "job:reminders", "file": "…/reminder/service.go", "line": 183, "accountId": null }
  ],
  "nextCursor": "MTc5MD…"
}
```

`nextCursor` es `null` en la última página. 400 `validation_error` (con `details`) para fechas, límite, estado, UUID o
cursor inválidos, o `endpoint` junto con `endpointPrefix`.

## `GET /ops/error-logs/summary`

Mismos `since`, `until`, `endpoint`, `endpointPrefix`, `status` y `accountId`. 200:

```json
{
  "groups": [
    { "endpoint": "/accounts", "httpStatus": 400, "message": "email is required", "count": 42,
      "firstSeen": "2026-09-24T10:00:00Z", "lastSeen": "2026-09-30T13:58:02Z" }
  ]
}
```

Hasta 100 grupos, de más a menos frecuente (desempate: el más reciente primero).

## Variables de entorno

| Variable | Notas |
|---|---|
| `OPS_API_KEY` | La clave de operación. Sin ella las rutas no existen. Nunca se registra ni se devuelve |
| `ERROR_LOGS_RETENTION_DAYS` | Días de retención; 90 por omisión; menos de 7 se usa 7; un valor inválido, 90 |

## Depuración

Diaria (al arrancar y cada 24 h), por lotes de 1000, `created_at < ahora − retención`. Imprime cuántas filas borró cuando
borró alguna. Una falla se reporta con `jobreport` como `job:error-logs-retention` (tipo `purge`).
