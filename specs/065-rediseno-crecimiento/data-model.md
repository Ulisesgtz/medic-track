# Modelo de datos: Rediseño de «Crecimiento»

No hay datos nuevos ni cambios en la API. Se leen los mismos tipos de la spec 063 (`features/growth/types.ts`): `GrowthList`, `Measurement` y `GrowthChart`. Aquí se describe el **modelo de vista** que la pantalla deriva de ellos.

## Estado de la pantalla

| Estado | Se da cuando | Muestra |
|---|---|---|
| A / B | Hay medidas, `chartAvailable` y la tabla elegida | Encabezado con «+ Anotar medida», última medida, registro, gráfica (Peso = A, Talla = B), lista o tabla |
| C | `measurements.length === 0` | Tarjeta vacía con «Anotar la primera medida» (si `canEdit`), la nota OMS y el registro |
| D | `referenceSex === null` y la referencia disponible | La gráfica solo con puntos y la invitación Niña·Niño (si `canEdit`; si no, la frase de quién la elige) |
| E | `!chartAvailable` o la gráfica responde `plan_required` | La tarjeta bloqueada en lugar de la gráfica, la nota OMS afuera y la lista completa |
| F | `!canEdit` | La nota «Vista de Cuidadora» (o «Solo lectura»), sin acciones de escritura y con la frase de la tabla |

Los estados se combinan. Por ejemplo, F + D es una Cuidadora sin tabla elegida.

## Gráfica (`chartModel.ts`, puro)

- `Indicator`: `'weight' | 'height'`, que es la pestaña.
- `RangeKind`: `'short' | 'full'`.
- `shortRangeMonths(birthDate, today, refMax)`: 12 · (años completos + 1), sin pasar de `refMax`.
- `fullRangeMonths(indicator, reference, lastPointMonths)`: 120 o 228 con referencia; sin ella, `max(rango corto, última medida)`.
- `rangeLabel(kind, months, indicator, hasReference)`:
  - rango corto: «0–3 años» / «0–1 año»;
  - rango completo: «Hasta 10 años» / «Hasta 19 años», o «Todo» sin referencia.
- `xTicks(xMax)`: lista de `{ months, label, long }` y las posiciones de «meses» y «años».
- `yAxis(points, curves, xMax)`: `{ y0, y1, ticks }`.
- `visiblePoints(points, xMax)`: los puntos dentro del rango, en orden.
- `nearestIndex(xs, x)`: el índice del punto más cercano en x.
- `smoothPath(points)`: el trazo suavizado de una curva, como `smooth()` del mock.
- `layout(desktop)`: `{ W, H, L, R, T, B, fs, line, r }`, con 316×264, 36/40/28/50, 13, 2.5 y 5 en el teléfono, y 854×380, 48/54/30/54, 14, 3 y 6 en la web.

## Selección

- Estado local: `{ indicator, range, selected }`.
- Por omisión: `indicator = 'weight'`, `range = 'short'` y `selected = null` (la última visible).
- Al cambiar de pestaña, `selected = null`.
- Al cambiar de rango se conserva la medida elegida si sigue visible.
- Nada se guarda al salir.

## Formatos (`growthText.ts`)

- `kgText(v)`: un decimal («9.0 kg»), o dos si el dato los trae («11.45 kg»).
- `cmText(v)`: «82 cm» o «59.5 cm».
- `valuesLine(kg, cm)`: «11.4 kg · 82 cm», solo con los valores que existan.
- `sinceLine(today, on)`: «hoy», «ayer», «hace N días», «hace N meses», «hace N años» o «hace 1 año».
- `ageAt(birth, on)`:
  - «4 semanas» antes de los 3 meses;
  - «3 meses» antes de los 12;
  - «1 año 1 mes» o «2 años» desde los 12.
- `formatDateShortNoPad('2026-10-03')`: «3 oct 2026».
