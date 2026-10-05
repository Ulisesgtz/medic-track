---

description: "Lista de tareas de la spec 024: consulta «solo como registro»"
---

# Tareas: Consulta «solo como registro»

**Entrada**: `/specs/024-consulta-solo-registro/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Pruebas**: obligatorias (Principio VI): >90 % en backend y frontend y Playwright a 390 y 1280 px.

**Organización**: US1 (guardar una consulta solo-registro: backend + formulario) y US2 (verla sin tomas ni alertas: listado y
detalle). El backend es la base de las dos.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Línea base

- [x] T001 Desde la rama `feature/023-calendario-selector-de-dia`: `cd backend && set -a && . ./.env.local && set +a && go test ./internal/consultation/... -cover` y `cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx vitest run` en verde

## Fase 2: Backend (base de US1 y US2)

- [x] T002 [US1] Migración `backend/migrations/0016_add_consultation_record_only.sql`: `ALTER TABLE consultations ADD COLUMN record_only BOOLEAN NOT NULL DEFAULT false;` con el comentario de que se escribe una vez (spec 004, FR-014) y de que las filas existentes quedan en `false`; aplícala en la base local
- [x] T003 [US1] `backend/internal/consultation/model.go` y `service.go`: `Consultation.RecordOnly` y `CreateConsultationInput.RecordOnly`; con la marca, `validateCreateConsultationInput` no exige `startTime` ni la valida y `CreateConsultation` guarda `StartTime = nil` aunque llegue; sin la marca, igual que hoy (hora de inicio obligatoria, FR-010). Pruebas en `service_test.go`: con la marca sin `startTime` es válido; con la marca y `startTime` "99:99" no falla y se guarda vacío; nombre, frecuencia y duración siguen validándose; sin la marca sin `startTime` falla como antes
- [x] T004 [US1] `repository.go`: `Create` inserta `record_only`; `GetByID` y `GetByChild` lo leen en `Consultation.RecordOnly`. Pruebas en `repository_test.go`: con la marca, cero filas en `doses` aunque la entrada traiga `StartTime`; `record_only` se guarda y se lee en el detalle y en el listado; la consulta normal queda en `false` y con tomas
- [x] T005 [US1] `handler.go`: `recordOnly` (opcional, `false`) en `createConsultationRequest` y en `consultationSummaryResponse` y `consultationDetailResponse` (siempre presente), con sus `example` y la nota en la descripción del endpoint; sigue escribiendo todo por `*httpx.Responder`. Pruebas en `handler_test.go` (petición sin el campo = `false`; con `true` y sin `startTime` responde `201` con `recordOnly: true`, `startTime: null` y `doses: []`; el listado y el detalle traen el campo)
- [x] T006 [US2] Prueba de que una consulta solo-registro no aporta nada derivado: en `overview_test.go` (resumen del hijo y tratamiento activo vacíos) y en `backend/internal/reminder/` (la consulta de tomas vencidas no la devuelve), usando una consulta solo-registro creada por el servicio
- [x] T007 Swagger: desde `backend/`, `go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd` y confirma `git diff` solo con `recordOnly`; luego `go vet ./... && go test ./... -cover` (>90 %)

## Fase 3: US1 — el formulario

- [x] T008 [US1] `frontend/src/features/consultations/types.ts` y `api.ts`: `recordOnly?: boolean` en `ConsultationSummary` y `ConsultationDetail` (opcional: un backend viejo no lo manda), `recordOnly` en el cuerpo de `createConsultation` y `startTime: string | null` por medicamento
- [x] T009 [US1] `ConsultationForm.tsx`: campo `recordOnly` (`false`) con un `<input type="checkbox">` y `<label>` reales («Consulta anterior: guardar solo como registro»), zona táctil de 44 px, y el texto auxiliar «No se crearán horarios de tomas ni avisos. Esto no se puede cambiar después.», después de la fecha, en los dos diseños (`variant`); el envío manda `recordOnly` y `startTime: null` en cada medicamento si está marcado; pasa `recordOnly` (`useWatch`) a cada `MedicationFieldset` y a `missingFields`
- [x] T010 [US1] `MedicationFieldset.tsx` y `missingFields.ts`: con `recordOnly` no se dibuja «Primera toma» (los dos diseños; el campo registrado conserva lo escrito) y su `required` pasa a `false`; `missingFields` no pide «la hora de la primera toma» con la marca
- [x] T011 [US1] Pruebas: `ConsultationForm.test.tsx`, `MedicationFieldset.test.tsx`, `missingFields.test.ts` (marcar quita «Primera toma» y deja de ser obligatoria; desmarcar la devuelve con lo que había escrito; envía `recordOnly: true` y `startTime: null`; sin marcar igual que hoy; el aviso de faltantes no la pide); ajusta las que dependían de que el campo siempre existiera

## Fase 4: US2 — listado y detalle

- [x] T012 [P] [US2] Crear `RecordOnlyBadge.tsx` (+ test): chip neutro «Solo registro» (tinta suave sobre `surface`, borde fino, sin rojo ni ámbar; `text-xs font-extrabold`), con `design-tokens.md`
- [x] T013 [US2] `ConsultationCard.tsx` (listado): muestra `RecordOnlyBadge` junto a la fecha cuando `recordOnly`; `ConsultationDetailPage.tsx`: la muestra junto a la fecha/doctor en los dos diseños y oculta en la web la tarjeta «Tratamiento activo» cuando `recordOnly` (calendario, leyenda, chips, progreso y botones ya no salen sin tomas). Pruebas en `ConsultationCard.test.tsx` y `ConsultationDetailPage.test.tsx` (etiqueta, sin «Tratamiento activo» en la web, sin calendario ni chips ni botones, cada medicamento dice «Cada 8 horas · 7 días» sin «primera toma»; una consulta normal igual que antes)

## Fase 5: Extremo a extremo

- [x] T014 [US1] [US2] `frontend/e2e/consulta-solo-registro.spec.ts` (390 y 1280 px): crear con la marca una consulta de hace meses con un medicamento sin hora → detalle con la etiqueta y sin calendario ni tomas; listado con la etiqueta; «Tomas de hoy» del hijo sin tomas de ella; una consulta normal del mismo hijo conserva sus tomas. Ajusta `detalle-consulta-hijo.spec.ts` y los helpers de `e2e/helpers.ts` si el formulario cambió

## Fase 6: Cierre

- [x] T015 [P] Documentación: `CLAUDE.md` (línea de la feature 024), `backend/CLAUDE.md` (columna `record_only`, la regla de la hora de inicio, que sin hora no hay tomas, el campo de la API), `frontend/CLAUDE.md` (formulario, etiqueta, detalle), `BACKLOG.md` (anota «convertir una consulta solo-registro en una con tomas» como futura si se quiere) y nota en `specs/004-…` (FR-010 de la hora de inicio: la excepción de la marca)
- [ ] T016 Calidad: `go vet ./... && go test ./... -cover`, `npx tsc --noEmit -p tsconfig.app.json && npx eslint src && npx vitest run --coverage`, E2E completos en los tres navegadores (`npx playwright test --workers=2`), capturas del formulario con la marca y del detalle a 390 y 1280 px para el usuario
- [ ] T017 Commit, push, code review y PR a `develop` (junto con la spec 023 en la misma rama: el PR de la rama lleva las dos; base `feature/022-rebranding-calendario` hasta que la 022 llegue a `develop`)

---

## Dependencias y orden

T001 → T002 → T003 → T004 → T005 → T006 → T007 (backend completo) → T008 → T009/T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017.
Paralelizable: T012 (un archivo nuevo) con T009-T011, y T015 con T016.

## Estrategia

Backend primero (el despliegue también va en ese orden: R3). US1 y US2 comparten backend, así que no hay MVP parcial útil
sin la etiqueta y el detalle; se entregan juntas. La migración es de solo agregar: no rompe consultas ni procesos existentes.
