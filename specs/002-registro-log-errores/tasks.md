---

description: "Lista de tareas para Registro de Log de Errores del Backend"
---

# Tareas: Registro de Log de Errores del Backend

**Entrada**: Documentos de diseño desde `/specs/002-registro-log-errores/`

**Prerrequisitos**: plan.md, spec.md, research.md, data-model.md, quickstart.md (sin `contracts/` — esta funcionalidad no expone ninguna interfaz pública nueva, ver plan.md)

**Pruebas**: INCLUIDAS y OBLIGATORIAS — el Principio VI de la constitución exige prueba unitaria para todo el código (>90% coverage); este spec no las hace opcionales. No aplica Playwright E2E (sin superficie de UI, ver FR-007 de spec.md).

**Organización**: Las tareas se agrupan por historia de usuario para permitir la implementación y prueba independiente de cada historia.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: Se puede ejecutar en paralelo (archivos distintos, sin dependencias)
- **[Historia]**: A qué historia de usuario pertenece la tarea (US1, US2)

## Convenciones de Rutas

Todo el trabajo es backend: `backend/internal/errorlog/` (nuevo), `backend/internal/httpx/` (modificado), `backend/internal/account/` y `backend/internal/catalog/` (wiring modificado), `backend/migrations/`. Identificadores de código en inglés (Principio "Idioma del Código" de la constitución).

---

## Fase 1: Configuración (Infraestructura Compartida)

**Propósito**: Esquema de base de datos para la nueva entidad.

- [X] T001 Crear migración `backend/migrations/0005_create_error_logs_table.sql`: tabla `error_logs` (`id` UUID PK default `gen_random_uuid()`, `message` TEXT NOT NULL, `http_status` INTEGER nullable, `endpoint` TEXT NOT NULL, `file` TEXT NOT NULL, `line` INTEGER NOT NULL, `account_id` UUID nullable FK → `accounts.id` sin `ON DELETE CASCADE`, `created_at` TIMESTAMPTZ NOT NULL DEFAULT `now()`), por data-model.md

**Punto de Control**: Esquema listo para persistir entradas de log.

---

## Fase 2: Fundamental (Prerrequisitos Bloqueantes)

**Propósito**: La entidad `ErrorLog` y su repositorio son compartidos por ambas historias de usuario — ninguna historia puede implementarse sin ellos.

**⚠️ CRÍTICO**: No puede comenzar el trabajo de ninguna historia de usuario hasta que esta fase esté completa.

- [X] T002 [P] Implementar struct `Entry` en `backend/internal/errorlog/model.go` con los campos de data-model.md (`ID`, `Message`, `HTTPStatus *int`, `Endpoint`, `File`, `Line`, `AccountID *uuid.UUID`, `CreatedAt`)
- [X] T003 Implementar `backend/internal/errorlog/repository.go`: `NewRepository(pool)` y `Create(ctx, *Entry) error` (INSERT simple vía `pgx`), siguiendo el mismo patrón que `backend/internal/account/repository.go` — depende de T001, T002
- [X] T004 [P] Escribir tests table-driven del repositorio en `backend/internal/errorlog/repository_test.go`: inserta una entrada con `account_id` NULL, inserta una con `account_id` de una cuenta real ya creada, y verifica un error de conexión (patrón `closedPool`, igual que en `internal/account/repository_test.go`), por Principio VI — depende de T003

**Punto de Control**: `ErrorLog` es una entidad persistible y probada, lista para engancharse desde `internal/httpx`.

---

## Fase 3: Historia de Usuario 1 - El sistema registra automáticamente cada error del API (Prioridad: P1) 🎯 MVP

**Objetivo**: Cada respuesta de error (4xx/5xx) del backend genera una fila en `error_logs` con mensaje, código HTTP, endpoint, cuenta asociada (si existe) y fecha/hora — sin que ningún handler lo invoque manualmente, y sin que una falla al registrar rompa la respuesta original.

**Prueba Independiente**: Provocar distintos errores (validación en `POST /accounts`, correo duplicado, límite freemium excedido, país no encontrado en `GET /catalog/countries/{countryCode}/states`) y verificar que cada uno crea una fila en `error_logs` con los campos correctos; simular un fallo del registrador y confirmar que la respuesta HTTP al cliente no cambia. Ver Escenarios 1, 3 y 4 de quickstart.md (el detalle de archivo/línea real llega en la Historia 2 — en esta historia puede quedar con un valor provisional).

### Pruebas para la Historia de Usuario 1 ⚠️

> Escribe estas pruebas PRIMERO y verifica que FALLEN antes de implementar.

