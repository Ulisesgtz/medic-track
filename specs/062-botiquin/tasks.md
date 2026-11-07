# Tareas: Botiquín de la casa

**Entrada**: `specs/062-botiquin/` (spec.md, plan.md, research.md R1–R7, data-model.md, contracts/api.md, quickstart.md, referencia/)
**Pruebas**: obligatorias (Principio VI). Backend contra la base real con y sin `pool_max_conns=4`; frontend > 90 %; E2E a 390 y 1280 px.
**Commits**: uno por fase en `feature/062-botiquin`. Archivos CRLF: editar con scripts que preserven los finales de línea.
**Mock**: construir exactamente `referencia/Botiquín PediTrack.dc.html` (medidas en su sección «Medidas para construirlo»).

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [X] T001 Escribir `backend/migrations/0033_medicine_cabinet.sql`: tabla `medicine_cabinet_items` con las columnas y CHECK de data-model.md (`name` 1–120, `strength` ≤ 60, `quantity` 0–999, `unit IN ('box','tablet','bottle','ml')`, `expires_year` 2000–2100, `expires_month` 1–12, `expires_day` NULL o 1–31, `note` ≤ 500, `photo` BYTEA NULL, `updated_by_account_id`/`updated_at` juntos), índice `(account_id)`; aplicarla en la base local y **mostrar el SQL al dueño** para DEV
- [X] T002 Copiar el mock a `specs/062-botiquin/referencia/` (hecho) y anotar sus medidas en `specs/062-botiquin/referencia/medidas.md`

---

## Fase 2: Fundamental (backend, bloquea todo)

- [X] T003 [P] `backend/internal/cabinet/model.go` y `errors.go`: `Item`, `Expires{Year, Month, Day *int}`, `Units`, `ErrItemNotFound`, `ErrPlanRequired`, `ErrLimit`, `MaxItems = 200`
- [X] T004 [P] `backend/internal/cabinet/validate.go` (puro): recorta y valida nombre/concentración/nota/cantidad/unidad/fecha (día válido para su mes con `time.Date`), mensajes fijos en español por campo; `DecodePhoto` (base64, `imagecheck.LooksLike`, ≤ 5 MiB) + `validate_test.go`
- [X] T005 `backend/internal/cabinet/repository.go`: `List(account)` (orden por el `fold` sin acentos, nombres de pila de quién agregó/editó, `has_photo`), `Get`, `Create` (tx: fila de la cuenta `FOR UPDATE`, `plan = 'paid'` o `ErrPlanRequired`, tope o `ErrLimit`), `Update` (foto `nil` = igual, vacío = quitar; sella `updated_*`), `Delete`, `Photo`; todo en `tx` dentro de la transacción
- [X] T006 `backend/internal/cabinet/service.go` y `handler.go` (+ Swagger, todo por `*httpx.Responder`, 8 MiB de cuerpo): las seis rutas del contrato, `canEdit` (nivel Full) y `canAdd` (Full + dueña `paid`) en la lista y el detalle, 422 `freemium_consultation_limit_exceeded` `reason: "medicine_cabinet"` y `cabinet_limit_exceeded`
- [X] T007 Rutas en `backend/internal/server/router.go` (`seesAccount` nuevo = `RequireAccess(…, access.Mark, OnAccount)`; `fullAccount`), `server.Deps.Cabinet`, cableado en `backend/cmd/api/main.go`; filas por rol en `backend/internal/server/router_test.go` (dueña, Tutor, Cuidador, Tutor de familia vencida, extraño); ninguna bajo `/child-device`
- [X] T008 Pruebas contra la base real en `backend/internal/cabinet/*_test.go`: CRUD, orden alfabético sin acentos, plan gratuito (422), tope de 200 con altas simultáneas, editar y quitar con el plan vencido, item de otra familia (404), foto (validación, quitar, ausente = igual), `error_logs` sin nombre ni nota; con y sin `pool_max_conns=4`; cobertura > 90 %
- [X] T009 Regenerar Swagger en `backend/internal/docs/`, `go vet ./...`

**Punto de control**: commit «feat(062): botiquín — backend».

---

## Fase 3: Historia 1 - Anotar las medicinas (P1) 🎯 MVP

- [X] T010 [P] [US1] `frontend/src/features/medicineCabinet/types.ts`, `api.ts` (+ `api.test.ts`; `CabinetApiError` con `plan_required`, `limit`, `validation_error`, `not_found`, `forbidden`) y `hooks.ts` (`['cabinet', ownerId]`, `['cabinet-item', id]`, `['cabinet-photo', id]`, mutaciones que invalidan)
- [X] T011 [P] [US1] `cabinetText.ts` (todas las frases del mock) + `cabinetText.test.ts` (prohíbe «caducad», «vencid», «se puede usar», «no usar», «tirar», «urgente», «alerta», «debes») y `expiresText.ts` («Caduca: mar 2027» / «12 mar 2027») + prueba
- [X] T012 [P] [US1] `cabinetAccess.ts` (`ownerId = family?.ownerAccountId ?? id`, `canView`, `canAdd`, `canEdit`, `isFree`) + prueba
- [X] T013 [US1] `CabinetPage.tsx` (lista: encabezado, buscador sin acentos, conteo «7 medicamentos» / «2 de 7 medicamentos», filas del mock en teléfono y web, cargando con esqueletos, vacío, sin resultados, «+ Agregar al botiquín» único sólido) + `CabinetRow.tsx`, con pruebas
- [X] T014 [US1] `CabinetFormPage.tsx` en modo agregar (a mano: nombre, concentración, cantidad + chips de unidad, caducidad mes/año/día, nota; `StickyActionBar` en el teléfono, botones a la derecha en la web; `useUnsavedWork`; errores del servidor por campo) con pruebas
- [X] T015 [US1] `CabinetItemPage.tsx` (detalle: datos, «Agregado por Ana · 6 nov», «Editada…» si aplica; «No se encontró este medicamento.») con pruebas
- [X] T016 [US1] Rutas `/botiquin`, `/botiquin/nuevo`, `/botiquin/:itemId`, `/botiquin/:itemId/editar` en `frontend/src/App.tsx` (`RequireSession` + `AppShell`)
- [X] T017 [US1] `CabinetEntry.tsx`: la fila «Checa tus medicamentos» del inicio bajo «Tus hijos» (teléfono y web) en `features/home/HomePage.tsx`, y «Botiquín» en el grupo Familia de `features/home/ChildrenSidebar.tsx`, con pruebas

