---

description: "Lista de tareas de la spec 016: finalizar tratamiento antes de tiempo"
---

# Tareas: Finalizar tratamiento antes de tiempo

**Entrada**: `/specs/016-finalizar-tratamiento/` (plan.md, spec.md, research.md, data-model.md, contracts/medication-end.md, quickstart.md)

**Pruebas**: obligatorias (Principio VI): >90 % en Go y React y Playwright a 390 y 1280 px.

**Organización**: una sola historia (US1, P1) con su base backend; el resto son efectos en lo existente.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [X] T001 Línea base: `cd backend && go test ./internal/... -cover` y `cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx vitest run` en verde

## Fase 2: Fundamental (backend)

- [X] T002 Crear `backend/migrations/0013_add_medication_ended_at.sql` (`ALTER TABLE medications ADD COLUMN ended_at TIMESTAMPTZ NULL`) y aplicarla a la BD local
- [X] T003 `backend/internal/consultation/dosestatus.go`: `DoseStatusCanceled = "canceled"` y `StatusAt(scheduledAt, taken, frequencyHours, endedAt *time.Time, now)`: si `endedAt != nil`, la toma es posterior a `endedAt` y no está marcada → `canceled` (antes de pending/due/unregistered); actualizar los llamadores; pruebas en `dosestatus_test.go` (bordes: exactamente en `endedAt` no es cancelada, 1 ns después sí; marcada posterior sigue `taken`; sin `endedAt` igual que antes)
- [X] T004 `backend/internal/consultation/model.go` y `repository.go`: `Medication.EndedAt *time.Time` leído en `GetByID` (y `Create` lo devuelve `nil`); pasar `ended_at` a `StatusAt` en detalle, alta, `UpdateDoseStatus` (agregar `m.ended_at` al `RETURNING`) y overview (agregar `m.ended_at` al `SELECT`)
- [X] T005 `repository.go` `GetOverview`: excluir tomas canceladas de `doses` (`AND NOT (m.ended_at IS NOT NULL AND d.scheduled_at > m.ended_at AND NOT d.taken)`) y medicaciones terminadas del tratamiento activo (`AND m.ended_at IS NULL`); pruebas en `overview_test.go`
- [X] T006 `repository.go`: `EndTreatment(ctx, consultationID, medicationID) (*Medication, error)` — `UPDATE … SET ended_at = now() WHERE id = $1 AND consultation_id = $2 AND ended_at IS NULL`, luego lee la medicación (con sus tomas y `status`); idempotente; `ErrMedicationNotFound` si no existe o no es de esa consulta; `ErrNothingToEnd` si no tiene tomas por delante (`scheduled_at > now()`) y aún no terminó; `service.go` la expone; errores en `errors.go`
- [X] T007 `handler.go`: `POST /consultations/{consultationId}/medications/{medicationId}/end` con `*httpx.Responder` (200 con la medicación y `endedAt`; 404 `medication_not_found`; 400 `validation_error` `nothing_to_end`), `endedAt` en `medicationResponse`, anotaciones Swagger; UUID mal formado → 404
- [X] T008 `backend/internal/server/router.go`: registrar la ruta en el grupo con sesión y `ownsConsultation`; fila en `router_test.go` (401 sin sesión, 403 de otra cuenta, dueño llega al handler)
- [X] T009 `backend/internal/reminder/repository.go`: `ClaimDueDoses` agrega `AND (m.ended_at IS NULL OR d.scheduled_at <= m.ended_at)`; prueba: una toma cancelada dentro de la ventana no se reclama
- [X] T010 Pruebas de repositorio y handler (`repository_test.go`, `handler_test.go`, archivo nuevo `endtreatment_test.go`): terminar marca `endedAt`, las tomas futuras salen `canceled`, las pasadas conservan su estado y se pueden marcar, idempotente (mismo `endedAt`), 404 de otra consulta, 400 sin tomas por delante, el otro medicamento no se afecta, `GetByID`/`POST` de consulta traen `endedAt`
- [X] T011 Regenerar Swagger (`go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd`), `gofmt`, `go vet` y `go test ./internal/... -cover` (>90 %)

