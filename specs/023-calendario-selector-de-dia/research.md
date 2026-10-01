# Investigación: El calendario como selector de día de «Medicamentos»

## R1 — Dónde vive el día elegido

**Decisión**: en `ConsultationDetailPage`, como `picked: string | null` (lo que el padre tocó). El día efectivo es
`picked ?? initialDay(numbered(medications), today)` (la regla de la spec 019: hoy si está dentro del tratamiento; si no,
el primer día; `null` si no hay tomas). El `useState` va **antes** de los `return` tempranos de carga y error (reglas de los
hooks); el cálculo del día efectivo, después de tener los datos.
**Por qué**: hoy `TreatmentCalendar` guarda `selected` con un `useState` interno y las tarjetas no lo ven. Hay dos
consumidores (calendario y N tarjetas) y un solo padre común: la página. No hace falta contexto ni librería.
**Matiz**: mientras el padre no toque nada el día por omisión **sigue a hoy** (`useLocalDay` pasa de día a la medianoche);
una vez que toca un día, ese día se queda, aunque pase la medianoche (escenario 2.3 de la spec). Antes el calendario
congelaba el día inicial al montarse; esto es más simple y no deja datos viejos.
**Alternativas**: contexto de React (excesivo para un padre y dos hijos); estado en el calendario con `onChange` hacia
arriba (dos fuentes de verdad).

El calendario conserva dentro **solo el mes que se ve** (`view`), que sigue siendo estado suyo: cambiar de mes no cambia el
día elegido (caso límite de la spec). Su `view` inicial sale del día efectivo al montarse, como hoy.

## R2 — Una sola regla de día para las tarjetas

**Decisión**: las tarjetas dejan de calcular «hoy o el día más cercano de **su** medicamento o el último»
(`MedicationCard` líneas 33-37) y reciben `day`. Las tomas del medicamento en ese día salen de
`dosesOfDay(medication, day)` (tomas con `dayKey(scheduledAt) === day`, en el orden que ya traen); `groupByPeriod`
(spec 015) las agrupa igual que hoy.
**Efecto aceptado por el usuario** (spec, Supuestos): en un tratamiento terminado las tarjetas abren en el primer día.
**Sin tomas en la consulta** (`day === null`): la tarjeta no pone título de día ni chips, como ahora.

## R3 — Textos de la tarjeta

- Título del día, entre el horario/progreso y los grupos: **«Tomas de hoy»** si `day === today`, si no
  **«Tomas del 3 de octubre»** (`longDay`, el mismo que el nombre de los días del calendario). Es el mismo texto que tenía
  la lista que se borra; así el padre reconoce lo que ya leía. Se pinta con el estilo de los rótulos pequeños de la tarjeta
  (`text-xs font-extrabold tracking-[0.1em] text-ink-soft uppercase`), no como un encabezado grande: es una etiqueta de la
  tarjeta, no una sección nueva.
- Sin tomas ese día: **«Este día no tiene tomas.»** (`text-sm font-semibold text-slate-600`, como el aviso de la lista).
- Se llama a `today` por una prop (`today: string`, `dayKey(useLocalDay().from)` que ya calcula la página).

## R4 — Qué se borra

Todo lo que solo existía para la lista del día (spec 022):
- `DayDoses.tsx` entero; el divisor `h-px` del calendario y su `<DayDoses/>`.
- `DoseChip`: la apariencia `calendar` y las props `appearance`, `desktop`, `next` (queda el chip único de las tarjetas,
  con su prop `label` solo si algo la sigue usando; si no, también se quita).
- `doseStatus.ts`: `CALENDAR_CHIP_STYLE`, `CALENDAR_CHIP_NOTE`.
- `treatmentDays.ts`: `nextDose`, `dosesOn`/`DayDose` (la lista era su único uso; se sustituyen por `dosesOfDay`).
- «próxima» y las filas con círculo de color (la tarjeta no las lleva, ya dicho en los Supuestos de la spec).
**Se queda**: la leyenda de medicamentos del calendario, los puntos, el día elegido en tinta, `CalendarLegendCard`, y los
nombres accesibles de los días.

## R5 — Sin cambios de datos

Todo sale de `consultation.medications[].doses[]`, que el detalle ya trae (con `status`, `taken`, canceladas y las agregadas
por un recorrido). Marcar una toma ya refresca el detalle (`useDoseToggle`); las tarjetas y el calendario leen el mismo
dato, así que se actualizan juntos y el día elegido (estado de la página) no se pierde. El progreso, «Terminado el …»,
«Se recorrió el …» y los botones siguen usando **todas** las tomas del medicamento (FR-008): no se tocan.

## R6 — Pruebas

- Unitarias: `treatmentDays` (`dosesOfDay`), `MedicationCard` (día recibido, título «de hoy»/«del …», sin tomas, sin día),
  `TreatmentCalendar` (llama `onSelect`, ya no lista tomas, conserva el mes al cambiar de mes), `ConsultationDetailPage`
  (tocar un día cambia las dos tarjetas; marcar una toma de otro día; ya no existe `Tomas del día`), `DoseChip`
  (solo el aspecto único).
- E2E (390 y 1280 px): `calendario-tratamiento.spec.ts` — «tocar un día lista sus tomas…» pasa a «tocar un día cambia las
  tarjetas», marcar una toma de otro día actualiza progreso y punto; los casos de día fuera del tratamiento y de finalizar
  siguen con los nombres de los días. Se busca en `recorrer-tratamiento.spec.ts` cualquier uso de la lista.
- Visual: capturas a 390 y 1280 px de la pantalla (calendario + tarjetas) para mostrárselas al usuario antes de cerrar.
