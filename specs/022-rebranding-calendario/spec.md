# Especificación de Funcionalidad: Rebranding de los colores del calendario

**Rama de la Funcionalidad**: `feature/022-rebranding-calendario`

**Creado**: 2026-09-30

**Estado**: Borrador — las 11 desviaciones fueron aprobadas por el usuario el 2026-09-30; la 12 (chips: ámbar = «por marcar») está en research R5 y se le señala

**Entrada**: Descripción del usuario: «quiero hacer un rebranding a los colores del calendario», con el diseño `Calendario PediTrack.dc.html` de Claude Design («Turno 1: Calendario del tratamiento con la paleta nueva», móvil de 430 px y web de 1024 px). Se guarda en `referencia/` junto con dos capturas de cómo se ve hoy la app (`actual-web.png`, `actual-iphone.png`, del usuario, con sus datos reales). Por la regla del proyecto, **el mock manda**: se construye tal cual y cada desviación se lista con su motivo.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - El calendario con la identidad visual nueva (Prioridad: P1)

El calendario del tratamiento (specs 019/020) se ve como el diseño nuevo: cada día del tratamiento es una pastilla celeste con **puntos de color**, uno por medicamento, **rellenos si la dosis se dio y vacíos si no**; el día elegido se resalta en oscuro con aro cian; los días fuera del tratamiento quedan sin fondo; y debajo, la leyenda y las tomas del día con los chips del diseño. Hoy cada medicamento se marca con su número de color, lo que en las capturas del usuario se ve apretado y poco claro (números sueltos, círculos rellenos de 18 px, filas muy altas).

**Por qué esta prioridad**: es lo pedido; el calendario es lo que el padre mira para saber cómo va el tratamiento.

**Prueba Independiente**: abrir el detalle de una consulta con tres medicamentos y comparar, al ancho del mock (430 y 1024 px), el calendario con el mock sección por sección: encabezado del mes, días de la semana, pastillas con sus puntos, día elegido, leyenda, título del día y chips.

**Escenarios de Aceptación**:

1. **Dado** un día dentro del tratamiento, **Entonces** se muestra como pastilla con fondo `#ecfeff`, borde `#cffafe` de 1 px, radio 12 px, el número del día en tinta y, debajo, un punto por cada medicamento que tiene tomas ese día, en el color del medicamento.
2. **Dado** un medicamento con todas sus tomas de ese día marcadas como dadas, **Entonces** su punto va relleno; si falta alguna, va vacío (solo el borde de 2 px).
3. **Dado** el día elegido, **Entonces** va en tinta `#04252b` con aro `#22d3ee` de 2 px, el número en blanco y los puntos en cian (`#22d3ee` relleno si se dio, `#a5f3fc` vacío).
4. **Dado** un día fuera del tratamiento, **Entonces** va sin fondo ni borde, solo el número.
5. **Dado** el encabezado, **Entonces** tiene el mes en 900, botones de mes de 40 px (móvil) y 36 px (web) con borde `#cffafe`, fondo `#ecfeff` y flecha `#0e7490`, y los días de la semana en `#64748b`.
6. **Dado** la leyenda, **Entonces** cada medicamento lleva su círculo de color con su número (26 px móvil, 22 px web) y su nombre.
7. **Dado** la lista «Tomas del día», **Entonces** cada fila lleva el círculo de color con su número, el nombre del medicamento y un chip de ancho fijo (130 px móvil, 160 px web): **dada** (verde, «✓ 16:32»), **sin registrar** (ámbar) o **próxima** (borde punteado).
8. **Dado** la web, **Entonces** la columna derecha trae, junto a «Tratamiento activo», la tarjeta «Cómo leer el calendario» con las tres claves del diseño.
9. **Dado** que se marca una toma, **Entonces** el punto, la leyenda y los chips se actualizan como hoy, sin recargar.

---

### Historia de Usuario 2 - Los colores de los medicamentos del diseño nuevo (Prioridad: P1)

