---

description: "Lista de tareas de implementación: Detalle de Hijo — Consultas y Recetas"
---

# Tareas: Detalle de Hijo — Consultas y Recetas

**Entrada**: Documentos de diseño desde `/specs/004-detalle-consulta-hijo/`

**Prerrequisitos**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Pruebas**: Incluidas — Principio VI de la constitución (cobertura >90% NO NEGOCIABLE) exige pruebas para todo código nuevo, y el flujo registrar→ver→marcar toma es uno de los 4 flujos críticos nombrados explícitamente en la constitución para Playwright E2E.

**Organización**: Las tareas se agrupan por historia de usuario para permitir la implementación y prueba independiente de cada historia.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: Se puede ejecutar en paralelo (archivos distintos, sin dependencias)
- **[Historia]**: US1, US2 o US3, según spec.md

## Convenciones de Rutas

Aplicación web existente: `backend/` (Go) y `frontend/` (React + Vite + TS). Todas las rutas de archivo son relativas a la raíz del repositorio.

---

## Fase 1: Configuración

- [X] T001 Instalar la dependencia nueva `tesseract.js` en `frontend/` (`npm install tesseract.js`) — única dependencia nueva de toda la funcionalidad (research.md)
- [X] T002 Verificar que `backend/` y `frontend/` compilan/buildean limpio antes de empezar (`cd backend && go build ./...`, `cd frontend && npm run build`), como línea base

---

## Fase 2: Fundamental (Prerrequisitos Bloqueantes)

**Propósito**: Infraestructura compartida por las 3 historias de usuario — DEBE completarse antes de cualquier historia.

**⚠️ CRÍTICO**: No puede comenzar el trabajo de ninguna historia de usuario hasta que esta fase esté completa.

- [X] T003 Crear la migración `backend/migrations/0006_create_consultations_table.sql`: columnas `id UUID PK`, `child_id UUID NOT NULL REFERENCES children(id)`, `doctor_name TEXT NOT NULL`, `consult_date DATE NOT NULL`, `photo BYTEA NOT NULL`, `symptoms TEXT NOT NULL DEFAULT ''`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` (data-model.md)
- [X] T004 Crear la migración `backend/migrations/0007_create_medications_table.sql`: columnas `id UUID PK`, `consultation_id UUID NOT NULL REFERENCES consultations(id)`, `name TEXT NOT NULL`, `frequency_hours INTEGER NOT NULL`, `duration_days INTEGER NOT NULL`, `start_time TIME NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` (data-model.md)
- [X] T005 Crear la migración `backend/migrations/0008_create_doses_table.sql`: columnas `id UUID PK`, `medication_id UUID NOT NULL REFERENCES medications(id)`, `scheduled_at TIMESTAMPTZ NOT NULL`, `taken BOOLEAN NOT NULL DEFAULT false`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` (data-model.md)
- [X] T006 [P] Crear `backend/internal/consultation/model.go` con los structs `Consultation`, `Medication`, `Dose` reflejando data-model.md
- [X] T007 [P] Crear `backend/internal/consultation/errors.go`: `ErrChildNotFound`, `ErrConsultationNotFound`, `ErrDoseNotFound`, `ValidationError`/`ValidationErrors` (mismo patrón que `internal/account/errors.go`)
- [X] T008 [P] Crear `frontend/src/features/consultations/types.ts`: tipos `ConsultationSummary`, `ConsultationDetail`, `Medication`, `Dose` que reflejen contracts/get-consultations.md y contracts/get-consultation-detail.md

**Punto de Control**: Fundación lista — las 3 historias de usuario pueden implementarse ahora.

---

## Fase 3: Historia de Usuario 1 - Ver el reporte de consultas de mi hijo (Prioridad: P1) 🎯 MVP

**Objetivo**: Al abrir `/children/{childId}`, ver el listado de consultas (fecha + doctor) o un estado vacío que invite a registrar la primera.

**Prueba Independiente**: Crear una consulta directamente vía API (o dejar el hijo sin ninguna) y abrir su pantalla de detalle, verificando el listado o el estado vacío correspondiente.

### Pruebas para la Historia de Usuario 1 ⚠️

> Escribir estas pruebas PRIMERO, asegurarse de que FALLEN antes de implementar.

