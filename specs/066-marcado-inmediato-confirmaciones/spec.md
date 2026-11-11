# Especificación de Funcionalidad: Marcado inmediato de tomas y confirmaciones propias

**Rama**: `feature/066-marcado-inmediato-confirmaciones`
**Creada**: 2026-11-11
**Estado**: Implementada (E2E en verde en local el 2026-11-11)
**Entrada**: revisión de la interfaz del 2026-11-10 (puntos 2 y 3) y el «Sí, empieza» del dueño. (1) Al marcar una toma o tocar «Realizado», la pantalla espera hoy la respuesta del servidor antes de cambiar; con mala señal parece que el toque no entró e invita a tocar dos veces. (2) Al salir de un formulario con datos, la app pregunta con el cuadro del navegador, que en la app instalada muestra el dominio y se ve distinto en cada teléfono. Solo cambia cómo responde la pantalla: no cambia qué se guarda, quién puede marcar ni ninguna regla del servidor. Sin mock (sistema visual y el diálogo de confirmación que ya existe en «Familia»).

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - La toma se ve marcada en cuanto la toco (Prioridad: P1)

Ana está en el estacionamiento del pediatra, con una rayita de señal. Le da la amoxicilina a Mateo y toca «Marcar». La toma se ve marcada en ese instante, con su hora. Unos segundos después el servidor confirma y aparece «por Ana, 16:02». Ana no tuvo que quedarse viendo la pantalla ni tocar otra vez.

**Por qué esta prioridad**: marcar es la acción que más se repite en la app, y un toque que no responde es la queja más probable de quien la usa todos los días.

**Prueba Independiente**: con la respuesta del servidor retrasada 3 segundos, tocar «Marcar» y comprobar que la toma cambia de inmediato y que, al llegar la respuesta, queda con el autor y la hora del servidor.

**Escenarios de Aceptación**:

1. **Dado** una toma sin marcar que la persona puede marcar, **Cuando** toca «Marcar», **Entonces** la toma se ve marcada de inmediato, sin esperar al servidor.
2. **Dado** una toma que la persona marcó, **Cuando** toca para quitar la marca, **Entonces** se ve sin marcar de inmediato.
3. **Dado** una actividad con avisos por marcar hoy, **Cuando** toca «✓ Realizado», **Entonces** el conteo del día y la barra avanzan de inmediato.
4. **Dado** un cambio mostrado de inmediato, **Cuando** el servidor lo confirma, **Entonces** la pantalla muestra lo que el servidor guardó (autor, hora y estado), y los conteos del día coinciden con él.
5. **Dado** un cambio que el servidor tarda más de 2 segundos en confirmar, **Cuando** la persona mira la toma, **Entonces** ve junto a ella «guardando…» hasta que llegue la respuesta.
6. **Dado** cualquier pantalla donde hoy se marca (detalle de la consulta, «Hoy» del detalle del hijo, tarjeta del hijo y «Tu día» en el inicio, el perfil propio, el perfil compartido de otra persona, el detalle de un suplemento o de una actividad y la pantalla del teléfono del hijo), **Cuando** se marca o se quita una marca, **Entonces** se comporta igual en todas.
7. **Dado** una toma marcada desde una pantalla, **Cuando** la persona pasa a otra pantalla que muestra la misma toma, **Entonces** la ve en el mismo estado.

---

### Historia de Usuario 2 - Si no se guardó, la pantalla lo dice y no miente (Prioridad: P1)

Luis toca «Marcar» en el elevador, sin señal. La toma se ve marcada un momento y luego vuelve a «por marcar», con un aviso: «No se guardó la marca. Revisa tu conexión e inténtalo de nuevo.» En su casa, Ana abre la app y ve la toma sin marcar, que es la verdad.

**Por qué esta prioridad**: son datos de salud compartidos. Una toma que se ve marcada en un teléfono y sin marcar en el otro puede terminar en una dosis doble o en una que nadie dio.

