# Especificación de Funcionalidad: Ver la app sin conexión (etapa 1, solo lectura)

**Rama**: `feature/067-ver-app-sin-conexion`
**Creada**: 2026-11-11
**Estado**: Implementada (E2E en verde en local el 2026-11-11; falta la prueba en un iPhone real)
**Entrada**: idea «Ver la app sin conexión» de la revisión de la app (`BACKLOG.md`, 2026-11-10), elegida por el dueño el 2026-11-11. Hoy la app instalada no abre sin señal: solo atiende los avisos. Esta etapa hace que abra y muestre los últimos datos que ese teléfono ya vio, sin poder cambiar nada; marcar sin conexión y mandarlo después es la etapa 2 (fuera de esta spec).

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - La app abre sin señal y muestra lo último que vi (Prioridad: P1)

Ana está en la sala de espera del pediatra, en un sótano sin señal. El doctor le pregunta qué medicamento le está dando a Mateo y a qué hora fue la última toma. Ana abre PediTrack desde la pantalla de inicio de su teléfono: la app abre, ve a Mateo, su «Hoy» con las tomas tal como estaban la última vez que tuvo conexión y, arriba, «Sin conexión · datos de las 08:15». Entra a la consulta y ve los medicamentos, las tomas marcadas con quién las marcó y el calendario.

**Por qué esta prioridad**: es todo el valor de la funcionalidad. Hoy, sin señal, la app instalada muestra una pantalla de error del navegador justo cuando más se necesita la información (consultorio, hospital, viaje).

**Prueba Independiente**: con la app ya usada una vez con conexión, cortar la red y abrirla de nuevo: abre, muestra el inicio, el hijo y la consulta con los datos de la última vez y el aviso con la hora de los datos.

**Escenarios de Aceptación**:

1. **Dado** una persona con sesión iniciada que ya abrió la app con conexión en ese dispositivo, **Cuando** la abre sin conexión, **Entonces** la app abre (no la pantalla de error del navegador) y muestra el inicio con los datos que ese dispositivo vio la última vez.
2. **Dado** la app abierta sin conexión, **Cuando** la persona entra a una pantalla que ya había visto con conexión (detalle del hijo, detalle de una consulta, un suplemento o actividad, su perfil, el botiquín, la cartilla), **Entonces** la ve con sus últimos datos.
3. **Dado** la app sin conexión, **Cuando** muestra datos guardados, **Entonces** un aviso neutral y visible dice que no hay conexión y la hora de esos datos («Sin conexión · datos de las 08:15»); si los datos no son de hoy, dice también el día («datos del 10 nov, 21:40»).
4. **Dado** la app sin conexión, **Cuando** la persona entra a una pantalla que ese dispositivo nunca vio, **Entonces** ve un mensaje neutral de que esa pantalla necesita conexión, y puede volver.
5. **Dado** la app sin conexión, **Cuando** vuelve la conexión, **Entonces** la app pide los datos de nuevo sin que la persona haga nada, el aviso desaparece y la pantalla muestra lo actual sin perder dónde estaba.
6. **Dado** la app abierta en una computadora o en un navegador del teléfono sin instalar, **Cuando** no hay conexión, **Entonces** no hay datos guardados que mostrar: se comporta como hoy y nunca guardó datos de salud en ese dispositivo (FR-012).

---

### Historia de Usuario 2 - Sin conexión nada parece guardarse (Prioridad: P1)

Luis, sin señal, abre la consulta de su hija y quiere marcar la toma de las 14:00. El botón no se ve como si fuera a funcionar: al tocarlo, la app le dice que necesita conexión para marcar. Nada aparece marcado ni lo engaña.

**Por qué esta prioridad**: son datos de salud compartidos por la familia. Una toma que parece marcada sin estar guardada puede terminar en una dosis doble o en una que nadie dio. Mostrar datos viejos es útil solo si nadie cree que puede cambiarlos.

**Prueba Independiente**: sin conexión, tocar «Marcar», «✓ Realizado», «Nueva consulta», «Editar» y «Guardar» de un formulario, y comprobar que ninguna acción se intenta, que cada una dice que necesita conexión y que ningún dato cambia en pantalla.