- [X] T009 [P] [US1] Prueba de repositorio para `GetByChild` (lista vacía, lista con varias consultas ordenadas por fecha descendente) en `backend/internal/consultation/repository_test.go`
- [X] T010 [P] [US1] Prueba de handler para `GET /children/{childId}/consultations` (200 con lista vacía, 200 con datos, 404 `child_not_found`) en `backend/internal/consultation/handler_test.go`
- [X] T011 [P] [US1] Prueba unitaria de `ChildDetailPage` para sus 2 estados (sin consultas / con consultas listadas) en `frontend/src/features/consultations/ChildDetailPage.test.tsx`, mockeando `fetchConsultations`

### Implementación de la Historia de Usuario 1

- [X] T012 [US1] Implementar `GetByChild(ctx, childID uuid.UUID) ([]Consultation, error)` en `backend/internal/consultation/repository.go`, devolviendo `ErrChildNotFound` si el hijo no existe (JOIN o verificación contra `children`), ordenado por `consult_date DESC`
- [X] T013 [US1] Implementar `ListConsultations(ctx, childID uuid.UUID) ([]Consultation, error)` en `backend/internal/consultation/service.go`, delegando a `GetByChild`
- [X] T014 [US1] Implementar el handler `ListConsultations` (`GET /children/{childId}/consultations`) en `backend/internal/consultation/handler.go` usando `*httpx.Responder` — 200 con `{childId, consultations: []}` (nunca `null`), 404 `child_not_found` (contracts/get-consultations.md)
- [X] T015 [US1] Registrar la ruta `GET /children/{childId}/consultations` en `backend/cmd/api/main.go`, wireando `consultation.NewRepository`/`NewService`/`NewHandler` con el mismo `*httpx.Responder` ya construido
- [X] T016 [P] [US1] Implementar `fetchConsultations(childId)` en `frontend/src/features/consultations/api.ts`, mapeando el 404 a un tipo de error distinguible (reutilizar el patrón `ApiError<Kind>` de `shared/apiError.ts`)
- [X] T017 [P] [US1] Implementar `ConsultationCard` (fecha + doctor, click navega al detalle) en `frontend/src/features/consultations/ConsultationCard.tsx`
- [X] T018 [US1] Implementar `ChildDetailPage` en `frontend/src/features/consultations/ChildDetailPage.tsx`: llama `fetchConsultations`, renderiza estado vacío (invitación a registrar la primera consulta) o listado de `ConsultationCard`, e incluye el botón "Registrar consulta" (sin funcionalidad todavía, se conecta en la Historia 2) (depende de T016, T017)
- [X] T019 [US1] Reemplazar `ChildDetailPlaceholder` por `ChildDetailPage` en la ruta `/children/:childId` de `frontend/src/App.tsx`, y eliminar `frontend/src/features/home/ChildDetailPlaceholder.tsx` y su test (ya no se usan)

**Punto de Control**: La Historia de Usuario 1 es completamente funcional y comprobable de forma independiente — MVP alcanzado.

---

## Fase 4: Historia de Usuario 2 - Registrar una consulta médica nueva (Prioridad: P2)

**Objetivo**: Desde "Registrar consulta", capturar doctor/fecha/foto/medicamentos/síntomas, con OCR client-side como ayuda de autollenado, y persistir todo (incluyendo las tomas generadas de una vez).

**Prueba Independiente**: Registrar una consulta completa desde el formulario y verificar que aparece de inmediato en el listado de la Historia 1; por separado, verificar que guardar sin medicamentos es rechazado.

### Pruebas para la Historia de Usuario 2 ⚠️

- [X] T020 [P] [US2] Prueba de servicio para `CreateConsultation`: éxito con 1 y con 2 medicamentos de frecuencias distintas, error de validación (doctor/fecha/foto faltante, fecha futura, `medications` vacío, `frequencyHours`/`durationDays` no positivos), `ErrChildNotFound` en `backend/internal/consultation/service_test.go`
- [X] T021 [P] [US2] Prueba de servicio para la generación de tomas, usando el algoritmo `total = floor(duration_days*24 / frequency_hours)`, `scheduled_at[i] = start_datetime + i*frequency_hours` para `i` de `0` a `total-1` (válido para cualquier frecuencia positiva, no solo divisores de 24 — p. ej. cada 5h): casos cada 8h × 3 días = 9 tomas, cada 24h × 1 día = 1 toma, y un caso con frecuencia que no divide 24 exacto (p. ej. cada 5h × 1 día = 4 tomas, no 5); medicamento sin `startTime` genera 0 tomas (FR-010) en `backend/internal/consultation/service_test.go`
- [X] T022 [P] [US2] Prueba de handler para `POST /children/{childId}/consultations` (201 con detalle completo, 400 `validation_error`, 404 `child_not_found`) en `backend/internal/consultation/handler_test.go`
- [X] T023 [P] [US2] Prueba unitaria de `useOcrSuggestion` (mockeando `tesseract.js`: texto extraído se expone como sugerencia; fallo/texto vacío no bloquea) en `frontend/src/features/consultations/useOcrSuggestion.test.ts`
- [X] T024 [P] [US2] Prueba unitaria de `ConsultationForm` (validación de campos requeridos, agregar/quitar medicamentos, envío exitoso navega al detalle, rechazo sin medicamentos) en `frontend/src/features/consultations/ConsultationForm.test.tsx`

