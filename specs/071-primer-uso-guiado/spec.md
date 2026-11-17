# Especificación de Funcionalidad: Primer uso guiado

**Rama de la Funcionalidad**: `feature/071-primer-uso-guiado`

**Creado**: 2026-11-16

**Estado**: Borrador

**Entrada**: Descripción del usuario: "071 Primer uso guiado. Tras el registro el inicio queda casi vacío y la persona no sabe qué hacer primero. Mock entregado por Claude Design y ajustado al inicio actual (estados A0 y A–G, teléfono 390 px y web 1280 px). «Antes de empezar» pasa a una ventana; tarjeta «Primeros pasos» en el inicio con tres pasos (primera consulta, instalar la app, activar los recordatorios); decisiones del dueño del 2026-11-16 sobre qué se guarda por cuenta y qué por dispositivo."

**Diseño de referencia**: `referencia/Primer uso guiado PediTrack.dc.html` (copia del canvas de Claude Design, versión 7 del 2026-11-16: estados A0 y A–G, cada uno en teléfono de 390 px y web de 1280 px, y las decisiones 1–11 al final). El inicio que rodea a la guía es el de hoy (spec 055 y lo que vino después); lo único nuevo es la ventana «Antes de empezar», la tarjeta «Primeros pasos», su aviso al cerrarla y la fila para reabrirla.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Saber qué hacer primero (Prioridad: P1)

Ana acaba de crear su cuenta con su hijo Mateo. Lee «Antes de empezar», toca «Entendido» y en el inicio ve una tarjeta «Primeros pasos» con tres pasos: registrar su primera consulta, instalar PediTrack en la pantalla de inicio y activar los recordatorios. Puede hacerlos en cualquier orden. Cada paso se marca con un check verde solo cuando de verdad pasó, y cuando los tres están hechos la guía se despide en una línea y no vuelve.

**Por qué esta prioridad**: hoy, tras el registro, el inicio queda casi vacío («Hoy no hay tomas ni actividades») y la persona no sabe que el valor de la app empieza al registrar una receta y recibir avisos. Es el problema que motiva la funcionalidad; sin esta historia no hay guía.

**Prueba Independiente**: con una cuenta nueva con un hijo y sin consultas, entrar al inicio, ver la guía con los tres pasos pendientes, registrar una consulta y comprobar que el paso 1 se marca hecho; repetir en el teléfono (390 px) y en la web (1280 px).

**Escenarios de Aceptación**:

1. **Dado** una cuenta recién creada con un hijo, sin consultas y con «Antes de empezar» ya confirmado, **Cuando** abre el inicio, **Entonces** ve entre el saludo y «Tu día» la tarjeta «Primeros pasos» con «Tres pasos, en el orden que quieras.», «Ahora no» y los tres pasos pendientes numerados (estado A).
2. **Dado** la guía con los tres pasos pendientes, **Cuando** la mira, **Entonces** solo el primer paso pendiente que no sea opcional ni esté bloqueado lleva el botón sólido; los demás botones van con contorno.
3. **Dado** una cuenta con un solo hijo, **Cuando** toca el botón del paso 1 («Tomar foto de la receta» en el teléfono, «Nueva consulta» en la web), **Entonces** llega a «Nueva consulta» de ese hijo.
4. **Dado** una cuenta con dos o más hijos, **Cuando** toca el botón del paso 1, **Entonces** primero elige para cuál de sus hijos y después llega a «Nueva consulta» de ese hijo.
5. **Dado** que la cuenta ya guardó una consulta (de cualquiera de sus hijos), **Cuando** vuelve al inicio, **Entonces** el paso 1 aparece hecho con el check verde, el texto «Registraste la consulta con …» y el enlace «Ver consulta», sin botón, y el botón sólido pasa al siguiente paso pendiente (estado B).
6. **Dado** que los tres pasos están hechos en ese dispositivo, **Cuando** abre el inicio, **Entonces** en lugar de la tarjeta ve una sola línea verde «Los tres pasos están hechos. Esta guía ya no se mostrará.», que se oculta a los 8 segundos o al salir del inicio, y la guía no vuelve a aparecer en esa cuenta (estado E).
7. **Dado** una cuenta con el plan gratuito y una consulta con tratamiento activo, **Cuando** ve la guía, **Entonces** el paso 1 está hecho y la guía no menciona planes, límites ni precios en ningún texto (estado G).