**Escenarios de Aceptación**:

1. **Dado** la app sin conexión, **Cuando** la persona toca «Marcar», quitar una marca o «✓ Realizado», **Entonces** la toma no cambia y aparece un aviso neutral de que marcar necesita conexión.
2. **Dado** la app sin conexión, **Cuando** la persona intenta crear, editar, finalizar, recorrer, borrar o invitar, **Entonces** la acción no se manda y la app dice que necesita conexión, sin perder lo que haya escrito en un formulario.
3. **Dado** la app sin conexión, **Cuando** muestra las tomas, **Entonces** cada toma tiene el estado que el servidor le dio la última vez (por marcar, sin registrar, marcada, cancelada…): el teléfono no recalcula estados con su reloj.
4. **Dado** datos guardados que no son de hoy, **Cuando** se muestran, **Entonces** «Hoy» no presenta esas tomas como las de hoy: el aviso dice de cuándo son.

---

### Historia de Usuario 3 - Lo guardado en el dispositivo es solo mío y se borra (Prioridad: P1)

Ana cierra sesión en su teléfono o abre la app en la computadora del trabajo. Lo que la app guardó para verse sin conexión es solo lo que su sesión ya vio, nunca fotos, y desaparece al cerrar sesión. Si otra persona entra con su cuenta en ese teléfono, no ve nada de Ana, y en la computadora del trabajo nunca se guardó nada.

**Por qué esta prioridad**: son datos de salud de menores (Principio II). Guardarlos en el dispositivo es una decisión de privacidad, no solo técnica: tiene que ser lo mínimo y tiene que poder borrarse.

**Prueba Independiente**: con datos guardados, cerrar sesión y abrir la app sin conexión: no hay datos de la cuenta anterior. Iniciar con otra cuenta: no ve nada de la anterior. Revisar lo guardado: no contiene fotos.

**Escenarios de Aceptación**:

1. **Dado** datos guardados para verse sin conexión, **Cuando** la persona cierra sesión, **Entonces** se borran todos de ese dispositivo.
2. **Dado** un dispositivo con datos de una cuenta, **Cuando** entra otra cuenta, **Entonces** no ve ni conserva nada de la anterior.
3. **Dado** cualquier pantalla con fotos (receta, cartilla, botiquín), **Cuando** la app guarda datos para verse sin conexión, **Entonces** las fotos no se guardan; sin conexión su lugar dice que la foto necesita conexión.
4. **Dado** datos guardados, **Cuando** se revisa qué contienen, **Entonces** son solo respuestas que esa sesión ya recibió del servidor: la app no descarga de antemano consultas, hijos ni pantallas que la persona no abrió.
5. **Dado** datos guardados que llevan más tiempo que el límite de retención sin que el dispositivo se conecte, **Cuando** la app abre, **Entonces** esos datos ya no se muestran y se borran.
6. **Dado** una persona que pierde el acceso a un hijo o a una familia, **Cuando** el dispositivo se conecta y el servidor ya no le da esos datos, **Entonces** los datos guardados de ese hijo o familia se borran del dispositivo.

---

### Historia de Usuario 4 - El teléfono del hijo también abre sin señal (Prioridad: P2)

Mateo, de 11 años, tiene la app en su teléfono con su acceso (spec 047). En el autobús, sin datos, abre «Hoy» y ve sus tomas y actividades de la última vez, con el mismo aviso de que no hay conexión. No puede marcar hasta tener señal.

**Por qué esta prioridad**: es la misma necesidad en un público más chico; depende de lo construido en la Historia 1.

**Prueba Independiente**: con el teléfono del hijo ya usado con conexión, cortar la red y abrir `/hijo/hoy`: muestra sus tomas de la última vez y el aviso; marcar dice que necesita conexión.

**Escenarios de Aceptación**:

1. **Dado** un teléfono del hijo que ya abrió «Hoy» con conexión, **Cuando** lo abre sin conexión, **Entonces** ve sus tomas y actividades de la última vez y el aviso con la hora.
2. **Dado** el teléfono del hijo sin conexión, **Cuando** toca para marcar, **Entonces** la app dice que necesita conexión y no cambia nada.
3. **Dado** un teléfono del hijo al que el Tutor le quitó el acceso, **Cuando** se conecta y el servidor rechaza su credencial, **Entonces** se borran sus datos guardados, como hoy se borra la credencial.