### Implementación de la Historia de Usuario 2

- [X] T025 [US2] Implementar `Create(ctx, childID uuid.UUID, input CreateConsultationInput) (*Consultation, error)` en `backend/internal/consultation/repository.go`: una transacción que inserta la consulta, sus medicamentos, y — por cada medicamento con `StartTime` no nulo — todas las `Dose` calculadas con `total = floor(duration_days*24 / frequency_hours)` tomas, `scheduled_at[i] = start_datetime + i*frequency_hours` para `i` de `0` a `total-1` (no una división por días — válido para cualquier frecuencia positiva, ver T021), devolviendo `ErrChildNotFound` si `childID` no existe
- [X] T026 [US2] Implementar `CreateConsultation(ctx, childID uuid.UUID, input CreateConsultationInput) (*Consultation, error)` en `backend/internal/consultation/service.go`: valida doctor/fecha (no futura)/foto (presente, ≤8MB)/al menos 1 medicamento (FR-015)/frecuencia y duración positivas por medicamento, luego delega a `repo.Create`
- [X] T027 [US2] Implementar el handler `CreateConsultation` (`POST /children/{childId}/consultations`) en `backend/internal/consultation/handler.go` usando `*httpx.Responder` — decodifica `photoBase64`, 201 con el detalle completo (mismo shape que `GET /consultations/{id}`), 400/404 (contracts/post-consultations.md); usa `http.MaxBytesReader` con un límite propio (~11MB, para cubrir 8MB de foto ya codificada en base64 + el resto del payload)
- [X] T028 [US2] Registrar la ruta `POST /children/{childId}/consultations` en `backend/cmd/api/main.go`
- [X] T029 [P] [US2] Implementar `createConsultation(childId, payload)` en `frontend/src/features/consultations/api.ts`
- [X] T030 [P] [US2] Implementar `useOcrSuggestion` en `frontend/src/features/consultations/useOcrSuggestion.ts`: recibe el archivo de foto adjunto, corre `tesseract.js` de forma asíncrona, expone el texto extraído (o `null` si falla/no encuentra nada) sin bloquear el resto del formulario (FR-007)
- [X] T031 [P] [US2] Implementar `MedicationFieldset` (nombre, frecuencia, duración con placeholder autollenado desde `useOcrSuggestion` si aplica, horario de inicio opcional, botón quitar) en `frontend/src/features/consultations/MedicationFieldset.tsx`
- [X] T032 [US2] Implementar `ConsultationForm` en `frontend/src/features/consultations/ConsultationForm.tsx`: doctor, fecha, `<input type="file" accept="image/*" capture>` para la foto (Principio III), field array de `MedicationFieldset`, textbox de síntomas, envía vía `createConsultation` y navega al detalle de la consulta creada en éxito (depende de T029, T030, T031)
- [X] T033 [US2] Conectar el botón "Registrar consulta" de `ChildDetailPage` (T018) para abrir `ConsultationForm` (modal o ruta propia, a criterio de implementación) y refrescar el listado tras un registro exitoso

**Punto de Control**: Las Historias de Usuario 1 y 2 funcionan ambas de forma independiente.

---

## Fase 5: Historia de Usuario 3 - Ver el detalle de una consulta y marcar las tomas (Prioridad: P3)

**Objetivo**: Abrir el detalle de una consulta (foto, doctor, fecha, medicamentos, tomas, síntomas) y marcar/desmarcar cualquier toma en cualquier momento.