---

### Historia de Usuario 2 - Instalar la app y activar los avisos en cada dispositivo (Prioridad: P1)

En su iPhone, Ana abre PediTrack en Safari. La guía le enseña con un dibujo cómo agregarla a la pantalla de inicio y le explica, sin alarmar, que los avisos solo funcionan con la app instalada. En Android ve un botón «Instalar». En la computadora, instalar es opcional y solo aparece si su navegador lo ofrece. Después activa los recordatorios; si antes rechazó el permiso, la guía le explica cómo cambiarlo en los ajustes.

**Por qué esta prioridad**: los recordatorios (spec 011) son el uso diario de la app y en iPhone no funcionan sin instalarla. Es la parte de la guía que más evita que alguien se quede sin avisos sin saber por qué.

**Prueba Independiente**: en cada tipo de dispositivo (Android, iPhone en Safari sin instalar, iPhone instalado, computadora con y sin la opción de instalar), abrir el inicio y comprobar el texto, el botón y el estado de los pasos 2 y 3; conceder y rechazar el permiso de avisos y comprobar el paso 3.

**Escenarios de Aceptación**:

1. **Dado** un teléfono Android con la app sin instalar y el navegador ofreciendo instalarla, **Cuando** ve el paso 2 «Instala PediTrack en tu pantalla de inicio», **Entonces** tiene el botón «Instalar» que abre la instalación del navegador.
2. **Dado** un iPhone con PediTrack abierta en Safari sin instalar, **Cuando** ve la guía, **Entonces** el paso 2 muestra el dibujo de la barra de Safari y tres pasos («Toca Compartir…», «Desliza y toca «Agregar a pantalla de inicio».», «Toca «Agregar»…») con la nota «Cuando abras PediTrack desde el ícono nuevo, este paso se marcará solo.», y el paso 3 aparece bloqueado con un candado, el texto que explica que en iPhone los avisos solo funcionan con PediTrack en la pantalla de inicio y el botón «Ir al paso 2» (estado C).
3. **Dado** un iPhone que abre PediTrack desde otro navegador que no es Safari, **Cuando** ve el paso 2, **Entonces** se le pide abrir PediTrack en Safari para poder instalarla.
4. **Dado** que la persona abre PediTrack ya instalada (desde el ícono de la pantalla de inicio o en su propia ventana en la computadora), **Cuando** ve la guía, **Entonces** el paso 2 aparece hecho («PediTrack está en tu pantalla de inicio.» o «PediTrack está instalada en esta computadora.»).
5. **Dado** una computadora cuyo navegador ofrece instalar la app, **Cuando** ve la guía, **Entonces** el paso 2 se titula «Instala PediTrack en tu computadora», lleva la etiqueta «Opcional» y su botón «Instalar» va siempre con contorno.
6. **Dado** una computadora cuyo navegador no ofrece instalar la app, **Cuando** ve la guía, **Entonces** el paso 2 no aparece, el subtítulo dice «Dos pasos, en el orden que quieras.» y los pasos se numeran 1 y 2; en la computadora el paso de los recordatorios nunca se bloquea.
7. **Dado** el paso 3 pendiente sin bloqueo, **Cuando** toca «Activar recordatorios», **Entonces** se activa el mismo flujo de recordatorios que ya existe (spec 011, incluida la elección de aviso con detalle o genérico la primera vez) y, al quedar activos en ese dispositivo, el paso 3 aparece hecho («Los avisos están activos en este dispositivo.» / «… en este navegador.»).
8. **Dado** que el permiso de avisos está rechazado en ese navegador, **Cuando** ve el paso 3, **Entonces** el texto dice que los avisos están desactivados en este navegador, muestra tres pasos numerados para cambiar el permiso en los ajustes del sitio (los del teléfono o los de la computadora), el botón «Ya los activé» y la nota «Si prefieres no recibirlos, la app funciona igual.», sin rojo ni ámbar (estado D).
9. **Dado** el paso 3 con el permiso rechazado, **Cuando** la persona cambia el permiso en los ajustes y toca «Ya los activé», **Entonces** la app vuelve a comprobar el permiso: si ya está concedido sigue el flujo de activación; si no, el paso queda igual, sin volver a pedir el permiso.