**Prueba Independiente**: hacer que el servidor rechace o no responda, tocar «Marcar» y comprobar que la toma vuelve a su estado anterior, que aparece el aviso y que ningún conteo queda cambiado.

**Escenarios de Aceptación**:

1. **Dado** un cambio mostrado de inmediato, **Cuando** no hay conexión o el servidor falla, **Entonces** la toma vuelve a su estado anterior y aparece un aviso neutral de que no se guardó.
2. **Dado** dos personas que marcan la misma toma casi a la vez, **Cuando** el servidor acepta la primera y rechaza la segunda, **Entonces** quien llegó después ve la toma marcada «por» la otra persona, con un aviso de que ya estaba marcada, y no puede quitar esa marca si no le corresponde.
3. **Dado** una persona que ya no tiene acceso (salió de la familia, se quitó el teléfono del hijo), **Cuando** toca «Marcar», **Entonces** la toma vuelve a su estado anterior y ve el aviso que hoy corresponde a ese caso.
4. **Dado** una toma que se canceló mientras la pantalla estaba abierta (tratamiento finalizado), **Cuando** toca «Marcar», **Entonces** la toma vuelve atrás y la pantalla se actualiza con el estado real.
5. **Dado** «✓ Realizado» en una actividad cuyo último aviso ya marcó otra persona, **Cuando** el servidor responde que no queda nada por marcar, **Entonces** el conteo vuelve al del servidor, sin mensaje de error.
6. **Dado** un aviso de que no se guardó, **Cuando** la persona vuelve a tocar «Marcar» con conexión, **Entonces** se guarda y el aviso desaparece.
7. **Dado** un lector de pantalla, **Cuando** un cambio se revierte, **Entonces** el aviso se anuncia sin mover el foco.

---

### Historia de Usuario 3 - La app pregunta con su propio diálogo antes de descartar (Prioridad: P2)

Ana lleva media «Nueva consulta» capturada y toca «← Cancelar» sin querer. En lugar del cuadro gris del navegador con el dominio, ve una hoja de la app: «¿Descartar la consulta? Se perderá lo que capturaste.», con «Seguir editando» (donde está el foco) y «Descartar». Toca «Seguir editando» y todo lo que escribió sigue ahí, también la foto.

**Por qué esta prioridad**: no cambia lo que la app hace, pero es la única parte de la interfaz que todavía no es de la app y aparece en el momento en que alguien puede perder su captura.

**Prueba Independiente**: escribir en cada formulario, intentar salir y comprobar que aparece el diálogo de la app, que «Seguir editando» conserva todo y que «Descartar» sale.

**Escenarios de Aceptación**:

1. **Dado** un formulario con datos sin guardar (nueva consulta, editar consulta, cita, suplemento o actividad, botiquín, medida de crecimiento, editar datos del hijo, vacuna), **Cuando** la persona intenta salir desde la app, **Entonces** ve el diálogo de confirmación de la app y no el del navegador.
2. **Dado** el diálogo abierto, **Cuando** elige «Seguir editando», presiona Escape o toca fuera, **Entonces** se cierra, sigue en el formulario con todo lo capturado y el foco vuelve a donde estaba.
3. **Dado** el diálogo abierto, **Cuando** elige «Descartar», **Entonces** sale a donde iba y lo capturado se pierde.
4. **Dado** un formulario sin cambios, **Cuando** la persona sale, **Entonces** no se le pregunta nada.
5. **Dado** el aviso «Hay una versión nueva» y un formulario con datos, **Cuando** toca «Actualizar», **Entonces** ve el diálogo de la app con la frase de hoy; solo se actualiza si lo confirma.
6. **Dado** el diálogo en el teléfono, **Entonces** es una hoja desde abajo; **Dado** el diálogo en la web, **Entonces** va centrado. En los dos el foco empieza en la opción que conserva los datos y Tab no sale del diálogo.
7. **Dado** el diálogo de una vacuna (que ya es un diálogo), **Cuando** se intenta cerrar con datos, **Entonces** la confirmación aparece encima y al cancelarla se vuelve al diálogo de la vacuna con lo escrito.