**Prueba Independiente**: Abrir el detalle de una consulta ya registrada con un medicamento con horario de inicio y marcar una de sus tomas; por separado, verificar que un medicamento sin horario de inicio no muestra tomas.

### Pruebas para la Historia de Usuario 3 ⚠️

- [X] T034 [P] [US3] Prueba de repositorio para `GetByID` (detalle completo con medicamentos y tomas ordenadas por `scheduled_at`, 404 si no existe) en `backend/internal/consultation/repository_test.go`
- [X] T035 [P] [US3] Prueba de repositorio para `UpdateDoseStatus` (marca/desmarca `taken` sin importar si `scheduled_at` ya pasó — FR-016; 404 si `doseId` no existe o no pertenece a la consulta) en `backend/internal/consultation/repository_test.go`
- [X] T036 [P] [US3] Prueba de handler para `GET /consultations/{consultationId}` (200, 404 `consultation_not_found`) y `PATCH /consultations/{consultationId}/doses/{doseId}` (200, 404 `dose_not_found`) en `backend/internal/consultation/handler_test.go`
- [X] T037 [P] [US3] Prueba unitaria de `DoseCheckbox` (marca/desmarca, refleja el estado sin recargar) en `frontend/src/features/consultations/DoseCheckbox.test.tsx`
- [X] T038 [P] [US3] Prueba unitaria de `ConsultationDetailPage` (renderiza foto/doctor/fecha/medicamentos/tomas/síntomas; medicamento sin tomas no muestra lista marcable) en `frontend/src/features/consultations/ConsultationDetailPage.test.tsx`

### Implementación de la Historia de Usuario 3

- [X] T039 [US3] Implementar `GetByID(ctx, id uuid.UUID) (*Consultation, error)` en `backend/internal/consultation/repository.go`, cargando medicamentos y sus tomas (ordenadas por `scheduled_at ASC`), devolviendo `ErrConsultationNotFound` si no existe
- [X] T040 [US3] Implementar `UpdateDoseStatus(ctx, doseID uuid.UUID, taken bool) (*Dose, error)` en `backend/internal/consultation/repository.go`, sin ninguna validación de fecha/estado de tratamiento (FR-016), devolviendo `ErrDoseNotFound` si no existe
- [X] T041 [US3] Implementar `GetConsultation(ctx, id uuid.UUID) (*Consultation, error)` y `MarkDose(ctx, doseID uuid.UUID, taken bool) (*Dose, error)` en `backend/internal/consultation/service.go`, delegando a los métodos del repositorio de T039/T040
- [X] T042 [US3] Implementar los handlers `GetConsultation` (`GET /consultations/{consultationId}`) y `UpdateDose` (`PATCH /consultations/{consultationId}/doses/{doseId}`) en `backend/internal/consultation/handler.go` usando `*httpx.Responder` (contracts/get-consultation-detail.md, contracts/patch-dose.md)
- [X] T043 [US3] Registrar las rutas `GET /consultations/{consultationId}` y `PATCH /consultations/{consultationId}/doses/{doseId}` en `backend/cmd/api/main.go`
- [X] T044 [P] [US3] Implementar `fetchConsultationDetail(consultationId)` y `updateDoseStatus(consultationId, doseId, taken)` en `frontend/src/features/consultations/api.ts`
- [X] T045 [P] [US3] Implementar `DoseCheckbox` (checkbox que llama `updateDoseStatus` y refleja el nuevo estado de inmediato, optimista o vía refetch) en `frontend/src/features/consultations/DoseCheckbox.tsx`
- [X] T046 [US3] Implementar `ConsultationDetailPage` en `frontend/src/features/consultations/ConsultationDetailPage.tsx`: llama `fetchConsultationDetail`, muestra foto/doctor/fecha/síntomas, y por cada medicamento su frecuencia/duración + lista de `DoseCheckbox` si `doses.length > 0` (depende de T044, T045)
- [X] T047 [US3] Registrar la ruta `/consultations/:consultationId` en `frontend/src/App.tsx`, y actualizar `ConsultationCard` (T017) para navegar ahí

**Punto de Control**: Las 3 historias de usuario son funcionales de forma independiente — funcionalidad completa.

---

## Fase Final: Pulido y Aspectos Transversales

