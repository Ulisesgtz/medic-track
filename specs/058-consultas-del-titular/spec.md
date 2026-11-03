# Especificación de Funcionalidad: Consultas del titular

**Rama de la Funcionalidad**: `feature/058-consultas-del-titular`

**Creado**: 2026-11-02

**Estado**: Borrador

**Entrada**: Descripción del usuario: "El titular (padre o madre) con sus propias consultas y actividades, como los hijos (pedido del dueño, 2026-11-02). Decisiones del dueño: un perfil propio que funciona como el detalle de un hijo y reemplaza «Mi día»; las consultas del titular son privadas por omisión y él decide con un interruptor compartirlas con los Tutores de su familia; solo plan completo; entran también el historial con búsqueda y el PDF."

## Contexto

Hoy PediTrack lleva la salud de los hijos. La persona de la cuenta solo tiene, para sí misma, sus suplementos y actividades en
«Mi día» (specs 033 parte 3, 035 y 056), que nadie más ve. Pero el papá y la mamá también van al médico, también reciben una
receta con tres medicamentos cada 8 horas y también se les olvida una toma. Esta spec les da **sus propias consultas**, con
todo lo que ya tiene la consulta de un hijo: foto de la receta con la ayuda de lectura en el teléfono, síntomas, notas,
medicamentos con sus tomas, calendario, recordatorios, finalizar, recorrer, editar, «solo registro» y la próxima cita; además
el historial con búsqueda y el PDF.

Lo distinto es de quién son los datos: **de una persona adulta**. Por eso son **privados por omisión** y solo su dueño decide
si los ve alguien más de su familia, y nunca un Cuidador ni el teléfono de un hijo.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Registrar mi propia consulta y seguir mis tomas (Prioridad: P1)

Ana fue al médico por una infección de garganta. Abre su perfil («Ana», el que antes se llamaba «Mi día»), toca «Nueva
consulta», toma la foto de la receta, marca «Dolor de garganta» y «Fiebre», y captura amoxicilina cada 8 horas por 7 días con
primera toma a las 14:00. En su perfil, «Hoy» le muestra sus tomas junto con sus suplementos y actividades; a las 14:00 le
llega el recordatorio y lo marca «Tomada» desde el aviso. El inicio («Tu día») cuenta sus tomas.

**Por qué esta prioridad**: es el corazón del pedido: sin poder registrar la consulta y seguir las tomas, nada más tiene
sentido. Sola ya entrega valor.

**Prueba Independiente**: con una cuenta de pago, crear una consulta propia con un medicamento con horario, ver sus tomas en
el perfil y en «Tu día», marcarlas y recibir su recordatorio; comprobar que ningún hijo la muestra.

**Escenarios de Aceptación**:

1. **Dado** una persona con plan completo, **Cuando** abre su perfil, **Entonces** ve «Hoy» primero, su tratamiento activo y
   su próxima cita si las tiene, el índice Consultas · Suplementos · Actividades y el botón «Nueva consulta».
2. **Dado** su perfil, **Cuando** toca «Nueva consulta», **Entonces** ve el mismo formulario que la consulta de un hijo (doctor,
   fecha, foto con ayuda de lectura, síntomas, notas, medicamentos con «Primera toma», «solo registro» y próxima cita) y al
   guardar la consulta aparece en su lista y en su detalle.
3. **Dado** una consulta propia con horario, **Cuando** llega la hora de una toma, **Entonces** la persona recibe su
   recordatorio en sus dispositivos activados y puede marcarla desde el aviso, desde «Hoy» del perfil, desde el detalle de la
   consulta y desde «Tu día».
4. **Dado** una consulta propia, **Cuando** se abre su detalle, **Entonces** tiene lo mismo que la de un hijo: calendario,
   tomas por día, progreso, «Finalizar tratamiento», «Recorrer tratamiento», «Editar consulta» y la próxima cita.
