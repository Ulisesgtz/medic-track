# Modelo de Datos: Errores de procesos en segundo plano

Sin cambios de esquema: se usa `error_logs` (migración `0005`) tal cual.

| Columna | En una fila de un proceso |
|---|---|
| `message` | Descripción fija de la falla con su conteo (ver `contracts/job-log-entries.md`); nunca texto de un error de terceros |
| `http_status` | `NULL` (ya admitido) |
| `endpoint` | `job:<nombre>`, p. ej. `job:reminders` |
| `file`, `line` | Del punto de `reminder/service.go` que llamó a `Report` (`runtime.Caller(1)`) |
| `account_id` | La cuenta cuando todas las fallas del ciclo son de una sola; si no, `NULL`. Nunca el correo |

## Estado en memoria del `Reporter` (no se guarda)

Por tipo de falla (`kind`): `lastWritten` (hora de la última fila), `suppressed` (veces calladas desde entonces) y
`recovered` (el ciclo de ese tipo salió limpio después de la última fila). Se pierde al reiniciar el servidor.
