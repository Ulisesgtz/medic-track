# Plan de Implementación: Barra de progreso de tomas por medicamento

**Rama**: `feature/014-progreso-tomas` | **Fecha**: 2026-09-29 | **Especificación**: [spec.md](./spec.md)

## Resumen

Cada medicamento del detalle de la consulta muestra "N / total tomas" y una barra que crece con las marcadas; las
tomas "sin registrar" (spec 013) se mencionan aparte y no cuentan. Todo se deriva en el frontend de las tomas que ya
llegan (research R1): **sin backend, migración ni API nueva**.

## Contexto Técnico

**Lenguaje/Versión**: TypeScript + React 19 + Vite (frontend). Backend sin cambios.

**Dependencias Principales**: ninguna nueva.

**Almacenamiento**: N/A.

**Pruebas**: Vitest + Testing Library (función, componente, tarjeta del medicamento); Playwright a 390 y 1280 px.
Cobertura >90 % (Principio VI).

**Tipo de Proyecto**: aplicación web — solo `frontend/`.

**Restricciones**: barra accesible (`progressbar` con valor y texto), sin lenguaje de evaluación ni consejos
(Principio I), `motion-reduce`.

## Verificación de la Constitución

- **I**: solo cuenta lo que el padre marcó y dice cuántas quedaron sin registrar, sin afirmar que no se dieron ni
  evaluar. ✅
- **II, III, IV**: sin datos, stack ni límites nuevos. ✅
- **V**: sin endpoint ni columna; una función y un componente. ✅
- **VI**: pruebas unitarias >90 % y E2E a 390/1280 px. ✅
- **Mocks**: sin mock; se diseña con `design-tokens.md` y se muestran capturas al usuario (anotar en la spec 007). ✅

## Estructura del Proyecto

```text
specs/014-progreso-tomas/{spec.md, plan.md, research.md, data-model.md, quickstart.md, checklists/, tasks.md}

frontend/src/features/consultations/
├── progress.ts (+ .test)            # medicationProgress y textos
├── ProgressBar.tsx (+ .test)        # role="progressbar" con valor y texto
└── MedicationCard.tsx               # la barra entre el título y el horario (móvil y web)
frontend/e2e/detalle-consulta-*.spec.ts   # el avance sube al marcar
CLAUDE.md, frontend/CLAUDE.md, specs/007 (desviación), BACKLOG.md (B3 hecho)
```

**Decisión de Estructura**: solo frontend; la regla vive en `progress.ts` para que la spec 016 la reutilice.

## Seguimiento de Complejidad

Sin violaciones.