5. **Dado** las direcciones viejas de «Mi día», «Mis suplementos» y «Mis actividades», **Cuando** se abren, **Entonces**
   llevan al perfil.
6. **Dado** el perfil, **Cuando** se compara con el detalle de un hijo, **Entonces** no tiene cartilla de vacunación ni
   «Acceso del hijo».

---

### Historia de Usuario 2 - Decidir quién de mi familia ve mis consultas (Prioridad: P2)

Ana está tomando un antibiótico y quiere que su pareja, Tutor de su familia, le ayude a acordarse. En su perfil enciende
«Compartir mis consultas con los Tutores de mi familia». Desde ese momento su pareja ve las consultas de Ana en un perfil
aparte, marca sus tomas («por Luis, 08:05») y puede activar sus propios avisos. Cuando el tratamiento termina, Ana apaga el
interruptor y su pareja deja de verlas al instante.

**Por qué esta prioridad**: es lo que hace distinta esta funcionalidad de una libreta privada, y toca privacidad de datos de
salud de una persona adulta: la regla tiene que estar bien antes de lanzarla. Depende de la Historia 1.

**Prueba Independiente**: con una familia de pago (dueña, un Tutor y un Cuidador), comprobar que con el interruptor apagado
nadie más ve las consultas de la dueña; encenderlo y comprobar que el Tutor las ve y marca pero el Cuidador no; apagarlo y
comprobar que el Tutor deja de verlas en la siguiente petición y deja de recibir sus avisos.

**Escenarios de Aceptación**:

1. **Dado** una persona que nunca tocó el interruptor, **Cuando** otro integrante de su familia busca sus consultas por
   cualquier camino, **Entonces** no las ve ni sabe cuántas hay.
2. **Dado** el interruptor encendido, **Cuando** un Tutor de la misma familia abre el inicio, **Entonces** ve un acceso al
   perfil de esa persona con su nombre, y dentro sus consultas, su tratamiento y sus tomas, y puede marcarlas y desmarcar las
   suyas.
3. **Dado** el interruptor encendido, **Cuando** el Tutor abre una consulta compartida, **Entonces** NO puede crear, editar,
   finalizar ni recorrer, ni cambiar la próxima cita: eso es solo de su dueño.
4. **Dado** el interruptor encendido, **Cuando** un Cuidador, un integrante con rol Hijo o el teléfono de un hijo intentan
   verlas, **Entonces** no las ven.
5. **Dado** el interruptor encendido, **Cuando** su dueño lo apaga, **Entonces** el Tutor deja de verlas en su siguiente
   petición, deja de recibir sus avisos y las tomas que marcó conservan «por Luis».
6. **Dado** el interruptor encendido, **Cuando** sus suplementos y actividades personales se buscan desde otra cuenta,
   **Entonces** siguen sin verse: el interruptor solo comparte las consultas.

---

### Historia de Usuario 3 - Buscar en mi historial y exportarlo a PDF (Prioridad: P3)

Antes de una cita con un especialista, Ana busca «amoxicilina» en su historial para recordar cuándo la tomó, filtra por el
último año y exporta un PDF con sus consultas y las fotos de sus recetas para llevarlo.

**Por qué esta prioridad**: es valioso cuando ya hay varias consultas guardadas, no el primer día. Reutiliza el historial
(spec 031) y el PDF (spec 050) de los hijos. Depende de la Historia 1.

**Prueba Independiente**: con varias consultas propias, buscar por texto y filtros y comprobar que solo salen las propias; y
exportar el PDF y comprobar que contiene sus consultas y fotos, sin cartilla y sin nada de los hijos.

**Escenarios de Aceptación**:

1. **Dado** su perfil con plan completo, **Cuando** toca «Buscar en el historial», **Entonces** busca y filtra sus consultas
   igual que el historial de un hijo (texto, fechas, doctor, medicamento, síntomas y tipo).
