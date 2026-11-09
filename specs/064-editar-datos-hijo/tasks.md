---
description: "Lista de tareas: editar los datos del hijo (spec 064)"
---

# Tareas: Editar los datos del hijo

**Entrada**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md) (R1–R10), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)
**Rama**: `feature/064-editar-datos-hijo` — un commit por fase.
**Pruebas**: las pide la constitución (Principio VI): cobertura > 90 %, backend contra la base real, E2E a 390 y 1280 px.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[US1/US2/US3]**: historia de la spec

---

## Fase 1: Configuración

- [X] T001 Crear `backend/migrations/0035_child_corrections.sql`. Agrega a `children` las columnas `corrected_by_account_id UUID NULL REFERENCES accounts (id)` y `corrected_at TIMESTAMPTZ NULL`, con el `CONSTRAINT children_correction_together CHECK ((corrected_by_account_id IS NULL) = (corrected_at IS NULL))`. Lleva un comentario en español al inicio (spec 064; no cambia ningún dato).
- [X] T002 Aplicar la `0035` en la base local (`DATABASE_URL=postgres://root:abcd1234@localhost:5432/pediTrack?sslmode=disable`). Mostrar el SQL completo al usuario para que lo aplique en DEV antes del merge.

**Commit**: `feat(064): migración 0035 (quién corrigió al hijo)`

---

## Fase 2: Fundamental (backend; bloquea todo)

- [ ] T003 [P] En `backend/internal/account/service.go`, exportar la regla del nombre como `ValidateName(name string) string`. Hoy es `validateNameFormat`: solo letras con acentos y ñ, espacios, guiones y apóstrofes, 1–100 caracteres. Debe devolver el mensaje fijo de error o `""`. Actualizar los llamadores y las pruebas.
- [ ] T004 [P] En `backend/internal/account/model.go`, agregar a `Child` los campos `CorrectedAt *time.Time` y `CorrectedBy *string`. En `backend/internal/account/repository.go`, las 4 lecturas de `children` (líneas ~110, ~174, ~249, ~301) usan alias `c` y agregan `LEFT JOIN accounts kb ON kb.id = c.corrected_by_account_id`, escaneando `c.corrected_at` y `kb.first_name`. En `backend/internal/account/handler.go`, agregar a `childResponse` `CorrectedAt *string json:"correctedAt"` (RFC 3339) y `CorrectedBy *string json:"correctedBy"`, y llenarlos donde se arma la respuesta. Agregar pruebas en `repository_test.go` y `handler_test.go`: un hijo nunca corregido trae `null`; uno corregido trae la fecha y el nombre de pila.
- [ ] T005 [P] En `backend/internal/growth/repository.go`:
  - Agregar `InsertInTx(ctx, tx pgx.Tx, childID, accountID, actor uuid.UUID, c Cleaned) (*Measurement, error)`. Revisa el tope de `MaxPerChild` (500 → `ErrLimit`) y hace el insert. La fila del hijo ya debe estar bloqueada por quien llama.
  - `Create` bloquea con `SELECT account_id, birth_date … FOR UPDATE`. Si `c.MeasuredOn` queda antes de `birth_date`, devuelve el error de validación de «antes del nacimiento» (el mismo campo y mensaje que `Validate`). Luego llama a `InsertInTx`.
  - `Update` pasa a una transacción: bloquea el hijo con `SELECT birth_date FROM children WHERE id = $1 FOR SHARE`, hace la misma revisión y luego la actualización.
  - En `growth_test.go`: si el nacimiento cambia a una fecha posterior entre la validación y la escritura, el insert se rechaza.
