---

description: "Lista de tareas de la spec 018: errores de procesos en segundo plano en error_logs"
---

# Tareas: Errores de procesos en segundo plano en `error_logs`

**Entrada**: `/specs/018-errores-procesos-segundo-plano/` (plan.md, spec.md, research.md, data-model.md, contracts/job-log-entries.md, quickstart.md)

**Pruebas**: obligatorias (Principio VI): >90 % en Go. Solo backend, sin frontend.

**Organización**: US2 (agrupar) vive dentro del `Reporter` que US1 necesita, así que la base es común y US1 la conecta al
proceso de recordatorios.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [ ] T001 Línea base: `cd backend && set -a && . ./.env.local && set +a && go vet ./... && go test ./internal/... -cover` en verde

## Fase 2: Fundamental — el `Reporter` (US2)

- [ ] T002 [US2] Crear `backend/internal/jobreport/reporter.go`: `Recorder` (interfaz `Create(ctx, *errorlog.Entry) error`), `GroupWindow = 15 * time.Minute`, `recordTimeout = 2 * time.Second`, `Reporter` con `New(recorder, job)` (`endpoint = "job:" + job`), `Report(ctx, kind, message string, accountID *uuid.UUID)` (archivo y línea con `runtime.Caller(1)`; escribe si no hay estado del tipo, si se recuperó o si pasó la ventana; si no, cuenta; al escribir agrega ` (repeated N more times since the last entry)` si hubo calladas; estado bajo `sync.Mutex`; escritura en goroutine con contexto propio y `log.Printf` si falla, FR-008; una escritura fallida deshace el estado del tipo para reintentar en la siguiente falla) y `Recovered(kind)` (marca recuperado sin borrar el contador); `http_status` nulo
- [ ] T003 [P] [US2] Crear `backend/internal/jobreport/export_test.go` (reloj y `spawn` síncronos) y `reporter_test.go`: primera falla escribe con endpoint, `HTTPStatus == nil`, archivo/línea del llamador y `AccountID`; misma falla dentro de la ventana no escribe; pasada la ventana escribe con el conteo; tipos distintos se agrupan por separado; `Recovered` + nueva falla escribe de inmediato con las veces calladas; un `Recorder` que falla no rompe ni retrasa (`Report` vuelve antes de que termine la escritura) y la siguiente falla reintenta sin esperar la ventana
- [ ] T004 [P] [US1] `backend/internal/jobreport/reporter_db_test.go` (con `DATABASE_URL`, como las demás): con `errorlog.NewRepository(pool)` real, una falla deja una fila con `endpoint = 'job:reminders'`, `http_status IS NULL`, `file` y `line` del llamador y `account_id` cuando se dio; limpia lo que crea

**Punto de Control**: `go test ./internal/jobreport -cover` >90 % y el reporter agrupa como pide la spec.

## Fase 3: US1 — Lo que falla en el proceso de recordatorios queda en `error_logs` (P1) 🎯 MVP

- [ ] T005 [US1] `backend/internal/reminder/service.go`: `FailureReporter` (`Report(ctx, kind, message string, accountID *uuid.UUID)`, `Recovered(kind string)`) definido en `reminder`, campo del `Service` y `SetReporter` (sin reporter no hace nada); en `Tick`: error de `ClaimDueDoses` → `report("tick", "reminder tick failed: could not read the due doses", nil)` solo si `ctx.Err() == nil`; `skipped > 0` → `prepare` (`N reminders could not be prepared`); `failed > 0` → `deliver` (`M of N reminders could not be delivered`); `account_id` solo si todas las fallas del ciclo son de una cuenta; `Recovered` de cada tipo sin fallas en el ciclo; `Gone` (404/410) sigue sin contar y un ciclo cancelado por el cierre no reporta; conservar los `log.Printf` existentes
- [ ] T006 [US1] `backend/internal/reminder/service_test.go` con un reporter falso: base caída → `tick`; un aviso rechazado → `deliver` con `1 of 1`; 404/410 → nada; ciclo limpio → nada y `Recovered` de los tres tipos; cierre del servidor (`ctx` cancelado) → nada; un recordatorio que no se puede preparar → `prepare`; `account_id` cuando la falla es de una sola cuenta y nulo con varias; valores centinela (endpoint del dispositivo, claves, secreto) no aparecen en ningún mensaje (SC-003); sin reporter el ciclo funciona igual
- [ ] T007 [US1] `backend/cmd/api/main.go`: `reminderService.SetReporter(jobreport.New(errorLogRepo, "reminders"))` antes de `RunScheduler`; `go build ./...`

**Punto de Control**: con la base caída o un servicio de avisos que rechaza, hay filas `job:reminders` sin datos sensibles.

## Fase 4: Pulido

- [ ] T008 [P] Documentación: `CLAUDE.md` (feature 018), `backend/CLAUDE.md` (fila de `internal/jobreport/`, sección «Automatic error logging»: los procesos en segundo plano reportan con `jobreport`, no con `httpx`), `BACKLOG.md` (punto hecho; se mantienen lectura/digest/purga), nota en `specs/011-recordatorios-push/` de que sus fallas ahora quedan en `error_logs`
- [ ] T009 Calidad: `gofmt -l`, `go vet ./...`, `go test ./internal/... -cover` (>90 % en `jobreport` y `reminder`); quickstart §2 con la base caída
- [ ] T010 Commit, push, PR a `develop` y code review

## Dependencias

Fase 1 → T002 → (T003, T004 en paralelo) → T005 → T006 → T007 → Pulido.

## Estrategia

MVP = `Reporter` + conexión al proceso de recordatorios en un solo PR (sin el agrupamiento, US1 inundaría la tabla).
