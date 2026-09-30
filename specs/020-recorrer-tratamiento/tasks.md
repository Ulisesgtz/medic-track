---

description: "Lista de tareas de la spec 020: recorrer el tratamiento y marcar inicio y fin en el calendario"
---

# Tareas: Recorrer el tratamiento y marcar inicio y fin en el calendario

**Entrada**: `/specs/020-recorrer-tratamiento/` (plan.md, spec.md, research.md, data-model.md, contracts/medication-extend.md, quickstart.md)

**Pruebas**: obligatorias (Principio VI): >90 % en Go y React y Playwright a 390 y 1280 px.

**Organización**: US1 (recorrer, P1) necesita backend y frontend; US2 (calendario con inicio y fin, P1) es solo frontend y
no depende de US1 (con el recorrido el fin se mueve solo).

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [X] T001 Línea base: `cd backend && go test ./internal/... -cover` y `cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx vitest run` en verde

## Fase 2: US1 - Backend (base de recorrer)

- [X] T002 [US1] Crear `backend/migrations/0014_create_medication_extensions.sql` (tabla `medication_extensions` y columnas `added_by_extension_id` y `covered_by_extension_id` en `doses`, como en `data-model.md`) y aplicarla a la BD local
- [X] T003 [US1] `backend/internal/consultation/model.go`, `errors.go`, `service.go`: `Dose.Covered`, `Medication.ExtendableDoses` y `Medication.Extensions` (`Extension{CreatedAt, ProposedDoses, AddedDoses}` con `Manual()`), `ErrNothingToExtend`, `MaxExtensionDoses = 60`; `Service.ExtendTreatment(ctx, consultationID, medicationID, doses)` valida 1–60 (`ValidationErrors`, campo `doses`) antes de llamar al repositorio
- [X] T004 [US1] `backend/internal/consultation/repository.go`: `GetByID` lee `covered_by_extension_id` y los recorridos de cada medicamento y calcula `ExtendableDoses` (tomas `unregistered` sin cubrir, en medicamentos sin `ended_at`); `ExtendTreatment` en una transacción: `SELECT … FOR UPDATE` del medicamento de esa consulta (`ErrMedicationNotFound`), `ErrNothingToExtend` si está finalizado o no hay por recorrer, inserta el recorrido (cuenta dueña por `children.account_id`, propuesto calculado, confirmado pedido), marca como cubiertas todas las tomas sin registrar y agrega las N tomas en `max(scheduled_at) + k × frecuencia` con `added_by_extension_id`; devuelve el medicamento actualizado con un solo reloj (`r.now()`)
- [X] T005 [US1] `backend/internal/consultation/handler.go`: `POST …/extend` con `*httpx.Responder` (200 medicamento, 400 `validation_error` / `nothing_to_extend`, 404 `medication_not_found`; UUID mal formado → 404), `extendableDoses` y `extensions` (`createdAt`, `proposedDoses`, `addedDoses`, `manual`) en `medicationResponse` (detalle, alta, `end`, `extend`) y anotaciones Swagger
- [X] T006 [US1] `backend/internal/server/router.go`: registrar la ruta con `ownsConsultation` y una fila en `router_test.go` (401 sin sesión, 403 de otra cuenta, dueño llega al handler)
- [X] T007 [P] [US1] Pruebas `backend/internal/consultation/extend_test.go` (BD real): propone exactamente las sin registrar; agrega N al final con la frecuencia, las originales no cambian; número distinto del propuesto queda `manual`; un segundo intento y dos llamadas en paralelo no duplican (`nothing_to_extend`); cubiertas no vuelven a proponerse y las nuevas sin registrar sí; finalizado o sin por recorrer → `nothing_to_extend`; 1, 60 válidos y 0, 61 y ausente `validation_error`; otro medicamento o consulta → 404; las tomas nuevas nacen `pending`, cuentan en el progreso y mueven «termina el…» del resumen (`GetOverview`); `ClaimDueDoses` las reclama cuando vencen; registro con la cuenta correcta
- [X] T008 [US1] Regenerar Swagger (`go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd`), `gofmt` del código nuevo, `go vet` y `go test ./internal/... -cover` (>90 %)

**Punto de Control**: el backend recorre un medicamento una sola vez por las mismas tomas y deja el registro.

## Fase 3: US1 - Frontend

