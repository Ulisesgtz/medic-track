# Especificación de Funcionalidad: Historial con búsqueda y filtros (plan de pago)

**Rama de la Funcionalidad**: `feature/031-historial-busqueda-filtros`

**Creado**: 2026-10-05

**Estado**: Borrador

**Entrada**: Descripción del usuario: pantalla «Historial» con búsqueda de texto y filtros (fechas, doctor, síntoma, medicamento, «con tratamiento / solo registro») sobre las consultas que ya existen, **exclusiva del plan de pago**; solo lectura, solo encuentra (Principio I); el plan gratuito sigue viendo su lista simple por fecha y, si intenta entrar, ve el aviso del plan; el plan lo decide el servidor. Decidido el 2026-10-05 (`BACKLOG.md`, «Qué incluye el plan de pago»). Segundo paso del «Orden sugerido» de esa entrada.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Encontrar una consulta del pasado (Prioridad: P1)

Una familia con el plan de pago lleva meses o años registrando consultas de un hijo. El pediatra le pregunta «¿cuándo fue la última vez que le dieron amoxicilina?» o ella quiere recordar qué doctor lo vio por la tos del año pasado. Abre el **Historial** del hijo y **escribe una palabra** (el nombre de un doctor, de un medicamento o algo de las notas) y/o **acota con filtros**: un rango de fechas, un doctor, uno o varios síntomas, un medicamento, o «con tratamiento» / «solo registro». La lista muestra **solo las consultas que coinciden**, con las mismas tarjetas de siempre, y tocar una abre su detalle de siempre.

**Por qué esta prioridad**: es todo el valor pedido y la razón de ser del plan de pago en esta función; sin ella el historial largo es una lista que solo se desplaza.

**Prueba Independiente**: con una cuenta de pago y un hijo con varias consultas distintas (doctores, medicamentos y síntomas distintos, una «solo registro»), escribir el nombre de un medicamento deja solo las consultas que lo tienen; añadir un rango de fechas las reduce más; limpiar todo regresa la lista completa.

**Escenarios de Aceptación**:

1. **Dado** una cuenta de pago y un hijo con consultas, **Cuando** abre el Historial sin escribir ni filtrar nada, **Entonces** ve **todas** sus consultas, de la más reciente a la más antigua, con el conteo («12 consultas»).
2. **Dado** el Historial, **Cuando** escribe una palabra en la búsqueda, **Entonces** la lista deja las consultas donde esa palabra aparece en el **doctor**, en el nombre de **algún medicamento** o en las **notas**, sin importar mayúsculas ni acentos («nino» encuentra «niño», «lopez» encuentra «López»).
3. **Dado** el Historial, **Cuando** elige un rango de fechas (desde, hasta, o solo uno de los dos), **Entonces** quedan las consultas cuya **fecha de consulta** cae dentro, extremos incluidos.
4. **Dado** el Historial, **Cuando** elige un doctor entre los que ya registró para ese hijo, **Entonces** quedan solo las consultas de ese doctor.
5. **Dado** el Historial, **Cuando** marca uno o más síntomas del catálogo (los mismos de «Nueva consulta»), **Entonces** quedan las consultas que tienen **todos** los síntomas marcados.
6. **Dado** el Historial, **Cuando** elige un medicamento entre los que ya registró para ese hijo, **Entonces** quedan las consultas que lo incluyen.
7. **Dado** el Historial, **Cuando** elige «Con tratamiento» o «Solo registro», **Entonces** quedan solo las consultas de ese tipo; «Todas» (por omisión) no filtra.
8. **Dado** varios criterios a la vez, **Entonces** una consulta aparece **solo si cumple todos** (la búsqueda de texto y cada filtro se suman, nunca se alternan).
9. **Dado** un resultado, **Cuando** toca la tarjeta, **Entonces** abre el detalle de la consulta, igual que desde la lista de siempre.
10. **Dado** cualquier combinación, **Entonces** la pantalla **solo encuentra y muestra**: nunca resume, compara, puntúa ni sugiere nada sobre la salud del niño (Principio I).

---

### Historia de Usuario 2 - El plan gratuito conserva su lista y ve qué incluye el completo (Prioridad: P1)

Una cuenta del plan gratuito **sigue viendo todas sus consultas** en su lista por fecha, exactamente como hoy: nada se oculta ni se limita por esta función (Principio IV: los datos ya capturados nunca se bloquean). La búsqueda y los filtros se ofrecen, pero son del plan completo: en la lista del hijo aparece la entrada «Buscar en el historial» con la marca «Plan completo»; al tocarla se abre el **aviso del plan** (el mismo pop-up de siempre, con su texto neutral: es parte del plan completo y todo lo registrado se mantiene) con «Entendido» y «Ver planes». Aunque alguien llegue al Historial por la dirección directa o con una llamada manual, **el servidor lo rechaza** para el plan gratuito.

