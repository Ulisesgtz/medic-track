# Plan de Implementación: Calendario del tratamiento

**Rama**: `feature/019-calendario-tratamiento` | **Fecha**: 2026-09-30 | **Especificación**: [spec.md](./spec.md)

## Resumen

Solo frontend. Un componente nuevo, `TreatmentCalendar`, en el detalle de la consulta: un calendario mensual con las
marcas de color (y número) de cada medicamento sobre su rango (research R2, R4) y, debajo, la lista de las tomas del día
elegido, marcables con el mismo chip de hoy (R5). Todo se calcula de lo que el detalle ya trae (R1); los colores son seis
tokens nuevos sin rojo, verde ni ámbar (R3). Móvil y web, dos diseños (R6).

## Contexto Técnico

**Lenguaje/Versión**: TypeScript + React 19. **Dependencias**: ninguna nueva.
**Almacenamiento**: N/A (sin backend, API ni base de datos).
**Pruebas**: Vitest + Testing Library (funciones puras del calendario, componente, página) y Playwright a 390/1280 px;
>90 % de cobertura.
**Restricciones**: nada cambia el rango, las tomas ni sus estados (solo se presentan); días en hora local; textos neutros
(Principio I); contraste de las marcas ≥ 3:1 y del número ≥ 4.5:1; área táctil ≥ 44 px; sin desplazamiento horizontal a
390 px; un solo botón sólido por pantalla (el calendario usa contorno/neutral).

## Verificación de la Constitución

- **I**: solo presenta lo que el padre registró; ningún color, texto ni estado sugiere una evaluación médica (sin rojo,
  sin «atrasado», sin ámbar nuevo). ✅ **II, III, IV**: sin datos, API ni esquema nuevos. ✅
- **V**: un componente, un módulo de funciones puras y seis tokens; sin librería. ✅ **VI**: unitarias >90 % y E2E a
  390/1280 px. ✅
- **Mocks**: sin mock; se diseña con `design-tokens.md` (se le agregan los colores) y se muestran capturas (desviación en
  la spec 007). ✅

## Estructura del Proyecto

```text
frontend/src/
├── index.css                                   # --color-med-1 … --color-med-6
└── features/consultations/
    ├── treatmentCalendar.ts (+ test)           # dayKey, medicationRange, daysOf(meds), marksOn(day), monthGrid, monthsWithTreatment, initialDay, medColor(n)
    ├── TreatmentCalendar.tsx (+ test)          # cuadrícula del mes, flechas, leyenda, día seleccionado
    ├── DayDoses.tsx (+ test)                   # tomas del día elegido (todas las medicaciones), con DoseChip
    ├── DoseChip.tsx                            # movido desde MedicationCard.tsx; prop opcional `label`
    ├── MedicationCard.tsx                      # importa DoseChip y dayKey
    └── ConsultationDetailPage.tsx              # monta el bloque en móvil y web
frontend/e2e/calendario-tratamiento.spec.ts
specs/005-identidad-visual-front-end/design-tokens.md, CLAUDE.md, frontend/CLAUDE.md, specs/007 (desviación), BACKLOG.md (B4 hecho)
```

## Seguimiento de Complejidad

Sin violaciones.
