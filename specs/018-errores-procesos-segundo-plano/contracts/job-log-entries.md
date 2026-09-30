# Contrato: filas de `error_logs` del proceso de recordatorios

Sin endpoint HTTP. Lo que se puede consultar en `error_logs` (`WHERE endpoint LIKE 'job:%'`):

| `endpoint` | Tipo | `message` | Cuándo |
|---|---|---|---|
| `job:reminders` | `tick` | `reminder tick failed: could not read the due doses` | El ciclo no pudo reclamar las tomas vencidas |
| `job:reminders` | `prepare` | `N reminders could not be prepared` | N ≥ 1 recordatorios no se armaron (dispositivos ilegibles o aviso no serializable) |
| `job:reminders` | `deliver` | `M of N reminders could not be delivered` | M ≥ 1 avisos no se entregaron |

- Cuando la misma falla se calló K ≥ 1 veces desde la fila anterior, el mensaje termina con
  ` (repeated K more times since the last entry)`.
- Como máximo una fila por tipo cada 15 minutos (`jobreport.GroupWindow`); tras un ciclo limpio del tipo, la siguiente
  aparición se escribe de inmediato.
- No se escribe nada por: 404/410 del servicio de avisos, un ciclo sin fallas, un ciclo cancelado por el cierre del
  servidor, ni cuando los recordatorios están «no disponibles» (el proceso no corre).
- `http_status` siempre `NULL`; `account_id` solo si todas las fallas del ciclo son de una cuenta; ninguna fila lleva la
  dirección de un dispositivo, claves, secreto, token de «Tomada», correo ni texto crudo de un error.