---

### Historia de Usuario 3 - «Antes de empezar» como ventana (Prioridad: P2)

Al entrar por primera vez, en lugar de una tarjeta larga que empuja todo el inicio hacia abajo, Ana ve «Antes de empezar» en una ventana encima del inicio: una hoja que sube desde abajo en el teléfono y un diálogo centrado en la computadora. Lee el texto, que se desplaza dentro de la ventana, y toca «Entendido»; la ventana se cierra y ve el inicio con la guía.

**Por qué esta prioridad**: hoy el aviso son ocho párrafos encima del inicio; con la guía, la persona vería primero un muro de texto y la guía quedaría abajo. Es necesaria para que la guía se vea, pero el aviso ya funciona, por eso va después de la guía.

**Prueba Independiente**: con una cuenta que no ha confirmado la versión vigente del aviso, abrir el inicio en el teléfono y en la web, comprobar la ventana, tocar «Entendido» y comprobar que la confirmación se guarda (no vuelve a salir al recargar) y que el inicio ya no muestra el aviso como tarjeta.

**Escenarios de Aceptación**:

1. **Dado** una cuenta que no ha confirmado la versión vigente del aviso, **Cuando** abre el inicio en el teléfono, **Entonces** ve «Antes de empezar» en una hoja que sube desde abajo sobre el inicio oscurecido, con el texto completo del aviso desplazable dentro y «Entendido» fijo abajo como único botón, sólido (estado A0).
2. **Dado** lo mismo en la web, **Cuando** abre el inicio, **Entonces** ve el aviso en un diálogo centrado de 600 px de ancho sobre el inicio oscurecido, con el texto desplazable y «Entendido» fijo abajo a la derecha.
3. **Dado** la ventana abierta, **Cuando** toca fuera de ella o presiona Escape, **Entonces** la ventana no se cierra: solo «Entendido» la cierra.
4. **Dado** la ventana abierta, **Cuando** toca «Entendido» y la confirmación se guarda, **Entonces** la ventana se cierra, el inicio muestra la guía (si le corresponde) y la ventana no vuelve a aparecer mientras no cambie la versión del aviso.
5. **Dado** la ventana abierta, **Cuando** toca «Entendido» y guardar falla, **Entonces** la ventana sigue abierta y muestra dentro el mensaje de error de hoy («No pudimos guardar tu confirmación. Revisa tu conexión e inténtalo de nuevo.»), y la persona puede volver a intentarlo.
6. **Dado** una cuenta que ya había confirmado una versión anterior del aviso, **Cuando** se publica una versión nueva del texto, **Entonces** la ventana vuelve a salir una vez, como hoy sale la tarjeta.
7. **Dado** la ventana abierta, **Cuando** se navega con el teclado o un lector de pantalla, **Entonces** el foco empieza en la ventana, no sale de ella mientras esté abierta y la ventana se anuncia con su título.

---

### Historia de Usuario 4 - Cerrar la guía y volver a abrirla (Prioridad: P2)

Ana no quiere la guía ahora. Toca «Ahora no»: la guía desaparece del inicio, un aviso breve le dice dónde volver a abrirla y al final del inicio aparece la fila «Primeros pasos · Ver guía». Más tarde la toca y la guía vuelve, con lo que ya hizo marcado.

**Por qué esta prioridad**: la guía nunca debe estorbar (no bloquea el inicio), pero tampoco perderse para siempre por un toque. Es complementaria a la guía.

**Prueba Independiente**: con la guía visible, tocar «Ahora no», comprobar el aviso, la fila nueva y que la guía no vuelve al recargar ni en otro dispositivo de la misma cuenta; tocar la fila y comprobar que la guía vuelve.

**Escenarios de Aceptación**:

