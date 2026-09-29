---

description: "Lista de tareas de la spec 012: síntomas seleccionables y notas previas a la consulta"
---

# Tareas: Síntomas seleccionables y notas previas a la consulta

**Entrada**: Documentos de diseño desde `/specs/012-sintomas-notas-consulta/`

**Prerrequisitos**: plan.md, spec.md, research.md, data-model.md, contracts/symptoms-api.md, quickstart.md

**Pruebas**: obligatorias por el Principio VI de la constitución (>90% de cobertura en Go y React, Playwright a 390 y
1280 px en los flujos críticos). Cada tarea de código tiene su tarea de prueba.

**Organización**: por historia de usuario (spec.md): US1 elegir síntomas (P1), US2 notas previas (P1), US3 ver síntomas
en listado y detalle (P2), US4 catálogo ampliable / síntomas retirados (P3).

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Historia]**: US1…US4

## Convenciones de Rutas

- Backend: `backend/` (Go: `internal/<paquete>/`, `migrations/`)
- Frontend: `frontend/src/` (React), `frontend/e2e/` (Playwright)

---

## Fase 1: Configuración

- [ ] T001 Línea base: `cd backend && go build ./... && go test ./... -cover` y `cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx vitest run` en verde antes de empezar (con `DATABASE_URL` de la BD local)

---

## Fase 2: Fundamental (Prerrequisitos Bloqueantes)

**Propósito**: el esquema nuevo y el renombre `symptoms → notes` de punta a punta, para que todo siga compilando y
pasando antes de agregar los síntomas. Ninguna historia empieza antes de terminar esta fase.

- [ ] T002 Crear `backend/migrations/0012_create_symptoms.sql` según data-model.md: `ALTER TABLE consultations RENAME COLUMN symptoms TO notes`; `ALTER TABLE consultations ADD CONSTRAINT consultations_id_child_id_key UNIQUE (id, child_id)`; `ALTER TABLE children ADD CONSTRAINT children_id_account_id_key UNIQUE (id, account_id)`; tabla `symptoms` (`code TEXT PRIMARY KEY`, `name TEXT NOT NULL`, `category TEXT NOT NULL`, `sort_order INTEGER NOT NULL UNIQUE`, `active BOOLEAN NOT NULL DEFAULT true`) sembrada con los 23 síntomas de la tabla de data-model.md (`sort_order` 10, 20, … en ese orden, códigos exactos `fever` … `sleeping_more`); tabla `consultation_symptoms` (`consultation_id UUID NOT NULL`, `child_id UUID NOT NULL`, `account_id UUID NOT NULL`, `symptom_code TEXT NOT NULL REFERENCES symptoms (code)`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `PRIMARY KEY (consultation_id, symptom_code)`, `FOREIGN KEY (consultation_id, child_id) REFERENCES consultations (id, child_id)`, `FOREIGN KEY (child_id, account_id) REFERENCES children (id, account_id)`) con índices `idx_consultation_symptoms_child_id (child_id)` e `idx_consultation_symptoms_account_id (account_id)`. Aplicarla a la BD local y a la de pruebas
- [ ] T003 Renombrar en el backend el texto libre `Symptoms` → `Notes`: `Consultation.Notes` en `backend/internal/consultation/model.go`, `CreateConsultationInput.Notes` en `service.go`, columna `notes` en las tres consultas de `repository.go` (listado, `INSERT`, detalle), y en `handler.go` los campos JSON `notes` de `createConsultationRequest`, del resumen del listado y de `consultationDetailResponse` (contracts §2–4), con sus anotaciones Swagger
- [ ] T004 Actualizar las pruebas del backend al renombre: `backend/internal/consultation/repository_test.go`, `handler_test.go`, `overview_test.go`, `service_test.go` y `testhelpers_test.go` (`notes` en lugar de `symptoms`); agregar una prueba de repositorio que confirme que el texto de una consulta se lee como `Notes` sin cambios
- [ ] T005 [P] Renombrar en el frontend `symptoms` (texto) → `notes`: `ConsultationSummary.notes` y `ConsultationDetail.notes` en `frontend/src/features/consultations/types.ts`, el cuerpo de `createConsultation` en `api.ts`, el valor del formulario (`notes`, `register('notes')`, `id="notes"`) en `ConsultationForm.tsx`, el subtítulo de `ConsultationCard.tsx` y las dos secciones de `ConsultationDetailPage.tsx` (por ahora con el título actual)
- [ ] T006 [P] Actualizar al renombre las pruebas del frontend (`ChildDetailPage.test.tsx`, `ConsultationCard.test.tsx`, `ConsultationDetailPage.test.tsx`, `ConsultationForm.test.tsx`, `NewConsultationPage.test.tsx`, `api.test.ts` en `frontend/src/features/consultations/`, y `frontend/src/features/home/HomePage.test.tsx`) y los E2E que crean consultas por API (`frontend/e2e/helpers.ts` línea `symptoms: 'Fiebre y tos'` y `frontend/e2e/detalle-consulta-web.spec.ts` `symptoms: 'Control'` → `notes`)
- [ ] T007 Regenerar la documentación Swagger en `backend/internal/docs/` (comando de `backend/CLAUDE.md`) y correr `go test ./...` y `npx vitest run`: todo verde con el renombre

