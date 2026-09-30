---

description: "Lista de tareas de la spec 019: calendario del tratamiento"
---

# Tareas: Calendario del tratamiento

**Entrada**: `/specs/019-calendario-tratamiento/` (plan.md, spec.md, research.md, data-model.md, contracts/calendar-ui.md, quickstart.md)

**Pruebas**: obligatorias (Principio VI): >90 % en React y Playwright a 390 y 1280 px. Solo frontend.

**Organización**: US1 (ver el calendario) y US2 (tocar un día) comparten las funciones puras y el componente; US1 entrega
el calendario con sus marcas y US2 agrega la lista del día.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [ ] T001 Línea base: `cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx vitest run` en verde
- [ ] T002 Colores: medir los seis candidatos de research R3 con un script (contraste ≥ 3:1 contra `canvas` y `surface`, ≥ 4.5:1 del número blanco, distinguibles simulando deuteranopia y protanopia), ajustar los que no pasen y agregar `--color-med-1 … --color-med-6` al bloque `@theme` de `frontend/src/index.css` y una tabla «Colores de medicamento» a `specs/005-identidad-visual-front-end/design-tokens.md` con sus valores y el porqué de los descartados

## Fase 2: Funciones puras (base de US1 y US2)

- [ ] T003 Crear `frontend/src/features/consultations/treatmentCalendar.ts`: `dayKey(instant)` (movido de `MedicationCard.tsx`, que lo importa), `medicationRange(medication)` (research R2: primer a último día; con `endedAt` hasta `min(último, día de endedAt)`; `null` si queda vacío), `medicationNumber`/`medColorClass(n)` (color `((n − 1) % 6) + 1`), `marksOn(day, medications)` (números de los medicamentos cuyo rango contiene el día), `treatmentDays(medications)` (primer y último día de todos los rangos), `monthsWithTreatment`, `monthGrid(year, month)` (semanas lunes a domingo con los días del mes anterior y siguiente marcados como ajenos), `initialDay(medications, today)` (hoy si está dentro de algún rango, si no el primer día) y `dosesOn(day, medications)` (tomas de todos los medicamentos de ese día ordenadas por hora, con su medicamento y número)
- [ ] T004 [P] Pruebas `treatmentCalendar.test.ts`: rango simple, rango con `endedAt` dentro, igual al último día, antes del primer día (vacío) y después del último; frecuencia de 48 h (los días intermedios llevan marca); cruza de mes y de año; bordes de la cuadrícula (mes que empieza en lunes y en domingo, febrero bisiesto); colores se repiten con el 7.º; `initialDay` con hoy dentro, antes y después del tratamiento; `dosesOn` ordena por hora entre medicamentos; hora local con `vi.stubEnv('TZ', …)`

**Punto de Control**: las funciones puras pasan con >90 % y no dependen de React.

## Fase 3: US1 - Ver el tratamiento completo en un calendario (P1) 🎯 MVP

- [ ] T005 [US1] Crear `frontend/src/features/consultations/TreatmentCalendar.tsx` (propiedades `consultationId`, `medications`, `today`, `variant`): título del mes (`aria-live="polite"`), flechas «Mes anterior»/«Mes siguiente» limitadas a `monthsWithTreatment`, cabecera `L M M J V S D`, cuadrícula de botones por día con marcas numeradas del color de cada medicamento (hasta 6, `aria-hidden`), nombre accesible «30 de septiembre · 1 Amoxicilina, 2 Paracetamol», hoy con `aria-current="date"` y anillo, días ajenos al mes o fuera del tratamiento atenuados pero legibles (≥ 4.5:1), selección con `aria-pressed`, leyenda «1 Amoxicilina …» en el orden de la consulta; `min-h-11`, focus visible, `cursor-pointer`, sin desplazamiento horizontal a 390 px; móvil y web como dos variantes (`variant`), con los tokens de `design-tokens.md`
- [ ] T006 [US1] Montar el bloque «Calendario del tratamiento» **antes** de «Medicamentos» en `ConsultationDetailPage.tsx`: sección a ancho completo en el móvil y tarjeta en la columna izquierda de la web; `today` de `useLocalDay().from`; el día seleccionado se conserva entre refrescos del detalle
- [ ] T007 [US1] Pruebas `TreatmentCalendar.test.tsx` y en `ConsultationDetailPage.test.tsx`: un solo calendario con varios medicamentos y su leyenda, marcas en los días del rango y no fuera, dos medicamentos el mismo día muestran ambas marcas, finalizado antes de tiempo termina en su día, hoy distinguido, flechas limitadas al primer y último mes con tratamiento (y nunca un mes vacío), un medicamento, más de 6 (colores repetidos, números únicos), móvil y web

