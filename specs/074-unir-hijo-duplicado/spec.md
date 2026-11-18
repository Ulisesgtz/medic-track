# Especificación de Funcionalidad: Un hijo registrado dos veces al unirse a una familia

**Rama de la Funcionalidad**: `feature/074-unir-hijo-duplicado`

**Creado**: 2026-11-18

**Estado**: Borrador

**Entrada**: Descripción del usuario: pedido del dueño del 2026-11-17 (`BACKLOG.md`, «Un hijo registrado dos veces al
unirse a una familia»). Hoy (spec 032) quien acepta una invitación conserva su cuenta y sus hijos y ve los de la familia
**junto** a los suyos: si los dos padres registraron al mismo niño, queda duplicado y no hay forma de juntarlos ni de
quitar uno. Al aceptar, si la persona tiene hijos propios, una pantalla «¿Cómo quieres seguir?» con tres caminos:
**usar solo lo de la familia**, **conservar ambas** o **unir** al hijo propio con el de la familia.

**Decisiones del dueño (2026-11-18)**:

- Se aceptan los ajustes del backlog: **unir, no sobrescribir** (se mueve todo lo del hijo propio al de la familia sin
  borrar nada y conservando quién anotó qué); el parecido del nombre **solo sugiere** y la persona elige qué hijo es
  cuál; antes de unir, un **resumen** de lo que se mueve y la advertencia de que **pasa a la familia** (si después sale,
  no se lleva copia) con la oferta de **descargar sus datos** antes (spec 070); unir también **después**, desde
  «Familia»; solo une quien **puede todo en los dos hijos**; las tomas y los avisos no se duplican ni se pierden.
- Unir es **irreversible**, con el resumen y la descarga antes de confirmar.
- «Usar solo lo de la familia» **oculta** los hijos propios, **no los borra**: se pueden volver a mostrar o descargar.
- El diseño lo hace **Claude Design** (mock); se construye tal cual.
- Al pasar los datos de la cuenta de la persona a la cuenta dueña de la familia, el dueño **confirma** el cambio de
  quién guarda esos datos (Principio II): es la persona quien lo decide, con el resumen y la advertencia delante.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Unir al hijo propio con el de la familia (Prioridad: P1)

Laura registró a Mateo en su cuenta gratuita y anotó dos consultas y sus vacunas. Su pareja, Ana, que tiene el plan
completo, también registró a Mateo y la invita como Tutora. Al aceptar, Laura ve «¿Cómo quieres seguir?», elige
**Unir**, la app le propone «Mateo (tuyo) es Mateo (de la familia)» porque se llaman igual, Laura lo confirma, elige qué
fecha de nacimiento queda (difieren por un error de captura), ve el resumen «Se pasarán a la familia: 2 consultas,
9 vacunas, 1 medida» con la advertencia y la opción de descargar sus datos, y confirma. Desde ese momento hay **un solo
Mateo**, con las consultas de las dos, y lo que Laura anotó sigue diciendo «por Laura».

**Por qué esta prioridad**: es el problema que pidió el dueño: el niño duplicado parte su historial en dos y nadie de la
familia ve completo lo anotado.

**Prueba Independiente**: con dos cuentas que tienen al mismo niño con datos en las dos, aceptar la invitación, unir y
comprobar que el niño aparece una vez, con todo lo de ambos, y que la copia propia ya no existe.

**Escenarios de Aceptación**:

1. **Dado** que Laura tiene hijos propios y abre una invitación válida como Tutora, **Cuando** la acepta, **Entonces**
   antes de ir al inicio ve «¿Cómo quieres seguir?» con tres caminos: usar solo lo de la familia, conservar ambas y
   unir.
2. **Dado** que elige unir, **Cuando** ve sus hijos y los de la familia, **Entonces** la app sugiere las parejas cuyo
   nombre coincide (sin distinguir mayúsculas ni acentos; nombre, o nombre y apellido), la persona puede cambiar o
   quitar cada pareja y puede elegir parejas que la app no sugirió; ningún hijo de la familia se puede elegir dos veces.
3. **Dado** una pareja cuyos datos del registro difieren (nombre, apellido, fecha de nacimiento, talla, peso, tabla de
   crecimiento niña/niño), **Cuando** sigue, **Entonces** elige para cada dato distinto cuál queda; los datos iguales no
   se preguntan.
4. **Dado** el paso de resumen, **Cuando** lo ve, **Entonces** dice cuántas consultas, vacunas, fotos de la cartilla,
   medidas, suplementos y actividades pasan al hijo de la familia, que **pasan a la familia de Ana**, que si después sale
   de la familia **no se lleva copia**, que **no se puede deshacer**, y ofrece «Descargar mis datos» (spec 070) antes de
   «Unir».
