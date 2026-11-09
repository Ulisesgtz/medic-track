# Tareas: Curvas de crecimiento

**Entrada**: `specs/063-curvas-crecimiento/` (spec.md, plan.md, research.md R1–R8, data-model.md, contracts/api.md, quickstart.md)
**Pruebas**: obligatorias (Principio VI). Backend contra la base real con y sin `pool_max_conns=4`; frontend > 90 %; E2E a 390 y 1280 px.
**Commits**: uno por fase en `feature/063-curvas-crecimiento`. Archivos CRLF existentes: editar con scripts que preserven los finales de línea.
**Sin mock**: sistema visual (`specs/005-identidad-visual-front-end/design-tokens.md`), dos diseños con `useIsDesktop`.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [X] T001 Escribir `backend/migrations/0034_growth_measurements.sql`: tabla `growth_measurements` (`id`, `child_id` + `account_id` con FK compuesta a `children (id, account_id)`, `measured_on DATE NOT NULL`, `weight_kg NUMERIC(5,2) NULL` CHECK 0.3–200, `height_cm NUMERIC(4,1) NULL` CHECK 30–220, CHECK al menos uno, `note` NULL 1–300, `created_by_account_id`/`created_at`, `corrected_by_account_id`/`corrected_at` juntos), índice `(child_id, measured_on DESC, created_at DESC)`, y `ALTER TABLE children ADD COLUMN growth_reference_sex TEXT NULL CHECK (growth_reference_sex IN ('female','male'))`; aplicarla en la base local y **mostrar el SQL al dueño** para DEV
- [X] T002 Obtener las tablas de percentiles de la OMS (peso para la edad 0–60 y 61–120 meses, talla para la edad 0–60 y 61–228 meses, niñas y niños; columnas P3, P15, P50, P85, P97) y escribir `backend/tools/whogrowth/convert.py` (Go no lee Excel sin una dependencia) que genere `backend/internal/growth/whodata_gen.go` (mensual, con la cita de la fuente en la cabecera; sin LMS). Si la descarga no es posible, pedir los Excel al dueño y dejar la tarea marcada como bloqueada

**Punto de control**: commit «feat(063): migración 0034 y referencia de la OMS».

---

## Fase 2: Fundamental (backend, bloquea todo)

- [X] T003 [P] `backend/internal/growth/model.go` y `errors.go`: `Measurement`, `Input`, `Registered`, `MaxPerChild = 500`, `ErrMeasurementNotFound`, `ErrLimit`, `ValidationErrors`, `PlanLimitGrowthChart = "growth_chart"`
- [X] T004 [P] `backend/internal/growth/validate.go` (puro) + `validate_test.go`: fecha ≤ mañana del servidor (como la cartilla) y ≥ nacimiento, peso 0.3–200 con 2 decimales, talla 30–220 con 1 decimal, al menos uno, nota recortada ≤ 300 (vacía = nil), mensajes fijos en español por campo sin juicios
- [X] T005 [P] `backend/internal/growth/reference.go` + prueba: `Reference(sex, indicator)` devuelve las curvas de `whodata_gen.go`; `MonthsBetween(birth, date)` = días / 30.4375; puntos de prueba contra valores publicados (SC-004)
- [X] T006 `backend/internal/growth/repository.go`: `List(childID)` (orden, nombres de pila de autor y corrector), `Registered(childID)`, `ReferenceSex`/`SetReferenceSex`, `Create` (tx: fila del hijo `FOR UPDATE`, tope 500 o `ErrLimit`, solo `tx`), `Update` (sella `corrected_*`; 404 si no es de ese hijo), `Delete`, `BirthDate`
- [X] T007 `backend/internal/growth/service.go` y `handler.go` (+ Swagger, todo por `*httpx.Responder`, cuerpo ≤ 16 KiB): las seis rutas de `contracts/api.md`; `canEdit` (Full) y `chartAvailable` (plan de la dueña) en la lista; la gráfica llama primero a `consultation.Repository.RequirePaid(childID, "growth_chart")` → 422 sin datos; `reference` null sin sexo, `available=false` sin `WHO_GROWTH_REFERENCE_ENABLED`; ningún valor ni nota en `error_logs`
- [X] T008 Rutas en `backend/internal/server/router.go` (`seesChild` para los GET, `fullChild` para POST/PUT/DELETE y `growth-reference`), `server.Deps.Growth`, cableado y la variable en `backend/cmd/api/main.go`; filas por rol en `backend/internal/server/router_test.go` (dueña, Tutor de familia de pago, Tutor de familia vencida, Cuidador, integrante Hijo, extraño); ninguna bajo `/child-device`
- [X] T009 Pruebas contra la base real en `backend/internal/growth/*_test.go`: CRUD, orden, fecha futura/antes del nacimiento, valores fuera de rango, ninguno de los dos, tope de 500 con altas simultáneas, medida de otro hijo (404), plan gratuito anota/corrige/borra pero la gráfica da 422 sin datos, sin sexo → `reference` null, interruptor apagado → sin curvas, `registered` del hijo, `error_logs` sin valores ni nota; con y sin `pool_max_conns=4`; cobertura > 90 %
- [X] T010 Regenerar Swagger en `backend/internal/docs/`, `go vet ./...`

**Punto de control**: commit «feat(063): curvas de crecimiento — backend».

---

## Fase 3: Historia 1 - Anotar el peso y la talla (P1) 🎯 MVP