**Por qué esta prioridad**: sin esto el corte de producto no existe (todos tendrían la función) o, peor, se escondería lo ya registrado.

**Prueba Independiente**: con una cuenta gratuita, la lista del hijo se ve completa y la entrada «Buscar en el historial» abre el aviso del plan, sin ninguna pantalla de búsqueda; con una cuenta de pago la misma entrada abre el Historial.

**Escenarios de Aceptación**:

1. **Dado** una cuenta gratuita (con cualquier cantidad de consultas, incluso las de cuando era de pago), **Entonces** la lista del hijo muestra todas sus consultas por fecha, sin cambios.
2. **Dado** una cuenta gratuita, **Cuando** toca «Buscar en el historial», **Entonces** ve el aviso del plan (no se navega a ninguna pantalla de búsqueda) y «Ver planes» abre `/planes`.
3. **Dado** una cuenta gratuita que intenta la búsqueda o los filtros por la dirección directa o una llamada manual, **Entonces** el servidor los rechaza y **no devuelve resultados filtrados**; la app muestra el mismo aviso.
4. **Dado** una cuenta de pago, **Entonces** nunca ve el aviso por esta función.
5. **Dado** una cuenta que baja de pago a gratuito, **Entonces** pierde la búsqueda y los filtros, y **conserva y ve** toda su lista (nada se borra ni se oculta).
6. **Dado** el aviso, **Entonces** es un diálogo real como los demás de la app (foco en «Ver planes», Tab no sale, Escape y el fondo lo cierran y el foco vuelve a la entrada).

---

### Historia de Usuario 3 - Buscar sin perderse (Prioridad: P2)

Buscar es iterar: probar una palabra, abrir una consulta, volver y afinar. La app **recuerda la búsqueda y los filtros** mientras se navega (al volver desde el detalle de una consulta, con «atrás» del navegador, o al recargar), muestra **qué criterios están activos** y permite quitarlos de uno en uno o **limpiarlos todos**. Cuando nada coincide lo dice con claridad y ofrece limpiar.

**Por qué esta prioridad**: sin esto la función existe pero es incómoda; el valor central ya lo da la Historia 1.

**Prueba Independiente**: buscar una palabra, abrir una consulta del resultado y volver: la búsqueda y la lista de resultados siguen ahí; quitar un filtro activo amplía la lista; una palabra que no existe muestra «Ninguna consulta coincide» con «Limpiar filtros».

**Escenarios de Aceptación**:

1. **Dado** una búsqueda y filtros activos, **Cuando** abre el detalle de un resultado y vuelve (con la flecha de la app o con «atrás»), **Entonces** el Historial muestra la misma búsqueda y los mismos filtros y resultados.
2. **Dado** criterios activos, **Entonces** cada uno se ve como una pastilla que se puede quitar, y hay un «Limpiar todo»; quitar uno vuelve a calcular la lista con los demás.
3. **Dado** criterios que no coinciden con nada, **Entonces** la pantalla dice «Ninguna consulta coincide con tu búsqueda» (nunca una pantalla en blanco) y ofrece «Limpiar filtros».
4. **Dado** un hijo sin consultas, **Entonces** el Historial dice que todavía no hay consultas registradas (el mismo mensaje de la lista) y no ofrece filtros inútiles.
5. **Dado** una falla al cargar, **Entonces** se dice con «Reintentar», sin perder lo que se había escrito.
6. **Dado** que escribe en la búsqueda, **Entonces** la lista se actualiza sola poco después de dejar de teclear, sin pedir un botón, y sin parpadear una pantalla vacía entre un resultado y otro.

---

### Casos Límite