**Punto de Control**: esquema nuevo aplicado, la app funciona igual que antes con `notes`.

---

## Fase 3: Historia de Usuario 1 - Elegir los síntomas tocándolos (Prioridad: P1) 🎯 MVP

**Objetivo**: el padre elige síntomas con chips al registrar la consulta y quedan guardados con la consulta, el hijo y
la cuenta.

**Prueba Independiente**: registrar una consulta tocando "Fiebre" y "Tos" y comprobar que el detalle (respuesta del
`POST`) trae exactamente esos dos síntomas.

### Backend

- [ ] T008 [P] [US1] Agregar `Symptom{Code, Name, Category string}` a `backend/internal/catalog/model.go` y `ListSymptoms(ctx)` a `backend/internal/catalog/repository.go`: solo `active`, `ORDER BY sort_order`
- [ ] T009 [P] [US1] Pruebas de `ListSymptoms` en `backend/internal/catalog/repository_test.go`: 23 síntomas sembrados, primero `fever`/"Fiebre"/"General", último `sleeping_more`, en orden; uno con `active = false` no aparece (restaurarlo al terminar)
- [ ] T010 [US1] Agregar `ListSymptoms` a `backend/internal/catalog/handler.go` (`GET /catalog/symptoms`, arreglo `[{code, name, category}]`, `[]` si no hay, contracts §1) con anotaciones Swagger, escrito con `h.responder`, y su prueba en `backend/internal/catalog/handler_test.go`
- [ ] T011 [US1] Registrar `GET /catalog/symptoms` como ruta pública en `backend/internal/server/router.go` (junto a `/catalog/countries`) y su fila en `backend/internal/server/router_test.go` (200 sin sesión)
- [ ] T012 [US1] Agregar `SymptomCodes []string` a `CreateConsultationInput` en `backend/internal/consultation/service.go`: quitar duplicados conservando el orden y pasar la lista al repositorio; `nil`/vacío = sin síntomas (FR-003)
- [ ] T013 [US1] Agregar `ErrSymptomNotAvailable` en `backend/internal/consultation/errors.go` y, en la transacción de `Create` de `backend/internal/consultation/repository.go`, después de insertar la consulta: si hay códigos, `INSERT INTO consultation_symptoms (consultation_id, child_id, account_id, symptom_code) SELECT $1, ch.id, ch.account_id, s.code FROM children ch JOIN symptoms s ON s.code = ANY($3) AND s.active WHERE ch.id = $2`; si las filas insertadas ≠ `len(codes)`, devolver `ErrSymptomNotAvailable` (la transacción se revierte, research R4)
- [ ] T014 [US1] Agregar `Symptoms []Symptom` (`Code`, `Name`, `Category`) a `Consultation` en `backend/internal/consultation/model.go` y leerlos en el detalle (`repository.go`): `JOIN symptoms` por `symptom_code`, `ORDER BY sort_order`, **sin filtrar por `active`** (FR-008); `[]` si no hay
- [ ] T015 [US1] En `backend/internal/consultation/handler.go`: `symptomCodes []string` en `createConsultationRequest`; `symptoms: [{code, name, category}]` en `consultationDetailResponse` (siempre arreglo); `ErrSymptomNotAvailable` → `400 validation_error` con `details: [{field: "symptomCodes", message: "symptom_not_available"}]` en `writeCreateConsultationError` (contracts §2–3); anotaciones Swagger
- [ ] T016 [US1] Pruebas en `backend/internal/consultation/`: `service_test.go` (duplicados se guardan una vez, lista vacía válida); `repository_test.go` (guarda los síntomas con el `child_id` y el `account_id` del hijo; el detalle los devuelve en orden de catálogo; un código inexistente o retirado devuelve `ErrSymptomNotAvailable` y **no** deja consulta, medicamentos ni tomas; un `INSERT` directo con otro `account_id` o con un `child_id` que no es el de la consulta falla por las llaves compuestas — SC-004); `handler_test.go` (201 con `symptoms`, 400 `symptom_not_available`)

