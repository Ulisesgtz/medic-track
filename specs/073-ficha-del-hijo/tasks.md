---
description: "Tareas de la spec 073 — Ficha de datos permanentes del hijo"
---

# Tareas: Ficha de datos permanentes del hijo

**Entrada**: `specs/073-ficha-del-hijo/` (spec, plan, research R1–R10, data-model, contracts/api.md, contracts/ui.md,
referencia/ con el mock de Claude Design)

**Pruebas**: obligatorias (Principio VI: > 90 % en Go y React; E2E a 390 y 1280 px).

**Organización**: US1 anotar y ver · US2 que la vea quien cuida · US3 PDF, descarga y borrado.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [X] T001 Migración `backend/migrations/0039_child_records.sql` según `data-model.md` (tres tablas, FK compuesta `(child_id, account_id)`, CHECKs de largo y de listas, `UNIQUE (child_id, position)`, índices por `account_id`, sin `ON DELETE CASCADE`); aplicarla en la base local

---

## Fase 2: Fundamental

- [X] T002 [P] `backend/internal/childrecord/validate.go` + `validate_test.go` (puro): reglas de R4 — nombres 1–120 tras `TrimSpace`, notas ≤ 300, nota general ≤ 1000, pediatra (nombre ≤ 120, teléfono ≤ 30 con solo dígitos, espacios, `+ - ( ) .`, consultorio ≤ 300), `bloodType` ∈ {`O+`,`O-`,`A+`,`A-`,`B+`,`B-`,`AB+`,`AB-`,`unknown`} o vacío, `kind` ∈ {`medication`,`food`,`other`} o vacío, topes 30/30; errores de campo por nombre (`allergies[2].name`) **sin el valor**; `Normalize` (trim, vacíos → nil) y `Equal` para «guardar sin cambios no cuenta»
- [X] T003 `backend/internal/childrecord/repository.go` + `repository_test.go`: `Get(ctx, childID)` (ficha + listas en orden + nombre de pila de quien actualizó) y `Save(ctx, childID, actor, input, expectedVersion)` en **una transacción**: `SELECT … FROM children WHERE id = $1 FOR UPDATE`, versión actual (0 sin ficha) ≠ esperada → `*ConflictError{Current}`; igual a lo guardado → devuelve lo guardado sin escribir; si no, upsert de `child_records` (`version + 1`, `updated_at = now()`, `updated_by_account_id = actor`) y reemplazo de las listas (borrar e insertar con `position`); nunca crea una ficha vacía si no existía. Pruebas: crear, editar, sin cambios, conflicto, dos guardados simultáneos (uno gana, el otro conflicto), topes, la ficha vacía
- [X] T004 `backend/internal/childrecord/handler.go` + `handler_test.go`: `GET /children/{childId}/record` y `PUT /children/{childId}/record` según `contracts/api.md` (respuesta con `exists`, `version`, `canEdit` = nivel Full, `updated {at, by}`); 400 `validation_error` con `httpx.ValidationBody`, 400 `invalid_request`, 409 `record_conflict` con `current` por `WriteJSONUnlogged`; todo por `*httpx.Responder`; anotaciones Swagger; `TestErrorLogsNeverCarryTheRecord` (textos reconocibles no llegan a `error_logs` en ningún error)
- [X] T005 Registrar en `backend/internal/server/router.go` (`r.With(seesChild).Get`, `r.With(fullChild).Put`), **nunca** bajo `/child-device`; filas en `routes()` de `router_test.go` y en los mapas de niveles (lectura: dueña, Tutor, Cuidador, Tutor vencido; escritura: dueña, Tutor de pago); `phoneRoutes` de `childdevice_router_test.go` **sin cambios** (la prueba confirma que el teléfono no la alcanza); wiring en `cmd/api/main.go`; Swagger regenerado con el comando del CI

**Punto de control**: el API de la ficha completo y probado.

---

## Fase 3: US1 — Anotar y ver la ficha (P1) 🎯 MVP

