# Guía de validación: Errores de procesos en segundo plano

**Requisitos**: backend con Postgres local y las claves VAPID (`backend/.env.local`), para que el proceso de
recordatorios corra.

## 1. Automatizado
```bash
cd backend && set -a && . ./.env.local && set +a
go vet ./... && go test ./internal/... -cover
```
`internal/jobreport` y `internal/reminder` deben quedar por encima del 90 %.

## 2. A mano: la consulta del ciclo falla
1. Arranca el backend (`go run ./cmd/api`).
2. Con la base arriba, haz fallar la consulta del ciclo sin tumbar `error_logs` (p. ej. `ALTER TABLE doses RENAME COLUMN
   reminder_sent_at TO reminder_sent_at_x;`). En la consola sale `reminder: tick failed`.
3. Consulta:
   ```sql
   SELECT created_at, endpoint, http_status, message, file, line
   FROM error_logs WHERE endpoint = 'job:reminders' ORDER BY created_at;
   ```
   Esperado: **una** fila `reminder tick failed: could not read the due doses` aunque pasen varios ciclos de 30 s,
   `http_status` nulo, `file`/`line` de `reminder/service.go`.
4. Deshaz el `RENAME`, espera un ciclo y vuelve a provocarlo: aparece una fila nueva de inmediato (el tipo se recuperó).
5. Con la base entera caída no se puede escribir nada en `error_logs`: solo queda la consola (limitación conocida).

## 3. A mano: un aviso que no se entrega
Registra un dispositivo con un `endpoint` de un servicio de avisos permitido que rechace el envío (p. ej. el de las
pruebas de integración) y deja vencer una toma: hay una fila `1 of 1 reminders could not be delivered` (y ninguna si el
servicio responde 404/410).

## 4. Nada sensible
`SELECT message FROM error_logs WHERE endpoint LIKE 'job:%'` no muestra direcciones `https://`, claves ni tokens.
