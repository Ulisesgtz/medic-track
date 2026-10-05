# Plan de Implementación: El calendario como selector de día de «Medicamentos»

**Rama**: `feature/023-calendario-selector-de-dia` | **Fecha**: 2026-10-01 | **Especificación**: [spec.md](./spec.md)

## Resumen

Solo frontend. El día elegido deja de ser un estado interno del calendario y pasa a la página del detalle (R1); el
calendario lo recibe y avisa cuando el padre toca un día, y cada `MedicationCard` recibe ese día y muestra **sus** tomas
de ese día (R2), con el título del día y el aviso «ese día no tiene tomas» (R3). La lista «Tomas del día» de la
spec 019/022 y todo lo que solo ella usaba (`DayDoses`, la apariencia `calendar` del chip, «próxima») se **borra** (R4).
Sin cambios de datos, API ni reglas de estado (R5).

## Contexto Técnico

**Lenguaje/Versión**: TypeScript + React 19. **Dependencias**: ninguna nueva.
**Almacenamiento**: N/A. **Pruebas**: Vitest + Testing Library y Playwright a 390/1280 px; >90 %.
**Restricciones**: móvil y web son dos diseños (`variant`); los chips de las tarjetas no cambian; nombres accesibles
únicos (dos medicamentos pueden tener una toma a la misma hora: las tarjetas viven en su `article`); textos del Principio I.

## Verificación de la Constitución

- **I**: solo presentación y selección de día; textos neutros («Tomas del 3 de octubre», «Este día no tiene tomas»). ✅
- **II, III, IV**: sin datos, API ni planes nuevos. ✅ **V**: sin librerías. ✅
- **VI**: unitarias >90 % y E2E a 390 y 1280 px (se ajustan los de la spec 019/022). ✅
- **Mocks**: sin mock nuevo; se conservan las tarjetas de los mocks 03/13 y se quita una lista que el mock 13 nunca tuvo. ✅

## Estructura del Proyecto

```text
frontend/src/features/consultations/
├── ConsultationDetailPage.tsx (+ test)   # guarda el día elegido (R1) y lo pasa al calendario y a cada tarjeta
├── TreatmentCalendar.tsx (+ test)        # controlado: recibe `selected` y `onSelect`; sin divisor ni lista del día
├── MedicationCard.tsx (+ test)           # muestra las tomas del día recibido; título del día; «Este día no tiene tomas»
├── treatmentDays.ts (+ test)             # `dosesOn`/`nextDose` salen; entra `dosesOfDay(medication, day)`
├── DayDoses.tsx                          # SE BORRA
├── DoseChip.tsx (+ test), doseStatus.ts  # vuelve a un solo aspecto: sin `appearance`, `desktop`, `next`, CALENDAR_CHIP_*
frontend/e2e/calendario-tratamiento.spec.ts, recorrer-tratamiento.spec.ts   # los días se leen en las tarjetas
specs/005-…/design-tokens.md, CLAUDE.md, frontend/CLAUDE.md, specs/019 y 022 (notas), BACKLOG.md
```

## Decisiones (ver research.md)

R1 el estado vive en la página · R2 una sola regla de día para tarjetas y calendario · R3 textos de la tarjeta ·
R4 qué se borra · R5 sin cambios de datos · R6 pruebas.