1. **Dado** la guía visible, **Cuando** toca «Ahora no», **Entonces** la tarjeta desaparece, aparece un aviso breve «Cerraste la guía. Puedes volver a abrirla en Primeros pasos, al final del inicio.» y la lista de abajo del inicio muestra como primera fila «Primeros pasos · Ver guía»; en la web, la franja de accesos pasa de 5 a 6 (estado F).
2. **Dado** la guía cerrada con «Ahora no», **Cuando** recarga el inicio o entra desde otro dispositivo con la misma cuenta, **Entonces** la guía sigue cerrada y la fila «Primeros pasos · Ver guía» sigue en la lista.
3. **Dado** la guía cerrada, **Cuando** toca «Primeros pasos · Ver guía», **Entonces** la guía vuelve a mostrarse en el inicio con el estado real de cada paso y la fila desaparece de la lista.
4. **Dado** que los tres pasos están hechos, **Cuando** la guía estaba cerrada, **Entonces** la fila «Primeros pasos» ya no aparece en la lista.

---

### Casos Límite

- **Dispositivo nuevo**: una cuenta que ya hizo los tres pasos en su teléfono entra desde una computadora o un teléfono nuevo: la guía vuelve a mostrarse en ese dispositivo con el paso 1 ya hecho, mientras le falte el paso 2 o el 3 **en ese dispositivo**, salvo que la cuenta la haya cerrado con «Ahora no». Cuando los pasos de ese dispositivo quedan hechos, se despide igual que en el estado E.
- **«Todo hecho» y un dispositivo nuevo**: la despedida «esta guía ya no se mostrará» se refiere al dispositivo donde se completó; en un dispositivo nuevo la guía vuelve con el paso 1 hecho (decisión del dueño del 2026-11-16). En un dispositivo donde ya se completaron los tres pasos, no vuelve aunque después se desactiven los recordatorios.
- **Recordatorios activados y luego apagados**: si la persona apaga los recordatorios en un dispositivo donde la guía ya se despidió, la guía no vuelve; si todavía no se había despedido, el paso 3 vuelve a pendiente.
- **Cuenta sin hijos**: si la cuenta no tiene ningún hijo (el inicio muestra «Aún no registras a tus hijos» con «Agregar hijo»), la guía no se muestra: el inicio ya tiene un único paso claro. Aparece en cuanto haya un hijo.
- **Consulta borrada o solo registro**: una consulta «solo registro» (spec 024) cuenta como primera consulta. Las consultas no se borran (decisión de la spec 058/051), así que el paso 1 no vuelve a pendiente.
- **Consultas propias**: una consulta propia del titular (spec 058) también cuenta como primera consulta.
- **Persona invitada a una familia**: un Tutor o un Cuidador invitado que entra a su inicio con hijos compartidos (spec 032) no ve la guía; un Tutor o Cuidador con hijos propios en su cuenta sí. Ver Supuestos.
- **Cuenta en pausa por eliminación** (spec 070): la guía no se muestra; la pantalla de la cuenta en pausa sustituye al inicio.
- **Sin conexión** (spec 067): el inicio guardado se muestra como hoy; la guía se muestra con el último estado conocido y sus botones que necesitan conexión dicen que la necesitan, igual que el resto de la app.
- **Navegador sin recordatorios** (no soporta avisos o no están disponibles en el servidor): el paso 3 no se muestra en ese dispositivo y la guía cuenta solo los pasos que quedan; si no queda ninguno pendiente en el dispositivo, se comporta como «todo hecho».
- **Ventana del aviso y guía a la vez**: mientras la ventana «Antes de empezar» está abierta, la guía queda detrás y no se puede usar hasta tocar «Entendido».
- **Dos dispositivos al mismo tiempo**: si en uno se toca «Ahora no» mientras el otro tiene la guía abierta, el otro la oculta la siguiente vez que pida los datos de la cuenta; nunca se pierde lo que la persona esté capturando.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

**Ventana «Antes de empezar»**

