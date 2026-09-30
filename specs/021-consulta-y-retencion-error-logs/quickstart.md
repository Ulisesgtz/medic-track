# Guía de validación: Consultar y depurar los errores registrados

**Requisitos**: Postgres local con la migración `0015` aplicada y `backend/.env.local` con `OPS_API_KEY=<una clave larga>` (y,
si quieres, `ERROR_LOGS_RETENTION_DAYS`).

## 1. Automatizado
```bash
cd backend && set -a && . ./.env.local && set +a && psql "$DATABASE_URL" -f migrations/0015_add_error_logs_indexes.sql
go vet ./... && go test ./... -cover
```

## 2. A mano: consultar
```bash
KEY=<tu OPS_API_KEY>
# Provoca un error que pase por el Responder (un país que no existe) y mira que aparece:
curl -s localhost:8080/catalog/countries/ZZ/states
curl -s -H "Authorization: Bearer $KEY" "localhost:8080/ops/error-logs?limit=5"
curl -s -H "Authorization: Bearer $KEY" "localhost:8080/ops/error-logs?endpointPrefix=job:"
curl -s -H "Authorization: Bearer $KEY" "localhost:8080/ops/error-logs/summary"
```
Esperado: entradas más recientes primero, `nextCursor` con más de `limit`, el resumen con conteos; sin correos.

## 3. A mano: sin clave o con clave mala
```bash
curl -si localhost:8080/ops/error-logs | head -1                       # 404
curl -si -H "Authorization: Bearer mala" localhost:8080/ops/error-logs | head -1   # 404, igual que /ruta-que-no-existe
```
Mismo 404 que `curl -si localhost:8080/ruta-que-no-existe`. Quita `OPS_API_KEY`, reinicia y la ruta con la clave buena
también da 404.

## 4. A mano: depuración
```sql
INSERT INTO error_logs (message, endpoint, file, line, created_at) VALUES
 ('vieja', '/x', 'f', 1, now() - interval '100 days'), ('reciente', '/x', 'f', 1, now() - interval '10 days');
```
Reinicia el backend con `ERROR_LOGS_RETENTION_DAYS=90`: en la consola dice cuántas filas borró y solo queda `reciente`.
Con `ERROR_LOGS_RETENTION_DAYS=1` el mínimo es 7: `reciente` (10 días) se borra, una de hace 5 días no.

## 5. Nada sensible
La clave no aparece en `error_logs`, en la consola ni en ninguna respuesta.
