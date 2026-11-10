# Investigación: Rediseño de «Crecimiento»

Fuente: `referencia/Crecimiento PediTrack.dc.html` (Claude Design, 2026-11-09). Este documento habla de él como «el mock». Las medidas salen de su sección «Medidas y decisiones» y de su código: `svg()`, `cfg()`, `bundle()` y los estilos en línea.

## R1 — Qué se reemplaza y qué se reusa

- **Decisión**: Se reescriben las piezas de presentación.
  - `GrowthPage.tsx` se reparte en piezas chicas de `features/growth/`: `GrowthPage`, `LatestCard`, `RegisteredBox`, `ChartCard`, `MeasurementsList` (teléfono) / `MeasurementsTable` (web), `ChartLockedCard` y `EmptyCard`.
  - `GrowthChart.tsx` se rehace con el dibujo del mock.
  - `GrowthFormPage.tsx` se reacomoda al formulario G1/G2.
  - `chartScale.ts` se cambia por `chartModel.ts`, que es puro: rangos, marcas, escalas y el punto más cercano.
  - `growthText.ts` cambia sus frases a las del mock.

  Sin cambios se reusan:
  - `api.ts`, `hooks.ts` y `types.ts` (las mismas consultas `['growth', id]` y `['growth-chart', id]`);
  - `growthForm.ts`, salvo dos mensajes;
  - `monthsAt` y la confirmación de «Quitar» (`ConfirmDialog`);
  - `useUnsavedWork`, `StickyActionBar`, `RoutinePageFrame` / `PageHeader` y `FreemiumLimitModal`.
- **Justificación**: los datos y las reglas de la spec 063 no cambian; solo la vista. Así el cambio queda en una carpeta y sin API.
- **Alternativas**: retocar la página actual. Se descartó porque el orden, la jerarquía y la gráfica son otros.

## R2 — El encabezado

- **Decisión**: `RoutinePageFrame` / `PageHeader` tal cual.
  - El mock dibuja el mismo encabezado de la spec 056: «← Mateo» 15/700 de 44 de alto, título 28/900 en el teléfono y 34/900 en la web, subtítulo 15 / 16.
  - El subtítulo pasa a ser «{nombre} · {edad}» con `formatAgeLong`, como en el mock («Mateo · 2 años 1 mes»).
  - «+ Anotar medida» es la acción `pageHeaderButton('primary')`: en el teléfono va a todo lo ancho, a 12 px del subtítulo.
  - Se muestra solo con `canEdit` y medidas. Sin medidas, el botón sólido es el de la tarjeta vacía: uno solo por pantalla.
- **Alternativas**: un encabezado propio. Se descartó porque rompe el encabezado común de la spec 056.

## R3 — Medidas del mock (lo que se copia)

**Teléfono (390 px).**

- Relleno lateral de 20 px y 16 px entre bloques.
- Tarjetas con radio 16, borde de 1 px `#cfe8ec` y fondo blanco. La página usa canvas `#f8feff`.
- **«Última medida»**:
  - relleno 16/18;
  - etiqueta 13/800 en mayúsculas, color action, tracking 0.06em;
  - valor 34/900 con tracking −0.03em y números tabulares;
  - «hace…» 15/500 en color body.
- **Tarjeta de la gráfica**: relleno 16 y separación 12.
  - Riel de pestañas: fondo hint, borde hint-border, relleno 4 y radio 14.
  - Cada pestaña mide 44 de alto, con radio 11 y borde de 2.
  - Pestaña elegida: borde action, fondo blanco, texto ink 800. Pestaña sin elegir: transparente, texto action 700.
  - Rango: pastillas de 44 de alto, relleno 0 16, 15 px y borde 1.5. Elegida: fondo y borde ink, texto blanco 800. Sin elegir: borde hint-border, fondo blanco, texto action 700.
  - Lectura: caja con fondo canvas, borde hint-edge, radio 14 y relleno 6. ‹ › miden 44×44, con radio 12, borde 1.5 hint-border y glifo de 22/800 en color action; al llegar a un extremo quedan con opacidad 0.4. El valor va en 18/900 y la línea de abajo en 14/500.
  - SVG de 316×264 con márgenes L36 R40 T28 B50.
  - Selector Niña·Niño: riel de 3 de relleno y radio 13. Botón elegido con borde action y fondo blanco.
  - Nota OMS: fondo hint, borde hint-border, radio 14, relleno 12/14 y 14 px; la segunda línea va en 700 color ink.