- **FR-001**: El aviso «Antes de empezar» (specs 009 y 010) DEBE mostrarse como una ventana encima del inicio y dejar de mostrarse como tarjeta dentro del inicio, con su texto vigente sin cambios.
- **FR-002**: En el diseño de teléfono la ventana DEBE ser una hoja que sube desde abajo; en el diseño web, un diálogo centrado de 600 px de ancho; en ambos, con el fondo oscurecido, el texto desplazable dentro y «Entendido» fijo abajo como único botón, sólido.
- **FR-003**: La ventana DEBE cerrarse solo con «Entendido»; tocar fuera o presionar Escape NO DEBE cerrarla.
- **FR-004**: «Entendido» DEBE guardar la confirmación de la versión vigente del aviso exactamente como hoy (spec 010: qué cuenta confirmó qué versión y cuándo); si guardar falla, la ventana DEBE seguir abierta y mostrar dentro el mensaje de error actual.
- **FR-005**: La ventana DEBE aparecer cuando la cuenta no ha confirmado la versión vigente del aviso (cuentas nuevas y cuando sube la versión), igual que hoy aparece la tarjeta.
- **FR-006**: La ventana DEBE ser accesible: se anuncia con su título, el foco empieza en ella y no sale de ella mientras esté abierta.

**Guía «Primeros pasos»**

- **FR-007**: El inicio DEBE mostrar la tarjeta «Primeros pasos» entre el saludo y «Tu día», a la persona que le corresponde (FR-024), mientras no esté cerrada con «Ahora no» ni completa en ese dispositivo, y nunca mientras la ventana «Antes de empezar» esté abierta.
- **FR-008**: La tarjeta DEBE tener el título «Primeros pasos», el subtítulo «Tres pasos, en el orden que quieras.» (o «Dos pasos, …» cuando el paso 2 no aplica), el botón «Ahora no» y los pasos en este orden: (1) «Registra tu primera consulta», (2) instalar PediTrack, (3) «Activa los recordatorios», numerados según los pasos que se muestren.
- **FR-009**: Los pasos DEBEN poder hacerse en cualquier orden; la guía no debe impedir usar el resto del inicio ni ninguna otra pantalla.
- **FR-010**: Un paso DEBE mostrarse hecho (check verde, sin botón) solo cuando de verdad pasó: paso 1, cuando la cuenta tiene al menos una consulta guardada (de un hijo o propia, con tratamiento o «solo registro»); paso 2, cuando la app corre instalada en ese dispositivo; paso 3, cuando el permiso de avisos está concedido y los recordatorios están activos en ese dispositivo.
- **FR-011**: De los pasos pendientes con botón, solo el primero que no sea opcional ni esté bloqueado DEBE llevar el botón sólido; los demás, con contorno. Si no queda ninguno así, la guía no lleva botón sólido.
- **FR-012**: El paso 1 pendiente DEBE llevar el botón «Tomar foto de la receta» en el teléfono y «Nueva consulta» en la web; con un hijo, lleva directo a «Nueva consulta» de ese hijo; con dos o más, la persona elige primero el hijo. Hecho, DEBE decir «Registraste la consulta con …» (el doctor de la primera consulta) y llevar el enlace «Ver consulta».
- **FR-013**: El paso 2 DEBE adaptarse al dispositivo: en Android, botón «Instalar» que abre la instalación del navegador; en iPhone con Safari, las instrucciones con el dibujo de la barra de Safari y sus tres pasos, sin botón; en iPhone con otro navegador, la indicación de abrir PediTrack en Safari; en la computadora, la etiqueta «Opcional», el botón «Instalar» siempre con contorno y solo si el navegador ofrece instalar; si no lo ofrece, el paso no aparece.
- **FR-014**: En un iPhone donde la app no está instalada, el paso 3 DEBE mostrarse bloqueado (candado, texto que explica por qué y botón «Ir al paso 2» que lleva la vista al paso 2); en la computadora y en Android nunca se bloquea.
- **FR-015**: El paso 3 pendiente DEBE llevar «Activar recordatorios» con la nota «Tu navegador te pedirá permiso.» y usar el mismo flujo de activación de recordatorios que ya existe (spec 011), sin un segundo mecanismo.
- **FR-016**: Con el permiso de avisos rechazado, el paso 3 DEBE mostrar los tres pasos para cambiarlo en los ajustes del sitio (versión teléfono o computadora), el botón «Ya los activé», que vuelve a comprobar el permiso sin volver a pedirlo, y la nota «Si prefieres no recibirlos, la app funciona igual.».
- **FR-017**: Si el navegador no puede recibir recordatorios o el servicio de recordatorios no está disponible, el paso 3 NO DEBE mostrarse en ese dispositivo.
- **FR-018**: Cuando todos los pasos que se muestran en ese dispositivo están hechos, la guía DEBE reemplazarse por la línea verde «Los tres pasos están hechos. Esta guía ya no se mostrará.» (o «Los dos pasos …»), que se oculta a los 8 segundos o al salir del inicio, y DEBE quedar registrado que la guía está completa en ese dispositivo para no volver a mostrarse ahí.

