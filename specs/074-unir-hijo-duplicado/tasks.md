---
description: "Tareas de la spec 074 — Un hijo registrado dos veces al unirse a una familia"
---

# Tareas: Un hijo registrado dos veces al unirse a una familia

**Entrada**: `specs/074-unir-hijo-duplicado/` (spec, plan, research R1–R11, data-model, contracts/api.md,
contracts/ui.md, referencia/ con el prompt y, cuando llegue, el mock de Claude Design)

**Pruebas**: obligatorias (Principio VI: > 90 % en Go y React; E2E a 390 y 1280 px).

**Organización**: US1 unir al aceptar · US2 ocultar o conservar · US3 unir después desde «Familia».

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [X] T001 Migración `backend/migrations/0040_child_merge_and_hide.sql` según `data-model.md`: `children.hidden_at timestamptz NULL`; tabla `child_merges` (`id uuid PK`, `family_account_id uuid NOT NULL → accounts`, `target_child_id uuid NOT NULL` con FK `(target_child_id, family_account_id) → children(id, account_id)`, `source_account_id uuid NULL → accounts`, `merged_by_account_id uuid NULL → accounts`, `merged_at timestamptz NOT NULL DEFAULT now()`, `counts jsonb NOT NULL`, índice `(target_child_id)`, sin `ON DELETE`); soltar y recrear con el **mismo nombre** (tomado de `pg_constraint`) y `DEFERRABLE INITIALLY IMMEDIATE` las cuatro FK `consultation_symptoms → consultations(id, child_id)` (0012), `consultation_symptoms → consultations(id, account_id)` (0032), `consultation_appointments → consultations(id, child_id)` (0020) y `consultation_appointments → consultations(id, account_id)` (0032); aplicarla en la base local

---

## Fase 2: Fundamental

- [X] T002 [P] `backend/internal/childmerge/pairing.go` + prueba (puro): `SuggestPairs(own, family)` — normaliza sin acentos ni mayúsculas ni espacios extra; pareja si el nombre coincide y, cuando los dos tienen apellido, también el apellido; **nunca** usa la fecha; cada hijo de la familia y cada propio a lo más una vez (el primero en orden de alta); `Differences(own, family)` devuelve los campos distintos de `firstName`, `lastName`, `birthDate`, `height`, `weight`, `growthReferenceSex` y, si ambos tienen ficha, `bloodType`, `pediatrician` (nombre+teléfono+consultorio como bloque), `generalNote`
- [X] T003 [P] `backend/internal/childrecord`: función exportada para **fundir** fichas dentro de una transacción ajena (`MergeInto(ctx, tx, source, target, actor, choices)`): sin ficha en T se mueve la de S (insertar la de T con sus listas y borrar la de S, por la PK `child_id`); con las dos, alergias y padecimientos = T y luego S sin repetir los idénticos (nombre, tipo y nota tras `TrimSpace`), más de 30 → `ErrRecordTooLong{List, Resulting}`; sangre/pediatra/nota según `choices`; `version + 1`, `updated_by = actor`; pruebas con Postgres de los cuatro casos (ninguna, solo S, solo T, las dos) y el tope
- [X] T004 [P] `backend/internal/childdevice`: función para **quitar todos los accesos activos de un hijo** dentro de una transacción ajena (la misma lógica de «Quitar»: `revoked_at`, `revoked_by`, apagar sus `reminder_devices`), devuelve cuántos; prueba
- [X] T005 `backend/internal/childmerge/repository.go` + pruebas con Postgres: `Options(ctx, actor)` (hijos propios —visibles y ocultos— y de la familia con datos del registro, resumen de ficha y conteos; `canMerge` según `access` nivel `Full`; 404 `no_family`), `Preview(ctx, actor, pairs)` (diferencias, `moves`, `overLimits` —rutinas activas por tipo 10, fotos de cartilla 10, medidas 500, fotos de recetas 100 de la cuenta Y— y `recordTooLong`; sin escribir) y `Merge(ctx, actor, pair)` en **una transacción** siguiendo los pasos 1–9 de `data-model.md`: bloquear cuenta Y y las filas de S y T en orden de id; revisar `S.account_id = actor`, nivel `Full` sobre T, nadie en pausa; `SET CONSTRAINTS … DEFERRED`; quitar accesos del teléfono (T004); `UPDATE … SET child_id = T, account_id = Y WHERE child_id = S` en `consultations`, `consultation_symptoms`, `consultation_appointments`, `supplement_routines`, `vaccine_records`, `vaccine_card_photos`, `growth_measurements`, `child_device_links`; fundir la ficha (T003); escribir en T los datos elegidos (409 `birth_date_conflict` si la fecha elegida es posterior a una medida o vacuna ya unida); borrar S; insertar `child_merges` con conteos. Pruebas: todo se mueve con sus ids, autores, marcas «por Laura» y correcciones intactos; `choices_missing`; Cuidador y Tutor de familia vencida → `merge_not_allowed`; un error a la mitad no deja nada movido; una marca de toma simultánea se conserva; las tomas futuras de S avisan a Y y no a X (reclamo de `reminder`); un aviso ya enviado no se repite
- [X] T006 `backend/internal/childmerge/inventory_test.go`: `TestMerge_KnowsEveryChildTable` recorre `information_schema.columns` y falla si una tabla con columna `child_id` no está en la lista de la unión ni en una lista explícita de excluidas con motivo (`family_members`, `family_invitations`, tablas de avisos por toma…)
- [X] T007 `backend/internal/childmerge/handler.go` + `handler_test.go`: `GET /family/merge-options`, `POST /family/merges/preview`, `POST /family/merges` según `contracts/api.md` (cada pareja en su transacción, resultados por pareja; 400 `pairs` —vacía, más de 10, repetidos, mal formados—; errores esperados con `WriteJSONUnlogged`); todo por `*httpx.Responder`; Swagger; `TestErrorLogsNeverCarryChildData` (nombres e ids de hijo no llegan a `error_logs`)
- [X] T008 Registrar las tres rutas en `backend/internal/server/router.go` (con sesión, `RequireNotPending`, **no** en `AllowedWhilePending`, **nunca** bajo `/child-device`); filas en `routes()` de `router_test.go`; `phoneRoutes` sin cambios; wiring en `cmd/api/main.go`; Swagger regenerado