### Frontend

- [ ] T017 [P] [US1] Agregar `Symptom {code, name, category}`, `fetchSymptoms()` (`GET /catalog/symptoms`) en `frontend/src/shared/catalog/api.ts` y `useSymptoms()` en `frontend/src/shared/catalog/useCatalog.ts` (TanStack Query, `queryKey: ['catalog', 'symptoms']`, `staleTime` largo como países), con pruebas en `api.test.ts` y `useCatalog.test.ts`
- [ ] T018 [US1] Crear `frontend/src/features/consultations/SymptomPicker.tsx` (research R7): `fieldset` con leyenda "¿Qué síntomas tuvo?", un grupo por categoría en el orden recibido con su subtítulo, cada síntoma un `<button type="button" aria-pressed>` de nombre fijo, `min-h-11`, `rounded-full`, `cursor-pointer`, foco visible; sin seleccionar: fondo `surface`, borde `slate-300`, texto `ink`; seleccionado: fondo `action`, texto blanco y palomita SVG (`aria-hidden`) a la izquierda. Props `value: string[]`, `onChange(codes)`; estado de carga; si el catálogo falla, `Notice` tono `info`: "No pudimos cargar la lista de síntomas. Puedes guardar la consulta y escribirlos en las notas." (FR-016). Variante `phone`/`desktop` solo para espaciados, sin clases `lg:`
- [ ] T019 [US1] Pruebas de `SymptomPicker` en `frontend/src/features/consultations/SymptomPicker.test.tsx`: categorías y síntomas en orden, tocar selecciona y vuelve a tocar quita (`aria-pressed`), nombre accesible fijo, teclado (Enter/Espacio), aviso cuando el catálogo falla, nada seleccionado al inicio
- [ ] T020 [US1] Integrar en `frontend/src/features/consultations/ConsultationForm.tsx`: valor `symptomCodes: string[]` (default `[]`, `Controller`), `SymptomPicker` en una sección propia **después** del grupo "Leído de tu receta" y antes de los medicamentos en ambos diseños (en el web sale del `fieldset` del OCR, research R7); `createConsultation` en `api.ts` envía `symptomCodes`; el OCR no toca `symptomCodes` ni `notes` (FR-017); `symptomCodes` y `symptoms: Symptom[]` en `types.ts`
- [ ] T021 [US1] Pruebas en `ConsultationForm.test.tsx` y `api.test.ts`: los chips elegidos viajan como `symptomCodes` (sin elegir = `[]`), el catálogo fallido no bloquea el guardado, una sugerencia del OCR no selecciona síntomas; la sección de síntomas aparece fuera del grupo del OCR en móvil y en web
- [ ] T022 [US1] E2E en `frontend/e2e/nueva-consulta-movil.spec.ts` y `frontend/e2e/nueva-consulta-web.spec.ts`: los chips aparecen por categoría, tocar "Fiebre" y "Tos" los marca (`aria-pressed="true"`), tocar "Tos" otra vez lo quita, y al guardar la consulta tiene "Fiebre" (390 y 1280 px)

**Punto de Control**: se pueden elegir síntomas y quedan guardados con consulta, hijo y cuenta.

---

## Fase 4: Historia de Usuario 2 - Notas previas a la consulta (Prioridad: P1)

**Objetivo**: el cuadro de texto se llama "Notas previas a la consulta" con su ejemplo, y las consultas anteriores
muestran su texto bajo ese nombre.

**Prueba Independiente**: ver el cuadro con su nombre y ejemplo en el formulario; abrir una consulta anterior y ver su
texto bajo "Notas previas a la consulta".

