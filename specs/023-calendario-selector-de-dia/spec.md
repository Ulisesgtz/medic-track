# Especificación de Funcionalidad: El calendario como selector de día de «Medicamentos»

**Rama de la Funcionalidad**: `feature/023-calendario-selector-de-dia`

**Creado**: 2026-10-01

**Estado**: Borrador

**Entrada**: Descripción del usuario: quitar la lista «Tomas de hoy / Tomas del <día>» que está debajo del calendario del tratamiento en el detalle de la consulta (specs 019 y 022) y hacer que el calendario sea el selector de día de la sección «Medicamentos» (opción (b) del `BACKLOG.md`, decidida por el usuario el 2026-10-01). Al tocar un día, cada tarjeta de medicamento muestra las tomas de **ese** día.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Tocar un día y ver sus tomas en cada medicamento (Prioridad: P1)

En el detalle de la consulta el padre ve hoy las tomas del día en **dos lugares**: la lista «Tomas de hoy» bajo el calendario (de todos los medicamentos mezclados, por hora) y las tarjetas de «Medicamentos» (cada una con sus tomas de **un solo día**: el de hoy o el más cercano). Es información repetida, y solo la lista permite mirar otro día. El padre quiere una sola forma: **tocar un día en el calendario y que cada tarjeta de medicamento muestre las tomas de ese día**, agrupadas en Mañana, Tarde y Noche, marcables como siempre.

**Por qué esta prioridad**: es todo el cambio: sin esto, quitar la lista dejaría el calendario sin acción y los otros días inalcanzables.

**Prueba Independiente**: una consulta con Amoxicilina 7 días y Paracetamol 3 días; tocar el día 2 del calendario hace que ambas tarjetas muestren las tomas del día 2; tocar el día 5 hace que Amoxicilina muestre las del día 5 y Paracetamol diga que ese día no tiene tomas.

**Escenarios de Aceptación**:

1. **Dado** una consulta con varios medicamentos, **Cuando** el padre toca un día del calendario, **Entonces** cada tarjeta de «Medicamentos» muestra las tomas de **ese** día (las del medicamento, no las de los demás), agrupadas en Mañana, Tarde y Noche, y no se muestra ninguna lista aparte bajo el calendario.
2. **Dado** un día en el que un medicamento no tiene tomas (porque ya terminó o aún no empieza), **Cuando** ese día está elegido, **Entonces** su tarjeta dice que ese día no tiene tomas, sin mostrar chips.
3. **Dado** que el padre marca o desmarca una toma en una tarjeta con un día distinto de hoy elegido, **Entonces** se actualiza en la tarjeta, en el calendario (el punto relleno o vacío de ese día), en la barra de progreso y en el resto de la pantalla, sin recargar y sin cambiar el día elegido.
4. **Dado** que se toca el día de hoy, **Entonces** las tarjetas muestran lo mismo que hoy mostraban por omisión.
5. **Dado** una toma cancelada (spec 016) o sin registrar (spec 013), **Cuando** su día está elegido, **Entonces** conserva su aspecto y reglas actuales en la tarjeta.
6. **Dado** el padre en el teléfono, **Cuando** toca un día, **Entonces** la pantalla se desplaza **lo mínimo** para dejar a la vista la primera tarjeta de medicamento (si ya se ve, no se mueve; con «reducir movimiento» el desplazamiento no es animado); en la web no se desplaza. Cada tarjeta dice **qué día** está mostrando.
7. **Dado** el padre que toca un día en una consulta y luego abre otra consulta, **Entonces** la otra abre en su propio día inicial, no en el que se tocó en la primera.

---

### Historia de Usuario 2 - Abrir el detalle con el día de siempre elegido (Prioridad: P1)

Al abrir el detalle de la consulta ya hay un día elegido y las tarjetas muestran sus tomas, sin que el padre toque nada.

**Por qué esta prioridad**: sin día inicial las tarjetas estarían vacías al entrar; hoy el padre ve de inmediato las tomas de hoy y eso no debe perderse.

**Prueba Independiente**: abrir una consulta cuyo tratamiento incluye hoy muestra hoy elegido y en las tarjetas las tomas de hoy.

**Escenarios de Aceptación**:

1. **Dado** una consulta cuyo tratamiento incluye hoy, **Cuando** el padre abre el detalle, **Entonces** el día elegido es hoy y cada tarjeta muestra sus tomas de hoy.
2. **Dado** una consulta cuyo tratamiento no incluye hoy (ya terminó o aún no empieza), **Cuando** se abre el detalle, **Entonces** el día elegido es el primer día del tratamiento (la misma regla del calendario de la spec 019).
3. **Dado** que el día cambia a la medianoche con la pantalla abierta, **Entonces** el día elegido por el padre no cambia solo.

---

### Casos Límite