- [X] T006 [P] [US1] `frontend/src/features/childRecord/api.ts` (`fetchChildRecord`, `saveChildRecord` con `expectedVersion`, errores 400/409/403 tipados) y `hooks.ts` (`useChildRecord` con llave `['child-record', childId]`, `useSaveChildRecord` que escribe la respuesta en la caché) con pruebas
- [X] T007 [P] [US1] `frontend/src/features/childRecord/recordText.ts` (todos los textos del mock, la frase fija «Lo anotado es lo que la familia escribió y no sustituye la opinión de su médico», etiquetas de tipo y sangre) y `recordText.test.ts` (prueba de redacción: sin «riesgo», «peligro», «grave», «urgente», «Sin alergias», «Sin padecimientos»; sin clases rojas/ámbar en `features/childRecord` **salvo** el token `error` de los errores del formulario de edición); `callLink.ts` (`tel:` con solo dígitos y `+`) con prueba
- [X] T008 [US1] `ChildRecordSection` (estados A y B del mock, ambos diseños con `useIsDesktop`): grupos vacíos no se muestran, «Actualizada el … por Ana», «Llamar», «Editar ficha»/«Empezar la ficha» de contorno; montarla al final del cuerpo de `ChildDetailPage` junto a la Cartilla y como **última pastilla** de `SECTIONS`/`SectionIndex` («Ficha»); en web en la columna principal
- [X] T009 [US1] `EditChildRecordPage` en `/children/:childId/ficha/editar` (estado D del mock): `PageHeader` «← <nombre>», `fieldset`/`label`, pastillas de opción (tipo de alergia y sangre), «Subir»/«Bajar» de 44 px con nombre accesible, «Quitar» como texto, «Agregar» punteado, barra fija con «Cancelar»/«Guardar» en el teléfono, errores de campo con el **rojo del sistema** (token `error`, decisión del dueño, contracts/ui.md desviación 2), contador de caracteres, `useDiscardGuard` al salir con cambios; React Hook Form + `useFieldArray`; ruta en `App.tsx` y en `shared/clientErrors/routePatterns.ts`
- [X] T010 [US1] Estado D2 (tope de 30: «30 de 30», sin «Agregar», línea de explicación, «y 28 más» / «Ver las 30» en la vista) y estado E (conflicto: aviso `hint` con quién y a qué hora, «Ver la versión nueva» aparte sin cerrar el formulario, «Seguir editando»; guardar después usa la versión nueva)
- [X] T011 [US1] Sin conexión (R7): raíz `child-record` en `PERSISTED_ROOTS` de `shared/offline/persistPolicy.ts`; `privacy.test.ts` en verde; guardar sin conexión dice que necesita conexión (como el resto)

---

## Fase 4: US2 — Que la vea quien cuida (P2)

- [X] T012 [US2] Estado C del mock: con `canEdit: false` la tarjeta no muestra «Editar ficha» y sí la línea de que solo la familia edita; la ruta de edición para quien no puede editar muestra el aviso de solo lectura (o vuelve al detalle); pruebas de la sección y de la página con `canEdit` falso

---

## Fase 5: US3 — PDF, descarga y borrado (P3)

- [X] T013 [P] [US3] `backend/internal/accountdeletion/purge.go`: pasos de `child_record_allergies`, `child_record_conditions` y `child_records` por `account_id` (antes de `children`) y `UPDATE child_records SET updated_by_account_id = NULL WHERE updated_by_account_id = $1`; `TestPurge_KnowsEveryTable` en verde; prueba de que la ficha de un hijo ajeno editada por la cuenta borrada queda sin autor
- [X] T014 [P] [US3] `backend/internal/dataexport/collect.go`: `textTables` `ficha`, `ficha_alergias`, `ficha_padecimientos` (por `account_id`, entran también en `FamilyChildren`); pruebas en `export_test.go`
- [X] T015 [US3] `backend/internal/historyexport`: `sections.record` (por omisión `true`) y `record` en `documentResponse` (la ficha o `null`); pruebas; Swagger
- [X] T016 [US3] Frontend PDF: tipos en `features/pdfExport/types.ts`, casilla «Incluir la ficha» (activada de inicio) en el panel, y el bloque «Ficha» en `document/Cover.tsx` según el estado F (borde de tinta, antes del tratamiento y la cita, «Ficha» en «Secciones» y «Contenido», frase fija dentro, portada compactada a título 38 px y resumen 16 px para que quepa en una hoja); pruebas del documento

---

## Fase 6: Pulido

- [X] T017 E2E `frontend/e2e/ficha-del-hijo.spec.ts` (390 y 1280 px): la dueña llena y guarda (lo ve tal cual, «Actualizada … por»), edita y quita; un Cuidador ve sin editar y con «Llamar»; conflicto entre dos sesiones (aviso E); tope de 30; el PDF incluye la ficha; ningún texto de la ficha en `error_logs`. Correr con `scripts/e2e-local.sh e2e/ficha-del-hijo.spec.ts` (Chromium y WebKit)
- [X] T018 Medir contra el mock a 390 y 1280 px (A, B, C, D, D2, E y la portada F) y escribir `referencia/desviaciones.md`
- [X] T019 [P] Mapas: `CLAUDE.md` (fila de la spec 073), `backend/CLAUDE.md` (`internal/childrecord`, migración `0039`, purga y descarga), `frontend/CLAUDE.md` (`features/childRecord`); `BACKLOG.md`: ficha del titular (`/yo`), compartir por QR, arrastrar para reordenar en web, y los pendientes del dueño (aplicar la `0039` en DEV, aviso de privacidad)
- [X] T020 Correr todo como CI (`go test ./...` > 90 % en `internal`, `vitest --coverage`, `scripts/e2e-local.sh` de los specs tocados, `govulncheck`) y revisión de código final

---

## Dependencias

- T001 → T003. T002 ∥ T001. T003 → T004 → T005.
- US1 frontend (T006–T011) necesita el contrato (no el backend corriendo) y puede ir en paralelo al backend; T008–T010 usan los textos de T007.
- US3: T013 ∥ T014 ∥ T015 (archivos distintos) después de T001; T016 después de T015.
- T017–T018 al final de US1–US3; T020 al final.

## Estrategia

MVP = Fase 1–3 (anotar y ver). Luego US2 (casi gratis con `canEdit`) y US3. Un solo PR a `develop`. **La `0039` se
aplica en DEV antes del merge.**