- [ ] T023 [US2] En `frontend/src/features/consultations/ConsultationForm.tsx`: etiqueta "Notas previas a la consulta", `placeholder` "Qué comió antes, cómo se sentía, cómo fue cambiando desde que empezó…", opcional, sin límite de largo nuevo (FR-012), debajo de `SymptomPicker` en la misma sección; quitar el comentario viejo sobre el mock 04/14
- [ ] T024 [US2] En `frontend/src/features/consultations/ConsultationDetailPage.tsx` (móvil y web): la sección de texto se titula "Notas previas a la consulta" y se omite si `notes` está vacío
- [ ] T025 [US2] Pruebas: `ConsultationForm.test.tsx` (etiqueta y ejemplo, opcional, se envía como `notes`) y `ConsultationDetailPage.test.tsx` (título nuevo, texto íntegro de una consulta anterior, sección omitida sin notas); actualizar los textos esperados "Síntomas"/"Síntomas registrados" en `frontend/e2e/detalle-consulta-movil.spec.ts`, `detalle-consulta-web.spec.ts` y `detalle-consulta-hijo.spec.ts`

**Punto de Control**: ya no hay dos cosas llamadas "síntomas" en el formulario.

---

## Fase 5: Historia de Usuario 3 - Ver los síntomas en el listado y en el detalle (Prioridad: P2)

**Objetivo**: el detalle muestra los síntomas como pastillas de solo lectura y el listado los resume.

**Prueba Independiente**: con una consulta con "Fiebre", "Tos" y "Vómito", verla en el listado del hijo y en su
detalle.

- [ ] T026 [US3] Agregar `SymptomNames []string` a `Consultation` y leerlo en el listado de `backend/internal/consultation/repository.go` con una subconsulta `COALESCE((SELECT array_agg(s.name ORDER BY s.sort_order) FROM consultation_symptoms cs JOIN symptoms s ON s.code = cs.symptom_code WHERE cs.consultation_id = c.id), '{}')`; exponer `symptomNames` (siempre arreglo) en el resumen de `handler.go` (contracts §4) con Swagger
- [ ] T027 [US3] Pruebas en `backend/internal/consultation/repository_test.go` y `handler_test.go`: `symptomNames` en orden de catálogo, `[]` sin síntomas
- [ ] T028 [P] [US3] Crear `frontend/src/features/consultations/SymptomChips.tsx`: pastillas de solo lectura (`<ul>`/`<li>`, fondo `hint`, borde `hint-border`, texto `ink`, `rounded-full`) en el orden recibido; nada si la lista está vacía; prueba en `SymptomChips.test.tsx`
- [ ] T029 [US3] En `ConsultationDetailPage.tsx` (móvil y web): sección "Síntomas" con `SymptomChips` antes de "Notas previas a la consulta", omitida sin síntomas (FR-014); pruebas en `ConsultationDetailPage.test.tsx` (con síntomas, sin síntomas, sin síntomas ni notas = ninguna sección vacía)
- [ ] T030 [US3] En `frontend/src/features/consultations/ConsultationCard.tsx`: subtítulo con `symptomNames` — hasta 3 unidos por ", " y "+N" si hay más — y, si no hay síntomas, el inicio de `notes` como hoy; siempre seguido de "· N medicamentos" (FR-015); `symptomNames` en `ConsultationSummary` de `types.ts`; pruebas en `ConsultationCard.test.tsx` (1, 3, 5 síntomas; sin síntomas con notas; sin nada)
- [ ] T031 [US3] E2E en `frontend/e2e/detalle-consulta-hijo.spec.ts` (390 y 1280 px): registrar una consulta con "Fiebre" y una nota, ver "Fiebre · 1 medicamento" en el listado y, en el detalle, la pastilla "Fiebre" y la nota bajo "Notas previas a la consulta"

**Punto de Control**: lo capturado se ve donde el padre lo busca.

---

## Fase 6: Historia de Usuario 4 - Catálogo ampliable y síntomas retirados (Prioridad: P3)

**Objetivo**: un síntoma retirado deja de ofrecerse pero se sigue viendo en consultas anteriores; enviarlo se rechaza
con un mensaje claro.

**Prueba Independiente**: marcar un síntoma como retirado y comprobar formulario, consulta anterior y rechazo al enviar
(quickstart §4).

