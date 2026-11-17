# Contrato — `POST /client-errors`

Pública, sin sesión (se ignora `Authorization`). Bajo el límite general y **su propio** límite
(`CLIENT_ERRORS_PER_MINUTE`, por omisión 10 por dirección y minuto; `0` = la ruta no existe → 404). CORS: el origen del
frontend (como el resto del API). Cuerpo máximo **2 KiB**. Campos desconocidos → 400.

## Petición

```http
POST /client-errors
Content-Type: application/json

{
  "kind": "render",
  "message": "Cannot read properties of undefined (reading 'doses')",
  "route": "/consultations/:consultationId",
  "version": "3e34a6799b24",
  "browser": "safari",
  "os": "ios",
  "installed": true,
  "count": 3
}
```

| Campo | Tipo | Reglas |
|---|---|---|
| `kind` | string | `error` (no atrapado) · `rejection` (promesa rechazada) · `render` (pantalla de error) |
| `message` | string | 1–300 caracteres; el servidor lo limpia (R5) y lo recorta a 200 |
| `route` | string | `/`, `other`, o segmentos `[a-z-]+` / `:[a-zA-Z]+`; ≤ 80 caracteres; **sin dígitos** |
| `version` | string | `[A-Za-z0-9.-]{1,20}` |
| `browser` | string | `safari` · `chrome` · `firefox` · `edge` · `samsung` · `other` |
| `os` | string | `ios` · `android` · `windows` · `macos` · `linux` · `other` |
| `installed` | bool | la app corre instalada (`display-mode: standalone`) |
| `count` | int | 1–1000, veces que el teléfono lo vio en esta carga |

## Respuestas

| Estado | Cuándo | Cuerpo | ¿Fila en `error_logs`? |
|---|---|---|---|
| **204** | Aceptado (también si el tope del servidor lo descartó) | — | sí, si no lo descartó un tope |
| 400 `invalid_client_error` | JSON inválido, campo de más, valor fuera de regla | `{"error","message"}` | **no** |
| 413 `body_too_large` | más de 2 KiB | `{"error","message"}` | **no** |
| 429 `rate_limited` | pasó el límite por dirección | `{"error","message"}` + `Retry-After` | **no** |

Todos los rechazos usan `Responder.WriteJSONErrorUnlogged`; el 204 se escribe por `Responder` también
(`WriteJSONUnlogged` sin cuerpo o el helper equivalente).

## Fila que se guarda (sin migración)

| Columna | Valor |
|---|---|
| `endpoint` | `client:` + `route` (p. ej. `client:/consultations/:consultationId`) |
| `message` | `render · Cannot read properties of undefined (reading 'doses') · safari/ios · instalada · v3e34a6799b24 · repetido 2–9 veces` |
| `http_status` | `NULL` |
| `account_id` | `NULL` (siempre) |
| `file` / `line` | `frontend` / `0` |

«repetido …» solo si `count > 1`, en rangos `2–9` y `10 o más`. Si el tope del servidor calló repeticiones, la
siguiente fila del mismo grupo termina en «(+N más desde la última)».

## Topes del servidor (por proceso, en memoria)

- Una fila por (`endpoint`, `kind`, mensaje limpio) cada **5 min**.
- Como mucho **30 filas por minuto** en total.
- Mapa de grupos con tope de 1 000 llaves (las más viejas se olvidan).