- [ ] T006 [P] En `backend/internal/vaccination/repository.go`, `Create` y `Update` bloquean el hijo con `SELECT birth_date FROM children WHERE id = $1 FOR SHARE` al inicio de su transacción. Si `applied_on` queda antes de `birth_date`, devuelven el error de validación existente del campo de fecha («antes del nacimiento»). Agregar pruebas equivalentes a las de T005 en las pruebas de `vaccination`.
- [ ] T007 Crear `backend/internal/childprofile/model.go` y `errors.go`:
  - Modelo: `Input{FirstName, LastName, BirthDate string; Height, Weight *float64; Measurement *MeasurementInput{MeasuredOn string}}`.
  - Errores: `ErrNotFound`, `ErrPlanRequired`, `PlanLimitChildIdentity = "child_identity"`, `ConflictError{MeasurementCount, VaccinationCount int; Measurements, Vaccinations []string}` (fechas `YYYY-MM-DD` ascendentes, hasta 20 de cada una) y `ValidationErrors` con campos `firstName`, `lastName`, `birthDate`, `height`, `weight`, `measurement`, `measurement.measuredOn`, `measurement.weightKg` y `measurement.heightCm`, con mensajes fijos que nunca repiten lo escrito.
- [ ] T008 Crear `backend/internal/childprofile/validate.go`, puro:
  - Recorta el nombre y el apellido y los valida con `account.ValidateName`.
  - `birthDate` en formato `YYYY-MM-DD`, no posterior a mañana en UTC.
  - `height` y `weight` son `nil` o `> 0`.
  - Si viene `measurement`: al menos uno de `height` o `weight` no `nil`; si no, error en `measurement`. Valida con `growth.Validate` usando el nacimiento **nuevo** y `today` (rangos 0.3–200 kg y 30–220 cm, la fecha hasta mañana en UTC y no antes del nacimiento), y mapea sus errores a `measurement.*`.
  - Pruebas en `backend/internal/childprofile/validate_test.go` para cada regla.
- [ ] T009 Crear `backend/internal/childprofile/repository.go`, con `Update(ctx, childID, actor uuid.UUID, c Cleaned) (*account.Child, error)` en **una** transacción, usando solo `tx`:
  1. `SELECT c.account_id, c.first_name, c.last_name, c.birth_date, c.height::float8, c.weight::float8, a.plan FROM children c JOIN accounts a ON a.id = c.account_id WHERE c.id = $1 FOR UPDATE OF c`. Sin filas → `ErrNotFound`.
  2. Si cambia el nombre, el apellido o la fecha y `plan <> 'paid'` → `ErrPlanRequired`, sin escribir.
  3. Si la fecha cambia, buscar las medidas (`measured_on < $new`) y las vacunas (`applied_on < $new`) del hijo, ordenadas por fecha. Si hay alguna → `ConflictError` con los conteos totales y hasta 20 fechas de cada una.
  4. Si algún campo cambió → `UPDATE children SET …, corrected_by_account_id = $actor, corrected_at = now()`. Si nada cambió, no se escribe ni se sella.
  5. Si viene la medida → `growth.InsertInTx`, que puede devolver `growth.ErrLimit`.
  6. Releer el hijo con el autor de la corrección y hacer commit.
- [ ] T010 Crear `backend/internal/childprofile/service.go` (`Update` = validar con la fecha de hoy inyectable + repositorio) y `handler.go`:
  - `UpdateChild` para `PUT /children/{childId}`. Toma el actor de la sesión como los demás manejadores con `fullChild`.
  - Escribe **todo** por `*httpx.Responder`:
    - 200 con el `childResponse` de `account`. Si hace falta, exportar un armador `account.ChildResponseFrom(Child)` o mover el tipo para que los dos lo usen.
    - 400 `validation_error` con `fields`.
    - 404.
    - 409 `birth_date_conflict` con `measurementCount`, `measurements`, `vaccinationCount` y `vaccinations`.
    - 422 `freemium_consultation_limit_exceeded` con `reason: "child_identity"`.
    - 422 `growth_limit_exceeded`.
  - Comentarios de Swagger (`@Summary`, `@Param`, `@Success`, `@Failure`).
  - Los nombres y los valores nunca van en los mensajes que llegan a `error_logs`.
