---

description: "Lista de tareas de la spec 023: el calendario como selector de día de «Medicamentos»"
---

# Tareas: El calendario como selector de día de «Medicamentos»

**Entrada**: `/specs/023-calendario-selector-de-dia/` (plan.md, spec.md, research.md, data-model.md, quickstart.md)

**Pruebas**: obligatorias (Principio VI): >90 % y Playwright a 390 y 1280 px. Solo frontend; sin API ni migraciones.

**Organización**: US1 (tocar un día y ver sus tomas en las tarjetas) y US2 (día inicial) son las dos P1 y comparten el
mismo cambio de estado; se hacen juntas.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Línea base

- [x] T001 Desde la rama `feature/023-calendario-selector-de-dia` (sale de la 022): `cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx vitest run` en verde antes de tocar nada

## Fase 2: Datos (base)

- [x] T002 [US1] `frontend/src/features/consultations/treatmentDays.ts`: agrega `dosesOfDay(medication, day)` (las tomas del medicamento con `dayKey(scheduledAt) === day`, en el orden en que vienen); quita `nextDose`, `dosesOn` y el tipo `DayDose`. Pruebas en `treatmentDays.test.ts` (un día con varias tomas, un día sin tomas, canceladas y agregadas incluidas); quita las de `nextDose`/`dosesOn`

## Fase 3: US1 + US2 — el calendario elige, las tarjetas muestran

- [x] T003 [US1] [US2] `ConsultationDetailPage.tsx`: `const [picked, setPicked] = useState<string | null>(null)` **antes** de los `return` de carga y error; con los datos, `selectedDay = picked ?? initialDay(numbered(consultation.medications), today)` (`today = dayKey(useLocalDay().from)`, que ya existe en la página); pasa `selected={selectedDay}` y `onSelect={setPicked}` al calendario y `day={selectedDay}` y `today` a cada `MedicationCard` (ambos diseños)
- [x] T004 [US1] `TreatmentCalendar.tsx`: pasa a controlado (`selected: string | null`, `onSelect(day)` por props; quita su `useState` de `selected`; conserva `view` y su mes inicial a partir de `selected`); quita el divisor `h-px`, `<DayDoses/>` y su import; borra `DayDoses.tsx`. Cambiar de mes no cambia `selected`
- [x] T005 [US1] `MedicationCard.tsx`: quita el cálculo de «hoy o el día más cercano» (líneas del `shownDay`) y el `useState(now)`; recibe `day: string | null` y `today: string`; las tomas son `day ? dosesOfDay(medication, day) : []`. Con `day`: título del día entre el progreso y los grupos, «Tomas de hoy» si `day === today`, si no «Tomas del 3 de octubre» (`longDay`), con el estilo de rótulo pequeño de R3; si no hay tomas ese día, «Este día no tiene tomas.» y ningún grupo; con `day === null` ni título ni aviso. Progreso, horario, «Terminado el…», «Se recorrió el…» y los botones siguen usando **todas** las tomas (FR-008)
- [x] T006 [P] [US1] Limpieza (R4): `DoseChip.tsx` vuelve a un solo aspecto (quita `appearance`, `desktop`, `next` y la rama `calendar`; si ya nadie usa `label`, también); `doseStatus.ts` quita `CALENDAR_CHIP_STYLE` y `CALENDAR_CHIP_NOTE`; borra de `DoseChip.test.tsx` lo del aspecto `calendar`. Confirma con `grep` que no queda ningún uso de lo borrado

## Fase 4: Pruebas

- [x] T007 [US1] [US2] Unitarias: `MedicationCard.test.tsx` (día recibido, «Tomas de hoy» / «Tomas del …», «Este día no tiene tomas.», `day=null` sin título, el progreso no depende del día); `TreatmentCalendar.test.tsx` (llama `onSelect` con el día tocado, ya no lista tomas ni muestra «Tomas del día», cambiar de mes no llama `onSelect`, conserva `aria-pressed`); `ConsultationDetailPage.test.tsx` (tocar un día cambia las dos tarjetas a la vez, marcar una toma de otro día actualiza tarjeta, punto y progreso sin perder el día, abre en hoy o en el primer día, en un tratamiento terminado abre en el primer día); ajusta las que buscaban la lista del día
- [x] T008 [US1] E2E: `frontend/e2e/calendario-tratamiento.spec.ts` — «tocar un día lista sus tomas…» pasa a «tocar un día cambia las tarjetas» (el día 3: Amoxicilina y Paracetamol con sus chips; el día 5: Paracetamol dice «Este día no tiene tomas.»), marcar una toma de otro día en la tarjeta actualiza «1 / 21 tomas» y el punto; el de «día fuera del tratamiento» pasa a leerse en las tarjetas; el de finalizar comprueba que las canceladas se alcanzan tocando su día. Revisa `recorrer-tratamiento.spec.ts` y cualquier otro que use la lista

## Fase 5: Cierre

- [x] T009 [P] Documentación: `specs/005-…/design-tokens.md` (la lista del día y los chips `calendar` ya no existen), `CLAUDE.md` (línea de la feature 023), `frontend/CLAUDE.md` (mapa: calendario controlado, `dosesOfDay`, tarjeta con día; quitar `DayDoses`, `nextDose`, `appearance="calendar"`), notas en `specs/019` y `specs/022` (la lista del día la sustituye la 023), y `BACKLOG.md` (la entrada pasa a «hecho en `specs/023-…`»)
- [ ] T010 Calidad: `cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx eslint src && npx vitest run --coverage` (>90 %); E2E completos en los tres navegadores (`npx playwright test --workers=2`); capturas a 390 y 1280 px (calendario + tarjetas, día de hoy y otro día) para mostrárselas al usuario
- [ ] T011 Commit, push, code review, PR a `develop` (base: si el PR #22 ya está en `develop`, se reajusta la base; si no, el PR apunta a `feature/022-rebranding-calendario`)

---

## Dependencias y orden

T001 → T002 → T003/T004/T005 (T003 define las props que T004 y T005 reciben; se hacen en ese orden) → T006 (después de T004, que borra el último uso de lo que T006 quita) → T007 → T008 → T009 → T010 → T011.
Paralelizable: T006 y T009 tocan archivos que nadie más toca en su fase.

## Estrategia

Un solo cambio pequeño y coherente: sin el estado en la página no hay nada que comprobar, así que no hay un MVP parcial útil;
se entrega todo junto (la lista no se quita hasta que las tarjetas ya muestren el día elegido, T003-T005 en el mismo paso).