- [ ] T009 [US1] `frontend/src/features/consultations/types.ts`, `api.ts`, `useExtendTreatment.ts`: `Medication.extendableDoses` y `extensions`, `extendTreatment(consultationId, medicationId, doses, token)` (`POST …/extend`; 404 → `medication_not_found`, 400 `nothing_to_extend` → kind `nothing_to_extend`, `validation_error`), mutación que invalida `['consultation', id]` y `['overview']`; actualizar fixtures
- [ ] T010 [US1] Crear `ExtendTreatmentDialog.tsx` (portal, `role="dialog"`, `aria-modal`, Escape y fondo cancelan salvo mientras se envía, foco inicial en «Cancelar», Tab circula campo → Cancelar → Sí, recorrer, foco vuelve al botón): campo numérico «Tomas a agregar» con el número propuesto, «Quedaría hasta el …» recalculado con el número (última toma + N × frecuencia, hora local), la pregunta «¿Tu médico te indicó reponer las tomas?», el aviso de registro e irreversibilidad, la nota «Cambiaste el número propuesto: quedará registrado que lo ingresaste tú manualmente.» solo si difiere, error del campo y botón deshabilitado con un valor que no sea entero de 1 a 60
- [ ] T011 [US1] `MedicationCard.tsx`: botón «Recorrer tratamiento» de contorno junto a «Finalizar tratamiento» solo con `extendableDoses > 0` y sin finalizar; con `nothing_to_extend` cierra el diálogo y refresca; línea «Se recorrió el 30 sep · +2 tomas» (+ « · número ingresado manualmente») con el último recorrido
- [ ] T012 [US1] Pruebas `ExtendTreatmentDialog.test.tsx`, `MedicationCard`/`ConsultationDetailPage.test.tsx` y `api.test.ts`: botón según `extendableDoses` y finalizado; diálogo propone el número; cambiar el número muestra la nota y actualiza «hasta cuándo»; 0, 61, vacío y decimal deshabilitan; confirmar llama al endpoint con el número y cierra; cancelar/Escape/fondo no cambian nada, y ocupado no se cierra; `nothing_to_extend` se trata como hecho; error del servidor; la línea de la tarjeta con y sin «manual»
- [ ] T013 [US1] E2E `frontend/e2e/recorrer-tratamiento.spec.ts` (390 y 1280 px): consulta de hace 2 días con tomas sin registrar → botón, diálogo con el número propuesto, recorrer con el propuesto → línea «Se recorrió…», botón fuera, «termina el…» movido; otro con número distinto → nota y «número ingresado manualmente»; «Cancelar» no cambia nada

**Punto de Control**: el padre recorre un tratamiento en 2 toques, o con su propio número, y queda registrado.

## Fase 4: US2 - Calendario con inicio y fin

- [ ] T014 [US2] `treatmentDays.ts`: `medicationDays(medication)` (días con al menos una toma dentro de `medicationRange`), `marksOn` devuelve `{ number, role }` con `role` = `start` / `end` / `both` / `mid` (solo días con tomas), y el nombre accesible del día («inicio de …», «fin de …», «inicio y fin de …»); pruebas de `treatmentDays.test.ts` (frecuencia de 48 h sin marca en el día sin toma, un solo día = `both`, finalizado termina en el último día con tomas no canceladas, recorrido mueve el fin y cruza de mes)
- [ ] T015 [US2] `TreatmentCalendar.tsx`: inicio y fin como círculo relleno del color con el número en blanco (13 px), intermedios como número en color, nombre accesible con el rol; pruebas en `TreatmentCalendar.test.tsx` y ajuste de `e2e/calendario-tratamiento.spec.ts` a los nuevos nombres; color nunca como único indicador

**Punto de Control**: el padre ve el inicio y el fin de cada medicamento en el calendario.

## Fase 5: Pulido

- [ ] T016 Diseño: capturas del botón, el diálogo (con y sin nota), la línea de la tarjeta y el calendario con inicio y fin en 390 y 1280 px (1 y 3 medicamentos); contraste ≥ 4.5:1; mostrarlas al usuario para aprobarlas
- [ ] T017 [P] Documentación: `CLAUDE.md` (feature 020), `backend/CLAUDE.md` (tabla, columnas, endpoint, `extendableDoses`), `frontend/CLAUDE.md` (diálogo, botón, calendario con roles), `specs/004-detalle-consulta-hijo/spec.md` (segunda excepción a FR-014: se agregan tomas), `specs/007` (desviación), `specs/019` (nota: el calendario ahora marca solo días con tomas y rellena inicio y fin), `design-tokens.md` si cambia algo, `BACKLOG.md` (B5 hecho)
- [ ] T018 Calidad: `gofmt`, `go vet`, `go test ./... -cover`; `npx tsc --noEmit -p tsconfig.app.json && npx eslint . && npx vitest run --coverage`; E2E afectados (calendario, detalle de consulta, finalizar, tomas sin registrar, progreso) en los tres navegadores; quickstart §2 (dos pestañas) y §3
- [ ] T019 Commit, push, PR a `develop` y code review

## Dependencias

Fase 1 → Fase 2 (T002→T003→T004→T005→T006; T007 después de T005; T008 al final) → Fase 3 (T009→T010→T011→T012→T013). Fase 4
(T014→T015) es independiente de las anteriores. Pulido al final.

## Estrategia

MVP = US1 completa (recorrer) porque sin el frontend el backend no sirve; US2 (calendario) puede entregarse antes o en el
mismo PR. Se recomienda un solo PR: comparten la documentación y el calendario muestra el efecto del recorrido.