5. **Dado** que confirma, **Cuando** termina, **Entonces** el hijo de la familia tiene todo lo del hijo propio
   (consultas con sus medicamentos, tomas y marcas, síntomas, citas, suplementos y actividades con sus tomas y marcas,
   vacunas, fotos de la cartilla, medidas y la ficha), cada cosa con su autor original («por Laura», «Corregida por
   Laura»), el hijo propio deja de existir y Laura llega al inicio con un solo Mateo.
6. **Dado** que la unión falla a medias (error o corte), **Cuando** se revisa, **Entonces** no cambió nada: o se movió
   todo o nada.

---

### Historia de Usuario 2 - Elegir cómo seguir al aceptar: ocultar o conservar (Prioridad: P2)

Pedro tiene a sus dos hijos registrados y su pareja ya lleva todo en la familia. Al aceptar elige **Usar solo lo de la
familia**: sus hijos propios dejan de verse en el inicio y la barra lateral, sin borrarse. Otra persona elige
**Conservar ambas** y sigue viendo los dos, con el aviso de que un niño puede aparecer dos veces.

**Por qué esta prioridad**: da salida a quien no quiere unir (no le interesa lo anotado antes, o no es el mismo niño)
sin dejar el inicio con duplicados.

**Prueba Independiente**: aceptar con hijos propios, elegir cada camino y comprobar qué hijos se ven en el inicio; luego
volver a mostrar un hijo oculto y descargar sus datos.

**Escenarios de Aceptación**:

1. **Dado** que elige «Usar solo lo de la familia», **Cuando** llega al inicio, **Entonces** solo ve los hijos de la
   familia; sus hijos propios no aparecen en el inicio, la barra lateral, «Tu día» ni el selector «¿De quién es la
   consulta?» (spec 071), y no recibe avisos de sus tomas, suplementos, actividades ni citas.
2. **Dado** hijos ocultos, **Cuando** abre «Mi cuenta», **Entonces** ve «Hijos ocultos» con cada uno y «Volver a
   mostrar»; al tocarlo el hijo vuelve al inicio con todo lo que tenía y sus avisos siguen desde ese momento (los que
   pasaron mientras estaba oculto no se mandan tarde).
3. **Dado** hijos ocultos, **Cuando** descarga todos sus datos (spec 070), **Entonces** el ZIP los incluye.
4. **Dado** que elige «Conservar ambas», **Cuando** llega al inicio, **Entonces** ve sus hijos y los de la familia como
   hoy, después de un aviso neutral de que un niño registrado en las dos cuentas aparecerá dos veces y que puede unirlos
   después desde «Familia».
5. **Dado** que cierra la pantalla sin elegir (o se corta la conexión), **Cuando** vuelve a la app, **Entonces** ya es
   integrante de la familia (aceptar no depende de esta pantalla) y todo queda como «Conservar ambas»; puede unir u
   ocultar después.
6. **Dado** una persona que sale de la familia (o la familia termina) con hijos ocultos, **Cuando** sale, **Entonces**
   sus hijos ocultos se vuelven a mostrar solos.

---

### Historia de Usuario 3 - Unir después, desde «Familia» (Prioridad: P3)

Laura eligió «Conservar ambas» al aceptar y una semana después decide juntar a Mateo. En «Familia» toca «Unir con un
hijo de la familia» y sigue el mismo flujo de parejas, datos distintos, resumen y confirmación.

**Por qué esta prioridad**: quien acepta con prisa o sin entender aún la diferencia no pierde la opción.

**Prueba Independiente**: con una persona ya integrante con hijos propios, unir desde «Familia» y comprobar lo mismo
que en la historia 1.

**Escenarios de Aceptación**:

1. **Dado** una Tutora de una familia de pago con hijos propios visibles u ocultos, **Cuando** abre «Familia»,
   **Entonces** ve «Unir con un hijo de la familia» y también «Ocultar mis hijos» / «Volver a mostrar».
2. **Dado** un Cuidador, un integrante Hijo, una persona sin hijos propios o una familia sin plan vigente, **Cuando**
   abre «Familia», **Entonces** no ve «Unir con un hijo de la familia».
3. **Dado** que la dueña de la familia tiene hijos repetidos dentro de su propia cuenta, **Cuando** usa esta función,
   **Entonces** no aplica: esta spec une solo un hijo propio de la persona invitada con uno de la familia.

---

### Casos Límite

- **Los dos registros tienen ficha (spec 073)**: alergias y padecimientos se juntan en una sola lista (los del hijo de
  la familia primero, sin repetir los de texto idéntico); el tipo de sangre, el pediatra y la nota general, si difieren,
  se eligen como los demás datos del paso 3. Si la lista unida pasa de 30, la app pide quitar desde la ficha antes de
  unir (no recorta nada sola).
