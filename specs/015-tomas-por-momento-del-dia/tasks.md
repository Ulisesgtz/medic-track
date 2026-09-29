---

description: "Lista de tareas de la spec 015: tomas por momento del día"
---

# Tareas: Tomas por momento del día

**Entrada**: `/specs/015-tomas-por-momento-del-dia/` (plan.md, spec.md, research.md, data-model.md, quickstart.md)

**Pruebas**: obligatorias (Principio VI): >90 % y Playwright a 390 y 1280 px. Solo frontend.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [X] T001 Línea base: `cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx vitest run` en verde

## Fase 2: Fundamental

- [X] T002 Crear `frontend/src/features/consultations/dayPeriods.ts`: tabla `PERIODS` (`morning` "Mañana" 05:00–11:59, `afternoon` "Tarde" 12:00–18:59, `night` "Noche" 19:00–04:59), `periodOf(iso)` por la hora local (`getHours`, `getMinutes`) y `groupByPeriod(doses)` → solo los grupos con tomas, en el orden Mañana, Tarde, Noche; dentro de cada grupo por hora (la Noche cronológica: 00:00–04:59 y luego 19:00 en adelante) (research R2)
- [X] T003 [P] Pruebas en `frontend/src/features/consultations/dayPeriods.test.ts`: bordes 04:59→Noche, 05:00→Mañana, 11:59→Mañana, 12:00→Tarde, 18:59→Tarde, 19:00→Noche, 00:00→Noche; un solo grupo; grupos vacíos omitidos; orden de la Noche (00:00 antes que 21:00)

## Fase 3: US1 - Tomas agrupadas por momento del día (P1) 🎯 MVP

**Prueba independiente**: tomas 00:00, 08:00 y 16:00 → Noche, Mañana, Tarde.

- [X] T004 [US1] En `frontend/src/features/consultations/MedicationCard.tsx`: en lugar de la fila única de chips del día seleccionado, un bloque por grupo de `groupByPeriod(chips)`: `role="group"` con `aria-label` del título, título `text-xs font-extrabold uppercase tracking-[0.1em] text-ink-soft` y sus chips (`flex flex-wrap gap-2.5`); marcar, estados, selector de día y barra sin cambios (research R3)
- [X] T005 [US1] Pruebas en `frontend/src/features/consultations/ConsultationDetailPage.test.tsx`: los tres grupos con su título y cada toma en el suyo, no aparecen grupos vacíos, un solo grupo, marcar una toma de un grupo sigue funcionando, al cambiar de día los grupos se rearman; actualizar las pruebas existentes que buscan chips fuera de un grupo
- [X] T006 [US1] E2E en `frontend/e2e/detalle-consulta-movil.spec.ts` y `detalle-consulta-web.spec.ts` (390 y 1280 px): con tomas 00:00/08:00/16:00, `getByRole('group', { name: 'Mañana' })` contiene 08:00, Tarde 16:00 y Noche 00:00

## Fase 4: Pulido

- [X] T007 Diseño: capturas del detalle con los tres grupos y con uno solo, en móvil (390) y web (1280); mostrarlas al usuario para aprobarlas
- [X] T008 [P] Anotar en `specs/007-homologar-pantallas-a-mocks/spec.md` la agrupación como adición sin mock; mapas: `CLAUDE.md` (feature 015), `frontend/CLAUDE.md` (`dayPeriods.ts`); B1 hecho en `BACKLOG.md`
- [X] T009 Calidad: `npx tsc --noEmit -p tsconfig.app.json && npx eslint . && npx vitest run --coverage` (>90 %); E2E afectados en los tres navegadores
- [X] T010 Commit, push, PR a `develop` y code review

## Dependencias

Fase 1 → 2 → US1 → Pulido. T003 en paralelo con T004.

## Estrategia

MVP = US1 completa; un solo PR.
