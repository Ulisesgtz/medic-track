---

description: "Lista de tareas para Registro de Cuenta de Usuario y Perfiles de Hijos"
---

# Tareas: Registro de Cuenta de Usuario y Perfiles de Hijos

**Entrada**: Documentos de diseño desde `/specs/001-registro-cuenta-usuario/`

**Prerrequisitos**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Pruebas**: INCLUIDAS y OBLIGATORIAS — el Principio VI de la constitución exige prueba unitaria para todo el código (>90% coverage) más E2E con Playwright para flujos críticos; este spec no las hace opcionales.

**Organización**: Las tareas se agrupan por historia de usuario para permitir la implementación y prueba independiente de cada historia.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: Se puede ejecutar en paralelo (archivos distintos, sin dependencias)
- **[Historia]**: A qué historia de usuario pertenece la tarea (US1, US2, US3)

## Convenciones de Rutas

Aplicación web (Opción 2 de plan.md): `backend/` (Go) y `frontend/` (React). Identificadores de código en inglés (Principio "Idioma del Código" de la constitución).

---

## Fase 1: Configuración (Infraestructura Compartida)

**Propósito**: Inicialización del proyecto y estructura básica

- [X] T001 Crear la estructura de carpetas del backend Go según plan.md: `backend/cmd/api/`, `backend/internal/account/`, `backend/internal/catalog/`, `backend/migrations/`
- [X] T002 [P] Crear la estructura de carpetas del frontend según plan.md: `frontend/src/features/account-signup/`, `frontend/src/shared/catalog/`, `frontend/e2e/`
- [X] T003 Configurar el enrutador base de la aplicación (React Router) y el shell de la app en `frontend/src/App.tsx` — prerrequisito para registrar la página de la Historia de Usuario 1 (T029) — depende de T002
- [X] T004 [P] Configurar `golangci-lint` en `backend/.golangci.yml` (gofmt/goimports como gate, por Convenciones de Código — Go de la constitución)
- [X] T005 [P] Configurar ESLint + Prettier en `frontend/.eslintrc.cjs` y `frontend/.prettierrc` (por Convenciones de Código — React de la constitución)
- [X] T006 [P] Configurar Vitest + Testing Library en `frontend/vitest.config.ts` y `frontend/src/setupTests.ts`
- [X] T007 [P] Configurar Playwright en `frontend/playwright.config.ts` con proyectos Chromium, Firefox y WebKit (WebKit simula Safari/iOS, por Principio III de la constitución)
- [X] T008 [P] Configurar conexión a PostgreSQL vía `pgx` en `backend/internal/platform/db.go`, leyendo cadena de conexión desde variable de entorno

**Punto de Control**: Estructura y herramientas listas para empezar la Fase 2.

---

## Fase 2: Fundamental (Prerrequisitos Bloqueantes)

**Propósito**: Infraestructura central que DEBE estar completa antes de implementar cualquier historia de usuario — el catálogo país/estado y el esquema base de datos son compartidos por las 3 historias.

**⚠️ CRÍTICO**: No puede comenzar el trabajo de ninguna historia de usuario hasta que esta fase esté completa.