**Punto de control**: commit «feat(062): botiquín — lista, formulario y detalle».

---

## Fase 4: Historia 2 - La foto propone los datos (P2)

- [X] T018 [P] [US2] `parseMedicineText.ts` (puro, research R4) + `parseMedicineText.test.ts` con textos reales de cajas
- [X] T019 [US2] En `CabinetFormPage.tsx`: elegir foto **sin `capture`** («Tomar foto» / «Elegir de la galería» en el teléfono, «Elegir foto» en la web), `shrinkPhoto`, `useOcrSuggestion`, estados leyendo / leído («Leído de tu foto · revísalo», campos con borde 2 px action y fondo hint) / sin texto, «Cambiar foto»; solo llena campos vacíos; nunca la cantidad
- [X] T020 [US2] En `CabinetItemPage.tsx`: la foto (350×240 teléfono, 360×440 web) que abre `PhotoViewer label="Foto de la caja"`; miniaturas 56×56 en la lista

**Punto de control**: commit.

---

## Fase 5: Historia 3 - Corregir y quitar (P3)

- [X] T021 [US3] `CabinetFormPage.tsx` en modo editar (`/botiquin/:itemId/editar`, valores guardados, la foto se queda si no se cambia) y «Editar» con contorno en el detalle
- [X] T022 [US3] «Quitar del botiquín» (texto) con `ConfirmDialog` («¿Quitar Paracetamol infantil?» / «Se quita del botiquín de la familia. No se puede deshacer.»), regreso a la lista

**Punto de control**: commit.

---

## Fase 6: Historia 4 - Agregar desde una consulta (P3)

- [X] T023 [US4] `AddToCabinetLink.tsx` en `features/consultations/MedicationCard.tsx` (botón de texto con ícono, 44 px, bajo el nombre en el teléfono y a su derecha en la web; solo con `canAdd`), que navega a `/botiquin/nuevo` con `{ name, consultDate, doctor, consultationId }` en el **estado del router**
- [X] T024 [US4] El formulario lee ese estado: «Desde la consulta del 18 oct · Dra. … El nombre viene de la receta; puedes cambiarlo.», etiqueta «De la receta», «← Consulta»; pruebas para la consulta de un hijo y la propia

**Punto de control**: commit.

---

## Fase 7: Historia 5 - Plan y Cuidador (P2)

- [X] T025 [US5] Motivo `medicine_cabinet` en `features/account-signup/FreemiumLimitModal.tsx` y `features/plans/planCopy.ts`; la fila del inicio y «+ Agregar» con plan gratuito abren el aviso; el 422 del servidor también, sin perder lo escrito
- [X] T026 [US5] Vista de Cuidadora en lista y detalle (nota del mock, sin botones) y plan vencido (ver, editar y quitar; agregar abre el aviso), con pruebas

**Punto de control**: commit.

---

## Fase 8: Pulido

- [X] T027 E2E `frontend/e2e/botiquin.spec.ts` (Chromium, 390 y 1280 px): dueña agrega a mano y busca; editar y quitar; atajo desde una consulta; Tutor y Cuidador (dos sesiones; el Cuidador recibe 403 del API); plan gratuito
- [X] T028 Medir la app contra el mock a 390 y 1280 px y escribir `specs/062-botiquin/referencia/desviaciones.md`
- [X] T029 [P] Docs: `CLAUDE.md` (raíz), `backend/CLAUDE.md` (paquete, rutas, migración 0033), `frontend/CLAUDE.md`, `BACKLOG.md` (marcar el botiquín hecho; dejar lo de fuera)
- [X] T030 Verificación: `go vet`, `go test ./...` con y sin `pool_max_conns=4`, Swagger sin cambios, `govulncheck`, `npx vitest run --coverage`, `npx tsc -b`, `npm run build`, `npx eslint .`, `npx playwright test --list`
- [X] T031 `/code-review`, push y PR a `develop` (ccd_pr `get_status` + `set_monitor`); recordar al dueño aplicar la `0033` en DEV; no fusionar

---

## Dependencias

- Fase 1 → Fase 2 → US1 (MVP) → US2, US3, US4 y US5 (tocan archivos de US1, en ese orden) → Pulido.
- Paralelo: T003/T004; T010/T011/T012; T018 junto con lo de US1; T029 con T027.

## Estrategia

MVP = Fases 1–3 (botiquín a mano, compartido). Luego la foto (US2), corregir/quitar (US3), el atajo (US4) y el plan/Cuidador (US5).