**Cerrar y reabrir**

- **FR-019**: «Ahora no» DEBE cerrar la guía para la cuenta (en todos sus dispositivos), mostrar el aviso breve «Cerraste la guía. Puedes volver a abrirla en Primeros pasos, al final del inicio.» y agregar como primera fila de la lista de abajo del inicio «Primeros pasos · Ver guía» (en la web, primer acceso de una franja de 6).
- **FR-020**: Tocar «Primeros pasos · Ver guía» DEBE volver a mostrar la guía para la cuenta, con el estado real de cada paso, y quitar la fila.
- **FR-021**: La fila «Primeros pasos» NO DEBE aparecer cuando la guía está visible ni cuando todos sus pasos en ese dispositivo están hechos.

**Qué se guarda y dónde**

- **FR-022**: Por **cuenta** DEBEN guardarse: si la guía está cerrada con «Ahora no» y la condición del paso 1 (que se deriva de las consultas de la cuenta, sin un dato nuevo). Por **dispositivo** DEBEN guardarse: si la guía ya se completó en ese dispositivo. Los pasos 2 y 3 se leen siempre del propio dispositivo.
- **FR-023**: En un dispositivo nuevo, la guía DEBE volver a mostrarse con el paso 1 ya hecho mientras le falte el paso 2 o el 3 en ese dispositivo, salvo que la cuenta la haya cerrado con «Ahora no».

**A quién y qué no hace**

- **FR-024**: La guía DEBE mostrarse solo a una cuenta con al menos un hijo propio (la dueña de sus hijos); NO DEBE mostrarse a una cuenta sin hijos, a una persona que solo ve hijos compartidos de otra familia, al teléfono del hijo (spec 047) ni a una cuenta en pausa por eliminación (spec 070).
- **FR-025**: La guía NO DEBE mencionar planes, límites, precios ni el plan de pago en ningún estado, y su comportamiento NO DEBE depender del plan de la cuenta.
- **FR-026**: La guía NO DEBE dar consejos de salud, recomendaciones ni interpretar datos (Principio I); sus textos son neutrales, sin rojo ni ámbar de alarma, sin urgencia ni felicitaciones.
- **FR-027**: El resto del inicio (spec 055 y lo que vino después: «Tu día», la tarjeta de cada hijo, «+ Agregar hijo», «Checa tus medicamentos», los perfiles compartidos y la lista de abajo) NO DEBE cambiar, salvo la fila «Primeros pasos» de FR-019.
- **FR-028**: Cada pantalla y estado DEBE existir en dos diseños separados, teléfono (390 px) y web (1280 px), como en el diseño de referencia, eligiendo uno solo por tamaño de pantalla, sin mezclar ambos.
- **FR-029**: Todo control de la guía y de la ventana DEBE medir al menos 44 px de alto, el texto al menos 13 px con contraste de 4.5:1, y ningún estado (hecho, bloqueado, opcional) DEBE depender solo del color: lleva check, candado, línea punteada o texto.

### Entidades Clave

