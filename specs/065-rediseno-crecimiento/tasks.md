# Tareas: Rediseño de «Crecimiento»

**Entrada**: `specs/065-rediseno-crecimiento/` (spec.md, plan.md, research.md R1–R11, data-model.md, contracts/ui.md, quickstart.md) y el mock `referencia/Crecimiento PediTrack.dc.html`.

**Pruebas**: obligatorias (constitución, Principio VI: Vitest > 90 % y E2E a 390 y 1280 px).

**Rama**: `feature/065-rediseno-crecimiento`, con un commit por fase.

**Reglas que valen para todas las tareas**:
- Archivos CRLF: se editan conservando los finales de línea.
- Vitest con `--testTimeout=30000 --maxWorkers=4`.
- Colores solo por tokens de `@theme`.
- Dos diseños con `useIsDesktop` que nunca se mezclan.
- Las frases van en `growthText.ts`.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [ ] T001 [P] Agregar a `frontend/src/index.css` (`@theme`), cada uno con su comentario de uso y contraste:
  - `--color-line: #cfe8ec`
  - `--color-curve: #869ca3`
  - `--color-field-edge: #6b8f97`
  - `--color-error: #b91c1c`
  - `--color-grid: #e2eef0`
  
  Documentarlos en `specs/005-identidad-visual-front-end/design-tokens.md` (research R4).
- [ ] T002 [P] Agregar `formatDateShortNoPad(iso)` («3 oct 2026») a `frontend/src/shared/date.ts`, con sus pruebas en `frontend/src/shared/date.test.ts`.
- [ ] T003 [P] Cambiar `ageAt` en `frontend/src/features/growth/growthAge.ts`:
  - menos de 3 meses: «N semanas»/«N días»;
  - de 3 a 11 meses: «N meses»;
  - desde 12 meses: «1 año 1 mes» / «2 años».
  
  Actualizar sus pruebas en `growthLogic.test.ts` (research R7).

**Punto de control**: `npx vitest run src/shared src/features/growth` y `noColorLiterals.test.ts` en verde. Commit.

---

## Fase 2: Fundamental (bloquea todas las historias)

- [ ] T004 Crear `frontend/src/features/growth/chartModel.ts`, puro (research R8 y data-model):
  - `layout(desktop)`, con 316×264, márgenes 36/40/28/50, fs 13, línea 2.5 y r 5 en el teléfono, y 854×380, 48/54/30/54, 14, 3 y 6 en la web;
  - `shortRangeMonths` y `fullRangeMonths`;
  - `rangeLabel`;
  - `xTicks` (con la marca larga en 24 y las posiciones de «meses»/«años»);
  - `yAxis` (pasos [1, 2, 4, 5, 10, 20, 40, 50] y redondeo a step/2);
  - `visiblePoints`, `nearestIndex` y `smoothPath` (Catmull-Rom del mock).
  
  Borrar `chartScale.ts`.
- [ ] T005 Pruebas de `chartModel.ts` en `frontend/src/features/growth/chartModel.test.ts`:
  - con los datos del mock: Mateo nacido el 2024-09-12, hoy 2026-10-24, rango corto 36, «0–3 años»;
  - las marcas del eje X: 0, 6, 12, 18, 2, 3 (peso 10: 0, 12, 2, 4, 6, 8, 10; talla 19: 0, 2, 5, 10, 15, 19);
  - eje Y de kg 2–18 con marcas 4/8/12/16;
  - «0–1 año» para un bebé, el tope del rango en el final de la referencia y el rango sin referencia («Todo»);
  - el punto más cercano y el trazo suavizado.
- [ ] T006 Rehacer `frontend/src/features/growth/growthText.ts` con las frases de contracts/ui.md:
  - última medida, registro, invitación, selector, Cuidadora / Solo lectura, nota OMS, vacía, bloqueada, lista y tabla;
  - los errores del formulario;
  - `kgText` (un decimal, dos si el dato los trae), `cmText`, `valuesLine` y `sinceLine(today, on)` (hoy / ayer / hace N días ≤ 30 / meses / años).
  
  Quitar las frases que ya no se usan.
- [ ] T007 Pruebas en `frontend/src/features/growth/growthLogic.test.ts`:
  - formatos y `sinceLine`;
  - la prueba de redacción: todas las frases de `GROWTH` contra la lista de palabras prohibidas de la spec 063 (normal, bajo, alto, riesgo, sobrepeso, percentil de, debería, preocup…).
