# Plan de Implementación: Rediseño de las pantallas de detalle

**Rama**: `feature/056-rediseno-detalles` (sale de `feature/055-rediseno-inicio`) | **Fecha**: 2026-11-01 | **Spec**: [spec.md](spec.md)
**Entrada**: `specs/056-rediseno-detalles/spec.md`; diseños en `referencia/` (y el del encabezado en Claude Design, resumido en
`referencia/encabezado-medidas.md`).

## Resumen

Un componente de encabezado común (`PageHeader`) que quita la banda oscura de las pantallas secundarias, una barra fija de
guardar en los formularios del teléfono, el detalle del hijo con «Hoy» primero y un índice de secciones, el detalle de la
consulta con el tratamiento primero (calendario semanal en el teléfono, candado en las marcas ajenas, «programada» marcable)
y «Mi día» uniendo lo personal. **Solo frontend**: todo sale de respuestas que ya existen (research R1).

## Contexto Técnico

**Lenguaje/Versión**: TypeScript 5 / React 19 (Vite)
**Dependencias principales**: TanStack Query, React Router, Tailwind CSS v4 — ninguna nueva
**Almacenamiento**: N/A
**Pruebas**: Vitest + Testing Library (> 90 %), Playwright (Chromium, 390 y 1280 px)
**Plataforma Objetivo**: PWA en teléfono (iOS/Android) y navegador de escritorio
**Tipo de Proyecto**: aplicación web; solo `frontend/`
**Objetivos de Rendimiento**: sin peticiones nuevas por pantalla; marcar sin scroll a 390 × 844 (SC-001)
**Restricciones**: los diseños mandan; colores solo como tokens; dos diseños con `useIsDesktop`; overlays con portal; 44 px y
4.5:1; alto de línea `normal` y tamaños exactos como el diseño
**Escala/Alcance**: ~4 piezas compartidas nuevas, 2 pantallas rehechas, 1 página nueva («Mi día»), ~12 pantallas que cambian de
encabezado

## Verificación de la Constitución

| Principio | Cumple | Cómo |
|---|---|---|
| I. Registra, nunca interpreta | ✅ | Sin estados nuevos; «programada» solo nombra una toma futura; chips neutros; pruebas de redacción (R9) |
| II. Privacidad | ✅ | Sin datos ni direcciones nuevas; lo personal sigue solo para su dueña |
| III. Stack fijo | ✅ | Sin dependencias |
| IV. Freemium disciplinado | ✅ | Lo registrado siempre se ve; el plan lo decide el servidor como hoy |
| V. Simplicidad | ✅ | Reutiliza `useChildDay`, `useOverviewDoseToggle`, `useMarkDone`, `groupByPeriod`, `MisRegistroSeccion`; `RoutinePageFrame` cambia por dentro |
| VI. Cobertura | ✅ | > 90 % y E2E por historia a 390 y 1280 px |

**Gates**: sin violaciones. Revisión después del diseño: sin cambios.

## Estructura del Proyecto

### Documentación

```text
specs/056-rediseno-detalles/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, contracts/ui.md, checklists/requirements.md
└── referencia/
    ├── Detalle y Mi día PediTrack.dc.html
    ├── Detalle de la consulta PediTrack.dc.html
    ├── encabezado-medidas.md        # el diseño del encabezado vive en Claude Design
    ├── medidas.md                   # se escribe al medir
    └── desviaciones.md              # se escribe al construir
```

### Código Fuente

```text
frontend/src/
├── shared/ui/
│   ├── PageHeader.tsx (+ test)          # R2
│   ├── pageHeaderText.ts (+ test)
│   ├── StickyActionBar.tsx (+ test)     # R3
│   ├── SectionIndex.tsx (+ test)        # R4
│   └── AppHeader.tsx                    # se borra (sin usos desde la 055)
├── features/supplements/
│   ├── RoutineFormPage.tsx              # RoutinePageFrame usa PageHeader por dentro
│   ├── RoutineForm.tsx                  # guardar en StickyActionBar
│   ├── MyDayPage.tsx (+ test), myDayText.ts   # R8
│   └── PersonalRoutinesPage.tsx         # se retira (las rutas redirigen a /mi-dia)
├── features/childDetail/                # R5
│   ├── ChildTodayCard.tsx, childDetailText.ts (+ tests)
├── features/consultations/
│   ├── ChildDetailPage.tsx              # rehecha: Hoy → tratamiento → cita → índice → secciones → Lo demás
│   ├── ConsultationDetailPage.tsx       # rehecha: tratamiento → cita → datos (plegables)
│   ├── TreatmentCalendar.tsx, treatmentDays.ts   # modo semana (R6)
│   ├── DoseChip.tsx                     # candado y «programada» (R7)
│   ├── ConsultationForm.tsx, NewConsultationPage.tsx, EditConsultationPage.tsx  # PageHeader + StickyActionBar
│   ├── HistoryPage.tsx                  # PageHeader con búsqueda pegada
│   └── consultationDetailText.ts (+ test)
├── features/family/FamilyPage.tsx       # PageHeader
├── features/appointments/AppointmentFormPage.tsx  # StickyActionBar
├── features/home/TuDia.tsx, ChildrenSidebar.tsx   # «Ver todo» y «Mi día»
└── App.tsx                              # /mi-dia y redirecciones

frontend/e2e/ detalle-hijo.spec.ts, mi-dia.spec.ts (nuevos), detalle-consulta*.spec.ts y los que buscan la banda (ajustes)
```

## Orden sugerido

1. Fundamental: `PageHeader`, `StickyActionBar`, `SectionIndex`, textos; `RoutinePageFrame` por dentro; borrar `AppHeader`.
2. US2 (encabezado en todas las pantallas de FR-010) — se ve de inmediato en ~12 pantallas.
3. US1 detalle del hijo (MVP de la parte visible más usada).
4. US3 detalle de la consulta (semana, candado, «programada», datos plegables).
5. US4 «Mi día» y redirecciones.
6. Medir contra los diseños, desviaciones, E2E, docs, verificación y `/code-review`.

## Seguimiento de Complejidad

Sin violaciones que justificar.
