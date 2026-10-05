# Plan de Implementación: Recorrer el tratamiento y marcar inicio y fin en el calendario

**Rama**: `feature/020-recorrer-tratamiento` | **Fecha**: 2026-09-30 | **Especificación**: [spec.md](./spec.md)

## Resumen

Dos partes. (1) **Backend + frontend**: un endpoint `POST …/medications/{id}/extend` que, tras la confirmación del padre,
agrega N tomas (1–60, propuesto = las sin registrar aún no recorridas) al final del medicamento y guarda el recorrido
—cuenta, propuesto, confirmado, hora— en una tabla de solo agregar (research R1–R4); el detalle trae `extendableDoses` y
`extensions` (R2, R5) y la tarjeta ofrece «Recorrer tratamiento» con un diálogo de número editable y nota de «manual»
(R6). (2) **Frontend**: el calendario marca los días con tomas y dibuja inicio y fin rellenos del color (R7).

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27 y TypeScript + React 19. **Dependencias**: ninguna nueva.
**Almacenamiento**: PostgreSQL, migración `0014` (tabla `medication_extensions` y dos columnas nulas en `doses`).
**Pruebas**: `go test` con BD real (recorrido, propuesto, cobertura, concurrencia, autorización, regla de tomas nuevas),
Vitest + Playwright a 390/1280 px; >90 %.
**Restricciones**: nunca automático ni sugerido (Principio I); solo el dueño; las tomas existentes no cambian; ninguna
toma sin registrar se recorre dos veces (bloqueo del medicamento); texto neutral; un solo botón sólido por pantalla
(ambos botones del medicamento van de contorno); `*httpx.Responder`; Swagger regenerado.

## Verificación de la Constitución

- **I**: es la decisión del padre y de su médico, nunca de la app: sin automatismo, sin sugerencia, confirmación explícita
  con la pregunta de la indicación médica y registro de quién decidió. Toca este principio y la inmutabilidad de las
  consultas (segunda excepción tras la spec 016): requiere la confirmación del usuario —la dio al elegir la opción (b) y
  el número editable el 2026-09-30—. ✅
- **II**: el recorrido guarda solo cuenta, medicamento y números; sin datos nuevos de terceros. ✅ **III, IV**: solo el
  dueño; sin cambios de planes. ✅
- **V**: una tabla, dos columnas, un endpoint, un diálogo; sin dependencias. ✅ **VI**: unitarias >90 % y E2E a 390/1280
  px. ✅
- **Mocks**: sin mock; se diseña con `design-tokens.md` y se muestran capturas (desviación en la spec 007). ✅

## Estructura del Proyecto

```text
backend/
├── migrations/0014_create_medication_extensions.sql
└── internal/
    ├── consultation/   # model.go (Dose.Covered/Added, Medication.ExtendableDoses/Extensions), repository.go
    │                   # (ExtendTreatment en transacción con FOR UPDATE; GetByID carga las columnas y calcula
    │                   # extendableDoses), service.go (validación 1–60, MaxExtensionDoses), errors.go
    │                   # (ErrNothingToExtend), handler.go (POST …/extend, campos nuevos, Swagger)
    ├── server/router.go (+ test)   # la ruta con ownsConsultation
    └── docs/                       # Swagger regenerado
frontend/src/features/consultations/
├── types.ts, api.ts, useExtendTreatment.ts
├── ExtendTreatmentDialog.tsx (+ test), MedicationCard.tsx (botón y línea del recorrido)
├── treatmentDays.ts (marksOn con rol, días con tomas, nombres), TreatmentCalendar.tsx (inicio/fin rellenos)
frontend/e2e/recorrer-tratamiento.spec.ts, calendario-tratamiento.spec.ts (ajustes)
CLAUDE.md (+ backend y frontend), specs/004 (segunda excepción), specs/007 (desviación), specs/019 (nota), design-tokens.md, BACKLOG.md
```

## Seguimiento de Complejidad

Sin violaciones; la excepción a la inmutabilidad está acotada a agregar tomas y un registro de solo agregar, documentada
en la spec 004.