**Punto de control**: unir funciona por API y está probado.

---

## Fase 3: US1 — Unir al aceptar (P1) 🎯 MVP

- [X] T009 [P] [US1] `backend/internal/account`: cada hijo de las respuestas de cuenta trae `merges: [{at, byFirstName}]` desde `child_merges` (una consulta por cuenta, no por hijo); pruebas
- [X] T010 [P] [US1] `frontend/src/features/family/merge/api.ts` + `hooks.ts` (opciones, vista previa, unir; tras unir invalidar `['accounts','me']`, `['family']` y las llaves del hijo propio y borrar su copia sin conexión) y `pairing.ts` (la misma sugerencia del servidor, para mostrar) con pruebas
- [X] T011 [P] [US1] `frontend/src/features/family/merge/mergeText.ts` (todos los textos del mock; «Se llaman igual»; la advertencia; «No se pudo unir. No cambió nada.») y `mergeText.test.ts` (prueba de redacción: sin «el mismo niño», «correcto», «el bueno», «recomend», «felicidades», sin clases rojas/ámbar)
- [X] T012 [US1] **Con el mock**: `HowToContinuePage` en `/familia/como-seguir` (estado A y A2 sin «Unir» para Cuidador; cerrar = conservar ambas, no guarda nada); `InvitationPage` navega ahí tras aceptar si la cuenta tiene hijos propios y el rol es Tutor o Cuidador, si no a `/home` como hoy
- [X] T013 [US1] **Con el mock**: `MergeFlow` en `/familia/unir` — B parejas (selector por hijo propio, «No es ninguno», un hijo de la familia una vez), C datos distintos (ninguno elegido de inicio, «Continuar» deshabilitado), D resumen con conteos, advertencia, D2 topes, `recordTooLong` (con enlace a la ficha), «Descargar mis datos» (spec 070) y «Unir», E uniendo/listo/error; dos diseños con `useIsDesktop`; `RequireConnection`; rutas en `App.tsx` y `shared/clientErrors/routePatterns.ts`
- [X] T014 [US1] **Con el mock**: estado G — línea «Se unió el 3 dic con el registro de Laura» en el detalle del hijo (`features/childDetail/`), desde `merges`

---

## Fase 4: US2 — Ocultar o conservar (P2)