- [ ] T008 Cambiar los mensajes de `frontend/src/features/growth/growthForm.ts` por los del contrato:
  - future: «Esa fecha aún no llega. Elige hoy o un día anterior.»;
  - weight: «Escribe el peso en kilos, con punto decimal. Por ejemplo: 11.6»;
  - height: «Escribe la talla en centímetros. Por ejemplo: 83»;
  - beforeBirth: «Esa fecha es antes del nacimiento. Elige otra.».
  
  Las reglas no cambian; ajustar sus pruebas.

**Punto de control**: la lógica pura queda probada. Commit.

---

## Fase 3: Historia 1, ver de un vistazo (P1) 🎯 MVP

**Objetivo**: los estados A y B del mock, en los dos diseños.

**Prueba independiente**: un hijo con 8 medidas y la tabla elegida se ve como A; con «Talla», como B.

- [ ] T009 [P] [US1] Rehacer `frontend/src/features/growth/GrowthChart.tsx` como el `svg()` del mock:
  - `viewBox` de `layout()`, `width: 100%`;
  - rejilla horizontal `stroke-grid` y valores del eje Y a la izquierda, 13/600 `fill-muted`;
  - la unidad «kg»/«cm» arriba en 800 `fill-body`;
  - eje X `stroke-curve`, con marcas de 5 px y 12 px en los 24 meses, rótulos, y «meses»/«años» en 800;
  - curvas `smoothPath` de 1.5 `stroke-curve` con «P3…P97» al final, separados por fs + 1;
  - polilínea del hijo de 2.5 / 3 px en action, con puntos de r = 5 / 6 y borde blanco de 2;
  - el punto elegido con aro de r + 3 y trazo 3, centro de r − 1.5 y guía punteada `3 4`;
  - el `rect` de toque que llama `onPick(nearestIndex)`;
  - `role="img"` con el nombre del contrato.
- [ ] T010 [P] [US1] Crear `frontend/src/features/growth/LatestCard.tsx`, la sección «Última medida» con los valores de la medida más reciente:
  - teléfono: relleno 16/18, valor 34/900;
  - web: relleno 20/24, valor 44/900;
  - debajo, «hace … · fecha» con `formatDateShortNoPad`; el día de hoy sale de `useLocalDay`.
- [ ] T011 [US1] Crear `frontend/src/features/growth/ChartCard.tsx`:
  - `tablist` Peso/Talla con flechas del teclado, en un riel hint con pestañas de 44;
  - el grupo «Rango de edad» con `aria-pressed`, pastillas de 44 en ink cuando están elegidas;
  - la lectura `aria-live` con ‹ › de 44×44, `disabled` y opacidad 0.4 en los extremos; en el teléfono, valor 18/900 y «fecha · edad» 14/500; en la web, una línea 18/800;
  - `GrowthChart`;
  - el selector «Curvas de la OMS para» Niña·Niño con `useSetReferenceSex`;
  - la nota OMS (`role=note`).
  
  La selección sigue research R8 (la más reciente por omisión, se reinicia al cambiar de pestaña y se conserva al cambiar de rango). En la web, la fila final es la nota a la izquierda y el selector a la derecha.
- [ ] T012 [US1] Reescribir `frontend/src/features/growth/GrowthPage.tsx`:
  - `RoutinePageFrame` con el subtítulo «{nombre} · {formatAgeLong}» y «+ Anotar medida» (`pageHeaderButton('primary')`, a todo lo ancho en el teléfono);
  - **teléfono**, separación 16: LatestCard → ChartCard → la lista (marcador hasta US2) → registro;
  - **web**, ancho máximo 904 y separación 24: fila 1.7fr/1fr (LatestCard + registro) → ChartCard → tabla;
  - el fondo de la página en canvas, si el marco no lo da ya.
- [ ] T013 [US1] Pruebas en `frontend/src/features/growth/GrowthChart.test.tsx` y `GrowthPage.test.tsx`:
  - A y B en los dos diseños (`stubMatchMedia`);
  - la lectura inicial es la última medida;
  - ‹ › y sus extremos;
  - un toque en el `rect` elige la más cercana;
  - el cambio de pestaña reinicia la selección y el de rango la conserva;
  - el selector Niña·Niño llama la mutación;
  - el nombre del SVG.
  
  Actualizar `growth.test-utils.tsx` con los datos del mock.

**Punto de control**: A y B funcionan. Commit.

---

## Fase 4: Historia 2, medidas anotadas y registro (P1)