Los primeros tres medicamentos de una consulta toman los colores del diseño: **`#0e7490`** (verde azulado), **`#7c3aed`** (violeta) y **`#db2777`** (rosa). Hoy son azul `#0c75df`, gris `#565b52` y violeta `#360cdf` (spec 019). Del cuarto al sexto se necesitan colores que combinen, y del séptimo en adelante se repiten.

**Por qué esta prioridad**: es el «rebranding de los colores» en sí.

**Prueba Independiente**: una consulta con seis medicamentos muestra seis colores distintos en la leyenda y en los puntos, y el séptimo repite el primero.

**Escenarios de Aceptación**:

1. **Dado** los medicamentos 1, 2 y 3, **Entonces** sus colores son `#0e7490`, `#7c3aed` y `#db2777` en leyenda, puntos y lista.
2. **Dado** los medicamentos 4 a 6, **Entonces** usan los colores propuestos en «Desviaciones» (o los que decida el usuario).
3. **Dado** siete o más medicamentos, **Entonces** los colores se repiten y el número (leyenda y lista) sigue siendo único.
4. **Dado** los tokens, **Entonces** `--color-med-1…6` de `index.css` y la tabla de `design-tokens.md` quedan con los valores nuevos y su contraste medido.

---

### Casos Límite

- Un día con 1 a 3 medicamentos cabe en una sola fila de puntos; con 4 a 6, en dos filas sin salirse de la pastilla.
- Un medicamento sin tomas ese día no lleva punto, pero **su lugar se conserva** (los puntos van en el orden de los medicamentos, con huecos): la posición del punto identifica al medicamento aunque el color no se distinga.
- Un tratamiento finalizado antes de tiempo (spec 016) o recorrido (spec 020): los días y puntos siguen el rango derivado de las tomas que no están canceladas, igual que hoy.
- Día elegido fuera del tratamiento: se resalta igual (aro y fondo oscuro) sin puntos.
- Hoy, si no es el día elegido, no lleva marca visual propia (el diseño no la tiene); sigue indicado a los lectores de pantalla con `aria-current="date"`.
- 390 px de ancho (iPhone): la pastilla de 7 columnas cabe sin desplazamiento horizontal.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: El calendario DEBE construirse con los valores del diseño (colores, tamaños, bordes, radios, pesos y textos de la sección «Escenarios») en su variante móvil y su variante web, por separado (`useIsDesktop`).
- **FR-002**: Cada día del tratamiento DEBE mostrar un punto por medicamento con tomas ese día, en el orden de los medicamentos y con su lugar fijo; relleno = todas las tomas de ese día dadas, vacío = alguna sin dar.
- **FR-003**: Los colores de los medicamentos 1 a 3 DEBEN ser `#0e7490`, `#7c3aed` y `#db2777`; los demás, los que apruebe el usuario; el color NUNCA DEBE ser el único indicador: la leyenda y la lista llevan el número y el nombre, y el nombre accesible de cada día lista los medicamentos.
- **FR-004**: El nombre accesible de cada día DEBE conservar «inicio de / fin de» (spec 020) y decir, por medicamento, si su dosis del día se dio («dada») o no.
- **FR-005**: Los chips de la lista del día DEBEN ser los del diseño (verde «✓ hora / dada», ámbar «sin registrar», punteado «próxima») sin cambiar sus reglas: marcar/desmarcar, estados de la spec 013, canceladas (spec 016) y nombres accesibles únicos.
- **FR-006**: La web DEBE agregar la tarjeta «Cómo leer el calendario» en la columna derecha, con los textos del diseño adaptados a lo real (ver Desviaciones).
- **FR-007**: Los textos DEBEN seguir el Principio I: nada de «debes», «atrasado» ni avisos médicos; la palabra «sin registrar» es la de la spec 013.
- **FR-008**: Los contrastes mínimos de accesibilidad NO DEBEN bajar de 4.5:1 en texto ni 3:1 en los puntos; donde el diseño no los cumple, se ajusta y se lista en «Desviaciones».
- **FR-009**: Esta funcionalidad NO DEBE cambiar datos, API ni reglas: solo presentación (lo que ya llega en el detalle).