- [X] T005 [US1] Tests en `backend/internal/httpx/json_test.go` para el nuevo tipo `Responder`: `WriteJSONError` dispara `Create()` en un `errorlog.Recorder` de prueba (fake/mock) con `message`/`http_status`/`endpoint`/`account_id` correctos; un `Recorder` que devuelve error NO altera el código de estado ni el cuerpo de la respuesta HTTP ya escrita (FR-005); `WriteJSON` (respuestas exitosas) NUNCA dispara el registro — por FR-001, FR-002, FR-005. Incluye además un caso específico que pasa un `message`/`code` que simula el flujo real de `email_already_exists` y verifica explícitamente que NINGÚN campo de la `Entry` capturada por el `Recorder` (ni `Message` ni ningún otro) contiene el string del correo electrónico de la solicitud — por FR-004/SC-002

### Implementación de la Historia de Usuario 1

- [X] T006 [US1] Definir la interfaz `errorlog.Recorder` (método `Record`/`Create` que `*errorlog.Repository` satisface) y convertir `backend/internal/httpx/json.go` de funciones de paquete sueltas a un tipo `Responder` con `NewResponder(recorder errorlog.Recorder) *Responder`; los métodos `WriteJSON`/`WriteJSONError(ctx context.Context, w http.ResponseWriter, status int, code, message string, accountID *uuid.UUID)` disparan el registro en una goroutine en segundo plano con `context.Background()` + timeout corto (~2s), derivando `endpoint` del patrón de ruta de `chi` (`chi.RouteContext(ctx).RoutePattern()`, con fallback a `r.URL.Path`); `file`/`line` quedan con un valor provisional por ahora (se completan en la Historia 2) — por research.md, depende de T003, T005
- [X] T007 [P] [US1] Actualizar `backend/internal/account/handler.go`: `NewHandler` recibe `*httpx.Responder` como parámetro adicional; todas las llamadas a las antiguas funciones de paquete `httpx.WriteJSON`/`httpx.WriteJSONError` pasan a ser métodos del responder inyectado, pasando el `accountID` cuando ya se conoce (p. ej. en el caso `email_already_exists`, donde la cuenta existente ya fue consultada) — depende de T006
- [X] T008 [P] [US1] Actualizar `backend/internal/catalog/handler.go`: mismo cambio que T007, sin `accountID` (el catálogo no está asociado a ninguna cuenta) — depende de T006
- [X] T009 [US1] Actualizar `backend/cmd/api/main.go`: crear `errorlog.NewRepository(pool)` y `httpx.NewResponder(errorlogRepo)`, pasar el responder a `account.NewHandler(...)` y `catalog.NewHandler(...)` — depende de T003, T006, T007, T008
- [X] T010 [P] [US1] Actualizar `backend/internal/account/handler_test.go` para construir el handler de prueba con un `*httpx.Responder` (real contra la DB de test, o con un `Recorder` fake) — depende de T007
- [X] T011 [P] [US1] Actualizar `backend/internal/catalog/handler_test.go` para construir el handler de prueba con un `*httpx.Responder` — depende de T008

**Punto de Control**: Todo error existente de `account` y `catalog` queda registrado automáticamente en `error_logs` (sin archivo/línea reales todavía), y ninguna respuesta HTTP existente cambia de comportamiento. Historia demostrable de punta a punta (Escenarios 1, 3 y 4 de quickstart.md).

---

## Fase 4: Historia de Usuario 2 - Cada entrada de log señala dónde ocurrió el error en el código (Prioridad: P2)

**Objetivo**: Cada entrada de `error_logs` incluye el archivo y línea reales de origen del error, sin que el handler tenga que pasarlos manualmente.

**Prueba Independiente**: Provocar dos errores desde puntos distintos del código (p. ej. un error de `account` y uno de `catalog`) y verificar que las entradas resultantes tienen `file`/`line` distintos, correspondientes al punto real donde se llamó `WriteJSONError`. Ver Escenario 2 de quickstart.md.

- [X] T012 [US2] Reemplazar el valor provisional de `file`/`line` en `httpx.Responder.WriteJSONError` (`backend/internal/httpx/json.go`) por una captura real vía `runtime.Caller(1)` — por research.md, depende de T006
- [X] T013 [P] [US2] Test en `backend/internal/httpx/json_test.go` que invoca `WriteJSONError` desde dos líneas distintas del propio test y verifica que las dos entradas registradas tienen `file`/`line` distintos y coinciden con el call site real — depende de T012

**Punto de Control**: Funcionalidad completa según spec.md — Escenario 2 de quickstart.md pasa.

---

## Fase Final: Pulido y Aspectos Transversales

**Propósito**: Verificación de calidad transversal exigida por la constitución (Principio VI) antes de considerar la feature terminada.