- [ ] T011 Crear `backend/internal/childprofile/childprofile_test.go`, contra la base real:
  - La talla y el peso en el plan gratuito.
  - Vaciar la talla.
  - Cambio de identidad en el plan gratuito → 422, sin cambiar nada; el peso que venía en la misma petición tampoco cambia.
  - La identidad en el plan de pago.
  - Mandar la misma identidad en el plan gratuito → 200.
  - Sin cambios → no se sella `corrected_*`.
  - Conflicto con medidas y con vacunas: conteos y fechas, sin escribir.
  - Una fecha anterior siempre pasa.
  - La casilla crea la medida.
  - La casilla con 250 kg → 400, sin escribir nada.
  - La casilla con 500 medidas → `ErrLimit`, sin escribir nada.
  - Un Tutor de familia de pago edita y queda su nombre como autor.
  - Concurrencia: una gorutina cambia el nacimiento a una fecha posterior mientras otra anota una medida anterior a esa fecha. Nunca queda una medida antes del nacimiento.
  - `error_logs` no contiene nombres ni valores.
  - Correr con y sin `pool_max_conns=4`.
- [ ] T012 Registrar `r.With(fullChild).Put("/children/{childId}", d.ChildProfile.UpdateChild)` en `backend/internal/server/router.go`, junto a las rutas del hijo y **nunca** en `/child-device`. Agregar `ChildProfile` a las dependencias.
  - En `backend/internal/server/router_test.go`, filas por rol: dueña 200, Tutor de familia de pago 200, Cuidador 403, Tutor de familia vencida 403, integrante Hijo 403, otra cuenta (el mismo resultado que las demás rutas `fullChild`), y una credencial del teléfono del hijo que no alcanza la ruta.
  - Cablear en `backend/cmd/api/main.go`.
- [ ] T013 Regenerar Swagger (`swag init`, el mismo comando que `backend/CLAUDE.md`) y correr `go vet ./...` y `go test ./... -cover`. La cobertura de `childprofile` debe ser > 90 %.

**Commit**: `feat(064): editar los datos del hijo — backend`

**Checkpoint**: la API cumple [contracts/api.md](contracts/api.md).

---

## Fase 3: Historia 1 - Corregir la talla y el peso del registro (P1) 🎯 MVP

**Objetivo**: desde el detalle del hijo, en cualquier plan, corregir y vaciar la talla y el peso, opcionalmente anotándolos como medida de hoy, y ver «Corregido el … por …».

**Prueba independiente**: con una cuenta del plan gratuito, corregir el peso con la casilla marcada, volver al detalle y ver el valor nuevo y «Corregido el …», y ver la medida en «Crecimiento».

- [ ] T014 [P] [US1] En `frontend/src/features/home/types.ts`, agregar a `Child` `correctedAt?: string | null` y `correctedBy?: string | null`.
- [ ] T015 [P] [US1] Crear `frontend/src/features/childProfile/api.ts`:
  - `updateChild(childId, body)` hace `PUT /children/{childId}` con el cliente existente.
  - Define `ChildProfileApiError` con los tipos `validation_error` (con `fields`), `birth_date_conflict` (con sus conteos y fechas), `plan_required`, `limit`, `forbidden` y `not_found`.
  - Crear `hooks.ts` con `useUpdateChild(childId)`. Al terminar invalida la cuenta (la clave que usa `useAccount`), `['growth', childId]`, `['growth-chart', childId]`, el resumen del hijo y la cartilla.
- [ ] T016 [P] [US1] Crear `frontend/src/features/childProfile/childProfileText.ts` con **todos** los textos:
  - Título «Editar datos», etiquetas, «Anotarlo también como medida de hoy», «Guardar cambios».
  - «Corregido el {fecha} por {nombre}» (fecha corta como en `growthText`).
  - Los errores fijos, el aviso del conflicto («Hay 2 medidas (3 mar 2022, 14 abr 2022) y 1 vacuna (10 mar 2022) anotadas antes de esa fecha. Corrígelas primero o elige otra fecha.»), la marca «Plan completo» y la frase para el Tutor.
  - Prueba de redacción en `childProfileText.test.ts` contra «normal», «bajo», «alto», «riesgo», «sobrepeso», «debería»…
- [ ] T017 [P] [US1] Crear `frontend/src/features/childProfile/editChildForm.ts`, puro:
  - Valores iniciales desde el `Child`.
  - Lectura de decimales con coma o punto.
  - `identityChanged(initial, values)` y `measuresChanged(initial, values)`.
  - El cuerpo del `PUT`: vacío → `null`; `measurement` solo con la casilla marcada, y `measuredOn` = hoy del teléfono `YYYY-MM-DD`.
  - Pruebas en `editChildForm.test.ts`.