---

### Casos Límite

- **Toques rápidos sobre la misma toma** (marcar, quitar, marcar): la pantalla termina en el estado del último toque y el servidor no guarda marcas repetidas ni queda en el estado contrario.
- **Varias tomas marcadas una tras otra**: cada una responde al instante; si falla solo una, solo esa vuelve atrás y el aviso dice cuál.
- **La pantalla se actualiza sola (cada 60 s o al volver a la app) mientras hay una marca por confirmar**: la actualización no borra la marca que aún espera respuesta.
- **La persona cambia de pantalla o cierra la app antes de la respuesta**: si el servidor no la guardó, al volver se ve sin marcar (manda el servidor); el aviso se muestra si la app sigue abierta.
- **La respuesta nunca llega** (red colgada): «guardando…» se mantiene hasta que la petición falle, y entonces se revierte con el aviso.
- **Una toma con marca ajena y candado**: no se puede tocar; nada cambia.
- **«sin registrar», «programada» y «cancelada»**: el cambio inmediato solo pone o quita la marca; qué estado tiene una toma sin marcar lo sigue diciendo el servidor.
- **Botón «atrás» del teléfono o del navegador, cerrar o recargar la pestaña**: se comportan como hoy; esta funcionalidad no agrega ni quita preguntas ahí.
- **Dos diálogos**: nunca quedan dos confirmaciones abiertas a la vez.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: Al marcar una toma, quitar una marca o tocar «Realizado», la pantalla DEBE mostrar el cambio de inmediato, sin esperar la respuesta del servidor.
- **FR-002**: El cambio inmediato DEBE aplicarse por igual en todas las pantallas donde hoy se marca: detalle de la consulta, «Hoy» del detalle del hijo, tarjeta del hijo y «Tu día» del inicio, perfil propio, perfil compartido, detalle de suplemento y de actividad, y la pantalla del teléfono del hijo.
- **FR-003**: Mientras un cambio espera respuesta, los conteos, barras y resúmenes del día de esa pantalla DEBEN reflejarlo.
- **FR-004**: Cuando el servidor confirma, la pantalla DEBE mostrar lo que el servidor guardó (autor, hora y estado); el autor y la hora definitivos son siempre los del servidor.
- **FR-005**: Si el servidor rechaza el cambio o no se puede contactar, la pantalla DEBE volver al estado anterior y mostrar un aviso neutral de que no se guardó. NUNCA debe quedar como marcada una toma que el servidor no guardó, ni como sin marcar una que sí.
- **FR-006**: Si el rechazo se debe a que otra persona ya había marcado la toma, la pantalla DEBE mostrar esa marca con su autor y decirlo, sin tono de error.
- **FR-007**: Un cambio que tarda más de 2 segundos en confirmarse DEBE verse como «guardando…» hasta que termine.
- **FR-008**: Las actualizaciones automáticas de la pantalla NO DEBEN deshacer un cambio que aún espera respuesta.
- **FR-009**: Toques repetidos sobre la misma toma DEBEN terminar con la pantalla y el servidor en el estado del último toque, sin marcas duplicadas.
- **FR-010**: El aviso de que no se guardó DEBE anunciarse a los lectores de pantalla sin mover el foco y DEBE desaparecer cuando el siguiente intento se guarda.
- **FR-011**: Qué toma está «por marcar», «sin registrar», «programada» o «cancelada» lo sigue decidiendo el servidor; el reloj del teléfono NO DEBE decidir ningún estado.
- **FR-012**: Quién puede marcar y quién puede quitar una marca NO cambia; un control que hoy está bloqueado sigue bloqueado.
- **FR-013**: Al intentar salir, desde la app, de un formulario con datos sin guardar, la app DEBE preguntar con su propio diálogo de confirmación en lugar del cuadro del navegador, en estos formularios: nueva consulta, editar consulta, cita (nueva y editar), suplemento y actividad (nuevo y editar), botiquín (nuevo y editar), medida de crecimiento (nueva y editar), editar datos del hijo y el diálogo de vacuna.
- **FR-014**: «Actualizar» del aviso de versión nueva, con un formulario con datos, DEBE preguntar con el mismo diálogo y actualizar solo si se confirma.
- **FR-015**: El diálogo DEBE conservar las frases que hoy se usan en cada caso, ofrecer «Seguir editando» y «Descartar» (en la actualización, «Seguir editando» y «Actualizar»), poner el foco inicial en la opción que conserva los datos, cerrarse con Escape o al tocar fuera sin descartar, no dejar salir el foco con Tab y devolver el foco al control que lo abrió.
- **FR-016**: El diálogo DEBE ser una hoja desde abajo en el diseño del teléfono y un cuadro centrado en el diseño web, sin mezclar los dos.
- **FR-017**: Cancelar el diálogo DEBE conservar todo lo capturado, incluida una foto ya elegida.
- **FR-018**: Ninguna frase nueva DEBE evaluar, aconsejar ni usar palabras de alarma (Principio I); los avisos dicen qué pasó con la marca, no qué hacer con la salud.
- **FR-019**: La funcionalidad NO DEBE cambiar ninguna regla del servidor, ningún dato guardado ni ningún permiso.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Al tocar «Marcar», «Realizado» o quitar una marca, el cambio se ve en menos de 100 milisegundos, sea cual sea la velocidad de la conexión.
- **SC-002**: En el 100 % de los casos en que el servidor no guarda un cambio, la pantalla vuelve al estado anterior y muestra el aviso en menos de 1 segundo desde que se conoce la falla.
- **SC-003**: Después de cualquier secuencia de toques, con o sin fallas, lo que muestra la pantalla al terminar coincide con lo que el servidor tiene guardado.
- **SC-004**: En ningún formulario de la app aparece el cuadro de confirmación del navegador al salir con datos o al actualizar la versión.
- **SC-005**: El diálogo de confirmación se puede usar completo solo con teclado y con lector de pantalla, en el diseño del teléfono y en el web.
- **SC-006**: Con una conexión lenta (3 segundos por respuesta), una persona marca cinco tomas seguidas sin esperar entre una y otra y las cinco quedan guardadas.

