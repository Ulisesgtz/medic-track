---

description: "Lista de tareas de implementación: Home Page — Listado de Hijos"
---

# Tareas: Home Page — Listado de Hijos

**Entrada**: Documentos de diseño desde `/specs/003-home-listado-hijos/`

**Prerrequisitos**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Pruebas**: Incluidas — Principio VI de la constitución (cobertura >90% NO NEGOCIABLE) exige pruebas para todo código nuevo, y esta funcionalidad cae dentro del alcance MVP con Playwright E2E obligatorio.

**Organización**: Las tareas se agrupan por historia de usuario para permitir la implementación y prueba independiente de cada historia.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: Se puede ejecutar en paralelo (archivos distintos, sin dependencias)
- **[Historia]**: US1, US2 o US3, según spec.md

## Convenciones de Rutas

Aplicación web existente: `backend/` (Go) y `frontend/` (React + Vite + TS). Todas las rutas de archivo son relativas a la raíz del repositorio.

---

## Fase 1: Configuración

**Propósito**: No se requiere inicialización de proyecto ni dependencias nuevas — esta funcionalidad extiende módulos ya existentes (`internal/account`, `features/account-signup`) sin agregar librerías (research.md).

- [X] T001 Verificar que `backend/internal/account/`, `backend/cmd/api/main.go`, `frontend/src/features/account-signup/` compilan/buildean limpio antes de empezar (`cd backend && go build ./...`, `cd frontend && npm run build`), como línea base antes de los cambios

---

## Fase 2: Fundamental (Prerrequisitos Bloqueantes)

**Propósito**: Infraestructura compartida por las 3 historias de usuario — DEBE completarse antes de cualquier historia.

**⚠️ CRÍTICO**: No puede comenzar el trabajo de ninguna historia de usuario hasta que esta fase esté completa.

- [X] T002 Agregar el error de dominio `ErrAccountNotFound` en `backend/internal/account/errors.go`, siguiendo el mismo patrón que `ErrEmailAlreadyExists`/`ErrInvalidNameFormat` (research.md, decisión "GetByID devuelve 404")
- [X] T003 [P] Crear el hook `useAccountSession` en `frontend/src/features/home/useAccountSession.ts`: `getAccountId()`, `setAccountId(id)`, `clearAccountId()` sobre `localStorage`, cada método envuelto en `try/catch` para degradar sin romper si `localStorage` no está disponible (research.md, decisión "manejo defensivo")
- [X] T004 [P] Crear los tipos `Account`/`Child` del lado del frontend en `frontend/src/features/home/types.ts`, con la misma forma que la respuesta de `contracts/get-account.md` (campos `id`, `firstName`, `lastName`, `email`, `countryCode`, `stateCode`, `plan`, `children[]`)
- [X] T005 Registrar las rutas `/home` y una ruta placeholder de detalle de hijo (p. ej. `/children/:childId`) en el enrutador del frontend, apuntando a un componente placeholder mínimo (p. ej. "Próximamente" + nombre del hijo) como `element` — sin construir la pantalla de detalle real (FR-005 — su contenido está fuera de alcance, pero la ruta debe tener un componente para no quedar en blanco ni romper la navegación)

**Punto de Control**: Fundación lista — las 3 historias de usuario pueden implementarse ahora.

---

## Fase 3: Historia de Usuario 1 - Ver el listado de mis hijos al entrar a la home (Prioridad: P1) 🎯 MVP

**Objetivo**: Al abrir `/home` con una cuenta válida, ver una tarjeta por hijo con nombre + edad calculada; estado vacío si no hay hijos; click en un hijo navega a la ruta placeholder.

**Prueba Independiente**: Crear una cuenta con al menos un hijo (vía API o UI existente), abrir `/home` directamente, y verificar que aparece una tarjeta por hijo con nombre y edad correctos.

### Pruebas para la Historia de Usuario 1 ⚠️

> Escribir estas pruebas PRIMERO, asegurarse de que FALLEN antes de implementar.

- [X] T006 [P] [US1] Prueba de servicio/repositorio para `GetByID`/`GetAccount` (caso 200 con hijos, caso 404) en `backend/internal/account/repository_test.go` y `backend/internal/account/service_test.go`
- [X] T007 [P] [US1] Prueba de handler para `GET /accounts/{accountId}` (200 con cuerpo igual al de `POST /accounts`, 404 `account_not_found`) en `backend/internal/account/handler_test.go`, siguiendo el patrón `newTestRouterWithPool` ya existente
- [X] T008 [P] [US1] Prueba unitaria de `computeAge` en `frontend/src/shared/age.test.ts`: casos límite en meses (0, 1, 23 meses) y en años (exactamente 2 años, 2 años y unos días, varios años)
- [X] T009 [P] [US1] Prueba unitaria de `HomePage` para sus 3 estados (sin cuenta, cuenta sin hijos, cuenta con hijos) en `frontend/src/features/home/HomePage.test.tsx`, mockeando `fetchAccount`