### Entidades Clave

- **Punto del día**: por medicamento y día, relleno o vacío; se deriva de las tomas del día (todas `taken` = relleno); no se guarda.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Al ancho del mock (430 y 1024 px), la comparación lado a lado sección por sección no muestra diferencias de estructura, y cada desviación está listada con su motivo.
- **SC-002**: El padre distingue en una mirada qué medicamentos tienen toma un día y cuáles de esas tomas ya dio.
- **SC-003**: Los flujos pasan sus pruebas a 390 y 1280 px en los tres navegadores, y las unitarias mantienen >90 % de cobertura.

## Desviaciones respecto al mock (propuestas; el usuario decide)

1. **Rosa `#db2777` para el medicamento 3**: el proyecto evitaba rojos y rosas por el Principio I (no hay color de alerta médica). El rosa 600 no es un rojo de alerta y es el color que pide el diseño: **se usa**. Su contraste con blanco es 4.60:1 (pasa 4.5:1 para el número blanco de la leyenda).
2. **Medicamentos 4 a 6**: el diseño solo define tres. Propuesta: `#2563eb` (azul), `#475569` (pizarra) y `#78350f` (café); se excluyen verde (`tomada`) y ámbar (`pendiente`). Los tres primeros del diseño, en simulación de deuteranopía y protanopía, quedan a ΔE ≈ 8 entre sí (poco): por eso los puntos **conservan su lugar fijo** por medicamento y la leyenda lleva números.
3. **Sin números dentro de las pastillas**: el diseño los quita y deja solo puntos; se acepta y se compensa con la posición fija y el nombre accesible. Los círculos de inicio y fin de la spec 020 **desaparecen visualmente** (el diseño no los tiene); «inicio de / fin de» se conserva en el nombre accesible. *Si quieres verlos también en pantalla, hay que diseñarlos: no están en este turno del diseño.*
4. **Días fuera del tratamiento** (`#94a3b8`, 2.6:1 sobre blanco): se usa `#64748b` (4.8:1) para cumplir 4.5:1.
5. **Días de la semana a 12 px**: el mínimo del proyecto es 13 px; se usa **13 px**.
6. **Chip «dada 16:40»**: el diseño muestra la hora a la que se dio; la app no guarda esa hora (solo si se dio): dice **«dada»** sin hora.
7. **Chip «próxima»**: el diseño lo pone solo a la siguiente toma; aquí, **la primera toma pendiente de todo el tratamiento** (la más próxima en el tiempo, de cualquier medicamento) lleva «próxima», y solo se ve si su día es el elegido; las demás pendientes quedan con el punteado sin segunda línea.
8. **Leyenda de «Cómo leer el calendario»**: «Punto vacío: dosis sin registrar» → **«Punto vacío: dosis sin dar»**, porque también son vacíos los puntos de tomas futuras (que aún no son «sin registrar», spec 013).
9. **Hoy sin marca visual**: el diseño no la trae; se quita el círculo oscuro de hoy y queda solo `aria-current="date"`.
10. **«Cómo leer el calendario» solo en la web**, como en el mock; el móvil no la trae.
11. **Nombres de medicamento en mayúsculas del diseño** (`PARACETAMOL`): son datos de ejemplo; se muestran como el padre los escribió.

## Supuestos

- Solo frontend; se apoya en lo que el detalle ya trae (tomas, `taken`, `status`, `endedAt`).
- El punto «relleno» = **todas** las tomas del medicamento ese día con `taken = true`; en un día con varias tomas, una sin dar lo deja vacío.
- Depende de: specs 013, 016, 019, 020.
- Fuera de alcance: el resto de la pantalla de detalle (se conserva), la lista de medicamentos y cualquier otro rebranding; un segundo turno del diseño (p. ej. el inicio y fin) se hace aparte.