**Prueba independiente**: con 8 medidas, la lista (teléfono) o la tabla (web) las muestra de la más reciente a la más antigua, con «—» y acciones solo con `canEdit`.

- [ ] T014 [P] [US2] Crear `frontend/src/features/growth/MeasurementsList.tsx` (teléfono):
  - `h2` «Medidas anotadas» 20/900 y «N medidas»;
  - contenedor con radio 16, borde line y separadores hint-edge;
  - cada fila con fecha/valores 16/800, edad 14 / «Anotada por» 13/600 muted, «Nota: …», la corrección y «Corregir»/«Quitar» (44 de alto, 14/800, «Quitar» en `text-error`), con la fecha en el nombre accesible.
- [ ] T015 [P] [US2] Crear `frontend/src/features/growth/MeasurementsTable.tsx` (web):
  - `role=table` con las columnas `132px 128px 96px 96px 1fr 168px`, separación 16 y fila mínima de 64;
  - encabezado 13/800 en mayúsculas, color muted, fondo canvas;
  - «—» con `aria-label` «Sin peso anotado» / «Sin talla anotada»;
  - la celda «Anotada por» con la nota y la corrección;
  - las acciones a la derecha.
- [ ] T016 [P] [US2] Crear `frontend/src/features/growth/RegisteredBox.tsx`:
  - la sección «Medida del registro» con borde punteado hint-border;
  - «AL REGISTRAR A {NOMBRE}», los valores (17/800 en el teléfono, 20/800 en la web) y «Sin fecha, por eso no aparece en la gráfica.»;
  - «Anotarla con fecha» solo con `canEdit`, con `state.registered`.
- [ ] T017 [US2] Conectar lista, tabla y registro en `GrowthPage.tsx`, con el `ConfirmDialog` de «Quitar» que ya existía (`useDeleteMeasurement`).
- [ ] T018 [US2] Pruebas en `GrowthPage.test.tsx`:
  - el orden y las celdas «—»;
  - la nota y la corrección;
  - Corregir lleva a la ruta de edición;
  - Quitar confirma, llama la mutación y muestra el error si falla;
  - el registro con y sin `canEdit`, y sin registro.

**Punto de control**: Commit.

---

## Fase 5: Historia 3, formulario (P1)

**Prueba independiente**: anotar y corregir en los dos diseños, con los errores G2.

- [ ] T019 [US3] Reacomodar `frontend/src/features/growth/GrowthFormPage.tsx` al mock G1/G2:
  - etiquetas «Fecha», «Peso», «Talla» y «Nota (opcional)» en 15/800;
  - campos de 52 de alto, radio 14, borde 1.5 `field-edge` (2 px `error` con error) y texto 17;
  - Peso y Talla lado a lado con el sufijo «kg»/«cm» (15/700 body) dentro de la caja; la etiqueta no lleva la unidad;
  - «Puedes anotar solo el peso o solo la talla.»;
  - nota de 96 de alto mínimo;
  - errores 14/600 `text-error` con el círculo «!» de 18 px y `role=alert`;
  - **teléfono**: `StickyActionBar` con «Guardar medida»;
  - **web**: tarjeta de 600 de ancho máximo y relleno 28, fecha de 260 de ancho máximo, Peso/Talla de 200 cada uno y «Cancelar» + «Guardar medida» a la derecha.
  
  Se conservan `useUnsavedWork`, `state.registered`, el modo edición «Corregir medida» y los errores del servidor.
- [ ] T020 [US3] Actualizar `frontend/src/features/growth/GrowthFormPage.test.tsx`:
  - G1 en los dos diseños;
  - G2: fecha futura y peso 116 con los textos del mock;
  - corregir;
  - la medida del registro;
  - salir con datos pide confirmar;
  - el 422 del tope.

**Punto de control**: Commit.

---

## Fase 6: Historia 4, estados especiales (P2)

**Prueba independiente**: los estados C, D, E y F, y los casos de referencia apagada y error, en los dos diseños.

- [ ] T021 [P] [US4] Estado C en `GrowthPage.tsx`: una tarjeta vacía con borde punteado:
  - «Aún no hay medidas anotadas» 18/800 (20 en la web) y el texto;
  - «Anotar la primera medida» como único botón sólido (solo `canEdit`; el encabezado no lleva «+ Anotar medida»);
  - la nota OMS afuera y el registro.
  
  En la web va en la fila superior, con el registro al lado.