- **Una sola búsqueda por hijo.** El Historial es **de un hijo** (el de la lista desde donde se entró). Un Historial de todos los hijos de la cuenta queda fuera de esta versión.
- **Texto con acentos, mayúsculas o espacios de más**: se ignoran los acentos, las mayúsculas y los espacios al inicio y al final. Un texto vacío no filtra.
- **Rango de fechas invertido** (desde posterior a hasta): se avisa en el campo y no se pide nada al servidor; el servidor también lo rechaza con un error de validación si llega así.
- **Una fecha futura** en un filtro es válida (simplemente no coincide con nada).
- **Síntomas retirados del catálogo** (spec 012) que una consulta antigua conserva: la consulta sigue encontrándose por ellos, y el filtro ofrece los síntomas que el catálogo sirve hoy.
- **Doctores y medicamentos escritos distinto** («Dr. López» y «Dra. López»): se tratan como lo que el padre escribió; las listas de elección muestran lo registrado tal cual, sin unificar ni corregir.
- **Una consulta «solo registro»** no tiene tomas, pero sí medicamentos escritos: se encuentra por su medicamento como cualquier otra.
- **Muchas consultas**: el Historial responde con fluidez con cientos de consultas por hijo; la lista no se parte en páginas en esta versión.
- **Privacidad**: lo que se escribe en la búsqueda no se guarda en el servidor ni en ningún registro de errores (solo se usa para responder); el texto buscado nunca aparece en un registro de errores.
- **Permisos**: solo el dueño del hijo puede buscar en su historial (igual que su lista); un hijo ajeno responde como siempre (403/404).
- **Mocks**: no hay mock entregado para esta pantalla (ver Supuestos). Móvil y web son dos diseños separados (nunca se mezclan), y se prueban a 390 px y 1280 px.
- Pantallas de 390 px: sin desplazamiento horizontal.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: Una cuenta con plan de pago DEBE poder ver el Historial de un hijo con **todas** sus consultas, de la más reciente a la más antigua, y su conteo.
- **FR-002**: El Historial DEBE ofrecer búsqueda de texto que coincida con el doctor, el nombre de algún medicamento o las notas, **ignorando mayúsculas, acentos y espacios en los extremos**.
- **FR-003**: DEBE ofrecer filtros por **rango de fechas** de la consulta (desde y/o hasta, extremos incluidos), **doctor**, **síntomas** (todos los marcados), **medicamento** y **tipo** (todas / con tratamiento / solo registro).
- **FR-004**: Los criterios activos DEBEN combinarse **todos a la vez** (una consulta aparece solo si cumple todos).
- **FR-005**: Las listas de elección de **doctor** y de **medicamento** DEBEN ofrecer lo que ya está registrado para ese hijo, tal cual fue escrito, sin repetidos; la de **síntoma**, el catálogo vigente.
- **FR-006**: Los resultados DEBEN usar la misma tarjeta de consulta y el mismo detalle que la lista de siempre; el Historial es **solo lectura** (no crea, edita ni borra nada).
- **FR-007**: La pantalla NUNCA DEBE resumir, comparar, puntuar ni sugerir nada sobre la salud (Principio I): solo encuentra y muestra lo que el padre registró.
- **FR-008**: Una cuenta con plan **gratuito** DEBE seguir viendo **todas** sus consultas en la lista por fecha, sin cambios; esta función NO DEBE ocultar, limitar ni retrasar el acceso a nada ya registrado.
- **FR-009**: Para el plan gratuito, la entrada «Buscar en el historial» DEBE verse con la marca «Plan completo» y abrir el aviso del plan (neutral, que dice que lo registrado se mantiene, con «Entendido» y «Ver planes»).
- **FR-010**: El **servidor** DEBE decidir el acceso según el plan de la cuenta (nunca el cliente) y DEBE rechazar a una cuenta gratuita que pida búsqueda o filtros, sin devolver resultados filtrados, con un error que la app convierte en el aviso del plan.
- **FR-011**: El servidor DEBE validar los criterios (fechas bien formadas y en orden, tipo conocido, síntomas del catálogo, longitud razonable del texto) y responder con errores de validación claros; un criterio inválido nunca se ignora en silencio.
- **FR-012**: La búsqueda y los filtros DEBEN conservarse al ir al detalle de una consulta y volver, con «atrás» del navegador y al recargar la página.
- **FR-013**: DEBE verse qué criterios están activos, poder quitarlos de uno en uno y limpiarlos todos; sin coincidencias, un mensaje claro con «Limpiar filtros»; un hijo sin consultas, el mensaje de siempre; una falla de carga, un aviso con «Reintentar».
- **FR-014**: La lista DEBE actualizarse sola poco después de que el padre deja de escribir, y no DEBE mostrar una pantalla vacía intermedia entre un resultado y el siguiente.
- **FR-015**: El texto buscado NO DEBE guardarse ni aparecer en ningún registro de errores o de operación del servidor.
- **FR-016**: Solo el dueño del hijo DEBE poder buscar en su historial.
- **FR-017**: Móvil y web DEBEN tener cada uno su propio diseño (nunca mezclados), con los tokens del sistema visual, los estilos de campo compartidos y áreas táctiles de al menos 44 px; sin desplazamiento horizontal a 390 px.
- **FR-018**: El aviso del plan DEBE reutilizar el pop-up de la spec 030 con un motivo nuevo («Historial con búsqueda y filtros en el plan completo»).