2. **Dado** su historial, **Cuando** toca «Exportar a PDF», **Entonces** el PDF se arma en su teléfono con la portada a su
   nombre, sus consultas y, si las pide, sus fotos; no tiene sección de cartilla.
3. **Dado** un Tutor con el interruptor encendido, **Cuando** abre el perfil compartido, **Entonces** puede buscar en el
   historial de esa persona pero NO exportarlo a PDF.
4. **Dado** el plan gratuito, **Cuando** la persona toca «Buscar en el historial» o «Exportar a PDF», **Entonces** ve el aviso
   del plan completo sin resultados ni datos.

---

### Casos Límite

- **Plan gratuito**: el perfil sigue mostrando sus suplementos y actividades como hoy; «Nueva consulta» lleva la marca «Plan
  completo» y abre el aviso del plan antes de mostrar el formulario; el servidor rechaza crear sin datos.
- **El plan se vence** con consultas propias guardadas: se siguen viendo, marcando, editando y finalizando, y sus avisos
  siguen; no se crean consultas nuevas ni se recorre un tratamiento; el historial y el PDF piden el plan como en los hijos.
- **Encender el interruptor** pide que la familia tenga plan de pago; apagarlo se puede siempre. Si después la familia deja de
  pagar, lo ya compartido se sigue viendo y marcando (como un Tutor con los hijos) hasta que su dueño lo apague o alguien
  salga de la familia.
- **Sin familia**: el interruptor no se muestra (no hay con quién compartir).
- **Una persona invitada** a una familia tiene su propio perfil y sus propias consultas, con el plan de esa familia; si las
  comparte, las ven la dueña de la familia y los demás Tutores.
- **Salir de la familia o ser quitado**: quien sale deja de ver las consultas compartidas de los demás al instante, y los
  demás dejan de ver las suyas; lo de cada quien se queda en su cuenta.
- **Dos personas marcan la misma toma a la vez**: gana la primera marca, como en las tomas de un hijo.
- **Avisos de un Tutor**: un Tutor con acceso compartido recibe avisos de esas tomas solo si los activa en «Tus avisos» de esa
  consulta (apagados por omisión, para que un dato de salud de otra persona no aparezca en su pantalla sin que lo pida).
- **Texto del aviso**: con detalle dice el nombre de la persona, el medicamento y la hora; en genérico solo que hay una toma.
  El aviso a su propio dueño no repite su nombre.
- **Dirección de una consulta propia abierta por otra cuenta** sin acceso: la misma respuesta que una consulta que no existe.
- **El teléfono de un hijo** nunca ve, cuenta ni recibe avisos de las consultas de un adulto.
- **Borrar**: una consulta propia, como la de un hijo, solo se edita; nunca se borra (decisión del 2026-11-02).

## Requisitos *(obligatorio)*

### Requisitos Funcionales

**El perfil**

- **FR-001**: Cada persona con cuenta DEBE tener un perfil propio, con su nombre de pila, que reemplaza «Mi día»: «Hoy»
  primero (sus tomas de medicamentos, suplementos y actividades del día), su tratamiento activo y su próxima cita, el índice
  Consultas · Suplementos · Actividades y «Nueva consulta», con el sistema visual de la spec 056 y un diseño para web y otro
  para móvil.
- **FR-002**: Las direcciones anteriores de «Mi día», «Mis suplementos» y «Mis actividades» DEBEN llevar al perfil.
- **FR-003**: El perfil NO DEBE tener cartilla de vacunación ni «Acceso del hijo».
- **FR-004**: El inicio («Tu día») y la barra lateral web DEBEN enlazar al perfil y contar sus tomas de medicamentos del día
  junto con sus suplementos y actividades.

**Las consultas propias**

- **FR-005**: Una persona con plan completo DEBE poder crear consultas propias con los mismos datos y reglas que la consulta de
  un hijo: doctor, fecha no futura, foto de la receta (ayuda de lectura en el teléfono, reducida antes de guardar, mismo tope
  de fotos de la cuenta), síntomas del catálogo, notas, medicamentos con frecuencia, duración y primera toma, «solo
  registro» y próxima cita opcional.
