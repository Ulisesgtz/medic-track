# Plan de Implementación: Errores de procesos en segundo plano en `error_logs`

**Rama**: `feature/018-errores-procesos-segundo-plano` | **Fecha**: 2026-09-30 | **Especificación**: [spec.md](./spec.md)

## Resumen

Un paquete nuevo, `internal/jobreport`, con un `Reporter` por proceso que escribe en `error_logs` (mismo `Recorder` y
misma tabla de la spec 002, sin migración): `endpoint = job:<nombre>`, `http_status` vacío, archivo y línea de quien
reporta, mensaje fijo sin datos sensibles (research R1, R4). Agrupa por tipo de falla —una fila por tipo cada 15 minutos,
con el conteo de las veces calladas, y una falla nueva tras recuperarse se escribe de inmediato (R2)— y escribe en
segundo plano con tiempo límite para no frenar el ciclo (R3). `reminder.Service` lo recibe por `SetReporter` y reporta
`tick`, `prepare` y `deliver`; 404/410 y el cierre del servidor no cuentan (R4, R5).

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27. **Dependencias**: ninguna nueva.
**Almacenamiento**: PostgreSQL, tabla `error_logs` existente (`http_status` nulo, `endpoint` texto): sin migración.
**Pruebas**: `go test` (unitarias con reloj y grabador falsos; una con la BD real que comprueba la fila `job:reminders`),
cobertura >90 %. Sin frontend, sin Playwright.
**Restricciones**: nunca frenar el ciclo (escritura en goroutine con 2 s de límite); ningún dato sensible en el mensaje
(dirección del dispositivo, claves, secreto, token, texto crudo de errores de terceros); nunca el correo (spec 002).

## Verificación de la Constitución

- **I**: no toca contenido médico ni de pantalla. ✅ **II**: los mensajes no llevan datos del padre ni de sus hijos;
  `account_id` solo cuando se conoce, como la spec 002. ✅ **III, IV**: sin cambios de API ni de esquema. ✅
- **V**: un paquete de ~100 líneas y un método `SetReporter`; sin dependencias. ✅ **VI**: unitarias >90 %; sin flujo de
  usuario que requiera E2E. ✅
- **Convención del proyecto**: el proceso escribe sus fallas en `error_logs`, la única vía soportada junto con el
  `Responder` para los errores HTTP. ✅

## Estructura del Proyecto

```text
backend/
├── internal/jobreport/
│   ├── reporter.go            # Reporter (Report / Recovered), agrupamiento, escritura en segundo plano
│   ├── reporter_test.go       # ventana, conteo, recuperación, tipos independientes, fallo del Recorder, archivo:línea
│   ├── reporter_db_test.go    # contra Postgres: la fila queda con endpoint job:reminders y http_status nulo
│   └── export_test.go         # reloj y spawn síncronos
├── internal/reminder/
│   ├── service.go             # FailureReporter, SetReporter; Tick reporta tick/prepare/deliver y llama Recovered
│   ├── service_test.go        # con un reporter falso: qué se reporta y qué no (404/410, cierre, ciclo limpio), sin datos sensibles
│   └── testhelpers_test.go
└── cmd/api/main.go            # SetReporter(jobreport.New(errorLogRepo, "reminders"))
CLAUDE.md, backend/CLAUDE.md, BACKLOG.md (punto hecho; sigue lo de la lectura/purga), specs/011 (nota)
```

## Seguimiento de Complejidad

Sin violaciones.