---

### Historia de Usuario 5 - Las actualizaciones y los avisos siguen funcionando (Prioridad: P2)

Ana actualiza la app con «Hay una versión nueva · Actualizar» y sigue recibiendo los recordatorios de las tomas como siempre. Que la app abra sin conexión no cambia nada de eso.

**Por qué esta prioridad**: no agrega valor nuevo pero protege dos funciones que ya existen y que fallaron antes (bugfix 061): un cambio en cómo arranca la app puede romperlas.

**Prueba Independiente**: publicar una versión nueva y comprobar que el aviso de versión aparece y que al tocarlo se carga la nueva; mandar un recordatorio y comprobar que llega y que «Tomada» funciona.

**Escenarios de Aceptación**:

1. **Dado** una versión nueva publicada, **Cuando** la app tiene conexión, **Entonces** el aviso «Hay una versión nueva · Actualizar» aparece como hoy, y al tocarlo se carga la versión nueva (no una guardada).
2. **Dado** la app sin conexión, **Cuando** no puede saber si hay versión nueva, **Entonces** no muestra el aviso de versión ni un error por no poder revisarla.
3. **Dado** los recordatorios activos, **Cuando** llega un aviso de una toma, **Entonces** se muestra y su acción «Tomada» funciona como hoy.
4. **Dado** un formulario con datos y una versión nueva, **Cuando** la persona toca «Actualizar», **Entonces** se le pregunta antes de perder lo capturado, como hoy (spec 017 y 066).

### Casos Límite

- **Primera vez sin conexión**: si el dispositivo nunca abrió la app con conexión (o se borró todo al cerrar sesión), sin conexión la app muestra un mensaje neutral de que necesita conexión para empezar, no una pantalla rota.
- **Sesión que necesita confirmarse**: sin conexión no se puede confirmar la sesión con el proveedor de inicio de sesión. Si el dispositivo tenía una sesión abierta, la app muestra los datos guardados de esa cuenta; nunca pide iniciar sesión sin conexión ni muestra datos sin una sesión previa en ese dispositivo.
- **Sesión cerrada en otro lado o vencida**: al volver la conexión, si la sesión ya no vale, la app borra los datos guardados y pide iniciar sesión, como hoy.
- **Conexión intermitente**: si una petición falla por falta de señal mientras la app estaba en línea, la pantalla conserva los datos que ya mostraba y aparece el aviso; no se vacía ni muestra el error de carga.
- **Datos de otro día**: una toma «por marcar» de ayer no se presenta como de hoy; el aviso con el día lo deja claro y el conteo de «Hoy» no se recalcula.
- **Almacenamiento lleno, denegado o en modo privado**: si el dispositivo no deja guardar, la app funciona con conexión exactamente como hoy y, sin conexión, muestra el mensaje de que necesita conexión.
- **Una marca en camino al perder la señal** (spec 066): la marca vuelve atrás con su aviso, como hoy; esta spec no la guarda para mandarla después.
- **Computadora o navegador sin instalar**: no guardan datos (FR-012); con conexión funcionan exactamente como hoy. Si la persona instala la app en el teléfono después, empieza a guardar desde ese momento.
- **App instalada en el teléfono y girada a lo ancho**: si el ancho llega al diseño web, se usa ese diseño y todo lo de esta spec aplica igual, porque lo que cuenta es el dispositivo, no el ancho.
- **Siete días sin conexión**: al abrir la app el octavo día sin haber recibido datos nuevos, lo guardado ya no se muestra, se borra y la app dice que necesita conexión.
- **Jalar hacia abajo para actualizar sin conexión** (spec 017): no vacía la pantalla; mantiene los datos y el aviso.
- **Búsqueda del historial, exportar PDF, curvas de crecimiento**: necesitan al servidor en el momento; sin conexión dicen que necesitan conexión.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

**Abrir sin conexión**

