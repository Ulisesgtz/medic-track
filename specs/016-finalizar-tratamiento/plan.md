# Plan de Implementación: Finalizar tratamiento antes de tiempo

**Rama**: `feature/016-finalizar-tratamiento` | **Fecha**: 2026-09-30 | **Especificación**: [spec.md](./spec.md)

## Resumen

Un botón "Finalizar tratamiento" por medicamento (con confirmación neutral) guarda **cuándo** se terminó en una columna
nueva, `medications.ended_at` (research R1); **ninguna toma se toca**: las que aún no llegaban se **derivan** como
canceladas, quinto estado de la regla de la spec 013 (R2). Endpoint nuevo, idempotente y solo para el dueño (R3). El
tratamiento terminado deja de contar como activo, de avisar (spec 011) y de sumar en el total del progreso (spec 014).
Única excepción a la inmutabilidad de las consultas.

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27 y TypeScript + React 19. **Dependencias**: ninguna nueva.
**Almacenamiento**: PostgreSQL, migración `0013` (una columna nula).
**Pruebas**: `go test` con BD real (regla, repositorio, endpoint, router), Vitest y Playwright a 390/1280 px; >90 %.
**Restricciones**: irreversible y así lo dice la confirmación; idempotente; texto neutral (Principio I); un solo botón
sólido por pantalla (el de finalizar va de contorno); solo el dueño; `*httpx.Responder`.

## Verificación de la Constitución

- **I**: solo registra lo que el padre decidió; sin consejo médico. Toca este principio y la excepción a la
  inmutabilidad: requiere confirmación explícita antes de implementar — la dio el usuario al pedir B6 con sus reglas
  (backlog 2026-09-28, spec 2026-09-29). ✅
- **II**: sin datos ni terceros nuevos; solo el dueño. ✅ **III, IV**: sin cambios. ✅
- **V**: una columna, un endpoint, un estado derivado. ✅ **VI**: unitarias >90 % y E2E a 390/1280 px. ✅
- **Mocks**: sin mock; se diseña con `design-tokens.md` y se muestran capturas (desviación en la spec 007). ✅

## Estructura del Proyecto

```text
backend/
├── migrations/0013_add_medication_ended_at.sql
└── internal/
    ├── consultation/   # dosestatus.go (canceled), model.go (EndedAt), repository.go (EndTreatment, lecturas,
    │                   # overview sin terminadas), service.go, handler.go (POST …/end, endedAt), errors.go
    ├── reminder/repository.go   # ClaimDueDoses sin canceladas
    ├── server/router.go (+ test)  # POST /consultations/{id}/medications/{mid}/end con ownsConsultation
    └── docs/                      # Swagger
frontend/src/features/consultations/
├── types.ts, api.ts, useEndTreatment.ts
├── EndTreatmentDialog.tsx (+ test), MedicationCard.tsx (botón, "Terminado…", chip cancelado)
├── doseStatus.ts (canceled), progress.ts (sin canceladas)
frontend/e2e/finalizar-tratamiento.spec.ts
CLAUDE.md, backend/CLAUDE.md, frontend/CLAUDE.md, specs/007, specs/004 (excepción), BACKLOG.md (B6 hecho)
```

## Seguimiento de Complejidad

Sin violaciones; la excepción a la inmutabilidad está acotada a `ended_at` y documentada en la spec 004.
