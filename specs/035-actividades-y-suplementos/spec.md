# Especificación de Funcionalidad: Suplementos y Actividades por separado

**Rama de la Funcionalidad**: `feature/035-actividades-y-suplementos`

**Creado**: 2026-10-08

**Estado**: Implementado (rama `feature/035-actividades-y-suplementos`, PR a `develop`)

**Entrada**: Observación del dueño del producto (2026-10-08, con capturas de un iPhone): en «Mis suplementos» una persona registró «Tomar agua» **cada hora** y la tarjeta escribía las 24 horas, mostraba 24 chips de toma y el calendario del detalle dibujaba 24 puntos por día que se salían de la pantalla; además la pantalla decía «suplemento» y «rutina» a la vez. Decisiones: (1) **dos secciones separadas**, **Suplementos** y **Actividades**, en el hijo y en lo personal; (2) los suplementos solo con **horas fijas** (ya no «cada N horas») y **sin calendario**, con el progreso del día en texto y barra; (3) las actividades se definen **«desde una hora hasta otra, cada cuánto»**, sin chips ni calendario: solo **barra de progreso del día**, «Próxima» y «Última», y un botón **«Realizado»** (en el aviso también); (4) las actividades pueden ser de la persona o de un hijo (las del hijo se comparten con la familia). Diseño entregado: `Actividades PediTrack.dc.html`; decisiones en [referencia/actividades-decisiones.md](./referencia/actividades-decisiones.md). Corrige la spec 033.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Una actividad «desde una hora hasta otra, cada cuánto» (Prioridad: P1)

La persona agrega la actividad «Tomar agua»: desde las 08:00, hasta las 20:00, cada 1 hora, todos los días. La tarjeta dice «Cada hora, de 08:00 a 20:00» y «6 de 13 hechas hoy» con una barra y «Próxima: 15:00»; nunca lista las 13 horas ni dibuja 13 chips. Cada vez que la hace toca «✓ Realizado» y la cuenta sube; el aviso a cada hora llega con la acción «Realizado».

**Por qué esta prioridad**: es el caso que rompió la pantalla y el que el dueño pidió.

**Prueba Independiente**: crear una actividad 09:00–18:00 cada 30 min; ver «Cada 30 min, de 09:00 a 18:00», 19 avisos al día en el detalle, tocar «Realizado» dos veces y ver «2 de 19 hechas hoy»; el aviso no tiene «Tomada».

**Escenarios de Aceptación**:

1. **Dado** una actividad activa que hoy toca, **Entonces** la tarjeta muestra la regla, «N de M hechas hoy», la barra (`role=progressbar`), «Próxima: HH:MM», «Última: …» si ya hay marcas y «✓ Realizado»; no hay chips, horas sueltas ni calendario.
2. **Dado** «Realizado», **Entonces** el servidor marca la **siguiente toma sin marcar del día** (la más temprana, también una futura) y queda registrado quién y cuándo; dos personas tocando a la vez marcan dos tomas distintas, nunca la misma.
3. **Dado** que ya están todas marcadas, **Entonces** el botón desaparece y «Próxima» dice «Sin más avisos hoy».
4. **Dado** que hay marcas hoy, **Entonces** el detalle ofrece «Quitar la última marca»: quita la última marcada del día si es de quien lo toca o quien puede todo (la regla de siempre de las tomas).
5. **Dado** el formulario, **Entonces** pide «Desde las» / «Hasta las» (la de fin va después de la de inicio), «Cada [N] minutos u horas» (5 a 59 minutos o 1 a 23 horas), «Días» (todos o ciertos días), fechas de inicio y fin opcional y nota, **sin ejemplos ni valores por omisión en las horas**, y cuenta los avisos sin listarlos («Con esto, cada día hay 13 avisos: el primero a las 08:00 y el último a las 20:00.»).
6. **Dado** una regla cuya hora de fin no cae justo en un intervalo (cada 2 horas de 09:00 a 18:00), **Entonces** el último aviso es el último que cabe (17:00).
7. **Dado** una actividad de 24 avisos al día, **Entonces** la tarjeta y el detalle miden lo mismo que una de 4.
8. **Dado** el aviso (push) de una actividad, **Entonces** dice «Actividad programada» (con detalle: «· Tomar agua» y «Mateo · 15:00»; propia: «15:00») y tiene la acción **«Realizado»**, nunca «Tomada».

---

### Historia de Usuario 2 - Los suplementos solo con horas fijas, sin calendario y mejor formato (Prioridad: P1)

Un suplemento es lo que se toma a **horas fijas** (diaria, o ciertos días de la semana, de una a seis horas). La tarjeta y el detalle se rediseñan: días y número de tomas, fechas, «2 de 6 tomas hoy» con barra y los chips de hoy; **desaparece el calendario** del detalle (queda una tarjeta «Hoy · jue 8 oct» con la cuenta, la barra y las tomas marcables). Desaparece «cada N horas» del formulario y los textos dicen «suplemento», nunca «rutina».

**Escenarios de Aceptación**:

1. **Dado** un suplemento con seis horas, **Entonces** la tarjeta dice «Todos los días · 6 tomas» (las horas las muestran los chips) y los chips caben en dos columnas en móvil y tres en web.
2. **Dado** el detalle, **Entonces** no hay calendario; sí «Horas», «Fechas», «Nota», «Agregado por» (en lo personal no hay «Agregado por»), «Tus avisos» (también en lo personal).
3. **Dado** el formulario, **Entonces** solo ofrece «Todos los días» y «Ciertos días de la semana»; las horas empiezan vacías; «+ Agregar otra hora» desaparece al llegar a seis.
4. **Dado** cualquier texto de las pantallas de suplementos, **Entonces** no dice «rutina»; el botón es «+ Agregar suplemento».