- **FR-001**: La app instalada DEBE abrir sin conexión mostrando su propia interfaz, nunca la pantalla de error del navegador, siempre que ese dispositivo la haya abierto antes con conexión.
- **FR-002**: Sin conexión, la app DEBE mostrar las pantallas que ese dispositivo ya vio con conexión, con los últimos datos recibidos del servidor: inicio («Tu día» y la tarjeta de cada hijo), detalle del hijo con «Hoy», detalle de una consulta (medicamentos, tomas, calendario, cita, datos de la consulta), detalle de un suplemento o actividad, el perfil propio y los perfiles compartidos, el botiquín y la cartilla de vacunación (sin fotos), y «Hoy» del teléfono del hijo.
- **FR-003**: Sin conexión, una pantalla que el dispositivo nunca vio DEBE mostrar un mensaje neutral de que necesita conexión, con una forma de volver.
- **FR-004**: Mientras se muestren datos guardados, la app DEBE mostrar un aviso visible y neutral con «Sin conexión» y la hora de los datos más viejos de esa pantalla; si no son de hoy, también el día. El aviso desaparece cuando vuelve la conexión y llegan datos nuevos.
- **FR-005**: Al volver la conexión, la app DEBE pedir los datos de nuevo sola, sin recargar la página ni perder la pantalla o un formulario en curso.
- **FR-006**: Una petición que falla por falta de señal DEBE dejar en pantalla los datos que ya estaban (con el aviso), en lugar de vaciarla o mostrar el error de carga.

**Nada cambia sin conexión**

- **FR-007**: Sin conexión, las acciones que cambian datos (marcar y quitar una marca, «✓ Realizado», crear, editar, finalizar, recorrer, borrar, invitar, guardar un formulario, subir una foto, activar avisos) NO DEBEN mandarse ni simularse; al tocarlas la app DEBE decir con un aviso neutral que necesitan conexión. Un formulario conserva lo escrito.
- **FR-008**: Sin conexión, los estados de las tomas y los conteos DEBEN ser exactamente los que el servidor mandó la última vez; el dispositivo NO DEBE recalcularlos con su reloj (spec 013).

**Privacidad de lo guardado (Principio II)**

- **FR-009**: El dispositivo DEBE guardar solo respuestas que esa sesión ya recibió al usar la app; la app NO DEBE descargar de antemano datos que la persona no abrió.
- **FR-010**: Lo guardado NO DEBE incluir fotos (recetas, cartilla, botiquín) ni ningún archivo; sin conexión, el lugar de una foto dice que necesita conexión.
- **FR-011**: Al cerrar sesión, al entrar otra cuenta, al vencer la sesión o al rechazar el servidor la credencial del teléfono del hijo, la app DEBE borrar todo lo guardado para verse sin conexión de ese dispositivo.
- **FR-012**: Los datos de salud se guardan para verse sin conexión **solo en la app instalada en la pantalla de inicio de un teléfono** (decisión del dueño, 2026-11-11). En una computadora, aunque se instale, y en una pestaña del navegador del teléfono sin instalar, NO se guarda ningún dato de salud ni se abren pantallas con datos sin conexión; ahí la app se comporta como hoy.
- **FR-013**: Lo guardado DEBE dejar de mostrarse y borrarse cuando el dispositivo lleve **7 días** sin recibir datos nuevos del servidor (decisión del dueño, 2026-11-11); cada respuesta nueva vuelve a contar los 7 días de lo que llega.
- **FR-014**: Cuando el servidor deja de dar un dato que estaba guardado (porque la persona perdió el acceso a un hijo, una familia o un perfil compartido, o el dato se borró), la copia guardada DEBE borrarse al conectarse.
- **FR-015**: Nada de lo guardado DEBE ir a terceros ni a la dirección de la página; el comportamiento existente de no poner datos de salud en la dirección se mantiene.

**Convivencia con lo que ya existe**

