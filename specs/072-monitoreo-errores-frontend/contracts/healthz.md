# Contrato — `GET /healthz` (y `HEAD /healthz`)

Pública, sin sesión, sin clave. Fuera del límite de peticiones, sin `middleware.Logger`, sin CORS (la registra el
router raíz `server.NewHandler` antes de montar el router de la API). Nunca escribe en `error_logs`.

## 200 — todo bien

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{"status":"ok","version":"3e34a6799b24"}
```

`version` = `RAILWAY_GIT_COMMIT_SHA` recortado a 12 caracteres, o `"dev"` si no existe.

## 503 — la base no respondió en 2 s (o el ping falló)

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json
Cache-Control: no-store

{"status":"unavailable"}
```

Sin texto del error, sin direcciones, sin versión.

## Reglas

- El resultado del ping se reutiliza **5 s**; las peticiones simultáneas comparten el ping en curso (una sola consulta).
- `HEAD` responde lo mismo sin cuerpo.
- Cualquier otro método → 405 (comportamiento de chi), sin fila en `error_logs`.
- Lo usa Railway (`backend/railway.json` → `"healthcheckPath": "/healthz"`) y el monitor externo (espera 200 y la
  palabra `ok`).