- **FR-006**: Una consulta propia DEBE comportarse como la de un hijo en todo lo demás: estados de las tomas, calendario,
  progreso, finalizar, recorrer, editar (spec 051), próxima cita con sus avisos, recordatorios por toma y marca con su autor.
- **FR-007**: Una consulta propia NO se DEBE poder borrar; solo editar.
- **FR-008**: Una consulta propia NUNCA DEBE aparecer en el detalle, la lista, el historial, el PDF, «Tomas de hoy» ni los
  conteos de ningún hijo, ni en el teléfono de un hijo.

**Quién la ve**

- **FR-009**: Una consulta propia DEBE ser visible solo para su dueño mientras el interruptor «Compartir mis consultas con los
  Tutores de mi familia» esté apagado, que es como empieza.
- **FR-010**: Con el interruptor encendido, la dueña de la familia y los integrantes con rol Tutor de la misma familia DEBEN
  poder ver las consultas, sus tomas y su próxima cita, marcar tomas y desmarcar las que marcaron ellos, y buscar en su
  historial; NO DEBEN poder crear, editar, finalizar, recorrer, cambiar la próxima cita ni exportar el PDF.
- **FR-011**: Un Cuidador, un integrante con rol Hijo y el teléfono de un hijo NUNCA DEBEN ver las consultas propias de otra
  persona, con el interruptor encendido o apagado.
- **FR-012**: El servidor DEBE decidir el acceso en cada petición: apagar el interruptor, salir de la familia o ser quitado
  DEBE cortar el acceso en la siguiente petición y dejar de crear avisos para esas personas; las marcas que hicieron
  conservan su autor.
- **FR-013**: Encender el interruptor DEBE pedir que la persona pertenezca a una familia con plan de pago; apagarlo DEBE poder
  hacerse siempre. Si la familia deja de pagar, el acceso compartido sigue (ver y marcar) hasta que su dueño lo apague.
- **FR-014**: El interruptor solo comparte las consultas; los suplementos y actividades personales DEBEN seguir siendo solo de
  su dueño.
- **FR-015**: Un Tutor con acceso compartido DEBE recibir avisos de esas tomas solo si los activa en «Tus avisos» de esa
  consulta; por omisión están apagados. Su dueño recibe los suyos como con un hijo.
- **FR-016**: Sin acceso, la respuesta a una consulta propia DEBE ser la misma que para una consulta que no existe.

**El plan**

- **FR-017**: Crear una consulta propia y recorrer un tratamiento propio DEBEN pedir plan completo (de la propia cuenta o de una
  familia de pago a la que la persona pertenece); el servidor lo decide y rechaza sin guardar nada con el motivo «consultas
  propias».
- **FR-018**: Con el plan vencido, lo ya registrado se DEBE seguir viendo, marcando, editando y finalizando, y sus avisos
  DEBEN seguir.
- **FR-019**: En el plan gratuito, «Nueva consulta» del perfil DEBE llevar la marca «Plan completo» y abrir el aviso del plan
  antes de mostrar un formulario que se rechazaría.

**Historial y PDF**

- **FR-020**: El perfil DEBE tener «Buscar en el historial» con el texto y los filtros del historial de un hijo (spec 031),
  solo sobre las consultas propias, con las mismas reglas de plan; el criterio viaja en el cuerpo, nunca en la dirección.
- **FR-021**: El dueño DEBE poder «Exportar a PDF» su historial (spec 050): se arma en su teléfono, con portada a su nombre,
  consultas y fotos opcionales, sin cartilla; con las mismas reglas de plan.

**Privacidad, textos y registro**

- **FR-022**: Los textos libres (doctor, notas, nombres de medicamentos, texto de búsqueda) NUNCA DEBEN ir en direcciones ni en
  el registro de errores.