- [ ] T018 [US1] Crear `frontend/src/features/childProfile/EditChildPage.tsx` (`/children/:childId/editar`), con dos diseños por `useIsDesktop` (sin clases `lg:`).
  - Usa el marco de las páginas de formulario (`RoutinePageFrame` + `PageHeader`) y `StickyActionBar` con «Guardar cambios» en el teléfono.
  - `useUnsavedWork` mientras haya cambios.
  - Campos: nombre, apellido, fecha (`max` = hoy del teléfono), talla (cm) y peso (kg) con `inputMode="decimal"`.
  - La casilla «Anotarlo también como medida de hoy» solo cuando `measuresChanged`.
  - Errores 400 por campo, incluidos los de `measurement.*` junto a la casilla. Si es `limit`, el aviso del tope.
  - Al guardar, `navigate` al detalle del hijo con `replace`.
  - Quien no tiene nivel completo (sin `canAdd`) ve el estado de solo lectura y no el formulario.
  - Sigue `specs/005-identidad-visual-front-end/design-tokens.md`.
- [ ] T019 [US1] En `frontend/src/App.tsx`, agregar la ruta `/children/:childId/editar` dentro de `RequireSession` y `AppShell`, como las de crecimiento.
- [ ] T020 [US1] En `frontend/src/features/childDetail/ChildDetailParts.tsx` (`MoreRows`), agregar la fila «Editar datos» (enlace a `/children/:childId/editar`) en los dos diseños, solo con `canAdd`. Su valor es «Corregido el … por …» si el hijo lo tiene. `ChildDetailPage.tsx` pasa el hijo o sus campos.
- [ ] T021 [US1] Agregar pruebas de `frontend/src/features/childProfile/EditChildPage.test.tsx` en ambos diseños:
  - Carga los valores.
  - Corrige y vacía.
  - La casilla aparece solo con cambios y manda `measurement`.
  - Muestra los errores 400 y el tope.
  - Navega al guardar.
  - Pide confirmar al salir con cambios.

  Agregar la fila en `ChildDetailPage.test.tsx`.

**Commit**: `feat(064): corregir talla y peso del hijo, con la casilla de medida`

---

## Fase 4: Historia 2 - Corregir el nombre y la fecha de nacimiento (P2)

**Objetivo**: con el plan completo, corregir la identidad. El plan gratuito ve los campos bloqueados con el aviso del plan, y una fecha que choca muestra cuáles registros lo impiden.

**Prueba independiente**: una cuenta de pago corrige el nombre y la fecha y los ve en el inicio y el detalle. Una cuenta gratuita ve «Plan completo». Una fecha posterior a una medida muestra el aviso con su fecha.

- [ ] T022 [P] [US2] En `frontend/src/features/account-signup/FreemiumLimitModal.tsx`, agregar `child_identity` a `PlanLimitReason`. En `frontend/src/features/plans/planCopy.ts`, agregar su fila de comparación («Corregir nombre y fecha de nacimiento»). Actualizar las pruebas del modal y de `planCopy`.
- [ ] T023 [US2] En `EditChildPage.tsx`:
  - Con el plan del hijo distinto de `paid`, el nombre, el apellido y la fecha van `disabled`, con la marca «Plan completo».
  - La dueña (`role` `owner`) abre `FreemiumLimitModal reason="child_identity"` al tocar la marca. Un Tutor ve en su lugar la frase fija de que la dueña de la familia tiene el plan.
  - Las reglas del nombre son las de `account-signup/validation.ts` (`nameValidation`, `nameError`).
  - El 422 `child_identity` del servidor abre el mismo modal sin perder lo escrito.
  - El 409 `birth_date_conflict` muestra el aviso bajo la fecha, con los conteos y las fechas formateadas.
- [ ] T024 [US2] Agregar pruebas en `EditChildPage.test.tsx`, ambos diseños:
  - Campos bloqueados en el plan gratuito.
  - El modal para la dueña y la frase para el Tutor.
  - Identidad editable en el plan de pago, con su cuerpo.
  - Error de nombre con dígitos.
  - El aviso del 409 con sus fechas.
  - El 422 abre el modal.

