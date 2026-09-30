# Investigación: Errores de procesos en segundo plano en `error_logs`

## R1 — Un paquete pequeño `internal/jobreport`, no un cambio en `httpx`

**Decisión**: un paquete nuevo con un `Reporter` por proceso (`jobreport.New(recorder, "reminders")` → `endpoint =
job:reminders`). Recibe el mismo `Recorder` (`Create(ctx, *errorlog.Entry)`) que `httpx.Responder`, que en producción es
`errorlog.Repository`.

**Justificación**: `httpx.Responder` está atado a respuestas HTTP (estado, ruta de chi, `runtime.Caller` a 2 saltos); el
backlog ya advierte que colapsar la atribución por línea de `error_logs` es lo que no se debe hacer. La entidad
(`errorlog.Entry`) y la tabla ya admiten filas sin `http_status` (`INTEGER` nulo) y con cualquier `endpoint` (`TEXT`),
así que **no hay migración**. El paquete es lo que pide FR-009: cualquier proceso futuro crea su `Reporter` con su nombre.

**Alternativas**: (a) extender `Responder` con un método `WriteJob` — mezcla dos cosas y el nombre miente; (b) escribir
directo con `errorlog.Repository` desde `reminder` — cada proceso reimplementaría el agrupamiento (FR-009) y `reminder`
dependería del almacenamiento.

## R2 — Agrupar por tipo de falla, 15 minutos, con «recuperado»

**Decisión**: el `Reporter` guarda por tipo (`kind`, una cadena corta: `tick`, `prepare`, `deliver`) la hora de la última
fila, cuántas veces se calló desde entonces y si el tipo ya «se recuperó».

- `Report(kind, message, accountID)`: escribe si no hay estado, si el tipo se recuperó desde la última fila o si pasaron
  ≥ 15 min; si no, solo suma al contador. Al escribir, si hubo veces calladas agrega « (repeated N more times since the
  last entry)» y pone el contador en 0.
- `Recovered(kind)`: el ciclo de ese tipo salió limpio; marca el tipo como recuperado, sin borrar el contador, de modo
  que la siguiente aparición se escribe **de inmediato** y arrastra las veces que se callaron (FR-005, escenario 4; nada
  se pierde en el conteo, SC-001).

**Justificación**: una falla larga deja ≤ 4 filas por tipo por hora (SC-002) y una falla nueva nunca espera. El estado
vive en memoria: al reiniciar el servidor se pierde y la primera falla se escribe de nuevo, que es lo deseable.

**Alternativas**: consultar `error_logs` para saber cuándo fue la última fila (una lectura por falla, y con la base
caída no se puede); ventana deslizante con contador por minuto (más complejo, sin ganancia).

## R3 — Escritura fuera del camino del ciclo

**Decisión**: igual que `httpx`: `go` con su propio contexto y `recordTimeout = 2 s`; si falla, `log.Printf` y sigue
(FR-008, SC-004). El `Reporter` toma un `spawn func(func())` (por defecto `go`) para que las pruebas lo hagan síncrono.
La decisión de escribir o no (estado bajo `sync.Mutex`) se toma en el momento, antes de lanzar la goroutine. **Limitación
conocida**: `error_logs` vive en la misma base; con la base entera caída la escritura falla y la falla solo queda en
la consola. Por eso una escritura fallida se deshace en el estado (vuelve la hora de la última fila y el contador
anteriores) y la siguiente falla reintenta sin esperar la ventana.

## R4 — Qué falla se reporta y qué texto lleva

**Decisión**: tres tipos, con mensajes fijos (inglés, sin texto del error de terceros):

| kind | Cuándo | Mensaje | `account_id` |
|---|---|---|---|
| `tick` | `ClaimDueDoses` devuelve error (base caída…) | `reminder tick failed: could not read the due doses` | nulo |
| `prepare` | ≥ 1 recordatorio no se pudo preparar (leer dispositivos o armar el aviso) | `N reminders could not be prepared` | la cuenta si todas las fallas del ciclo son de una sola |
| `deliver` | ≥ 1 aviso no se entregó (error del servicio de avisos, red, o no se pudo apagar un dispositivo 404/410) | `M of N reminders could not be delivered` | igual que arriba |

`Gone` (404/410) no cuenta. Un ciclo cancelado por el cierre del servidor (`ctx.Err() != nil`) no reporta nada. El
archivo y la línea son los de la llamada a `Report` (`runtime.Caller(1)`), es decir, el punto de `reminder/service.go`
donde se detectó, como pide FR-002. Nunca se interpola un `err`: `Sender.Send` ya devuelve un error que puede traer el
`endpoint` del dispositivo («never logged», spec 011) y se sigue descartando.

## R5 — Cableado

**Decisión**: `Service.SetReporter(FailureReporter)` con un `FailureReporter` definido en `reminder` (consumidor),
`nil`-seguro (sin reporter no hace nada: las pruebas existentes y el modo sin claves no cambian). `cmd/api/main.go` lo
conecta con `jobreport.New(errorLogRepo, "reminders")`. `NewService` no cambia de firma.