- [X] T015 [US2] `backend/internal/account`: `hidden_at` efectivo = `hidden_at IS NOT NULL` **y** la dueña es integrante activa (Tutor o Cuidador) de una familia; `GET /accounts/me` y `GET /accounts/{id}` sin los ocultos en `children` y con `hiddenChildren: [{id, firstName}]`; `firstUseGuide.ownChildren` sin ocultos; `PUT /accounts/{accountId}/hidden-children` (`ownsAccount`; reemplaza el conjunto, conserva la fecha de los que ya estaban; 409 `no_family` con lista no vacía sin familia activa; 400 `childIds` si uno no es suyo); **los ocultos siguen contando** en `AddChildIfUnderLimit` y en el tratamiento activo de la spec 030; ruta y filas en `router_test.go`; pruebas
- [X] T016 [P] [US2] `backend/internal/reminder` (`candidates.go`, `appointment.go`; revisar también suplementos/actividades): no avisar **a cuentas** de un hijo con ocultamiento efectivo; el teléfono del hijo (`child_device.go`) sigue avisando; al volver a mostrar no se mandan tarde las tomas pasadas; pruebas
- [X] T017 [P] [US2] `backend/internal/family/repository.go`: `Leave` y `RemoveMember` hacen `UPDATE children SET hidden_at = NULL WHERE account_id = <quien sale>` en su transacción; pruebas
- [X] T018 [US2] **Con el mock**: «Usar solo lo de la familia» en A llama a `PUT hidden-children` con todos los hijos propios; F (aviso de «Conservar ambas»); H «Hijos ocultos» en `AccountPage` con «Volver a mostrar»; la barra lateral, el inicio, «Tu día» y el selector de la spec 071 ya no ven a los ocultos (vienen fuera de `children`); pruebas

---

## Fase 5: US3 — Unir después desde «Familia» (P3)

- [X] T019 [US3] **Con el mock**: en `FamilyPage`, sección de la persona invitada con «Unir con un hijo de la familia» (solo `canMerge` y con hijos propios, visibles u ocultos) → `/familia/unir`, y «Ocultar mis hijos» / «Volver a mostrar»; nada de esto para Cuidador (sin unir), integrante Hijo ni la dueña; pruebas

---

## Fase 6: Pulido y transversales

- [X] T020 [P] `backend/internal/accountdeletion/purge.go`: `UPDATE child_merges SET source_account_id = NULL` / `merged_by_account_id = NULL` donde sea la cuenta borrada y `DELETE FROM child_merges WHERE family_account_id = $1` antes de `children`; `TestPurge_KnowsEveryTable` en verde
- [X] T021 [P] `backend/internal/dataexport/collect.go`: tabla `uniones` (fecha y conteos) en el ZIP de la cuenta dueña; prueba de que los hijos ocultos entran en la descarga
- [X] T022 E2E `frontend/e2e/unir-hijos.spec.ts` a 390 y 1280 px: aceptar → unir → un solo hijo con todo y la línea «Se unió…»; «Usar solo lo de la familia» → inicio sin hijos propios → «Volver a mostrar»; Cuidador sin «Unir»; correr con `scripts/e2e-local.sh e2e/unir-hijos.spec.ts` antes del push; ajustar E2E existentes de la invitación (`familia*.spec.ts`) que esperaban ir directo al inicio
- [X] T023 Comparar con el mock a 390 y 1280 px sección por sección y escribir `referencia/desviaciones.md`; completar `contracts/ui.md`
- [X] T024 Mapas: `CLAUDE.md` (línea de la spec 074), `backend/CLAUDE.md` (`internal/childmerge`, `hidden_at`, FK diferibles), `frontend/CLAUDE.md` (`features/family/merge/`); `BACKLOG.md` marcado hecho; pendientes del dueño (la `0040` en DEV antes del merge, aviso de privacidad)
- [X] T025 Correr todo: `cd backend && go test ./... -cover`, `cd frontend && npx vitest run --coverage` y `npx tsc -b`, y la suite E2E con `scripts/e2e-local.sh` — hecho 2026-11-18: backend completo en verde (91.2 %), vitest 2612 pruebas (97.5 %), tsc limpio; E2E: `unir-hijos` 8/8 y `familia`, `inicio`, `eliminar-cuenta` con `--workers=2` (con 4 workers fallan por la lentitud de Clerk al sembrar); la suite E2E completa la corre el CI

---

## Dependencias

- T001 antes de todo el backend. T002–T004 en paralelo; T005 depende de ellos; T006–T008 después de T005.
- US1 (T009–T014) depende de la Fase 2. US2 (T015–T018) solo de T001; puede ir en paralelo a US1 en el backend.
  US3 (T019) depende de T013 y T018.
- **Las tareas marcadas «Con el mock» (T012–T014, T018 en su parte visual, T019, T023) esperan el mock de Claude
  Design**; todo lo demás no.

## Ejemplo de ejecución en paralelo

- Backend: T002, T003 y T004 a la vez; después T016 y T017 a la vez con T009.
- Frontend: T010 y T011 a la vez en cuanto exista la Fase 2.

## Estrategia

1. MVP = Fases 1–2 + US1: unir de punta a punta (es el problema pedido).
2. US2 (ocultar) y US3 (unir después) como incrementos.
3. Fase 6 al final, con el E2E y la medición contra el mock.