### Implementación de la Historia de Usuario 1

- [X] T010 [US1] Implementar `GetByID(ctx, id uuid.UUID) (*Account, error)` en `backend/internal/account/repository.go`, devolviendo `ErrAccountNotFound` si no existe ninguna fila (reutiliza el query de hijos ya existente de `Create`)
- [X] T011 [US1] Implementar `GetAccount(ctx, id uuid.UUID) (*Account, error)` en `backend/internal/account/service.go`, delegando a `GetByID` (depende de T010, T002)
- [X] T012 [US1] Implementar el handler `GetAccount` (`GET /accounts/{accountId}`) en `backend/internal/account/handler.go`, usando `h.responder.WriteJSON`/`WriteJSONError` — 200 con el mismo cuerpo que `POST /accounts`, 404 `account_not_found` si `ErrAccountNotFound` (depende de T011; sigue la regla de `backend/CLAUDE.md` de usar siempre `*httpx.Responder`)
- [X] T013 [US1] Registrar la ruta `GET /accounts/{accountId}` en `backend/cmd/api/main.go`
- [X] T014 [P] [US1] Implementar `computeAge(birthDate: string): { value: number; unit: 'meses' | 'años' }` en `frontend/src/shared/age.ts` (meses si el resultado en años es menor a 2, años completos en caso contrario — Aclaraciones de spec.md)
- [X] T015 [P] [US1] Implementar `fetchAccount(accountId: string)` en `frontend/src/features/home/api.ts`, mapeando el 404 a un tipo de error distinguible por el llamador (depende de T004)
- [X] T016 [US1] Implementar `ChildCard` (nombre + `computeAge`, click navega a la ruta placeholder del hijo) en `frontend/src/features/home/ChildCard.tsx` (depende de T014)
- [X] T017 [US1] Implementar `HomePage` en `frontend/src/features/home/HomePage.tsx`: lee `accountId` con `useAccountSession`, llama `fetchAccount`, y renderiza los 3 estados (sin cuenta con enlace a `/signup`, cuenta sin hijos con invitación a agregar el primero, listado de `ChildCard`) (depende de T003, T015, T016)

**Punto de Control**: La Historia de Usuario 1 es completamente funcional y comprobable de forma independiente — MVP alcanzado.

---

## Fase 4: Historia de Usuario 2 - Agregar un hijo nuevo desde la home (Prioridad: P2)

**Objetivo**: Desde `/home`, agregar un hijo mediante un modal que reutiliza el formulario de feature 001, respetando el límite freemium.

**Prueba Independiente**: Agregar un hijo desde la home en una cuenta bajo el límite y verificar que aparece en el listado; agregar un segundo hijo en una cuenta gratuita ya con 1 hijo y verificar el pop-up freemium sin creación de hijo.

### Pruebas para la Historia de Usuario 2 ⚠️

- [X] T018 [P] [US2] Prueba de servicio para `AddChild` (éxito bajo el límite, `ErrFreemiumChildLimitExceeded` al superarlo, error de validación de campos, `ErrAccountNotFound`) en `backend/internal/account/service_test.go`
- [X] T019 [P] [US2] Prueba de handler para `POST /accounts/{accountId}/children` (201 con cuenta actualizada completa, 400 `validation_error`, 404 `account_not_found`, 422 `freemium_child_limit_exceeded`) en `backend/internal/account/handler_test.go`
- [X] T020 [P] [US2] Prueba unitaria de `AddChildModal` (envío exitoso cierra el modal y refresca el listado; respuesta 422 muestra el pop-up freemium existente sin cerrar el modal) en `frontend/src/features/home/AddChildModal.test.tsx`

### Implementación de la Historia de Usuario 2

