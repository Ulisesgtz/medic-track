---
description: "Tareas de la spec 078 — la opción elegida en azul de acción"
---

# Tareas: La opción elegida en azul de acción

**Entrada**: `specs/078-seleccion-azul/` (spec con el inventario, plan, research R1–R5, quickstart).
**Pruebas**: obligatorias (> 90 %; E2E de los flujos tocados a 390 y 1280 px).
**Organización**: una sola historia (US1: lo elegido en el azul de la app).

## Fase 1: Fundamental

- [X] T001 `frontend/src/shared/ui/selection.ts`: `selectedFill = 'border-action bg-action text-white'`, `selectedCard = 'border-action'`, `selectedDotRing = 'border-action'`, `selectedDot = 'bg-action'` (research R1), con comentario de la regla y su prueba unitaria

## Fase 2: US1 — Lo elegido en azul (P1) 🎯

- [X] T002 [P] [US1] `features/supplements/RoutineForm.tsx`: `segmentOn` → `selectedFill` (días, «Todos los días / Ciertos días», «minutos / horas», «Sin fin / Hasta una fecha»); tarjetas «Cuándo se hace»: borde de la elegida `selectedCard` (`bg-hint` se queda), aro y punto del radio `selectedDotRing`/`selectedDot`
- [X] T003 [P] [US1] `features/supplements/ActivityTypePicker.tsx`: `chipOn` → `selectedFill` (la palomita sigue blanca); el borde de error en tinta NO cambia
- [X] T004 [P] [US1] `features/appointments/AppointmentFields.tsx`: segmentado «Tiempo antes / Días antes a una hora» → `selectedFill` (el recuadro «Nuevo aviso» y los bordes de los campos no cambian)
- [X] T005 [P] [US1] `features/childRecord/RecordFormParts.tsx`: chips de tipo de alergia y de tipo de sangre → `selectedFill`
- [X] T006 [P] [US1] `features/family/InviteForm.tsx`: tarjetas de rol → borde `selectedCard`, aro y punto `selectedDotRing`/`selectedDot` (el aro de foco no cambia)
- [X] T007 [P] [US1] `features/family/merge/ChoiceCard.tsx`: borde de la tarjeta elegida `selectedCard`; círculo con palomita `selectedDotRing` + `selectedDot`
- [X] T008 [P] [US1] `features/growth/ChartCard.tsx`: pastillas de rango → `selectedFill` (las pestañas Peso/Talla y Niña/Niño NO cambian)
- [X] T009 [P] [US1] `features/medicineCabinet/CabinetFormPage.tsx`: chips de unidad → `selectedFill`
- [X] T010 [US1] Actualizar las pruebas unitarias que esperaban `bg-ink`/`border-ink` en lo elegido

## Fase 3: Pulido

- [X] T011 `frontend/src/shared/ui/noInkSelection.test.ts` (research R4): falla si un archivo del inventario vuelve a dibujar la elegida con `bg-ink text-white` o `border-ink bg-ink`, y comprueba que importa `shared/ui/selection`
- [X] T012 Regla en `specs/005-identidad-visual-front-end/design-tokens.md` («Lo elegido va en `action` con texto blanco y una segunda señal; la tinta queda para texto») y en «Sistema visual» de `frontend/CLAUDE.md`; línea de la spec 078 en `CLAUDE.md`
- [X] T013 Comparar a 390 y 1280 px cada pantalla del inventario antes/después (capturas en el scratchpad, no en el repo): solo cambia la opción elegida; contraste 5.36:1
- [X] T014 Suites: `npx vitest run --coverage`, `npx tsc --noEmit`, `npx eslint .`; E2E del quickstart con `scripts/e2e-local.sh --workers=2`

## Dependencias

T001 → T002–T009 (en paralelo, archivos distintos) → T010–T014.