- [X] T014 [P] Verificar coverage ≥90% en `backend/internal/errorlog` y `backend/internal/httpx` con `go test -cover ./...`; cerrar cualquier brecha, por Principio VI
- [X] T015 [P] Verificar que el coverage de `backend/internal/account` y `backend/internal/catalog` se mantiene ≥90% tras el cambio de constructor de sus handlers (no debe haber regresión), por Principio VI
- [X] T016 Ejecutar manualmente los 4 escenarios de `quickstart.md` de punta a punta contra el backend local, confirmando el comportamiento (incluyendo el Escenario 3, simulando una falla de la base de datos de `error_logs`)
- [X] T017 [P] Escribir un benchmark (`go test -bench`) o una aserción de tiempo en `backend/internal/httpx/json_test.go` que mida la latencia de `Responder.WriteJSONError` (tiempo hasta que la respuesta HTTP queda escrita, sin esperar a que termine la goroutine de registro) y confirme que se mantiene por debajo de los 50ms de SC-004 — por spec.md SC-004
- [X] T018 Actualizar `backend/CLAUDE.md`: documentar el nuevo paquete `internal/errorlog`, el cambio de `internal/httpx` de funciones sueltas a `Responder`, y el nuevo parámetro en los constructores de `account.NewHandler`/`catalog.NewHandler` — por la convención "When you add a new module/feature" de `CLAUDE.md`
- [X] T019 Regenerar la documentación Swagger (`swag init -g cmd/api/main.go -o internal/docs --pd` desde `backend/`) si el cambio de constructores o cualquier tipo de respuesta afectó las anotaciones existentes — por `backend/CLAUDE.md`

---

## Dependencias y Orden de Ejecución

### Dependencias de Fase

- **Configuración (Fase 1)**: Sin dependencias — puede comenzar de inmediato
- **Fundamental (Fase 2)**: Depende de completar la Configuración — BLOQUEA ambas historias de usuario (comparten la entidad `ErrorLog` y su repositorio)
- **Historias de Usuario (Fase 3-4)**: Ambas dependen de completar la Fundamental
  - US2 depende de que exista el `Responder`/`WriteJSONError` de US1 (le agrega la captura real de archivo/línea, no lo duplica) — implementar en orden P1 → P2, no en paralelo total
- **Pulido (Fase Final)**: Depende de que estén completas ambas historias de usuario

### Dentro de Cada Historia de Usuario

- Las pruebas DEBEN escribirse y FALLAR antes de implementar (Principio VI)
- Modelo antes que repositorio (Fase 2)
- Repositorio antes que `Responder` (Fase 3)
- `Responder` antes que el wiring de los handlers existentes (Fase 3)
- Wiring de handlers antes que el `main.go` (Fase 3)

### Oportunidades de Paralelización

- T002 puede avanzar mientras T001 se revisa (archivos distintos); T004 depende de T003
- Dentro de la Historia 1: T007 y T008 en paralelo (archivos distintos) tras T006; T010 y T011 en paralelo tras T007/T008 respectivamente
- Dentro de la Fase Final: T014, T015 y T017 en paralelo (T014/T015 no editan archivos; T017 es el único que edita `json_test.go` en esta fase)

---

## Ejemplo Paralelo: Historia de Usuario 1

```bash
# Tras completar T006, lanzar juntas las tareas de wiring de handlers:
Task: "Actualizar backend/internal/account/handler.go para recibir *httpx.Responder"
Task: "Actualizar backend/internal/catalog/handler.go para recibir *httpx.Responder"
```

---

## Estrategia de Implementación

### MVP Primero (Solo Historia de Usuario 1)

1. Completar la Fase 1: Configuración (migración)
2. Completar la Fase 2: Fundamental (entidad `ErrorLog` + repositorio)
3. Completar la Fase 3: Historia de Usuario 1
4. **DETENERSE y VALIDAR**: Probar la Historia de Usuario 1 de forma independiente (Escenarios 1, 3, 4 de quickstart.md)
5. Desplegar/demostrar si está lista — ya resuelve el problema central: visibilidad de errores en producción

### Entrega Incremental

1. Completar Configuración + Fundamental → entidad y esquema listos
2. Agregar Historia de Usuario 1 → probar de forma independiente → demostrar (¡registro automático funcionando!)
3. Agregar Historia de Usuario 2 → probar de forma independiente → demostrar (archivo/línea reales en cada entrada)
4. Fase Final de Pulido → coverage, quickstart completo, documentación

---

## Notas

- Las tareas [P] = archivos distintos, sin dependencias
- La etiqueta [Historia] mapea la tarea a una historia de usuario específica para trazabilidad
- Verifica que las pruebas fallen antes de implementar (TDD, exigido por el Principio VI de la constitución)
- Haz commit después de cada tarea o grupo lógico, siguiendo la convención de rama `feature/002-registro-log-errores` y PR hacia `develop` al cerrar la tarea con pruebas en verde (Control de Versiones de la constitución)
- Detente en cada Punto de Control para validar la historia de forma independiente antes de continuar
- Esta funcionalidad NO incluye tareas de frontend, endpoint de consulta, ni el digest semanal por correo — ver `BACKLOG.md` para esos ítems diferidos