### Entidades Clave

- **Consulta** (ya existe): doctor, fecha, notas, síntomas marcados, medicamentos (nombre), si es «solo registro». Es lo que se busca; no cambia.
- **Búsqueda del historial** (no se guarda): el texto, el rango de fechas, el doctor, los síntomas, el medicamento y el tipo que el padre tiene activos en ese momento. Vive en la pantalla y en su dirección; **no es un dato de la cuenta**.
- **Cuenta** (ya existe): su plan decide si hay acceso (spec 029).

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Una persona con plan de pago encuentra una consulta concreta de su hijo (por doctor, medicamento o palabra de las notas) en **menos de 30 segundos y 4 toques/acciones** desde la lista del hijo, sin ayuda.
- **SC-002**: Con **500 consultas** por hijo, los resultados se ven en **menos de 1 segundo** después de dejar de escribir o de cambiar un filtro.
- **SC-003**: El **100 %** de las consultas de una cuenta gratuita sigue visible en su lista tras esta función (ninguna se oculta, aunque la cuenta venga del plan de pago).
- **SC-004**: Una cuenta gratuita **nunca** recibe resultados filtrados, ni por la app ni por una llamada directa.
- **SC-005**: Para cada criterio (texto, fechas, doctor, síntoma, medicamento, tipo) **y sus combinaciones**, el conjunto devuelto contiene exactamente las consultas que cumplen todo: **cero** consultas de más y **cero** de menos en la batería de pruebas.
- **SC-006**: El **100 %** de las búsquedas por texto ignora acentos y mayúsculas (la misma consulta con «lopez», «LÓPEZ» y «López»).
- **SC-007**: Al volver del detalle de una consulta, el Historial vuelve **idéntico** (mismos criterios y resultados) en el **100 %** de los casos probados, en móvil y web.
- **SC-008**: Una cuenta de pago no nota ningún cambio en el resto de la app; una gratuita, tampoco, salvo la nueva entrada «Buscar en el historial».

## Supuestos

- **Es del hijo, no de la cuenta**: un Historial por hijo (el de la lista desde la que se entra). El de todos los hijos queda para después; con el tope de 10 hijos y el uso episódico, no hace falta en esta versión (Principio V).
- **Todas las consultas coincidentes se muestran** (sin páginas) en esta versión: las consultas de un hijo son pocas (decenas, cientos como mucho) y la lista actual ya las muestra todas. Si un hijo llegara a tener miles, se revisa.
- **Los síntomas se suman**: marcar «Fiebre» y «Tos» deja las consultas que tienen **las dos** (cada síntoma marcado acota más, igual que el resto de los criterios).
- **El doctor y el medicamento se eligen de una lista** de lo ya registrado (los nombres son texto libre y varían); para encontrar «algo parecido» sirve la búsqueda de texto, que coincide con **partes** de las palabras («amox» encuentra «Amoxicilina 250 mg»).
- **Coincidir con parte del texto**, sin corregir faltas ni buscar sinónimos ni «parecidos» (eso ya sería interpretar).
- **No hay mock entregado** para esta pantalla. Se diseña con el sistema visual existente (`design-tokens.md`, `formStyles.ts`, las tarjetas y los avisos de la app) en dos diseños separados, móvil y web, y se mostrará al usuario para ajustes antes de darla por cerrada; cualquier desviación futura de un mock se listará con su motivo.
- **Dónde se entra**: desde la lista de consultas del hijo (móvil y web) con una entrada «Buscar en el historial»; el Historial es una pantalla propia con su propia dirección web, para que «atrás», recargar y volver del detalle funcionen.
- **El plan se lee del servidor**: la app decide qué mostrar con el plan de la cuenta que ya recibe; el servidor, además, rechaza lo que el plan no incluye (la app nunca es la única barrera).
- **Un plan se da a mano con SQL** hasta que exista el cobro (spec 029); los probadores se prueban en DEV con `paid` y `free`.
- **Fuera de alcance** (siguen en `BACKLOG.md`): exportar el historial a PDF, liga de solo lectura para el pediatra, curvas OMS, vacunas y citas, compartir con la pareja, el cobro con Mercado Pago, la pantalla de planes y un Historial de todos los hijos.