**Punto de Control**: el backend termina tratamientos y sus tomas futuras salen canceladas.

## Fase 3: US1 - Terminar un tratamiento antes (P1) 🎯 MVP (frontend)

- [X] T012 `frontend/src/features/consultations/types.ts`, `api.ts`: `DoseStatus` gana `'canceled'`; `Medication.endedAt: string | null`; `endTreatment(consultationId, medicationId, token)` (`POST …/end`, errores `ConsultationApiError`); actualizar fixtures de pruebas
- [X] T013 `doseStatus.ts`: estilo del chip cancelado en `DOSE_CHIP_STYLE` (borde punteado `slate-300`, texto `slate-500` tachado), `isUnmarked` no lo cuenta; `progress.ts`: `medicationProgress` excluye las `canceled` del total; pruebas en `doseStatus.test.ts` y `progress.test.ts`
- [X] T014 Crear `frontend/src/features/consultations/useEndTreatment.ts` (mutación que invalida `['consultation', id]` y `['overview']`) y `EndTreatmentDialog.tsx`: portal, `role="dialog"`, `aria-modal`, Escape, foco entra y vuelve al botón (ref `opener`), Tab no sale; texto "¿Finalizar el tratamiento de {nombre}? Se dejarán de avisar las tomas que faltan. Las tomas registradas se conservan. No se puede deshacer." y botones "Cancelar" / "Finalizar tratamiento"; error en español si falla
- [X] T015 `MedicationCard.tsx`: botón "Finalizar tratamiento" de contorno, solo si `!endedAt` y hay alguna toma `pending`; con `endedAt`, en su lugar "Terminado el {fecha} · N de M tomas" (`formatDayMonth`; N marcadas, M no canceladas); el chip `canceled` deshabilitado, con "cancelada" en su descripción accesible y sin `aria-pressed` accionable; la agrupación por momento (spec 015) no cambia
- [X] T016 Pruebas en `EndTreatmentDialog.test.tsx`, `ConsultationDetailPage.test.tsx` y `MedicationCard`: botón según estado, diálogo y cancelar, confirmar llama al endpoint y muestra "Terminado…", chip cancelado no marcable, barra sin canceladas, error del servidor
- [X] T017 E2E `frontend/e2e/finalizar-tratamiento.spec.ts` (390 y 1280 px): consulta cada 8 h por 3 días, marcar una toma, finalizar con confirmación → "Terminado el … · 1 de N tomas", las tomas futuras canceladas no se marcan, una toma ya pasada sí; "Cancelar" no cambia nada; el detalle del hijo ya no muestra ese tratamiento como activo

**Punto de Control**: el padre termina un tratamiento en 2 toques y ve el resultado.

## Fase 4: Pulido

- [X] T018 Diseño: capturas del botón, el diálogo, la tarjeta terminada y el chip cancelado en 390 y 1280 px; contraste ≥ 4.5:1 en textos; mostrarlas al usuario para aprobarlas
- [X] T019 [P] Revisar textos contra el Principio I (nada aconseja, evalúa ni dice "suspendiste"); `specs/004-detalle-consulta-hijo/spec.md` (nota de la excepción a FR-014: solo `ended_at`) y `specs/007` (desviación: botón, diálogo y chip cancelado sin mock)
- [X] T020 [P] Mapas: `CLAUDE.md` (feature 016), `backend/CLAUDE.md` (`ended_at`, `canceled`, endpoint, `ClaimDueDoses`), `frontend/CLAUDE.md` (diálogo, chip cancelado); B6 hecho en `BACKLOG.md`
- [X] T021 Calidad: `gofmt`, `go vet`, `go test ./internal/... -cover`; `npx tsc --noEmit -p tsconfig.app.json && npx eslint . && npx vitest run --coverage`; E2E afectados en los tres navegadores
- [X] T022 Commit, push, PR a `develop` y code review

## Dependencias

Fase 1 → 2 (T002→T003→T004→T005/T006→T007→T008; T009 en paralelo) → Fase 3 (T012→T013→T014→T015→T016→T017) → Pulido.

## Estrategia

MVP = backend + frontend de US1 en un solo PR (la migración y el endpoint no sirven sin la pantalla).
