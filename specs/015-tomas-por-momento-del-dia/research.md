# Investigación: Tomas por momento del día

## R1. Solo presentación, en el frontend

**Decisión**: el momento de cada toma se calcula en el navegador con la hora local con la que ya se muestra la toma
(`formatTime` usa `getHours`/`getMinutes` locales). Sin cambios de API, datos ni migración.

**Justificación**: la hora local del padre es lo que el padre ve en el chip; calcularla en el servidor exigiría mandar la
zona horaria y duplicar la regla (Principio V).

## R2. Función pura `dayPeriod`

**Decisión**: `dayPeriods.ts` con `periodOf(isoDate) → 'morning' | 'afternoon' | 'night'` por la hora local:
Mañana 05:00–11:59, Tarde 12:00–18:59, Noche 19:00–04:59, y `groupByPeriod(doses)` que devuelve solo los grupos con tomas,
en el orden Mañana, Tarde, Noche; dentro de cada grupo, las tomas por hora del día (la Noche, cronológica: 00:00–04:59 del
día y luego 19:00 en adelante). Los rangos viven en una sola tabla (`PERIODS`) para cambiarlos en un lugar.

**Justificación**: se prueba sin renderizar, con los bordes exactos (04:59, 05:00, 11:59, 12:00, 18:59, 19:00).

## R3. Presentación

**Decisión**: en `MedicationCard`, en lugar de una sola fila de chips, un bloque por grupo con un título pequeño
(`text-xs font-extrabold uppercase text-ink-soft`, como las otras etiquetas de la pantalla) y sus chips debajo (mismo
`flex-wrap gap-2.5`). El grupo es un `role="group"` con `aria-label` "Mañana"/"Tarde"/"Noche". Un solo grupo con tomas
sigue mostrando su título (FR-002). Marcar, estados (spec 013), el selector de día y la barra (spec 014) no cambian.

## R4. Cambio de horario de verano y zona horaria

Cada toma cae según su hora local tal como se muestra; no hay regla especial (FR y casos límite de la spec).

## R5. Pruebas

Unitarias de `periodOf`/`groupByPeriod` (bordes, un grupo, grupos vacíos, orden de la Noche); tarjeta del medicamento
(grupos con título, sin grupos vacíos, marcar sigue igual, el día cambia y se rearman); E2E móvil y web con las tomas
00:00 / 08:00 / 16:00 (Noche, Mañana, Tarde).