---

### Historia de Usuario 3 - Dos secciones separadas, en el hijo y en lo personal (Prioridad: P1)

En el detalle de cada hijo, **Suplementos** y **Actividades** son dos secciones una bajo otra, cada una con su botón, su vacío, su tope de 10 activos y su plan. En lo personal son dos pantallas — `/mis-suplementos` y `/mis-actividades` — con su entrada cada una en el inicio y en la barra lateral web; el inicio resume las dos («Tus tomas de hoy» y «Tus actividades de hoy», con «Realizado» en cada fila).

**Escenarios de Aceptación**:

1. **Dado** una persona de pago, **Entonces** puede agregar actividades y suplementos de sus hijos (Tutores) y propios; un Cuidador ve y marca «Realizado» y elige sus avisos pero no agrega ni edita.
2. **Dado** el plan caducado, **Entonces** todo se ve y se marca (incluido «Realizado»), y solo se puede finalizar; el servidor sigue pidiendo plan para crear, editar y reanudar.
3. **Dado** 10 activas de un tipo, **Entonces** el tope se explica en esa sección y no cuenta las del otro tipo.
4. **Dado** las actividades de un hijo, **Entonces** no entran en «Tomas de hoy» del hijo ni en el inicio (solo las propias).

---

### Historia de Usuario 4 - Lo que ya existe sigue funcionando (Prioridad: P2)

Las rutinas «cada N horas» que ya existen pasan a ser **actividades** (empiezan a su primera hora y siguen cada N horas hasta las 23:59, todos los días), con sus tomas marcadas y su historial intactos; los suplementos con horas fijas no cambian.

## Requisitos *(obligatorio)*

- **FR-001**: Una rutina tiene un **tipo** (`supplement` | `activity`) fijado al crearla. Suplemento: periodo `daily` o `weekdays` con 1–6 horas. Actividad: periodo `window` con hora de inicio y de fin (la de fin posterior a la de inicio), `intervalMinutes` de 5 a 1380 y 0–7 días de la semana (vacío = todos). Se quita el periodo `interval`.
- **FR-002**: Las tomas de una actividad se calculan por día local: de la hora de inicio a la de fin cada `intervalMinutes`, solo en los días elegidos, entre su fecha de inicio y la de fin; el último es el último que cabe. Se materializan como las de un suplemento (horizonte de 14 días).
- **FR-003**: `POST /routines/{id}/done` (nivel «ver y marcar», sin depender del plan) marca la **siguiente toma sin marcar** de la ventana dada (`from`, `to`) con el actor de la sesión, atómico (dos personas a la vez marcan tomas distintas); 409 `nothing_to_mark` si no queda ninguna.
- **FR-004**: Las listas (`GET …/routines`) se piden **por tipo** (`kind`, por omisión `supplement`) y el tope de 10 activas se cuenta **por tipo** y por hijo (o por persona en lo propio).
- **FR-005**: «Tomas de hoy» del hijo (overview) y del inicio solo incluyen **suplementos**; las actividades de un hijo se ven en su detalle.
- **FR-006**: El aviso de una actividad lleva `source: "activity"` y la acción «Realizado» (la «Tomada» de las demás no cambia); el texto lo redacta el dispositivo, sin imperativos; el genérico no lleva nombre ni hijo.
- **FR-007**: La migración convierte las rutinas `interval` existentes en actividades y regenera sus tomas futuras sin tocar lo pasado ni lo marcado.
- **FR-008**: Todo el texto visible dice «suplemento» o «actividad», nunca «rutina»; los nombres de código y de API siguen en inglés (`routine`).
- **FR-009**: Web y móvil son dos diseños separados (`useIsDesktop`), nunca mezclados; nada de calendario en suplementos ni en actividades.
- **FR-010**: Principio I: ningún texto, ejemplo ni color evalúa el progreso («bien», «mal», «te falta»); el progreso solo cuenta lo marcado y no cambia de color.

## Fuera de alcance

- Actividades de un hijo en el inicio (el diseño solo las muestra en el detalle del hijo).
- Renombrar el inicio a «Inicio» ni cambiar «← Tus hijos» (pendiente de la parte 3 de la spec 033).

## Supuestos (preguntas abiertas del diseño, resueltas hasta nueva decisión del dueño)

1. «Realizado» marca la **más temprana sin marcar del día**, también si ya pasaron todas (cuenta hacia el total del día).
2. «Quitar la última marca» aparece **siempre que haya marcas hoy** y la última sea de quien lo toca o de quien puede todo (la regla de las tomas).
3. Mínimo y máximo de «cada»: de **5 a 59 minutos** o de **1 a 23 horas** (hasta 288 avisos al día).
4. Si la hora de fin no cae justo en un intervalo, el último aviso es el último que cabe.
5. El tope de 10 es **por tipo y por hijo** (y por tipo en lo propio).
6. Las rutinas «cada N horas» existentes pasan a **actividades** (ventana desde su primera hora hasta las 23:59).
7. Las horas del formulario de suplemento **empiezan vacías**.
8. Un solo diálogo de finalizar por tipo con los textos del diseño; «Pausar» sigue sin confirmación.
9. «Realizado» de contorno en las listas y sólido en el detalle de la actividad, como dibuja el diseño.
