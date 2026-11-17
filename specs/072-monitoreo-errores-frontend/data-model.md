# Modelo de datos — Spec 072

**Sin migración.** Todo cabe en tablas que ya existen.

## `error_logs` (spec 002; columnas sin cambio)

Filas nuevas del grupo **errores del cliente**:

| Columna | Valor | Nota |
|---|---|---|
| `endpoint` | `client:<patrón de pantalla>` | p. ej. `client:/children/:childId`, `client:/hijo/hoy`, `client:other`. Nunca un id real (validado sin dígitos en el servidor). |
| `message` | `<tipo> · <mensaje limpio> · <navegador>/<sistema>[ · instalada] · v<versión>[ · repetido 2–9 veces \| 10 o más veces][ (+N más desde la última)]` | ≤ 300 caracteres; el mensaje limpio ≤ 200. |
| `http_status` | `NULL` | como las filas `job:` (spec 018). |
| `account_id` | `NULL` | siempre; el reporte no lleva quién era. |
| `file` / `line` | `frontend` / `0` | las columnas son `NOT NULL`. |
| `created_at` | hora del servidor al guardar | |

Retención: la misma de toda la tabla (spec 021, 90 días por omisión). Índice `(endpoint text_pattern_ops,
created_at DESC)` de la `0015` ya sirve al filtro `endpointPrefix=client:`.

## Lo que NO se guarda (en ningún lado)

- La dirección IP: el límite por dirección vive en memoria del proceso y se olvida al minuto.
- La cadena completa del navegador (`User-Agent`), la URL real, la pila de llamadas, la sesión o la credencial.

## Estado en memoria (no persistente)

- **Teléfono** (`shared/clientErrors`): mapa por (tipo, mensaje limpio, patrón) → conteo, primera vez, si ya se mandó;
  contador de reportes por carga (tope 5); bandera de reentrada. Se pierde al recargar.
- **Pantalla de error**: `sessionStorage['peditrack.errorScreen.reloadAt']` = hora del último «Volver a cargar» (para el
  estado E; se lee y escribe en `try/catch`).
- **Servidor** (`internal/clienterror`): mapa por (`endpoint`, tipo, mensaje) → última escritura y repeticiones calladas
  (tope 1 000 llaves); contador global por minuto (tope 30). Por proceso, como `jobreport`.
- **Servidor** (`internal/health`): último resultado del ping y su hora (5 s de vida).

## Correo semanal (spec 039)

`errordigest.Digest` gana `Clients Section` (mismo tipo que `Requests` y `Jobs`); `errorlog.Filter` cambia
`ExcludeEndpointPrefix string` por `ExcludeEndpointPrefixes []string`.
