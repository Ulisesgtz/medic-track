# Investigación: Curvas de crecimiento

## R1. Licencia y fuente de las tablas de la OMS

- **Decisión**: usar las **tablas de percentiles** publicadas por la OMS (no su software): Patrones de Crecimiento Infantil
  (peso para la edad y longitud/talla para la edad, 0–60 meses, niñas y niños) y Referencia de Crecimiento 2007 (talla para la
  edad 61–228 meses, peso para la edad 61–120 meses), solo las columnas **P3, P15, P50, P85 y P97**, mensuales. Las curvas
  quedan detrás de la variable `WHO_GROWTH_REFERENCE_ENABLED` (apagada por omisión): sin ella la gráfica dibuja solo los puntos
  del hijo y la frase «La referencia de la OMS aún no está disponible». **Antes de prenderla en producción, el dueño pide el
  permiso de la OMS** (formulario de permisos de who.int para reutilizar material en un producto comercial) y guarda la
  respuesta. En DEV se puede prender para probar. La gráfica cita la fuente: «Referencia: OMS, Patrones de Crecimiento Infantil
  (2006) y Referencia de Crecimiento 2007».
- **Justificación**: los libros y manuales de la OMS dicen «© World Health Organization … All rights reserved» y la licencia de
  su software (WHO Anthro/AnthroPlus) prohíbe usarlo «for sale or for use in conjunction with any commercial or promotional
  purpose»; nada encontrado da permiso explícito para reutilizar las tablas en una app de pago. Es un riesgo legal de
  lanzamiento (como COFEPRIS), no técnico: el interruptor deja lista la entrega sin publicarlas sin permiso.
- **Alternativas**: (a) publicar sin permiso — rechazado; (b) curvas de los CDC — son de EE. UU. y la OMS es la referencia que
  usan los pediatras en México; (c) solo los puntos del hijo — es la salida si la OMS lo niega (el interruptor apagado).
- **Archivos**: páginas de who.int de cada indicador («Weight-for-age», «Length/height-for-age», y las de la Referencia
  2007), tablas «Percentiles» para niñas y niños en Excel. `backend/tools/whogrowth/convert.py` (no se despliega; Go no lee Excel sin una dependencia) los lee y genera
  `internal/growth/whodata_gen.go`; si la descarga automática falla en la implementación, el dueño baja los Excel y los pone en
  una carpeta local (los Excel no se suben: los términos de la OMS piden permiso para reproducirlos en un producto comercial; se sube solo el `.go` generado con la cita). Términos de who.int: los extractos se pueden reproducir «for research or private study but not for sale or for use in conjunction with commercial purposes»; otro uso requiere autorización escrita previa (formulario de permisos de who.int).

## R2. Dónde viven las curvas y cómo se protege el plan

- **Decisión**: embebidas en el backend; `GET /children/{childId}/growth-chart` pide primero el plan de la cuenta dueña del
  hijo (`consultation.Repository.RequirePaid(childID, "growth_chart")`, el mismo del PDF) y solo con plan completo devuelve las
  medidas y las curvas del sexo elegido. La lista de medidas (`GET …/growth-measurements`) es de cualquier plan.
- **Justificación**: un JSON en el bundle del frontend lo puede leer cualquiera, también el plan gratuito; con el servidor la
  regla de la spec (FR-005, SC-003) se cumple de verdad.
- **Alternativas**: servir las curvas en una ruta aparte (dos peticiones, mismo resultado).

## R3. Modelo

- **Decisión**: tabla `growth_measurements` (llave compuesta `(child_id, account_id)` → `children (id, account_id)`, como
  `vaccine_records`), `measured_on DATE`, `weight_kg NUMERIC(5,2)`, `height_cm NUMERIC(4,1)`, al menos uno, `note`,
  `created_by/at`, `corrected_by/at` juntos; columna `children.growth_reference_sex TEXT NULL CHECK IN ('female','male')`. El
  `height`/`weight` del registro se quedan en `children` sin tocar.