- **Lista**:
  - título «Medidas anotadas» 20/900 con «N medidas» 14 a la derecha;
  - contenedor con radio 16, borde `#cfe8ec` y separadores de 1 px en hint-edge;
  - fila con relleno 12 16 4: fecha y valores 16/800, edad 14, «Anotada por» 13/600 `#475569`, nota 14, corrección 13/600;
  - acciones de 44 de alto, 14/800, separadas 20 («Quitar» en `#b91c1c`).
- **Caja del registro**: borde punteado 1.5 hint-border, radio 16, relleno 14/16; etiqueta 13/800 en mayúsculas, valor 17/800, texto 14.
- **Formulario**:
  - etiqueta 15/800;
  - campo de 52 de alto, radio 14, borde 1.5 `#6b8f97` (con error: 2 px `#b91c1c`) y texto 17;
  - sufijo «kg»/«cm» 15/700 en color body;
  - error 14/600 en `#b91c1c` con un círculo «!» de 18 px;
  - nota de 96 de alto mínimo;
  - barra fija: 14 arriba, 34 abajo, botón de 52.

**Web (1280 px, barra lateral de 280).**

- Contenido con relleno 28/48, ancho máximo 904 y 24 entre bloques.
- Fila superior con columnas 1.7fr / 1fr y 20 de separación:
  - la última medida con relleno 20/24 y valor 44/900;
  - la caja del registro con relleno 20/22 y valor 20/800.
- **Gráfica**: relleno 24 y separación 16.
  - Pestañas de 300 de ancho a la izquierda y el rango a la derecha, con pastillas de relleno 0 18.
  - Lectura en una línea 18/800, entre ‹ ›.
  - SVG de 854×380 con márgenes L48 R54 T30 B54.
  - Fila final: la nota OMS (15 px) a la izquierda y el selector a la derecha, con relleno 0 20.
- **Tabla**:
  - columnas `132px 128px 96px 96px 1fr 168px`, separación 16 y fila mínima de 64;
  - encabezado 13/800 en mayúsculas, color `#475569`, fondo canvas;
  - celdas de 16/800 (fecha), 15 (edad) y 16/700 (valores).
- **Formulario**: tarjeta de 600 de ancho máximo y relleno 28. Fecha de 260 de ancho máximo; Peso y Talla de 200 cada uno. «Cancelar» y «Guardar medida» a la derecha.

**Dibujo del SVG.**

- Rejilla horizontal en `#e2eef0`. Eje X y marcas en `#869ca3`; la marca de los 24 meses mide 12 y las demás 5.
- Texto de los ejes 13/600 (14 en la web) en `#475569`. La unidad del eje Y («kg»/«cm») va arriba en 800, color `#1f3d44`; «meses»/«años» van abajo en 800.
- **Curvas**: trazo de 1.5 en `#869ca3`, suavizadas (Catmull-Rom → Bézier, `smooth()` del mock). La etiqueta P3…P97 va al final a la derecha, en 13/700 `#475569`, separada para no encimarse (`gap = fs + 1`).
- **Línea del hijo**: action, 2.5 (3 en la web), con uniones redondeadas.
  - Puntos de radio 5 (6 en la web) con borde blanco de 2.
  - El punto elegido lleva un aro blanco con borde action de 3 y radio r+3, el centro de radio r−1.5 y una guía vertical punteada `3 4`.
- **Decisión**: el SVG tiene `viewBox` con las medidas del mock y `width: 100%`. A 390 px el área real mide exactamente 316 de ancho (390 − 2·20 − 2·16 − 2 de margen negativo); a 1280 mide 854 (1000 − 2·48 − 2·24 − bordes). Así no se deforma a otros anchos.
- **Comparación**: se renderiza la app a 390 y 1280 en el navegador integrado con los datos del mock (Mateo, 8 medidas, nacido el 12 sep 2024). Se mide con `getBoundingClientRect` y se compara sección por sección con el mock abierto al mismo ancho. Las diferencias van a `referencia/desviaciones.md`.

## R4 — Colores del mock que faltan en `@theme`