## Supuestos

- **Sin botón «Deshacer» aparte**: quitar una marca ya es volver a tocar la toma (y en el inicio «✓ HH:MM» se puede tocar durante un minuto); no se agrega otro control.
- **«guardando…» a los 2 segundos**: antes de eso la toma se ve como marcada sin más, para que con buena señal no parpadee ningún texto. Es una decisión de esta spec; el dueño puede pedir que se vea desde el primer instante.
- **Sin marcar sin conexión**: si no hay señal, la marca no se guarda en el teléfono para mandarla después; se revierte y se avisa. Guardarla y sincronizarla es la etapa 2 de «Ver la app sin conexión» del `BACKLOG.md`.
- **«Marcar tomas» (todas las de hoy)** y la acción «Tomada» de un aviso quedan como están.
- **El botón «atrás» del sistema, cerrar y recargar la pestaña** quedan como están: hoy la app no pregunta ahí y esta funcionalidad no lo cambia.
- **Las frases de confirmación** son las de hoy, sin reescribirlas; solo se agregan las etiquetas de los dos botones y los avisos de la marca que no se guardó.
- **Sin mock**: el diálogo es el de confirmación de «Familia», ya homologado a su mock; el aviso usa el bloque de avisos del sistema visual.
- **Solo la aplicación del navegador**: no hay cambios de servidor, de datos ni del aviso «Antes de empezar».
- **Pruebas** en los dos diseños (390 y 1280 px), como toda pantalla.