- [X] T021 [US2] Extraer `validateChildFields(c CreateChildInput) []ValidationError` desde `validateCreateAccountInput` en `backend/internal/account/service.go`, devolviendo nombres de campo sin prefijo de índice (`firstName`, no `children[0].firstName`); `validateCreateAccountInput` sigue envolviendo esos nombres con `children[i].` (research.md, decisión de reutilización de validación)
- [X] T022 [US2] Implementar `CreateChild(ctx, accountID uuid.UUID, child CreateChildInput) (*Child, error)` en `backend/internal/account/repository.go`, extraído del loop de inserción de `Create`
- [X] T023 [US2] Implementar `AddChild(ctx, accountID uuid.UUID, input CreateChildInput) (*Account, error)` en `backend/internal/account/service.go`: valida con `validateChildFields` (T021), obtiene la cuenta con `GetByID` (T010) para contar hijos existentes y aplicar el mismo límite freemium de `CreateAccount`, inserta con `CreateChild` (T022) y devuelve la cuenta actualizada
- [X] T024 [US2] Implementar el handler `AddChild` (`POST /accounts/{accountId}/children`) en `backend/internal/account/handler.go` usando `*httpx.Responder` — 201 con la cuenta completa, 400 `validation_error`, 404 `account_not_found`, 422 `freemium_child_limit_exceeded` (depende de T023)
- [X] T025 [US2] Registrar la ruta `POST /accounts/{accountId}/children` en `backend/cmd/api/main.go`
- [X] T026 [P] [US2] Implementar `addChild(accountId, payload)` en `frontend/src/features/home/api.ts`, propagando el error 422 de forma distinguible para el pop-up freemium
- [X] T027 [US2] Implementar `AddChildModal` en `frontend/src/features/home/AddChildModal.tsx`: reutiliza `ChildFieldset` tal cual desde `features/account-signup/` (sin duplicarlo — research.md), al enviar llama `addChild`, en éxito cierra el modal y refresca el listado, en 422 muestra el mismo pop-up de upgrade ya construido en feature 001
- [X] T028 [US2] Agregar el control "Agregar hijo" y el estado de apertura del modal en `frontend/src/features/home/HomePage.tsx` (depende de T017, T027)

**Punto de Control**: Las Historias de Usuario 1 y 2 funcionan ambas de forma independiente.

---

## Fase 5: Historia de Usuario 3 - Volver a mi home sin tener que loguearme de nuevo (Prioridad: P3)

**Objetivo**: Tras crear la cuenta, llegar automáticamente a `/home`; recargar la página conserva la misma cuenta; sin cuenta guardada (o inválida) se muestra la invitación a crear cuenta.

**Prueba Independiente**: Crear una cuenta y confirmar la navegación automática a `/home`; recargar y verificar que persiste; abrir en un navegador limpio y verificar la invitación a crear cuenta.

### Pruebas para la Historia de Usuario 3 ⚠️

- [X] T029 [P] [US3] Prueba unitaria de `AccountSignupForm`: en éxito, guarda el `accountId` devuelto con `useAccountSession` y navega a `/home` en vez de mostrar solo el mensaje inline, en `frontend/src/features/account-signup/AccountSignupForm.test.tsx`
- [X] T030 [P] [US3] Prueba E2E Playwright del flujo completo (crear cuenta → llegar a `/home` → ver hijo listado → recargar y seguir viéndolo → agregar un segundo hijo → ver pop-up freemium) en `frontend/e2e/home-listado-hijos.spec.ts` (Principio VI — flujo crítico MVP)

### Implementación de la Historia de Usuario 3

- [X] T031 [US3] Actualizar `AccountSignupForm` en `frontend/src/features/account-signup/AccountSignupForm.tsx` para, en la respuesta 201 de `POST /accounts`, guardar el `accountId` vía `useAccountSession` (T003) y navegar a `/home`, reemplazando el mensaje de éxito inline actual
- [X] T032 [US3] En `HomePage.tsx` (T017), si `fetchAccount` responde 404, limpiar el `accountId` guardado con `useAccountSession.clearAccountId()` y mostrar el mismo estado "sin cuenta" que cuando no hay ningún id guardado (Caso Límite de spec.md)

**Punto de Control**: Las 3 historias de usuario son funcionales de forma independiente — funcionalidad completa.

---

## Fase Final: Pulido y Aspectos Transversales

**Propósito**: Mejoras que afectan a varias historias de usuario.