- [X] T009 Crear migración `backend/migrations/0001_create_catalog_tables.sql`: tabla `countries` (`code` string PK, `name` string) y tabla `states` (`code` string PK, `country_code` FK → `countries.code`, `name` string), con datos semilla de al menos México y sus estados, por data-model.md
- [X] T010 Crear migración `backend/migrations/0002_create_accounts_table.sql`: tabla `accounts` (`id` UUID PK, `first_name` string NOT NULL, `last_name` string NOT NULL, `email` string NOT NULL UNIQUE, `country_code` FK nullable → `countries.code`, `state_code` FK nullable → `states.code`, `plan` enum(`free`,`paid`) NOT NULL DEFAULT `free`, `created_at` timestamp), por data-model.md
- [X] T011 Crear migración `backend/migrations/0003_create_children_table.sql`: tabla `children` (`id` UUID PK, `account_id` FK NOT NULL → `accounts.id`, `first_name` string NOT NULL, `last_name` string NOT NULL, `birth_date` date NOT NULL, `height` numeric nullable, `weight` numeric nullable, `created_at` timestamp), por data-model.md
- [X] T012 [P] Implementar structs `Account` y `Child` en `backend/internal/account/model.go`, replicando los campos y tipos de data-model.md
- [X] T013 [P] Implementar structs `Country` y `State` en `backend/internal/catalog/model.go`
- [X] T014 Implementar `backend/internal/catalog/repository.go` con `ListCountries(ctx) ([]Country, error)` y `ListStatesByCountry(ctx, countryCode string) ([]State, error)` usando `pgx`
- [X] T015 Implementar handlers `GET /catalog/countries` y `GET /catalog/countries/{countryCode}/states` en `backend/internal/catalog/handler.go` por contracts/get-catalog.md, retornando 404 si `countryCode` no existe
- [X] T016 [P] Escribir tests unitarios table-driven para el repositorio y los handlers de catálogo en `backend/internal/catalog/repository_test.go` y `backend/internal/catalog/handler_test.go`, por Principio VI
- [X] T017 Montar el router `chi` y las rutas de catálogo en `backend/cmd/api/main.go`
- [X] T018 [P] Implementar hook compartido `useCatalog` en `frontend/src/shared/catalog/useCatalog.ts` (consume `GET /catalog/countries` y `GET /catalog/countries/{countryCode}/states` vía TanStack Query), usado por el formulario de todas las historias
- [X] T019 [P] Escribir test del hook `useCatalog` en `frontend/src/shared/catalog/useCatalog.test.ts`

**Punto de Control**: Catálogo país/estado funcional (backend + frontend) y esquema de base de datos listo — la implementación de historias de usuario puede comenzar.

---

## Fase 3: Historia de Usuario 1 - Crear cuenta de padre/tutor (Prioridad: P1) 🎯 MVP

**Objetivo**: Un padre/tutor crea su cuenta con nombre, apellido y correo (país/estado opcionales), sin necesidad de agregar hijos.

**Prueba Independiente**: Llenar solo los campos obligatorios de la cuenta (sin hijos) y guardar — verificar `201 Created` con `children: []`. Ver Escenario 1 de quickstart.md.

### Pruebas para la Historia de Usuario 1 ⚠️

> Escribe estas pruebas PRIMERO y verifica que FALLEN antes de implementar.

- [X] T020 [P] [US1] Test unitario de validación de Account (campos obligatorios faltantes, formato de email inválido) en `backend/internal/account/service_test.go`, por FR-001/FR-002
- [X] T021 [P] [US1] Test unitario de unicidad de email (email duplicado → error mapeable a 409) en `backend/internal/account/repository_test.go`, por FR-002
- [X] T022 [P] [US1] Test de componente de `AccountSignupForm` para validación de campos obligatorios (nombre, apellido, correo) y para confirmar que los demás campos ya llenos NO se limpian al mostrar un error de validación, en `frontend/src/features/account-signup/AccountSignupForm.test.tsx`, por Escenarios de Aceptación 2-4 de la Historia 1 y SC-002 del spec

### Implementación de la Historia de Usuario 1

- [X] T023 [US1] Implementar `AccountRepository.Create(ctx, account)` en `backend/internal/account/repository.go` (INSERT en `accounts`, mapea `unique_violation` de PostgreSQL a un error de dominio de email duplicado) — depende de T010, T012
- [X] T024 [US1] Implementar `AccountService.CreateAccount(ctx, input)` en `backend/internal/account/service.go`: valida `first_name`/`last_name`/`email` obligatorios y formato de email, delega unicidad al repositorio, por FR-001/FR-002 — depende de T023
- [X] T025 [US1] Implementar handler `POST /accounts` en `backend/internal/account/handler.go` por contracts/post-accounts.md, devolviendo `201`/`400`/`409` (el manejo de `children` se extiende en la Fase 4) — depende de T024
- [X] T026 [US1] Montar la ruta `POST /accounts` en `backend/cmd/api/main.go` — depende de T025
- [X] T027 [US1] Implementar `AccountSignupForm.tsx` en `frontend/src/features/account-signup/AccountSignupForm.tsx` con React Hook Form: campos `firstName`, `lastName`, `email` (obligatorios), `countryCode`/`stateCode` (opcionales, desde `useCatalog`) — depende de T018
- [X] T028 [US1] Implementar `useAccountSignup.ts` (mutación TanStack Query hacia `POST /accounts`) en `frontend/src/features/account-signup/useAccountSignup.ts`, mostrando errores `400`/`409` en línea junto al campo correspondiente — depende de T027
- [X] T029 [US1] Crear `AccountSignupPage.tsx` en `frontend/src/features/account-signup/AccountSignupPage.tsx` que monte `AccountSignupForm` y la registre en el enrutador de la app — depende de T027, T003