- **Decisión**: se agregan a `index.css` y a `design-tokens.md` con nombre:

  | Token | Valor | Uso |
  |---|---|---|
  | `--color-line` | `#cfe8ec` | Bordes de tarjeta del mock |
  | `--color-curve` | `#869ca3` | Curvas OMS y eje (decorativo, no es texto) |
  | `--color-field-edge` | `#6b8f97` | Borde de campo, 3.6:1 sobre blanco (≥ 3:1 para un componente) |
  | `--color-error` | `#b91c1c` | Error de formulario y «Quitar»; es el `red-700` de Tailwind v4 con su valor exacto |

  Ya existen y se reusan:
  - `--color-muted` (`#475569`);
  - `--color-skel` (`#e2eef0`, para la rejilla; se le da el alias `--color-grid`);
  - `--color-canvas` (`#f8feff`);
  - `hint`, `hint-border`, `hint-edge`, `body`, `ink`, `action` y `confirmed`.

  En los SVG se usan con `stroke-curve`, `fill-muted`, etc. `noColorLiterals.test.ts` sigue pasando.
- **Contraste**:
  - `#475569` sobre blanco: 7.58:1.
  - action sobre blanco: 5.36:1.
  - Blanco sobre confirmed: 5.48:1.
  - `#b91c1c` sobre blanco: 6.47:1.
  - `#869ca3` solo dibuja líneas (no es texto).

## R5 — Aviso del plan (estado E)

- **Decisión**: `FreemiumLimitModal reason="growth_chart"`, el aviso único de la app (spec 034, con sus textos de `planCopy.ts`). La tarjeta bloqueada y su texto («Gráfica de crecimiento», «Plan completo», «Con el Plan completo ves las medidas de Mateo sobre las curvas de la OMS.», «Ver la gráfica» con contorno) son las del mock.
- **Justificación**: regla de la app: un solo aviso para todos los límites, con su comparación y su precio.
- **Desviación**: el mock dibuja un aviso propio («La gráfica es parte del Plan completo»). Se lista en `desviaciones.md` para que el dueño decida.

## R6 — «La tabla la elige Ana» y la nota de Cuidadora

- **Decisión**:
  - El nombre sale de `account.family.ownerName`. Si falta, por ejemplo la propia dueña sin familia, que nunca ve esa frase porque puede editar, se usa la frase sin nombre: «La tabla la elige la familia.».
  - Sin tabla elegida y sin permiso para editar: «Por ahora ves solo las medidas de {nombre}. La tabla de la OMS la elige {Ana}.».
  - La nota «Vista de Cuidadora. Puedes ver las medidas. Anotarlas lo hace la familia.» va para todo `!canEdit`: un Cuidador o un Tutor de una familia que dejó de pagar.
- **Desviación menor**: un Tutor de una familia vencida también lee «Vista de Cuidadora». Para no decir un rol que no tiene, se usa «Solo lectura.» cuando `role !== 'caregiver'`.

## R7 — Fechas, edades y «hace…»

- **Decisión**:
  - **Fechas**: el mock no lleva el cero del día («3 oct 2026»), pero `formatDateShort` sí («03 oct 2026»). Se agrega `formatDateShortNoPad` a `shared/date.ts`, solo para esta pantalla, para que coincida con el mock (la PDF ya lo hace igual).
  - **Edad de cada medida**: el mock dice «1 año 1 mes» a los 13 meses y «1 año 6 meses» a los 19; hoy `ageAt` dice «13 meses» hasta los 24. Se cambia `ageAt` para que pase a años desde los 12 meses, como el mock. Solo lo usa Crecimiento; se revisa con grep antes.
  - **«hace…»**: lo da `sinceLine(today, measuredOn)`:
    - «hoy» y «ayer» para 0 y 1 días;
    - «hace N días» hasta 30;
    - después «hace N meses» (de 1 a 11) y «hace N años» / «hace 1 año».
    
    El día de hoy sale de `useLocalDay`.
- **Valores**:
  - peso con `toFixed(1)` («9.0 kg»);
  - talla entera sin decimales («82 cm») o con uno («59.5 cm»), como `fk`/`fc` del mock;
  - el peso con dos decimales guardado (por ejemplo 11.45) se muestra con dos, para no redondear un dato del padre.

## R8 — Escalas de la gráfica (`chartModel.ts`)