**Punto de Control**: el padre ve hasta cuándo dura cada medicamento sin cambiar de día.

## Fase 4: US2 - Tocar un día para ver sus tomas (P1)

- [ ] T008 [US2] Mover `DoseChip` de `MedicationCard.tsx` a `DoseChip.tsx` (prop opcional `label` para el nombre accesible; sin ella sigue «Toma de 08:00») y crear `DayDoses.tsx`: encabezado «Tomas del 30 de septiembre» / «Tomas de hoy», filas de todos los medicamentos ordenadas por hora con marca numerada, nombre del medicamento y el chip con `label = "<medicamento>, <hora>"`; vacía: «Ese día no hay tomas.»; conectarla a `TreatmentCalendar` (tocar un día lo selecciona y actualiza la lista)
- [ ] T009 [US2] Pruebas `DayDoses.test.tsx` y en `TreatmentCalendar.test.tsx`: tocar un día muestra sus tomas de todos los medicamentos por hora; marcar una llama a la mutación y se actualiza (también en el chip del medicamento); día sin tomas; día inicial (hoy dentro / primer día); estados sin registrar y cancelada conservan su aspecto y reglas; los nombres «Toma de 08:00» de `MedicationCard` siguen siendo únicos
- [ ] T010 [US1] [US2] E2E `frontend/e2e/calendario-tratamiento.spec.ts` (390 y 1280 px): consulta con dos medicamentos de duración distinta → un calendario con leyenda y marcas (7 y 3 días), tocar el día 3 lista las tomas de los dos, marcar una y ver la barra del medicamento cambiar sin recargar, tocar un día sin tomas, flechas de mes en un tratamiento que cruza de mes, finalizar un medicamento y ver su marca terminar ese día

**Punto de Control**: tocar un día muestra y permite marcar sus tomas.

## Fase 5: Pulido

- [ ] T011 Diseño: capturas del calendario, el día elegido y la leyenda en 390 y 1280 px con 1, 3 y 7 medicamentos; contraste ≥ 4.5:1 en textos y ≥ 3:1 en marcas; mostrarlas al usuario para aprobarlas (FR-010) y decidir si el selector «Día anterior / Día siguiente» por medicamento sigue o se quita
- [ ] T012 [P] Documentación: `CLAUDE.md` (feature 019), `frontend/CLAUDE.md` (`TreatmentCalendar`, `DayDoses`, `DoseChip`, `treatmentCalendar.ts`, colores `med-*`), `specs/007-homologar-pantallas-a-mocks/spec.md` (desviación: calendario sin mock) y `BACKLOG.md` (B4 hecho)
- [ ] T013 Calidad: `npx tsc --noEmit -p tsconfig.app.json && npx eslint . && npx vitest run --coverage`; E2E afectados (detalle de consulta, tomas sin registrar, finalizar, progreso) en los tres navegadores
- [ ] T014 Commit, push, PR a `develop` y code review

## Dependencias

Fase 1 → Fase 2 (T003→T004) → US1 (T005→T006→T007) → US2 (T008→T009→T010) → Pulido. T002 va antes de T005.

## Estrategia

MVP = US1 (el calendario con sus marcas); US2 (la lista del día) va en el mismo PR porque sin ella el calendario no es
consultable, pero puede entregarse aparte.