- [ ] T011 [P] [US1] `frontend/src/features/growth/types.ts`, `api.ts` (+ prueba; `GrowthApiError` con `plan_required`, `limit`, `validation_error`, `not_found`, `forbidden`) y `hooks.ts` (`['growth', childId]`, `['growth-chart', childId]`, mutaciones que invalidan ambas)
- [ ] T012 [P] [US1] `growthText.ts` (todas las frases) + `growthText.test.ts` (prohíbe «normal», «bajo», «alto», «riesgo», «sobrepeso», «desnutri», «obes», «por debajo», «por encima», «debería», «percentil de») y `growthAge.ts` («6 semanas», «7 meses», «1 año 5 meses», «4 años 2 meses») + prueba
- [ ] T013 [P] [US1] `growthForm.ts` (valores, coma o punto decimal, validación igual al servidor, cuerpo del POST/PUT, `isDirty`) + prueba
- [ ] T014 [US1] `GrowthPage.tsx` (`/children/:childId/crecimiento`, `PageHeader`): lista de la más reciente a la más antigua con fecha, edad, peso, talla y nota; estado vacío; el bloque del registro sin fecha con «Anotarla con fecha»; «Anotar medida» para `canEdit`; teléfono y web separados; pruebas
- [ ] T015 [US1] `GrowthFormPage.tsx` (`/children/:childId/crecimiento/nueva`): fecha, peso, talla, nota; `StickyActionBar` en el teléfono; `useUnsavedWork`; errores del servidor por campo; 422 de tope con una frase; pruebas
- [ ] T016 [US1] `GrowthSection.tsx` en el detalle del hijo (`features/childDetail/`, teléfono y web, en el índice junto a Cartilla): «Última: 12.4 kg · 86 cm, 3 nov» o «Aún no hay medidas»; rutas en `frontend/src/App.tsx` (`RequireSession` + `AppShell`); pruebas

**Punto de control**: commit «feat(063): crecimiento — anotar y ver la lista».

---

## Fase 4: Historia 2 y 3 - La curva y la tabla de la OMS (P2)

- [ ] T017 [US2] `GrowthChart.tsx` (SVG propio): eje de edad (meses hasta 24, años después), eje kg/cm, ventana y «Ver todo», cinco curvas grises rotuladas P3…P97, puntos `action` unidos y tocables (44 px) con «fecha · valor · edad», nota del límite de la referencia, texto fijo de FR-009 y la fuente; tabla alternativa debajo; teléfono 260 px de alto y web 720×360; pruebas
- [ ] T018 [US2] En `GrowthPage.tsx`: «Ver la curva» con «Peso» / «Talla»; plan gratuito → marca «Plan completo» y `FreemiumLimitModal reason="growth_chart"` (motivo nuevo en `features/account-signup/FreemiumLimitModal.tsx` y `features/plans/planCopy.ts`); 422 del servidor también abre el aviso; `available=false` → solo los puntos y «La referencia de la OMS aún no está disponible»; pruebas
- [ ] T019 [US3] Elección «Niña · Niño» en la gráfica cuando falta (`PUT …/growth-reference`), cambiarla después; Cuidador ve los puntos sin curvas y la frase de que una persona adulta la elige; pruebas

**Punto de control**: commit «feat(063): crecimiento — la gráfica».

---

## Fase 5: Historia 4 - Corregir y quitar (P3)

- [ ] T020 [US4] `GrowthFormPage.tsx` en modo editar (`/children/:childId/crecimiento/:measurementId/editar`) y «Corregida el … por …» en la fila; «Quitar» con `ConfirmDialog` neutral; sin botones para Mark; pruebas

**Punto de control**: commit.

---

## Fase 6: Pulido

- [ ] T021 E2E `frontend/e2e/crecimiento.spec.ts` (Chromium, 390 y 1280 px): anotar y ver en la lista; plan gratuito → aviso del plan; plan completo → elegir la tabla y ver la gráfica; corregir y quitar; Cuidador sin botones (403 del API). Usar `getByLabel(…, { exact: true })`
- [ ] T022 [P] Docs: `CLAUDE.md` (raíz), `backend/CLAUDE.md` (paquete, rutas, migración 0034, `WHO_GROWTH_REFERENCE_ENABLED`), `frontend/CLAUDE.md`, `DEPLOY.md` (la variable), `BACKLOG.md` (curvas hechas; pendientes: permiso de la OMS, gráfica en el PDF, perímetro cefálico)
- [ ] T023 Verificación: `go vet`, `go test ./...` con y sin `pool_max_conns=4`, Swagger sin cambios, `govulncheck`, `npx vitest run --coverage`, `npx tsc -b`, `npm run build`, `npx eslint .`, `npx playwright test --list`; ver la pantalla en el navegador local a 390 y 1280
- [ ] T024 `/code-review`, push y PR a `develop` (ccd_pr `get_status` + `set_monitor`); recordar al dueño aplicar la `0034` en DEV y pedir el permiso de la OMS; no fusionar

---

## Dependencias

- Fase 1 → Fase 2 → US1 (MVP) → US2/US3 (misma pantalla) → US4 → Pulido.
- T002 solo bloquea la gráfica con curvas (T017); el resto avanza sin ella.
- Paralelo: T003/T004/T005; T011/T012/T013; T022 con T021.

## Estrategia

MVP = Fases 1–3: el historial de medidas en cualquier plan (sustituye la libreta). Luego la gráfica del plan completo con la
referencia de la OMS (detrás del interruptor hasta tener el permiso) y al final corregir y quitar.