- [ ] T032 [US4] Pruebas de backend en `backend/internal/consultation/repository_test.go` y `backend/internal/catalog/repository_test.go`: una consulta con un síntoma que luego se retira lo sigue mostrando en detalle y listado; el catálogo ya no lo lista; un síntoma agregado con un `sort_order` intermedio aparece en su posición (restaurar el catálogo al terminar)
- [ ] T033 [US4] En `frontend/src/features/consultations/api.ts`, reconocer el 400 con `details[].message === 'symptom_not_available'` (kind nuevo o detalle) y en `ConsultationForm.tsx` mostrar "Uno de los síntomas que elegiste ya no está disponible. Revisa la lista e intenta de nuevo.", invalidar `['catalog', 'symptoms']` y quitar de `symptomCodes` los que ya no vengan en el catálogo, conservando el resto del formulario (casos límite de la spec)
- [ ] T034 [US4] Pruebas de T033 en `ConsultationForm.test.tsx` y `api.test.ts`

**Punto de Control**: el catálogo se puede cambiar sin publicar la app y nada se rompe.

---

## Fase 7: Pulido y Transversales

- [ ] T035 Diseño: capturas de "Nueva consulta" (sección de síntomas y notas), el detalle y el listado en móvil (390 px) y web (1280 px) con el Browser preview; revisar contraste (texto blanco sobre `action`, borde de chips ≥ 3:1), áreas de 44 px y foco visible; mostrarlas al usuario para aprobarlas (FR-019)
- [ ] T036 [P] Anotar en `specs/007-homologar-pantallas-a-mocks/spec.md` (desviaciones) que en el web el cuadro de notas sale del grupo "Leído de tu receta" del mock 14 y que la sección de síntomas es nueva en los mocks 04/14 y 03/13, con su motivo
- [ ] T037 [P] Revisar todos los textos nuevos contra el Principio I (SC-005): ningún diagnóstico, gravedad, sugerencia ni imperativo médico
- [ ] T038 [P] Actualizar mapas: `CLAUDE.md` (feature 012 en "Current features"), `backend/CLAUDE.md` (migración `0012`, `GET /catalog/symptoms`, `consultation_symptoms` y cómo mantener el catálogo con SQL), `frontend/CLAUDE.md` (`SymptomPicker`, `SymptomChips`, `useSymptoms`, `notes`)
- [ ] T039 Cobertura y calidad: `cd backend && gofmt -l ./internal && go vet ./... && go test ./... -cover` (>90%) y `cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx eslint . && npx vitest run --coverage` (>90%)
- [ ] T040 E2E completos afectados en los tres navegadores (`detalle-consulta-hijo`, `detalle-consulta-movil`, `detalle-consulta-web`, `nueva-consulta-movil`, `nueva-consulta-web`) y validación manual de quickstart.md §1–§5
- [ ] T041 Commit(s), push de `feature/012-sintomas-notas-consulta` y PR a `develop`; code review del PR

---

## Dependencias y Orden de Ejecución

- **Fase 1 → Fase 2 → historias.** La Fase 2 (esquema + renombre) bloquea todo.
- **US1** (Fase 3) depende solo de la Fase 2. Es el MVP.
- **US2** (Fase 4) depende de la Fase 2; T023 va en la misma sección que T020, así que conviene después de US1.
- **US3** (Fase 5) necesita que existan síntomas guardados (US1, T013–T015) para probarse de punta a punta; T028 puede
  empezar en paralelo.
- **US4** (Fase 6) depende de US1 (rechazo en T013) y US3 (lectura en listado).
- **Pulido** al final; T035 necesita las pantallas de US1–US3.

### Dentro de cada historia

Backend antes que frontend cuando el frontend consume un campo nuevo; cada tarea de código con su prueba antes de
cerrar la historia.

## Oportunidades de Paralelismo

- Fase 2: T005/T006 (frontend) en paralelo con T003/T004 (backend) una vez creada la migración T002.
- US1: T008/T009 (catálogo) en paralelo con T012 (servicio); T017 (frontend del catálogo) en paralelo con el backend.
- US3: T028 (`SymptomChips`) en paralelo con T026/T027 (backend).
- Pulido: T036, T037, T038 en paralelo.

### Ejemplo en paralelo (US1)

```text
T008 catalog.ListSymptoms (backend/internal/catalog/repository.go)
T012 SymptomCodes en el servicio (backend/internal/consultation/service.go)
T017 fetchSymptoms + useSymptoms (frontend/src/shared/catalog/)
```

## Estrategia de Implementación

- **MVP**: Fases 1–3 (US1): síntomas elegibles y guardados. Útil sola, aunque el formulario seguiría diciendo "Síntomas"
  en el cuadro de texto, por eso US2 (pequeña) va inmediatamente después.
- **Incremental**: US2 → US3 → US4, cada una con sus pruebas y su punto de control; un solo PR al terminar el pulido.