- [ ] T022 [P] [US4] Estado D en `ChartCard.tsx`:
  - con la referencia disponible y sin tabla, la invitación (hint) sobre la gráfica con Niña/Niño;
  - la gráfica solo con puntos;
  - sin el selector de abajo;
  - sin `canEdit`, la frase de quién la elige.
- [ ] T023 [P] [US4] Crear `frontend/src/features/growth/ChartLockedCard.tsx` (estado E):
  - `h2` «Gráfica de crecimiento» con la marca «Plan completo» y su texto;
  - «Ver la gráfica» con contorno, que abre `FreemiumLimitModal reason="growth_chart"` (con `opener` y foco de vuelta);
  - la nota OMS afuera;
  - la gráfica nunca se pide.
- [ ] T024 [US4] Estado F en `GrowthPage.tsx`:
  - nota «Vista de Cuidadora.» (`role === 'caregiver'`) o «Solo lectura.» bajo el título;
  - sin ninguna acción de escritura;
  - «Curvas de la OMS para {niña|niño}. La tabla la elige {account.family.ownerName}».
- [ ] T025 [US4] Casos en `ChartCard.tsx`:
  - referencia apagada: `referenceOff`, sin curvas, invitación, selector ni nota de curvas, y con «Todo» como rango completo;
  - error con «Reintentar»;
  - esqueleto de la altura del SVG;
  - una sola medida;
  - pestaña sin medidas de su tipo;
  - la nota «más allá de la referencia».
- [ ] T026 [US4] Pruebas en `GrowthPage.test.tsx`:
  - C, D, E (el modal se abre y no se pide la gráfica) y F (Cuidadora y Tutor de familia vencida);
  - referencia apagada, error, reintento, una medida, pestaña vacía y plan rechazado por el servidor.
  
  Cobertura de `features/growth/` mayor al 90 %.

**Punto de control**: Commit.

---

## Fase 7: Pulido y aspectos transversales

- [ ] T027 Actualizar `frontend/e2e/crecimiento.spec.ts` (390 y 1280) a los textos y roles nuevos:
  - la dueña anota desde el detalle, ve «Última medida», cambia a Talla, usa ‹ › y corrige y quita;
  - plan gratuito: «Ver la gráfica» abre el aviso y el API da 422;
  - Cuidadora: «Vista de Cuidadora» y sin acciones.
- [ ] T028 Comparar lado a lado con el mock en el navegador integrado, a 390 y 1280 (quickstart §2):
  - medir con `getBoundingClientRect` y screenshots, con los datos de Mateo;
  - corregir lo que no coincida;
  - escribir `specs/065-rediseno-crecimiento/referencia/desviaciones.md` con cada desviación y su motivo: el aviso del plan, la barra lateral, «Solo lectura» para no-Cuidadores y el eje Y de ±1, más lo que salga.
- [ ] T029 Documentación:
  - `CLAUDE.md` raíz: entrada de la spec 065;
  - `frontend/CLAUDE.md`: actualizar la sección `features/growth/` con los componentes nuevos y la nota de que viene del mock;
  - `specs/063-curvas-crecimiento/spec.md`: una nota de que la pantalla se rehízo en la 065.
- [ ] T030 Verificación completa en `frontend/`:
  - `npx vitest run --coverage --testTimeout=30000 --maxWorkers=4` (umbral > 90 %);
  - `npx tsc --noEmit`, `npx eslint .`, `npm run build`;
  - `npx playwright test e2e/crecimiento.spec.ts --list`.
- [ ] T031 Correr `/code-review` sobre la rama, arreglar los hallazgos, hacer push (`git push -u origin feature/065-rediseno-crecimiento`) y abrir el PR a `develop`. Luego `get_status`. Marcar las tareas [X].

---

## Dependencias

- La Fase 1 y la Fase 2 van primero: chartModel, textos y tokens bloquean todo.
- US1 (Fase 3) da el esqueleto de `GrowthPage`; US2, US3 y US4 dependen de ese esqueleto. US3 (el formulario) es independiente de US1/US2 y puede ir en paralelo después de la Fase 2.
- La Fase 7 va al final.

## Paralelismo

- Fase 1: T001, T002 y T003 juntas.
- US1: T009 y T010 juntas, antes de T011 y T012.
- US2: T014, T015 y T016 juntas.
- US4: T021, T022 y T023 juntas.

## Estrategia

El MVP es US1 (A/B), con lo que la gráfica ya se entiende. Después vienen US2, US3 y US4, cada una con su commit. La comparación con el mock (T028) se hace antes del PR y sus desviaciones las decide el dueño.