- **FR-016**: El aviso «Hay una versión nueva · Actualizar» (spec 017) DEBE seguir funcionando con conexión y, al tocarlo, cargar la versión nueva; sin conexión no se muestra ni da error.
- **FR-017**: Los recordatorios y su acción «Tomada» (spec 011, bugfix 061) DEBEN seguir funcionando como hoy, incluido que todo aviso recibido se muestre.
- **FR-018**: El teléfono del hijo (spec 047) DEBE abrir «Hoy» sin conexión con las mismas reglas: solo sus datos ya vistos, sin marcar, y borrado cuando pierde el acceso.
- **FR-019**: En la app instalada en el teléfono, el diseño que corresponda a su ancho (normalmente el del teléfono) DEBE cumplir todo lo anterior; el diseño web en una computadora DEBE seguir sin guardar datos (FR-012); el aviso de sin conexión sigue el sistema visual (spec 005) y no usa rojo ni palabras de alarma.
- **FR-020**: Ningún texto nuevo DEBE evaluar ni aconsejar sobre la salud (Principio I); los avisos hablan solo de la conexión y de la hora de los datos.

### Entidades Clave

- **Datos guardados para verse sin conexión**: copia en el dispositivo de una respuesta del servidor que la sesión ya vio, con la cuenta a la que pertenece y la hora en que llegó. No contiene fotos. Se borra con la sesión, por retención o cuando el servidor deja de darla.
- **Cascarón de la app**: los archivos de la propia app (pantallas, estilos, tipografía, iconos) necesarios para abrir sin conexión; no contiene datos de nadie.
- **Estado de conexión**: si el dispositivo puede hablar con el servidor en este momento; decide si se muestra el aviso y si las acciones se permiten.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: En un teléfono con la app instalada que ya la usó con conexión, la app abre sin conexión y muestra el inicio con datos en menos de 3 segundos, en el 100 % de las pruebas.
- **SC-002**: Sin conexión, el 100 % de las pantallas listadas en FR-002 que el dispositivo ya vio se muestran con sus últimos datos y el aviso con la hora.
- **SC-003**: Sin conexión, 0 acciones que cambian datos se mandan o aparentan haberse guardado; cada una muestra el aviso de que necesita conexión.
- **SC-004**: Tras cerrar sesión, 0 datos de la cuenta quedan en el dispositivo; lo guardado nunca contiene una foto; en una computadora o un navegador sin instalar se guardan 0 datos de salud; a los 7 días sin conexión se muestran 0 datos guardados.
- **SC-005**: Al volver la conexión, la pantalla muestra datos actuales en menos de 5 segundos sin que la persona haga nada y sin perder lo capturado en un formulario.
- **SC-006**: El aviso de versión nueva y los recordatorios funcionan igual que antes en el 100 % de sus pruebas existentes.

## Supuestos

- **Etapa 1 = solo lectura**: marcar sin conexión y mandarlo al volver (etapa 2 del backlog) queda fuera; sigue anotado en `BACKLOG.md`.
- **Sin cifrado propio de lo guardado**: lo guardado queda en el almacenamiento de la app en el teléfono, protegido por su bloqueo; una llave guardada en el mismo dispositivo no agregaría protección real. Se limita en cambio qué se guarda (FR-009, FR-010), cuánto dura (FR-013) y cuándo se borra (FR-011, FR-014).
- **Sin mock**: el aviso de sin conexión y el mensaje de «necesita conexión» se hacen con el sistema visual (spec 005) y su redacción se lista en la spec para que el dueño la apruebe.
- **Solo frontend**: no se espera cambiar el API ni la base; el servidor sigue siendo quien decide los estados.
- **Inicio de sesión**: sin conexión no se puede iniciar sesión ni confirmar la sesión con el proveedor; se muestran los datos de la última sesión abierta en ese dispositivo hasta que la conexión permita confirmarla.
- **Aviso de privacidad**: guardar datos en el dispositivo debe mencionarse en el aviso de privacidad (pendiente del dueño, como en las specs 046, 047 y 058); también subir el aviso «Antes de empezar» si el dueño lo decide.
- **Pruebas**: E2E a 390 px como app instalada, con la red cortada por el navegador de pruebas, y a 1280 px comprobando que en la computadora no se guarda nada, además de una prueba manual en un iPhone real con la app instalada (la forma en que iOS guarda los archivos de una app instalada solo se comprueba en un dispositivo).