- **Topes por hijo** (10 suplementos y 10 actividades activas, 10 fotos de la cartilla, 500 medidas): la unión **no se
  bloquea** si el resultado los pasa; el hijo queda por encima del tope y no se puede agregar más de ese tipo hasta
  bajar de él (las reglas de cada spec ya lo hacen al agregar). El resumen lo dice.
- **Fotos de recetas (100 por cuenta, spec 043)**: las consultas movidas cuentan para la cuenta dueña de la familia;
  la unión no se bloquea si se pasa del tope.
- **Teléfono del hijo (spec 047)**: los accesos del teléfono del hijo propio se quitan al unir (el resumen lo dice) y
  se puede dar uno nuevo desde el hijo de la familia; con un hijo oculto, el teléfono del niño sigue funcionando.
- **Vacuna repetida** (la misma vacuna y fecha en los dos): se conservan las dos filas, como si se hubiera anotado dos
  veces; la app no las junta ni decide cuál vale (Principio I).
- **Tomas a la misma hora**: no se juntan; cada consulta y rutina conserva sus tomas, sus marcas y su autor.
- **Avisos ya enviados y por enviar**: un aviso ya enviado no se repite; las tomas futuras del hijo movido avisan a las
  personas que ahora tienen acceso al hijo de la familia y con dispositivo, una vez por toma y persona.
- **Otra persona marca una toma mientras se une**: la marca y la unión no se pisan; la que llegue después espera a la
  otra y la marca se conserva.
- **La dueña de la familia deja de pagar o pide eliminar su cuenta (spec 070) mientras la persona está en el
  resumen**: al confirmar, la app revisa otra vez que la persona pueda todo en los dos hijos; si ya no, no une y lo dice
  con palabras neutras.
- **Dos hijos propios elegidos para el mismo hijo de la familia**: no se permite; uno por uno.
- **La persona es dueña de su propia familia con invitados**: hoy no puede aceptar otra familia (spec 032); no cambia.
- **El hijo propio está en pausa por eliminación de cuenta**: no se puede aceptar con la cuenta en pausa (spec 070).
- **Sin conexión**: la pantalla y la unión necesitan conexión («Esta pantalla necesita conexión.», spec 067); la copia
  sin conexión del hijo que desaparece se borra con el siguiente 404.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: Al aceptar una invitación como **Tutor o Cuidador**, si la persona tiene al menos un hijo propio, la app
  DEBE mostrar «¿Cómo quieres seguir?» con tres caminos: «Usar solo lo de la familia», «Conservar ambas» y «Unir». Un
  Cuidador ve solo los dos primeros (no puede todo en los hijos de la familia). Quien no tiene hijos propios, o acepta
  como Hijo, va directo al inicio como hoy.
- **FR-002**: Aceptar la invitación DEBE seguir siendo una acción aparte e igual que hoy (spec 032); elegir el camino
  ocurre después y no elegir equivale a «Conservar ambas».
- **FR-003**: «Usar solo lo de la familia» DEBE ocultar los hijos propios de la persona: no se borra nada; dejan de
  verse en el inicio, la barra lateral, «Tu día», los selectores de hijo y la lista de hijos de la cuenta, y dejan de
  mandarle avisos. La persona DEBE poder volver a mostrar cada hijo desde «Mi cuenta» y «Familia», y descargarlos en
  «Descargar todos mis datos».
- **FR-004**: Ocultar es solo de la cuenta de la persona: los hijos ocultos siguen contando para su tope de hijos, su
  teléfono del hijo sigue funcionando y se vuelven a mostrar solos si la persona sale de la familia o la familia
  termina.
- **FR-005**: «Unir» DEBE dejar elegir parejas (hijo propio → hijo de la familia), sugiriendo las de nombre igual sin
  distinguir mayúsculas ni acentos; la sugerencia nunca se aplica sola; cada hijo de la familia y cada hijo propio
  entra a lo más en una pareja.
- **FR-006**: Para cada pareja con datos del registro distintos (nombre, apellido, fecha de nacimiento, talla, peso,
  tabla de crecimiento) y, si ambos tienen ficha, tipo de sangre, pediatra y nota general distintos, la persona DEBE
  elegir cuál queda. Ninguno se elige por omisión.
- **FR-007**: Antes de unir, la app DEBE mostrar un resumen por pareja con los conteos de lo que se mueve (consultas,
  vacunas, fotos de la cartilla, medidas, suplementos, actividades, si hay ficha y los accesos del teléfono del hijo que
  se quitan), que todo **pasa a la familia de <nombre de pila de la dueña>**, que al salir de la familia no se lleva
  copia, que no se puede deshacer, y «Descargar mis datos» antes de «Unir».