- **Justificación**: el patrón de la cartilla ya protege que una medida no cambie de hijo ni de cuenta; la columna en `children`
  es un dato del hijo, opcional y sin pantalla propia.
- **Alternativas**: una fila por indicador (peso y talla separados) — duplica la fecha y la nota de la misma revisión.

## R4. Reglas de escritura

- Fecha ≤ hoy en la zona del padre (hasta un día después de la fecha del servidor, como la cartilla) y ≥ `birth_date`.
- Peso 0.3–200 kg (2 decimales), talla 30–220 cm (1 decimal), coma o punto aceptados en la pantalla; el servidor recibe número.
- Nota ≤ 300, recortada; vacía = NULL.
- Tope de 500 por hijo: `Create` bloquea la fila del hijo `FOR UPDATE` y cuenta (como el tope de fotos de la cartilla).
- Corregir sella `corrected_by/at`; borrar es real. Todo dentro de la transacción usa solo `tx`.
- Errores: 422 `validation_error` con `fields`, 422 `growth_limit_exceeded`, 404 si la medida no es de ese hijo.

## R5. Gráfica

- **Decisión**: SVG propio (`GrowthChart.tsx`), sin librería: eje X = edad en meses (etiquetas en meses hasta 24 y en años
  después), eje Y = kg o cm; ventana = de 0 a `max(edad de la última medida, 24 meses)` redondeado, con «Ver todo» si el hijo
  tiene medidas antes de esa ventana; las cinco curvas en `stroke` gris (`--color-ink-muted` con opacidades distintas y un
  rótulo al final de cada una: «P97», …), los puntos del hijo en `--color-action` unidos por una línea, cada punto un botón
  (44 px de área) que muestra «3 nov 2026 · 12.4 kg · 1 año 5 meses». Debajo, una **tabla** con las mismas medidas (lectores de
  pantalla y quien no lee gráficas) y el texto fijo de FR-009. Teléfono: ancho completo, alto 260; web: tarjeta de 720×360.
- **Justificación**: no hay librería de gráficas en el proyecto; `@react-pdf` no sirve en pantalla; una gráfica de líneas con
  ejes es poco código y queda bajo el sistema visual.
- **Alternativas**: Recharts/Chart.js (+60–200 KB, estilos propios).

## R6. Edad mostrada

- Puro y probado (`growthAge.ts`): < 3 meses «6 semanas»; < 24 meses «1 año 5 meses» / «7 meses»; después «4 años 2 meses».
  Para la gráfica, meses decimales = días / 30.4375 (la convención de la OMS).

## R7. Frontend

- Sección «Crecimiento» en el detalle del hijo (teléfono y web, en el índice junto a Cartilla) con «Última: 12.4 kg · 86 cm,
  3 nov» o «Aún no hay medidas» y «Anotar medida» para quien puede.
- `FreemiumLimitModal` motivo `growth_chart` (+ fila en `planCopy.ts`); «Ver la curva» con la marca «Plan completo» en el plan
  gratuito (`canAdd` / `isFree` como la cartilla y el PDF).
- La elección «Niña · Niño» vive en la gráfica (`PUT /children/{childId}/growth-reference`), solo para `Full`.
- `useUnsavedWork` en el formulario; `ConfirmDialog` para quitar; textos en `growthText.ts` con la prueba de redacción
  (prohíbe «normal», «bajo», «alto», «riesgo», «sobrepeso», «desnutri», «obes», «por debajo», «por encima», «debería»,
  «percentil de»).

## R8. Acceso

- Ver lista y gráfica: `seesChild` (Mark). Anotar, corregir, borrar, elegir la tabla: `fullChild` (Full) en cualquier plan.
- Un integrante Hijo: el nivel ya lo deja fuera (`OnChild`). Ninguna ruta bajo `/child-device`.
- Filas por rol en `router_test.go` (dueña, Tutor de familia de pago, Tutor de familia vencida, Cuidador, extraño).