- [X] T033 [P] Actualizar `CLAUDE.md` (raíz) y `backend/CLAUDE.md` con los 2 endpoints nuevos y la nueva carpeta `frontend/src/features/home/` en sus mapas de módulos (regla existente: "no se actualizan solas")
- [X] T034 [P] Regenerar la documentación Swagger (`swag init -g cmd/api/main.go -o internal/docs --pd`) tras agregar las anotaciones a `GetAccount`/`AddChild` en `backend/internal/account/handler.go`
- [X] T035 Ejecutar manualmente los 6 escenarios de `quickstart.md` contra el backend y frontend corriendo localmente, incluyendo verificar que el listado de hijos (Escenario 2) sea visible en menos de 2s tras abrir la home (SC-001)
- [X] T036 Verificar cobertura >90% en backend (`cd backend && go test ./... -cover`) y frontend (`cd frontend && npx vitest run --coverage`) — Principio VI NO NEGOCIABLE

---

## Dependencias y Orden de Ejecución

### Dependencias de Fase

- **Configuración (Fase 1)**: Sin dependencias.
- **Fundamental (Fase 2)**: Depende de la Configuración — BLOQUEA las 3 historias de usuario.
- **Historias de Usuario (Fase 3-5)**: Todas dependen de la Fundamental. US1 no depende de US2 ni US3. US2 depende de que exista `GetByID` (T010, de US1) porque `AddChild` lo reutiliza para contar hijos — por eso T023 referencia T010. US3 depende de que exista `HomePage` (T017, de US1) y `useAccountSession` (T003, Fundamental).
- **Pulido (Fase Final)**: Depende de que las 3 historias estén completas.

### Dependencias entre Historias de Usuario

- **US1 (P1)**: Puede comenzar tras la Fundamental. Sin dependencias de otras historias.
- **US2 (P2)**: Puede comenzar tras la Fundamental, pero su implementación de servicio (T023) reutiliza `GetByID` de US1 (T010) — en la práctica, implementar T010 antes de T023 aunque ambas tareas pertenezcan a fases distintas.
- **US3 (P3)**: Su implementación (T031, T032) modifica `AccountSignupForm` y `HomePage`, por lo que requiere que T017 (HomePage de US1) ya exista.

### Dentro de Cada Historia de Usuario

- Pruebas antes que implementación (deben fallar primero).
- Repositorio antes que servicio; servicio antes que handler; handler antes que ruta registrada.
- Backend antes que frontend cuando el frontend consume el endpoint nuevo.

### Oportunidades de Paralelización

- T003 y T004 (Fundamental) son paralelas entre sí.
- Dentro de US1: T006-T009 (pruebas) en paralelo entre sí; T014 y T015 en paralelo entre sí.
- Dentro de US2: T018-T020 (pruebas) en paralelo entre sí.
- Dentro de US3: T029 y T030 en paralelo entre sí.
- T033 y T034 (Pulido) en paralelo entre sí.

---

## Ejemplo Paralelo: Historia de Usuario 1

```bash
# Lanzar juntas las pruebas de la Historia de Usuario 1:
Task: "Prueba de servicio/repositorio para GetByID/GetAccount en backend/internal/account/repository_test.go y service_test.go"
Task: "Prueba de handler para GET /accounts/{accountId} en backend/internal/account/handler_test.go"
Task: "Prueba unitaria de computeAge en frontend/src/shared/age.test.ts"
Task: "Prueba unitaria de HomePage (3 estados) en frontend/src/features/home/HomePage.test.tsx"

# Lanzar juntas dos piezas independientes de implementación:
Task: "Implementar computeAge en frontend/src/shared/age.ts"
Task: "Implementar fetchAccount en frontend/src/features/home/api.ts"
```

---

## Estrategia de Implementación

### MVP Primero (Solo Historia de Usuario 1)

1. Completar Fase 1: Configuración.
2. Completar Fase 2: Fundamental.
3. Completar Fase 3: Historia de Usuario 1.
4. **DETENERSE y VALIDAR**: Escenarios 1, 2 y 6 de `quickstart.md` (sin cuenta, listado con hijo, click en hijo → placeholder).
5. Desplegar/demostrar si está lista.

### Entrega Incremental

1. Configuración + Fundamental → Fundación lista.
2. Agregar US1 → Validar (Escenarios 1, 2, 6 de quickstart.md) → MVP.
3. Agregar US2 → Validar (Escenario 4 de quickstart.md, límite freemium).
4. Agregar US3 → Validar (Escenarios 2, 3, 5 de quickstart.md, persistencia y navegación automática).
5. Cada historia aporta valor sin romper las anteriores.

## Notas

- Las tareas [P] son de archivos distintos sin dependencias entre sí.
- La etiqueta [Historia] mapea cada tarea a su historia de usuario para trazabilidad.
- Verificar que las pruebas fallen antes de implementar (TDD, por Principio VI).
- Detenerse en cada punto de control para validar la historia de forma independiente contra `quickstart.md`.