- **Rango corto** (por omisión): de 0 a `min(máximo de la referencia, 12 · (edad en años completos + 1))` meses, con la edad tomada de hoy. Mateo, con 2 años 1 mes, da 36. El rótulo es «0–N años», o «0–1 año» con N = 1.
- **Rango completo**: «Hasta 10 años» (peso, 120 meses) o «Hasta 19 años» (talla, 228). Sin referencia (apagada o sin tabla), el rango completo llega a `max(rango corto, última medida)` y se rotula «Todo».
- **Marcas del eje X**:
  - en rangos de 3 años o menos: cada 6 meses hasta 24, con rótulo en meses, y luego cada año, rotulado en años;
  - en rangos de un año: cada 3 meses;
  - en rangos más largos: 0, 12, 24 y luego años con un paso que deje 7 marcas como máximo (peso 10: 0, 12, 2, 4, 6, 8, 10; talla 19: 0, 2, 5, 10, 15, 19, como en el mock);
  - la marca de los 24 meses va siempre larga.
  
  «meses» se rotula centrado en el mes 12 y «años» centrado entre 24 y el final; si el rango no pasa de 24, solo «meses».
- **Eje Y**:
  - se toman `lo` y `hi` de las curvas P3/P97 dentro del rango y de los puntos visibles;
  - `step` es el menor valor de [1, 2, 4, 5, 10, 20, 40, 50] que sea mayor o igual a (hi − lo)/6;
  - `y0` y `y1` son `lo` y `hi` redondeados hacia fuera a múltiplos de step/2;
  - las marcas son los múltiplos de step dentro del rango.
  
  Con los datos del mock da kg 2–18 con marcas 4/8/12/16 y cm 45–105 con marcas de 10 en 10 (el mock dice 44–106: diferencia de ±1, se lista).
- **Puntos fuera del rango**: no se dibujan, pero siguen en la lista. La lectura y ‹ › recorren solo las medidas visibles del indicador.
- **Selección**:
  - por omisión, la medida más reciente del indicador;
  - al cambiar de pestaña se vuelve a la más reciente;
  - al cambiar de rango se conserva la elegida si sigue visible y, si no, se pasa a la más reciente visible;
  - tocar el área de datos elige el punto de x más cercano (`nearestIndex`).

## R9 — Accesibilidad

- **Pestañas**: `role="tablist"` con `role="tab"`, `aria-selected` y flechas ← → entre pestañas. La gráfica es el `tabpanel`.
- **Rango**: un `role="group"` de botones con `aria-pressed`.
- **Lectura y SVG**:
  - La caja de lectura es `aria-live="polite"`.
  - ‹ › tienen los nombres «Medida anterior» / «Medida siguiente» y quedan `disabled` en los extremos (además de la opacidad).
  - El SVG es `role="img"` con el nombre «Gráfica de peso de Mateo. Los mismos datos están en Medidas anotadas.».
  - El área de toque es un `rect` sin rol: lo mismo se logra con ‹ ›.
- **Celdas vacías**: en la tabla web llevan `aria-label` «Sin peso anotado» / «Sin talla anotada».
- **Acciones de cada fila**: «Corregir» y «Quitar» llevan la fecha en su nombre accesible («Corregir 12 oct 2026»).

## R10 — Casos especiales

- **Referencia apagada** (`reference.available === false`): sin curvas, sin invitación, sin selector y sin la nota de las curvas. Se muestra la frase que ya existe, `GROWTH.referenceOff`.
- **Error de la gráfica**: dentro de la tarjeta aparecen «No pudimos cargar la gráfica.» y «Reintentar». Mientras carga, un esqueleto de la altura del SVG.
- **Una sola medida**: un punto, sin línea; ‹ › deshabilitados.
- **Pestaña sin medidas de su tipo**: «Aún no hay medidas de talla.» en lugar de la lectura, y la gráfica con las curvas, si las hay, sin puntos.
- **Más allá de la referencia**: la nota que ya existe (`beyondWeight` / `beyondHeight`) bajo la gráfica.

## R11 — Pruebas

- **Unitarias**:
  - `chartModel.test.ts`: rangos, marcas, eje Y con los datos del mock, punto más cercano y selección;
  - `growthText.test.ts`: frases, «hace…», formatos y redacción (lista de palabras prohibidas de la spec 063);
  - `GrowthPage.test.tsx`: estados A–F en ambos diseños, ‹ ›, toque, pestañas, rango y el modal;
  - `GrowthChart.test.tsx`: dibujo y nombres;
  - `GrowthFormPage.test.tsx`: G1/G2, sufijos, errores y la barra fija.
  
  La cobertura de `features/growth/` debe quedar arriba del 90 %.
- **E2E**: `crecimiento.spec.ts` se actualiza a los nuevos nombres y textos (dueña, plan gratuito y Cuidadora, a 390 y 1280).