**Punto de Control**: La Historia de Usuario 1 debe estar completamente funcional — cuenta sin hijos, de extremo a extremo.

---

## Fase 4: Historia de Usuario 2 - Agregar hijos durante el registro (Prioridad: P2)

**Objetivo**: El padre/tutor agrega uno o más hijos (nombre, apellido, fecha de nacimiento obligatorios; talla/peso opcionales) en el mismo formulario.

**Prueba Independiente**: Agregar un hijo con nombre/apellido/fecha de nacimiento (sin talla/peso) y guardar — verificar `201` con el hijo asociado. Ver Escenario 2 de quickstart.md.

### Pruebas para la Historia de Usuario 2 ⚠️

- [X] T030 [P] [US2] Test unitario de validación de Child (campos obligatorios faltantes, `birth_date` futura, `height`/`weight` no numéricos o negativos) en `backend/internal/account/service_test.go`, por FR-004/FR-005 y el Caso Límite de talla/peso del spec
- [X] T031 [P] [US2] Test de componente de `ChildFieldset` para agregar/quitar un bloque de hijo antes de guardar, sin que cuente para ningún límite, en `frontend/src/features/account-signup/ChildFieldset.test.tsx`, por FR-006
- [X] T032 [P] [US2] Test de integración: verificar que NO exista ningún endpoint `PATCH`/`DELETE` para `Child` (confirmar que el router no expone esas rutas, o que responden 404/405) en `backend/internal/account/handler_test.go`, por la inmutabilidad exigida en FR-006a

### Implementación de la Historia de Usuario 2

- [X] T033 [US2] Extender `AccountRepository.Create` en `backend/internal/account/repository.go` para insertar las filas de `children` asociadas dentro de la misma transacción de creación de cuenta — depende de T011, T023
- [X] T034 [US2] Extender `AccountService.CreateAccount` en `backend/internal/account/service.go` para validar cada hijo: `first_name`/`last_name`/`birth_date` obligatorios, `birth_date` no futura (FR-005), `height`/`weight` numéricos positivos si se proporcionan — depende de T024
- [X] T035 [US2] Extender el handler `POST /accounts` en `backend/internal/account/handler.go` para aceptar el arreglo `children` del body, por contracts/post-accounts.md — depende de T025, T034
- [X] T036 [US2] Implementar `ChildFieldset.tsx` en `frontend/src/features/account-signup/ChildFieldset.tsx` usando `useFieldArray` de React Hook Form: campos `firstName`, `lastName`, `birthDate` (obligatorios), `height`, `weight` (opcionales), con control para remover un bloque antes de guardar (FR-006) — depende de T027
- [X] T037 [US2] Integrar `ChildFieldset` en `AccountSignupForm.tsx` con el botón "Agregar hijo" que revela un nuevo bloque cada vez que se presiona, por FR-003 — depende de T036

**Punto de Control**: Las Historias 1 y 2 funcionan de forma independiente — cuenta con hijos persiste correctamente. La inmutabilidad de FR-006a queda cubierta explícitamente por T032 (no solo como nota manual).

---

## Fase 5: Historia de Usuario 3 - Aviso de límite freemium al agregar un segundo hijo (Prioridad: P3)

**Objetivo**: Al presionar "Agregar hijo" por segunda vez sin plan de pago, se muestra de inmediato un banner de upgrade, sin bloquear la escritura ni perder datos ya capturados; el servidor rechaza persistir más de 1 hijo sin plan de pago.