- [X] T048 [P] Actualizar `CLAUDE.md` (raíz), `backend/CLAUDE.md` y `frontend/CLAUDE.md` con el nuevo módulo `internal/consultation`, la nueva carpeta `frontend/src/features/consultations/`, y la dependencia nueva `tesseract.js`
- [X] T049 [P] Agregar las anotaciones Swagger (`@Summary`/`@Param`/`@Success`/`@Failure`/`@Router`) a los 4 handlers de `internal/consultation/handler.go` y regenerar (`swag init -g cmd/api/main.go -o internal/docs --pd`)
- [X] T050 Ejecutar manualmente los 8 escenarios de `quickstart.md` contra el backend y frontend corriendo localmente
- [X] T051 [P] Prueba E2E Playwright del flujo completo (registrar consulta con un medicamento con horario de inicio → verla en el listado → abrir su detalle → ver las tomas generadas → marcar una toma) en `frontend/e2e/detalle-consulta-hijo.spec.ts` — flujo crítico nombrado explícitamente en la constitución (Principio VI)
- [X] T052 Verificar cobertura >90% en backend (`cd backend && go test ./... -cover`) y frontend (`cd frontend && npx vitest run --coverage`) — Principio VI NO NEGOCIABLE
- [X] T053 Agregar una prueba de router que verifique que `PUT`/`PATCH`/`DELETE` sobre `/consultations/{consultationId}` (y sobre `/children/{childId}/consultations/{consultationId}` si aplica) devuelven 404/405, replicando el patrón de `TestRouter_NoChildMutationRoutes` de feature 001 — cubre SC-003 (inmutabilidad) con una prueba explícita, no solo por ausencia de código, en `backend/internal/consultation/handler_test.go`

---

## Dependencias y Orden de Ejecución

### Dependencias de Fase

- **Configuración (Fase 1)**: Sin dependencias.
- **Fundamental (Fase 2)**: Depende de la Configuración — BLOQUEA las 3 historias de usuario.
- **Historias de Usuario (Fase 3-5)**: Todas dependen de la Fundamental. US1 no depende de US2 ni US3. US2 depende de que exista el listado de US1 (`ChildDetailPage`, T018) para conectar el botón "Registrar consulta" (T033) — en la práctica, completar T018 antes de T033. US3 depende de `ConsultationCard` (T017, de US1) para el link de navegación (T047) y, para tener datos reales que ver, de que exista al menos una consulta creada por US2 — aunque su propio código (T039-T046) no depende en compilación de US2.

### Dentro de Cada Historia de Usuario

- Pruebas antes que implementación (deben fallar primero).
- Repositorio antes que servicio; servicio antes que handler; handler antes que ruta registrada.
- Backend antes que frontend cuando el frontend consume el endpoint nuevo.

### Oportunidades de Paralelización

- T006, T007, T008 (Fundamental) en paralelo entre sí.
- Dentro de US1: T009-T011 (pruebas) en paralelo; T016/T017 en paralelo.
- Dentro de US2: T020-T024 (pruebas) en paralelo; T029/T030/T031 en paralelo.
- Dentro de US3: T034-T038 (pruebas) en paralelo; T044/T045 en paralelo.
- T048/T049/T051 (Pulido) en paralelo entre sí.

---

## Estrategia de Implementación

### MVP Primero (Solo Historia de Usuario 1)

1. Completar Fase 1: Configuración.
2. Completar Fase 2: Fundamental.
3. Completar Fase 3: Historia de Usuario 1.
4. **DETENERSE y VALIDAR**: Escenarios 1 y 8 de `quickstart.md` (estado vacío, hijo inexistente) — sin datos reales todavía, ya que crearlos depende de US2.
5. Desplegar/demostrar si está lista.

### Entrega Incremental

1. Configuración + Fundamental → Fundación lista.
2. Agregar US1 → Validar con datos creados manualmente vía API (quickstart.md aún no ejecutable de punta a punta).
3. Agregar US2 → Validar (Escenarios 2-4 de quickstart.md, registrar consulta) → primer punto donde el flujo completo es demostrable de principio a fin.
4. Agregar US3 → Validar (Escenarios 5-7 de quickstart.md, ver detalle y marcar tomas) → funcionalidad completa.

## Notas

- Las tareas [P] son de archivos distintos sin dependencias entre sí.
- La etiqueta [Historia] mapea cada tarea a su historia de usuario para trazabilidad.
- Verificar que las pruebas fallen antes de implementar (TDD, por Principio VI).
- Detenerse en cada punto de control para validar la historia de forma independiente contra `quickstart.md`.