- **Estado de la guía de la cuenta**: si la persona cerró la guía con «Ahora no» (sí/no) y cuándo. Es de la cuenta y se ve igual en todos sus dispositivos. No guarda datos de salud.
- **Estado de la guía en el dispositivo**: si la guía ya se completó en ese dispositivo. Vive solo en el dispositivo; se pierde si se borran los datos del navegador (entonces la guía puede volver con los pasos hechos marcados).
- **Confirmación del aviso** (existente, spec 010): qué cuenta confirmó qué versión de «Antes de empezar» y cuándo. Sin cambios.
- **Primera consulta** (derivada): la consulta más antigua de la cuenta, de la que se muestra el doctor y el enlace «Ver consulta». No es un dato nuevo.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Una persona con una cuenta nueva llega del inicio a «Nueva consulta» de su hijo en un toque (un hijo) o dos (varios hijos).
- **SC-002**: En los ocho estados del diseño (A0 y A–G), la app coincide con el diseño de referencia sección por sección a 390 px y a 1280 px, y cada diferencia que quede está listada con su motivo.
- **SC-003**: En un iPhone sin instalar, el 100 % de las veces la guía explica por qué no se pueden activar los avisos y cómo instalar, en lugar de un botón que no funciona.
- **SC-004**: Ningún texto de la guía ni de la ventana menciona planes, precios, diagnósticos o recomendaciones de salud (comprobado por una prueba de redacción).
- **SC-005**: Cerrar la guía con «Ahora no» la oculta en todos los dispositivos de la cuenta y reabrirla toma un toque desde el inicio.
- **SC-006**: Tras «Entendido», la ventana del aviso no vuelve a aparecer en ninguna sesión de la cuenta mientras no cambie la versión del texto, y la confirmación queda registrada igual que hoy.
- **SC-007**: El inicio de una cuenta que no ve la guía (invitada, sin hijos, en pausa) se ve exactamente igual que antes de esta funcionalidad.

## Supuestos

- **Quién ve la guía**: solo la cuenta dueña de al menos un hijo. Una persona invitada a una familia que solo ve hijos compartidos no la ve, porque registrar una consulta y el sentido de los pasos son de la dueña; si la persona invitada tiene hijos propios, la ve. A confirmar en el plan (la descripción lo dejó abierto).
- **Cuenta sin hijos**: la guía espera a que haya un hijo; el inicio ya muestra el único paso («Agregar hijo»).
- **Persistencia por cuenta**: «Ahora no» se guarda en el servidor con la cuenta (un dato nuevo, sin datos de salud); la condición del paso 1 se deriva de las consultas que la cuenta ya tiene.
- **Persistencia por dispositivo**: «completa en este dispositivo» se guarda en el propio dispositivo; si se borran los datos del navegador, la guía puede volver a mostrarse con los pasos hechos marcados, lo cual es aceptable.
- **Recordatorios**: «activos en este dispositivo» es el mismo estado que hoy muestra la fila «Recordatorios» de la lista de abajo del inicio (spec 011 y bugfix 061).
- **Instalación**: «la app corre instalada» es lo que el navegador informa al abrir la app desde su ícono o en su propia ventana; el botón «Instalar» depende de que el navegador lo ofrezca (Android y algunos navegadores de computadora); en iPhone no existe y se usan las instrucciones.
- **Textos**: los textos son los del diseño de referencia; la redacción final puede ajustarse en el plan si algún texto no cabe, sin cambiar su sentido.
- **Aviso «Antes de empezar»**: cambia solo su forma (ventana), no su texto ni su versión; no hace falta subir la versión del aviso (nadie lo verá de nuevo por este cambio).
- **Sin conexión**: la guía se comporta como el resto del inicio sin conexión (spec 067); cerrar o reabrir la guía sin conexión no se permite y lo dice.
- **Fuera de alcance**: un recorrido por pantallas o globos sobre la interfaz, pasos adicionales (familia, suplementos, cartilla), la guía en el teléfono del hijo, métricas de cuántas personas completan la guía (queda en `BACKLOG.md`, «Métricas de producto propias») y cambiar el texto del aviso.
- **Dependencias**: specs 009/010 (aviso y su confirmación), 011 y bugfix 061 (recordatorios), 024 y 058 (consultas «solo registro» y propias), 032 y 047 (familia y teléfono del hijo), 055 (inicio), 067 (sin conexión) y 070 (cuenta en pausa).