**Prueba Independiente**: Llenar datos de 2 hijos e intentar guardar — verificar `422 freemium_child_limit_exceeded` y que el formulario conserva todos los datos. Ver Escenario 4 de quickstart.md.

### Pruebas para la Historia de Usuario 3 ⚠️

- [X] T038 [P] [US3] Test unitario: cuenta con `plan = 'free'` y más de 1 hijo en el request → `AccountService.CreateAccount` retorna error de dominio de límite freemium, en `backend/internal/account/service_test.go`, por FR-007
- [X] T039 [P] [US3] Test de componente: `FreemiumBanner` aparece de inmediato al agregar el 2do bloque de hijo (sin esperar al guardado) y los campos siguen editables, en `frontend/src/features/account-signup/FreemiumBanner.test.tsx`, por FR-007 y Escenario de Aceptación 1 de la Historia 3
- [X] T040 [P] [US3] Test de componente/hook: al recibir `422 freemium_child_limit_exceeded`, el estado del formulario (tutor + ambos hijos) NO se limpia, en `frontend/src/features/account-signup/useAccountSignup.test.ts`, por Escenario de Aceptación 2 de la Historia 3

### Implementación de la Historia de Usuario 3

- [X] T041 [US3] Implementar la verificación de límite freemium en `AccountService.CreateAccount` (`backend/internal/account/service.go`): si `plan == "free"` y `len(children) > 1`, retorna error de dominio `ErrFreemiumChildLimitExceeded` — depende de T034
- [X] T042 [US3] Mapear `ErrFreemiumChildLimitExceeded` a la respuesta `422` con forma `{error, message, limit, received}` en `backend/internal/account/handler.go`, por contracts/post-accounts.md — depende de T035, T041
- [X] T043 [US3] Implementar `FreemiumBanner.tsx` en `frontend/src/features/account-signup/FreemiumBanner.tsx`: mensaje de límite y botón "Ver planes" (ruta placeholder, por Supuestos de spec.md) — depende de T018
- [X] T044 [US3] Integrar `FreemiumBanner` en `AccountSignupForm.tsx`: mostrarlo de inmediato cuando el conteo local de bloques de hijo supere 1 (validación del lado del cliente, sin esperar respuesta del servidor), sin deshabilitar los campos, por FR-007 — depende de T037, T043
- [X] T045 [US3] Manejar la respuesta `422` en `useAccountSignup.ts`: mantener intacto el estado del formulario y volver a mostrar `FreemiumBanner`, por FR-007 y Escenario 4 de quickstart.md — depende de T028, T042

**Punto de Control**: Las 3 historias de usuario funcionan de forma independiente y en conjunto — flujo completo de registro con regla freemium sin pérdida de datos.

---

## Fase Final: Pulido y Aspectos Transversales

**Propósito**: Verificación de calidad transversal exigida por la constitución (Principio VI) antes de considerar la feature terminada.

- [X] T046 [P] Escribir test E2E Playwright `frontend/e2e/account-signup.spec.ts` cubriendo los Escenarios 1, 2 y 4 de quickstart.md, como gate de CI separado del coverage unitario, por Principio VI
- [X] T047 [P] Verificar coverage del backend ≥90% con `go test -cover ./...`; cerrar cualquier brecha en `backend/internal/account/` y `backend/internal/catalog/`, por Principio VI
- [X] T048 [P] Verificar coverage del frontend ≥90% con el reporte de Vitest; cerrar cualquier brecha en `frontend/src/features/account-signup/` y `frontend/src/shared/catalog/`, por Principio VI
- [X] T049 Pasada de revisión de seguridad (skill `backend-security-coder`) sobre `POST /accounts` y `GET /catalog/*`: confirmar queries parametrizadas vía `pgx` (sin SQL injection), mensajes de error que no filtren detalles internos, y validación exhaustiva de input — por Convenciones de Código — Go de la constitución
- [X] T050 Ejecutar manualmente los 6 escenarios de quickstart.md de punta a punta, midiendo el tiempo de completado del Escenario 2 contra la meta SC-001 (<3 minutos), y actualizar el documento si algún nombre de campo/endpoint cambió durante la implementación