- Una consulta **sin tomas** (sin medicamentos o medicamentos sin tomas): no hay calendario ni día elegido; las tarjetas se muestran como hoy, sin chips (como ahora).
- Un tratamiento **finalizado antes de tiempo** (spec 016): las tomas canceladas de los días posteriores al fin se alcanzan tocando esos días (hoy no se alcanzaban desde el calendario); se ven canceladas, como siempre.
- Un tratamiento **recorrido** (spec 020): las tomas agregadas aparecen en sus días como tomas normales.
- Un medicamento con **varias tomas** el mismo día: se agrupan por momento del día (spec 015), solo los grupos que tengan tomas.
- Cambiar de **mes** en el calendario no cambia el día elegido ni lo que muestran las tarjetas.
- El padre en otra **zona horaria**: los días se calculan con la hora local que ve el padre (specs 013/015).
- La barra de progreso y el texto «Terminado el …» / «Se recorrió el …» de cada tarjeta **no dependen del día elegido**: siempre cuentan todo el medicamento.
- Esta funcionalidad **no toca** el bloque «Tomas de hoy» del detalle del hijo ni el panel de «Tomas de hoy» de la web del hijo (spec 006): reúnen las tomas de todas las consultas y son otra cosa.
- Pantallas de 390 px: sin desplazamiento horizontal.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: El detalle de la consulta NO DEBE mostrar ya la lista de tomas del día ni su título («Tomas de hoy» / «Tomas del <día>») ni el divisor que la separaba, bajo el calendario. El calendario conserva sus meses, días, puntos y leyenda.
- **FR-002**: El día elegido en el calendario DEBE ser **el mismo** que determina qué tomas muestra cada tarjeta de «Medicamentos»: una sola selección por pantalla.
- **FR-003**: Cada tarjeta DEBE mostrar las tomas **de su medicamento en el día elegido**, agrupadas en Mañana, Tarde y Noche (spec 015), con el mismo chip marcable y los mismos estados (tomada, por marcar, pendiente, sin registrar, cancelada) que hoy.
- **FR-004**: Si el medicamento no tiene tomas en el día elegido, su tarjeta DEBE decir que ese día no tiene tomas.
- **FR-005**: Cada tarjeta DEBE decir **qué día** muestra (p. ej. «Hoy» o «3 de octubre»), con el formato de fechas del proyecto; los grupos Mañana/Tarde/Noche también lo dicen en su nombre accesible («Mañana, Amoxicilina, hoy»).
- **FR-006**: Al abrir el detalle el día elegido DEBE ser hoy si está dentro del tratamiento o, si no, el primer día del tratamiento (la regla de la spec 019); el día elegido por el padre no cambia solo cuando pasa la medianoche.
- **FR-007**: Marcar o desmarcar una toma DEBE actualizarse en la tarjeta, el calendario, el progreso y las cantidades del resto de la pantalla, sin recargar y sin cambiar el día elegido.
- **FR-008**: La barra de progreso, el horario, «Terminado el …», «Se recorrió el …» y los botones «Finalizar tratamiento» / «Recorrer tratamiento» de cada tarjeta DEBEN seguir calculándose con **todo** el medicamento, sin depender del día elegido.
- **FR-009**: Móvil y web DEBEN conservar sus diseños separados; la funcionalidad no cambia la estructura de ninguno salvo lo que FR-001 y FR-005 piden, y debe cumplir las reglas visuales del proyecto (`design-tokens.md`).
- **FR-010**: Los textos DEBEN ser neutros y en español, sin consejo ni evaluación (Principio I).

### Entidades Clave

- **Día elegido**: un día del tratamiento (`AAAA-MM-DD`, hora local) que es el mismo para el calendario y para todas las tarjetas; se deriva de la selección del padre, no se guarda.
- **Tomas del día de un medicamento**: las tomas del medicamento cuya hora programada cae en el día elegido; se derivan de las tomas que el detalle ya trae.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: El padre ve las tomas de cualquier día del tratamiento, medicamento por medicamento, con **un solo toque** en el calendario y sin otra pantalla ni lista intermedia.
- **SC-002**: El 100 % de las tomas de una consulta se alcanza tocando su día (incluidas las canceladas de un tratamiento finalizado y las agregadas por un recorrido).
- **SC-003**: Las tomas de hoy siguen visibles **al abrir** el detalle, sin tocar nada, cuando hoy está en el tratamiento.
- **SC-004**: No queda ninguna lista de tomas repetida en el detalle de la consulta: cada toma aparece una sola vez en pantalla.
- **SC-005**: Los flujos pasan sus pruebas de extremo a extremo a 390 y 1280 px, y las unitarias mantienen >90 % de cobertura.

## Supuestos

- Solo frontend: todo se deriva de las tomas que el detalle de la consulta ya trae; sin API ni base de datos.
- **Decidido por el usuario (2026-10-01)**: opción (b) del `BACKLOG.md`, y la «bandeja de abajo» es la lista bajo el calendario (specs 019/022), no el bloque «Tomas de hoy» del detalle del hijo.
- **Cambio de regla del día por omisión de las tarjetas**: hoy cada tarjeta muestra «hoy, o el día más cercano con tomas del propio medicamento, o el último». Pasa a regir la regla del calendario: **hoy si está dentro del tratamiento; si no, el primer día**. Consecuencia: en un tratamiento ya terminado las tarjetas abren en su primer día (antes, en el último); el padre llega a cualquier otro día tocándolo en el calendario.
- El chip «próxima» del diseño de la spec 022 (segunda línea de la toma siguiente) desaparece con la lista; las tarjetas conservan sus chips actuales. Lo que la spec 022 dibujó para la lista (filas con número de color) no se traslada a las tarjetas.
- El texto exacto que dice el día en cada tarjeta y el de «ese día no tiene tomas» se fijan en el plan, con el formato de fechas del proyecto.
- La leyenda de colores del calendario, sus puntos y la tarjeta «Cómo leer el calendario» (web) se quedan tal como están.
- Fuera de alcance: el calendario del detalle del hijo, recorrer o finalizar tratamientos, exportar al calendario del teléfono, vistas semanal o anual y cualquier cambio de la API.
- Depende de: specs 013 (estados), 015 (momentos del día), 016 (finalizar), 019 y 022 (calendario). Mientras el PR #22 (spec 022) no esté en `develop`, la rama se crea desde `feature/022-rebranding-calendario`.
