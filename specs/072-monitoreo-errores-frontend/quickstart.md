# Quickstart — validar la spec 072

## Requisitos

- Postgres local y `backend/.env.local` como siempre; API en `:8080`, frontend en `:5173`.
- Para E2E: `scripts/e2e-local.sh` (enciende `VITE_TEST_ERROR_ROUTE=true`).

## 1. Revisión de salud

```bash
curl -i http://localhost:8080/healthz
```

Esperado: `200`, `{"status":"ok","version":"dev"}`, `Cache-Control: no-store`. Detener Postgres y repetir: `503`
`{"status":"unavailable"}` en ≤ 2 s. En los dos casos, `SELECT count(*) FROM error_logs` no cambia. 300 peticiones
seguidas a `/healthz` no dan 429 ni cuestan más de un ping cada 5 s (ver la consola de Postgres o las pruebas).

## 2. Reporte de error del cliente (a mano)

```bash
curl -i -X POST http://localhost:8080/client-errors -H "Content-Type: application/json" -d "{\"kind\":\"error\",\"message\":\"x ana@correo.com 3e34a679-9b24-4230-f35a-0f142688b493\",\"route\":\"/children/:childId\",\"version\":\"dev\",\"browser\":\"chrome\",\"os\":\"windows\",\"installed\":false,\"count\":1}"
```

Esperado: `204` y una fila `endpoint = 'client:/children/:childId'` con `[correo]` y `[id]` en el mensaje,
`account_id` y `http_status` nulos. Con `"route":"/children/3e34a679"` → `400` y ninguna fila. Once seguidas desde la
misma dirección → la 11.ª da `429` y ninguna fila de más.

## 3. Desde la app

Con `VITE_TEST_ERROR_ROUTE=true`, abrir `/__prueba-error`: se ve la **pantalla de error** (estado A o B según la sesión,
D sin sesión) y en ≤ 5 s aparece la fila `client:/__prueba-error` con `render`. `/__prueba-error?tipo=asincrono` deja
filas `error` y `rejection`. Tocar «Volver a cargar» → estado E. En modo avión (DevTools «Offline») → estado F y ninguna
petición a `/client-errors`.

## 4. Operación y correo

```bash
curl -H "Authorization: Bearer $OPS_API_KEY" "http://localhost:8080/ops/error-logs?endpointPrefix=client:"
```

Lista las filas del cliente. El correo semanal de prueba (pruebas de `errordigest`) muestra la sección «ERRORES EN LOS
TELÉFONOS Y NAVEGADORES» aparte de «PETICIONES» y «PROCESOS EN SEGUNDO PLANO».

## 5. Monitor externo (dueño, en DEV)

Seguir `DEPLOY.md` → «Monitoreo externo»: dos monitores en Better Stack (`https://api-dev.pedi-track.com/healthz` con la
palabra `ok`, y `https://dev.pedi-track.com/`). Probar con «Pause» del servicio en Railway: llega el aviso de caída en
≤ 10 min y el de regreso al reanudar.

## 6. Pruebas

```bash
cd backend && go test ./... -cover
```

```bash
cd frontend && npx vitest run --coverage
```

```bash
scripts/e2e-local.sh e2e/errores-cliente.spec.ts
```