---

## Dependencias y Orden de Ejecución

### Dependencias de Fase

- **Configuración (Fase 1)**: Sin dependencias — puede comenzar de inmediato
- **Fundamental (Fase 2)**: Depende de completar la Configuración — BLOQUEA las 3 historias de usuario (todas comparten el catálogo país/estado y el esquema de base de datos)
- **Historias de Usuario (Fase 3-5)**: Todas dependen de completar la Fundamental
  - US2 depende de que exista `AccountRepository.Create`/`AccountService.CreateAccount` de US1 (los extiende, no los duplica)
  - US3 depende de que exista el manejo de `children` de US2 (el límite freemium se valida sobre el arreglo de hijos que US2 ya acepta)
  - Por esta dependencia de extensión de código compartido, se recomienda implementar en orden P1 → P2 → P3 en vez de en paralelo total
- **Pulido (Fase Final)**: Depende de que estén completas las 3 historias de usuario

### Dentro de Cada Historia de Usuario

- Las pruebas DEBEN escribirse y FALLAR antes de implementar (Principio VI)
- Modelos/migraciones antes que repositorio
- Repositorio antes que servicio
- Servicio antes que handler/endpoint
- Backend de la historia antes que su integración de frontend

### Oportunidades de Paralelización

- Todas las tareas de Configuración marcadas [P] (T002, T004-T008) pueden ejecutarse en paralelo
- Dentro de la Fundamental: T012/T013 en paralelo; T016/T018/T019 en paralelo tras T014/T015
- Dentro de cada historia: las tareas de prueba marcadas [P] pueden ejecutarse en paralelo entre sí antes de empezar la implementación
- El frontend y el backend de una misma historia pueden avanzar en paralelo una vez que el contrato del endpoint está definido (ya lo está, en contracts/)

---

## Ejemplo Paralelo: Historia de Usuario 1

```bash
# Lanzar juntas todas las pruebas de la Historia de Usuario 1:
Task: "Test unitario de validación de Account en backend/internal/account/service_test.go"
Task: "Test unitario de unicidad de email en backend/internal/account/repository_test.go"
Task: "Test de componente de AccountSignupForm en frontend/src/features/account-signup/AccountSignupForm.test.tsx"
```

---

## Estrategia de Implementación

### MVP Primero (Solo Historia de Usuario 1)

1. Completar la Fase 1: Configuración
2. Completar la Fase 2: Fundamental (catálogo + esquema de base de datos)
3. Completar la Fase 3: Historia de Usuario 1
4. **DETENERSE y VALIDAR**: Probar la Historia de Usuario 1 de forma independiente (Escenario 1 de quickstart.md)
5. Desplegar/demostrar si está lista

### Entrega Incremental

1. Completar Configuración + Fundamental → catálogo y esquema listos
2. Agregar Historia de Usuario 1 → probar de forma independiente → demostrar (¡MVP: cuenta sin hijos!)
3. Agregar Historia de Usuario 2 → probar de forma independiente → demostrar (cuenta con hijos)
4. Agregar Historia de Usuario 3 → probar de forma independiente → demostrar (regla freemium completa)
5. Fase Final de Pulido → coverage, E2E, revisión de seguridad

---

## Notas

- Las tareas [P] = archivos distintos, sin dependencias
- La etiqueta [Historia] mapea la tarea a una historia de usuario específica para trazabilidad
- Cada historia de usuario debe poder completarse y probarse de forma independiente, aunque US2/US3 extienden código de US1 (ver Dependencias entre Historias arriba)
- Verifica que las pruebas fallen antes de implementar (TDD, exigido por el Principio VI de la constitución)
- Haz commit después de cada tarea o grupo lógico, siguiendo la convención de ramas `feature/001-registro-cuenta-usuario` y PR hacia `develop` al cerrar la tarea con pruebas en verde (Control de Versiones de la constitución)
- Detente en cada Punto de Control para validar la historia de forma independiente antes de continuar
