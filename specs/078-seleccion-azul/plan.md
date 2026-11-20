# Plan de Implementación: La opción elegida en azul de acción

**Rama**: `feature/078-seleccion-azul` | **Fecha**: 2026-11-20 | **Especificación**: [spec.md](spec.md)

## Resumen

Los 9 controles del inventario dejan de dibujar la opción elegida en tinta y usan el azul de acción con texto blanco (o borde y
punto azules en las tarjetas de opción), a través de un juego de clases compartido en `shared/ui/selection.ts`. Una prueba
vigila que ningún control vuelva a la tinta y la regla queda en el sistema visual. Detalle en [research.md](research.md).

## Contexto Técnico

**Lenguaje/Versión**: TypeScript + React 19, Tailwind v4.
**Dependencias Principales**: ninguna nueva.
**Almacenamiento**: no aplica.
**Pruebas**: Vitest (> 90 %), E2E de los flujos tocados con `scripts/e2e-local.sh`.
**Plataforma Objetivo**: PWA en Cloudflare Pages.
**Tipo de Proyecto**: aplicación web (solo frontend).
**Restricciones**: AA (5.36:1); colores solo con tokens (`noColorLiterals.test.ts`); dos diseños sin mezclar; nada fuera del
inventario cambia.
**Escala/Alcance**: 1 archivo nuevo + 9 controles en 8 archivos + pruebas + documentación.

## Verificación de la Constitución

| Principio | ¿Cumple? | Cómo |
|---|---|---|
| I. Registra, nunca interpreta | ✅ | Solo color de selección; ningún texto nuevo. |
| II. Privacidad | ✅ | Sin datos. |
| III. Stack fijo | ✅ | React + Tailwind. |
| IV. Freemium | ✅ | Sin cambio. |
| V. Simplicidad | ✅ | Un juego de clases compartido en vez de 9 copias. |
| VI. Pruebas | ✅ | Prueba de la regla + pruebas existentes + E2E de los flujos. |
| Sistema visual | ✅ | Regla nueva en `design-tokens.md` y `frontend/CLAUDE.md`; supera lo que dibujaban los mocks anteriores por decisión del dueño. |

## Estructura del Proyecto

```text
specs/078-seleccion-azul/  spec · plan · research · quickstart · checklists · tasks (siguiente paso)

frontend/src/
├── shared/ui/selection.ts            # NUEVO: selectedFill, selectedCard, selectedDot
├── shared/ui/noInkSelection.test.ts  # NUEVO: vigila la regla
├── features/supplements/RoutineForm.tsx, ActivityTypePicker.tsx
├── features/appointments/AppointmentFields.tsx
├── features/childRecord/RecordFormParts.tsx
├── features/family/InviteForm.tsx, family/merge/ChoiceCard.tsx
├── features/growth/ChartCard.tsx
└── features/medicineCabinet/CabinetFormPage.tsx
specs/005-identidad-visual-front-end/design-tokens.md, frontend/CLAUDE.md
```

## Fuera de alcance

Calendario del tratamiento, pestañas de crecimiento y «Tu plan actual» (decisión del dueño; en `BACKLOG.md`).