**Commit**: `feat(064): corregir nombre y fecha de nacimiento con el plan completo`

---

## Fase 5: Historia 3 - Quién puede editar (P2)

**Objetivo**: solo el nivel completo ve la entrada y el formulario; el servidor lo hace cumplir (T012).

- [ ] T025 [US3] En `ChildDetailPage.test.tsx` y `EditChildPage.test.tsx`: un Cuidador y un Tutor de familia vencida (`readOnly`) no ven «Editar datos», y si abren la dirección ven el estado de solo lectura sin formulario. Un Tutor de familia de pago sí edita, y ve «Corregido el … por Luis».

**Commit**: `feat(064): editar los datos del hijo — quién puede`

---

## Fase 6: Pulido

- [ ] T026 [P] Crear `frontend/e2e/editar-hijo.spec.ts` para 390 y 1280 px (`designs`), con los helpers de `frontend/e2e/helpers.ts` (`seedChild`, `setAccountPlan`, `secondPerson`, `inviteViaApi`, `acceptViaApi`). Casos:
  1. La dueña corrige el peso con la casilla y lo ve en el detalle y en «Crecimiento».
  2. La dueña de pago corrige el nombre y la fecha; el nombre nuevo se ve en el detalle.
  3. Una fecha posterior a una medida muestra el aviso.
  4. Plan gratuito: los campos bloqueados y el `PUT` directo con otro nombre → 422 `child_identity`.
  5. Un Cuidador no ve la fila y su `PUT` → 403.
- [ ] T027 [P] Documentación:
  - Nota en `specs/001-registro-cuenta-usuario/spec.md`, junto a FR-006a: la spec 064 la reemplaza, con la decisión del 2026-11-09 (la identidad solo con el plan completo; el hijo sigue sin borrarse).
  - Actualizar el comentario de `account.Child` en `backend/internal/account/model.go`.
  - Una entrada `specs/064-editar-datos-hijo/` en `CLAUDE.md`.
  - El paquete `internal/childprofile`, la migración `0035` y la revisión bajo bloqueo en `backend/CLAUDE.md`.
  - La sección `features/childProfile/` en `frontend/CLAUDE.md`.
  - Marcar «Editar los datos del hijo» como hecho en `BACKLOG.md`.
- [ ] T028 Verificación completa:
  - `go vet ./...`.
  - `go test ./... -cover`, con y sin `pool_max_conns=4`.
  - Swagger sin cambios después de regenerar.
  - `govulncheck ./...`.
  - `npx vitest run --coverage --testTimeout=30000 --maxWorkers=4` > 90 %.
  - `npm run build`, `npx eslint .`, `npx tsc -b`.
  - `npx playwright test --list`.
- [ ] T029 Correr `/code-review` sobre la rama, arreglar los hallazgos y volver a verificar.
- [ ] T030 Push, PR a `develop` con el SQL de la `0035` en «Antes del merge», y luego `get_status` y `set_monitor` del PR.

**Commit**: `feat(064): E2E, documentación y hallazgos del code review`

---

## Dependencias

- **Fase 1 → Fase 2 → Fases 3–5 → Fase 6.**
- En la Fase 2: T003–T006 son paralelas. T007 → T008 → T009 → T010 → T011 → T012 → T013.
- US1 (Fase 3) es el MVP. US2 y US3 tocan `EditChildPage.tsx` y van después de US1, en orden.
- T022 se puede hacer junto con la Fase 3 (archivos distintos).

## Ejemplos de paralelismo

- Fase 2: T003 (account) ‖ T005 (growth) ‖ T006 (vaccination), y T004 después de T003, porque comparten `account`.
- Fase 3: T014 ‖ T015 ‖ T016 ‖ T017, luego T018 → T019 → T020 → T021.
- Fase 6: T026 ‖ T027.

## Estrategia

1. **MVP**: Fases 1–3. La talla y el peso en todos los planes ya resuelven lo que la spec 001 dejaba pendiente.
2. Fase 4: la identidad con el plan completo.
3. Fase 5: los roles.
4. Fase 6: pulido.
5. Antes del merge, el dueño aplica la `0035` en DEV.