- **FR-023**: Ningún texto de la app DEBE interpretar, evaluar ni aconsejar sobre las consultas o las tomas (Principio I).
- **FR-024**: El aviso «Antes de empezar» DEBE decir que la app también registra la salud de la persona de la cuenta, y su
  versión DEBE subir para que todas las cuentas lo vuelvan a ver.

### Entidades Clave

- **Perfil**: la vista de la persona de la cuenta sobre sí misma; no es un dato nuevo, se arma con su cuenta, sus consultas
  propias y sus suplementos y actividades personales.
- **Consulta propia**: una consulta cuyo paciente es la persona de la cuenta y no un hijo; tiene todo lo de una consulta
  (medicamentos, tomas, síntomas, foto, próxima cita, extensiones, edición) y pertenece a una sola cuenta.
- **Preferencia de compartir**: por persona, si sus consultas propias las ven los Tutores de su familia; apagada al crearse,
  con quién la cambió y cuándo.
- **Avisos de un Tutor sobre una consulta compartida**: por persona y consulta, si recibe los recordatorios (apagado por
  omisión).

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Una persona con plan completo registra su propia consulta con un medicamento con horario en menos de 2 minutos
  desde su perfil, con los mismos pasos que la de un hijo.
- **SC-002**: En el 100 % de las pruebas de acceso, nadie además de su dueño ve una consulta propia con el interruptor
  apagado, y ningún Cuidador, integrante Hijo ni teléfono de un hijo la ve con el interruptor encendido.
- **SC-003**: Al apagar el interruptor, el Tutor deja de ver las consultas en su siguiente petición (0 accesos después) y no
  recibe ningún aviso nuevo de ellas.
- **SC-004**: Ninguna consulta propia aparece en ninguna pantalla, conteo, historial o PDF de un hijo (0 casos en las
  pruebas).
- **SC-005**: Los recordatorios de las tomas propias llegan a su hora con la misma puntualidad que los de un hijo, y nunca
  dos avisos de la misma toma a la misma persona.
- **SC-006**: Una búsqueda en el historial propio devuelve solo consultas propias y un PDF propio no contiene datos de ningún
  hijo (verificado en pruebas automáticas).
- **SC-007**: Ningún texto libre aparece en direcciones ni en el registro de errores en las pruebas.
- **SC-008**: Todas las pantallas nuevas o cambiadas funcionan a 390 px y a 1280 px con su propio diseño, y la cobertura de
  pruebas unitarias sigue arriba de 90 %.

## Supuestos

- Decisiones del dueño del 2026-11-02: perfil propio que reemplaza «Mi día»; privado por omisión con interruptor del dueño
  para los Tutores de su familia; solo plan completo; historial y PDF en la misma entrega.
- «Los Tutores de mi familia» = la dueña de la familia y los integrantes con rol Tutor activos de la misma familia (spec
  032); una persona pertenece a una familia a la vez. Sin familia no hay con quién compartir.
- El Tutor con acceso compartido **ve y marca**, no edita: las consultas son de una persona adulta y solo ella decide qué se
  registra. Desmarcar sigue la regla de las tomas de un hijo (el autor de la marca o el dueño).
- Con el plan vencido el acceso compartido sigue, igual que un Tutor sigue viendo y marcando a los hijos (spec 032).
- Los avisos de un Tutor sobre consultas ajenas empiezan apagados (es un dato de salud de otra persona adulta en su pantalla).
- El PDF solo lo exporta el dueño: exportar es sacar una copia de los datos y eso solo lo decide él.
- No hay mock entregado: el perfil sigue el detalle del hijo de la spec 056 y la consulta reutiliza las pantallas de los
  hijos.
- Ver suplementos y actividades personales no cambia (specs 033 parte 3 y 035).
- El aviso de privacidad (documento legal) lo actualiza el dueño; esta spec sube la versión del aviso «Antes de empezar».
- El registro de la marca del interruptor (quién y cuándo) es para auditoría, sin historial de cambios visible.