- **FR-008**: Unir DEBE mover al hijo de la familia, en una sola operación de todo o nada, todo lo del hijo propio:
  consultas (con medicamentos, tomas y sus marcas, recorridos, finales, síntomas, fotos y citas), suplementos y
  actividades (con tomas, marcas, silencios y «Tus avisos»), vacunas y fotos de la cartilla, medidas de crecimiento y
  la ficha (FR-006 y casos límite), conservando autores, fechas y sellos de corrección o edición. El hijo propio DEBE
  dejar de existir al terminar. Nada de los datos se borra.
- **FR-009**: Solo DEBE poder unir quien tenga el nivel máximo («puede todo») sobre los dos hijos en el momento de
  confirmar: la dueña del hijo propio que además es Tutora de una familia de pago vigente. El servidor lo decide.
- **FR-010**: Unir es irreversible. El hijo de la familia DEBE mostrar una línea neutral «Se unió el 3 dic con el
  registro de Laura» y la familia guarda quién unió, cuándo y los conteos (sin nombres de hijos ni datos de salud).
- **FR-011**: Tras unir, las tomas y avisos DEBEN seguir la regla de siempre: la primera marca gana, un aviso por toma
  y persona con acceso, nada ya enviado se repite.
- **FR-012**: La persona que unió y después sale de la familia NO se lleva copia de lo unido (spec 032); la oferta de
  descarga del resumen es su forma de conservarlo.
- **FR-013**: «Unir con un hijo de la familia» DEBE estar también en «Familia» para quien cumple FR-009 y tiene hijos
  propios (visibles u ocultos), con el mismo flujo.
- **FR-014**: Ningún texto de la funcionalidad DEBE evaluar, recomendar ni decidir cuál registro es «el bueno»
  (Principio I); el parecido solo se presenta como «Se llaman igual».
- **FR-015**: Los nombres de los hijos y cualquier dato de salud NO DEBEN viajar en la dirección, quedar en
  `error_logs` ni en correos (Principio II).
- **FR-016**: Las pantallas DEBEN tener los dos diseños (teléfono y web) del mock de Claude Design, construidos tal cual,
  y no aplican sin conexión.

### Entidades Clave

- **Hijo oculto**: un hijo propio marcado por su dueña como «no mostrar» (cuándo); no cambia nada de sus datos.
- **Unión de hijos**: el registro de que el hijo propio de una persona se unió a un hijo de una familia: quién, cuándo,
  la familia, el hijo resultante y los conteos de lo movido; sin nombres ni datos de salud.
- **Pareja**: elección temporal (no se guarda) de qué hijo propio corresponde a qué hijo de la familia, con las
  elecciones de los datos distintos.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Tras unir, el niño aparece **una sola vez** en el inicio de todos los integrantes y su historial tiene el
  100 % de las consultas, vacunas, medidas, suplementos y actividades de los dos registros.
- **SC-002**: El 100 % de las marcas y correcciones movidas conserva su autor y su hora originales.
- **SC-003**: Una unión interrumpida deja los dos registros exactamente como estaban (cero datos a medias).
- **SC-004**: Una persona puede aceptar la invitación y unir a un hijo en menos de 2 minutos, sin salir del flujo.
- **SC-005**: Ocultar y volver a mostrar no pierde ningún dato: lo descargado antes y después de ocultar es igual.
- **SC-006**: Ningún texto de la funcionalidad contiene juicios de salud ni recomendaciones (prueba de redacción).

## Supuestos

- La sugerencia de parejas compara solo el nombre (y el apellido si ambos lo tienen); no usa la fecha de nacimiento
  para sugerir, porque un error de captura es justo lo que se quiere corregir.
- Ocultar no tiene tope y no requiere plan; unir requiere que la familia tenga el plan vigente (es la única forma de que
  la persona sea Tutora con nivel máximo).
- La cuenta dueña de la familia no necesita aprobar la unión: un Tutor ya puede crear y editar todo en sus hijos (spec
  032); la línea «Se unió…» y el registro de la unión lo dejan visible.
- Unir varios hijos a la vez se hace en una sola confirmación, pero cada pareja es su propia operación de todo o nada;
  el resumen final dice cuáles se unieron.
- La dueña de la familia con niños repetidos dentro de su propia cuenta, borrar un hijo y pasar los hijos a un Tutor
  siguen en `BACKLOG.md`.
- El aviso de privacidad (que la persona puede pasar sus datos a la familia) es pendiente del dueño.

## Dependencias

- Spec 032 (familia, niveles, salir sin copia), 047 (teléfono del hijo), 058 (consultas propias: **no** se mueven),
  070 (descarga de datos, cuenta en pausa), 071 (selector de hijo), 073 (ficha), 067 (sin conexión).
- Mock de Claude Design de «¿Cómo quieres seguir?», parejas, datos distintos, resumen, listo, hijos ocultos y la entrada
  en «Familia» (teléfono y web).
