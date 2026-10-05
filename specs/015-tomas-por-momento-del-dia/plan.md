# Plan de Implementación: Tomas por momento del día

**Rama**: `feature/015-tomas-por-momento-del-dia` | **Fecha**: 2026-09-29 | **Especificación**: [spec.md](./spec.md)

## Resumen

En el detalle de la consulta, las tomas del día de cada medicamento se agrupan en Mañana, Tarde y Noche según su hora
local, en vez de una sola fila de chips. Solo presentación en el frontend (research R1): **sin backend, API ni
migración**. Una función pura decide el grupo y un bloque por grupo pinta sus chips.

## Contexto Técnico

**Lenguaje/Versión**: TypeScript + React 19 + Vite (solo `frontend/`). **Dependencias**: ninguna nueva.
**Pruebas**: Vitest (función, tarjeta), Playwright a 390 y 1280 px; cobertura >90 % (Principio VI).
**Restricciones**: rangos en una sola tabla; títulos solo "Mañana/Tarde/Noche" (Principio I); marcar, estados de
spec 013, selector de día y barra de spec 014 sin cambios.

## Verificación de la Constitución

- **I**: títulos neutros, sin consejos. ✅ **II–IV**: sin datos ni stack nuevos. ✅
- **V**: una función y un cambio de presentación. ✅ **VI**: unitarias >90 % y E2E a 390/1280 px. ✅
- **Mocks**: sin mock; se diseña con `design-tokens.md` y se muestran capturas (desviación en la spec 007). ✅

## Estructura del Proyecto

```text
specs/015-tomas-por-momento-del-dia/{spec, plan, research, data-model, quickstart, checklists, tasks}.md

frontend/src/features/consultations/
├── dayPeriods.ts (+ .test)     # PERIODS, periodOf, groupByPeriod
└── MedicationCard.tsx          # un grupo con título por momento, en lugar de una fila
frontend/e2e/detalle-consulta-*.spec.ts   # Mañana / Tarde / Noche
CLAUDE.md, frontend/CLAUDE.md, specs/007 (desviación), BACKLOG.md (B1 hecho)
```

## Seguimiento de Complejidad

Sin violaciones.
