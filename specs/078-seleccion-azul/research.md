# Investigación — Spec 078: la opción elegida en azul de acción

Fecha: 2026-11-20. Inventario de `implementar` (Sonnet, solo lectura); decisiones de la sesión principal y del dueño.

## R1. Un solo juego de clases compartido

**Hallazgo**: cada pantalla escribe su propia clase de «elegida» (`segmentOn`, `chipOn`, condiciones en línea con
`bg-ink text-white` o `border-ink`). Por eso el oscuro se repitió en 9 controles.

**Decisión**: `frontend/src/shared/ui/selection.ts` con las clases del estado elegido, para que todas las pantallas usen la
misma y una prueba pueda vigilarla:

- `selectedFill` = `border-action bg-action text-white` (segmentados, chips, pastillas de rango).
- `selectedCard` = `border-action` (borde de la tarjeta de opción; su fondo `bg-hint` se queda).
- `selectedDot` = aro `border-action` y punto `bg-action` del radio de una tarjeta de opción.

Las clases de lo **no** elegido, medidas y radios de cada control no cambian.

**Alternativa descartada**: un token nuevo `--color-selected`: sería otro nombre para `action` y el sistema ya usa `action`
(selector de hora, síntomas, barra lateral).

## R2. Segunda señal (no solo color)

Ya existe en todos: palomita en los chips de tipo de actividad, ficha y unir hijos; punto en las tarjetas de opción; el
segmentado cambia de relleno. No se agregan señales nuevas.

## R3. Contraste

Blanco sobre `#0e7490` = 5.36:1 (AA). El aro de foco (`ring-action` / `ring-offset`) sigue visible sobre el relleno porque
lleva desplazamiento blanco; donde un control use `ring-ink` de foco, se queda.

## R4. Prueba que vigila la regla

`frontend/src/shared/ui/noInkSelection.test.ts`: lee los archivos del inventario y falla si alguno vuelve a dibujar la elegida
con `bg-ink text-white` / `border-ink bg-ink`; y comprueba que importan `shared/ui/selection`. Además se actualizan las pruebas
unitarias que esperaban `bg-ink`.

## R5. Sin API, migración ni textos nuevos

Solo clases. E2E: los flujos existentes (actividades, tipos de actividad, crecimiento, ficha, botiquín, familia, unir hijos,
citas) deben seguir pasando; ninguno revisa colores, salvo que alguno lo haga y se ajuste.
