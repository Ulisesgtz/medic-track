---

description: "Lista de tareas de la spec 022: rebranding de los colores del calendario"
---

# Tareas: Rebranding de los colores del calendario

**Entrada**: `/specs/022-rebranding-calendario/` (plan.md, spec.md, research.md, quickstart.md, referencia/)

**Pruebas**: obligatorias (Principio VI): >90 % y Playwright a 390 y 1280 px. Solo frontend.

**Organización**: US2 (colores) es la base; US1 (el calendario nuevo) la usa.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [ ] T001 Línea base: `cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx vitest run` en verde
- [ ] T002 [US2] Colores: `--color-med-1…6` en `frontend/src/index.css` = `#0e7490`, `#7c3aed`, `#db2777`, `#2563eb`, `#475569`, `#78350f`; medir contraste (blanco ≥ 4.5:1, puntos sobre `#ecfeff` ≥ 3:1) y actualizar la tabla «Colores de medicamento» de `specs/005-identidad-visual-front-end/design-tokens.md` (rosa y el porqué: es el del diseño y no un color de alerta); clases literales `MED_BORDER` junto a `MED_BG`/`MED_TEXT` en `treatmentDays.ts`

## Fase 2: Datos de los puntos (base)

- [ ] T003 [US1] `treatmentDays.ts`: `numbered()` guarda las tomas no canceladas por día; `DayMark` gana `taken` (todas dadas); `slotsOf(día, meds)` devuelve una ranura por medicamento en su orden (con `null` donde no hay toma); `markLabel` dice «(dada)» / «(sin dar)»; `firstPendingOf(día, medications)` para «próxima»; pruebas de `treatmentDays.test.ts` (relleno solo si todas dadas, lugar fijo con huecos, nombres, inicio/fin se conservan en el nombre)
- [ ] T004 [P] [US1] Chips: `doseStatus.ts` agrega `CALENDAR_CHIP_STYLE` y textos de segunda línea por estado (R5: `taken` verde «dada», `due` ámbar «por marcar», `unregistered` punteado «sin registrar», `pending` punteado blanco con «próxima» solo si `next`, `canceled` el de la spec 016); `DoseChip` gana `appearance="calendar"` y `next`, con anchos 130 / 160 px; pruebas en `doseStatus.test.ts` y `DoseChip`

## Fase 3: US1 - El calendario nuevo

- [ ] T005 [US1] Reescribir `TreatmentCalendar.tsx` con las medidas del diseño (research R1) por `variant`: tarjeta, encabezado con botones de mes, días de la semana 13 px `#64748b`, cuadrícula con hueco 4 / 6 px, pastilla del tratamiento, día fuera del tratamiento en `#64748b`, día elegido en `#04252b` con aro `#22d3ee`, puntos 7 / 8 px con ranuras fijas (3 columnas, una fila por cada tres medicamentos), puntos cian en el día elegido, leyenda con círculos 26 / 22 px, divisor y título del día; nombre accesible del día con los medicamentos, «inicio de / fin de» y «dada / sin dar»; sin marca visual de hoy (queda `aria-current="date"`)
- [ ] T006 [US1] `DayDoses.tsx`: fila del diseño (círculo 26 / 24 px, nombre 14 px 800 con puntos suspensivos, chip calendar de ancho fijo), «próxima» en la primera toma pendiente del día; nombres accesibles sin cambios («Amoxicilina, 08:00»)
- [ ] T007 [P] [US1] Crear `CalendarLegendCard.tsx` («Cómo leer el calendario»: punto relleno = dosis dada, punto vacío = dosis sin dar, día dentro del tratamiento) y montarla en la columna derecha de la web de `ConsultationDetailPage.tsx`, bajo «Tratamiento activo»; solo en el diseño web
- [ ] T008 [US1] Pruebas: `TreatmentCalendar.test.tsx`, `DayDoses.test.tsx`/`ConsultationDetailPage.test.tsx`, `CalendarLegendCard.test.tsx` (puntos rellenos/vacíos y lugar fijo, día elegido, días fuera, 4–6 medicamentos en dos filas, nombres, chips por estado, tarjeta solo en la web); ajustar los E2E `calendario-tratamiento.spec.ts` y `recorrer-tratamiento.spec.ts` a los nombres nuevos de los días y a que ya no hay círculos de inicio/fin

**Punto de Control**: el calendario se ve como el diseño y conserva su comportamiento.

## Fase 4: Comparación y pulido

- [ ] T009 Comparación con el mock (regla de los mocks): script local de Playwright que abre el standalone y la app con los mismos datos a 430 y 1024 px, captura y pone lado a lado; revisar sección por sección y corregir; listar toda diferencia restante con su motivo (las 12 desviaciones) y mostrar las capturas al usuario para aprobarlas
- [ ] T010 [P] Documentación: `CLAUDE.md` (feature 022), `frontend/CLAUDE.md` (calendario con puntos, chips `calendar`, `CalendarLegendCard`, colores), `specs/007` (nota), `specs/019` y `specs/020` (nota: el aspecto lo reemplaza la 022) y `BACKLOG.md` (segundo turno del diseño: inicio y fin visibles)
- [ ] T011 Calidad: `npx tsc --noEmit -p tsconfig.app.json && npx eslint . && npx vitest run --coverage`; E2E afectados en los tres navegadores
- [ ] T012 Commit, push, PR a `develop` y code review

## Dependencias

T001 → T002 → T003 (T004 en paralelo) → T005 → T006 (T007 en paralelo) → T008 → T009 → Pulido.

## Estrategia

Un solo PR: es un cambio visual coherente y se prueba entero contra el diseño.
