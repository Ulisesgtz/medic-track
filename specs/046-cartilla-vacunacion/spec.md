# Especificación de Funcionalidad: Cartilla de vacunación del hijo

**Rama de la Funcionalidad**: `feature/046-cartilla-vacunacion`

**Creado**: 2026-10-17

**Estado**: Borrador

**Entrada**: Descripción del usuario: "Cartilla de vacunación del hijo. El padre/tutor registra las vacunas de cada hijo de dos maneras: (1) llenado manual y (2) tomando o eligiendo una foto de la cartilla, con el OCR en el teléfono solo como ayuda editable. Vista de la cartilla por hijo, foto consultable, qué plan la incluye, compartida con la familia por los niveles de la spec 032. La app registra y nunca interpreta ni aconseja. Fuera de alcance: recordatorios calculados por la app, importar registros del gobierno, certificados."

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Registrar a mano las vacunas de mi hijo (Prioridad: P1)

Un padre abre la página de su hijo y entra a «Cartilla de vacunación». Agrega una vacuna eligiéndola de una lista de nombres conocidos (o escribiendo otra que no está en la lista), la fecha en que se aplicó y, si quiere, el número de dosis, el lote, el lugar o médico y una nota. Al guardar, la vacuna aparece en la cartilla del hijo con su fecha. Puede corregir o borrar lo que escribió mal.

**Por qué esta prioridad**: es el valor central y funciona sin foto ni OCR: una cartilla de papel que se pierde o se deteriora ahora vive también en el teléfono, y es lo que ningún competidor mexicano ofrece.

**Prueba Independiente**: con solo esta historia, un padre crea tres vacunas de un hijo, las ve ordenadas en su cartilla, corrige una fecha y borra otra, sin haber subido ninguna foto.

**Escenarios de Aceptación**:

1. **Dado** un hijo sin vacunas registradas, **Cuando** el padre agrega «Hepatitis B» con la fecha de aplicación, **Entonces** la cartilla muestra esa vacuna con su fecha y el hijo queda con una vacuna registrada.
2. **Dado** que la vacuna que busca no está en la lista, **Cuando** la escribe con sus propias palabras («otra»), **Entonces** se guarda tal cual la escribió y aparece en la cartilla como cualquier otra.
3. **Dado** una vacuna con varias dosis (la misma vacuna aplicada en fechas distintas), **Cuando** el padre agrega cada aplicación, **Entonces** la cartilla agrupa por vacuna y lista cada dosis con su fecha, sin decir cuántas faltan.
4. **Dado** una vacuna ya guardada, **Cuando** el padre corrige su fecha o la borra tras confirmar, **Entonces** la cartilla refleja el cambio y nada más se modifica.
5. **Dado** que el padre escribe una fecha futura o una fecha anterior al nacimiento del hijo, **Cuando** intenta guardar, **Entonces** se le dice con claridad qué fecha no es válida y no se guarda hasta corregirla.

---

### Historia de Usuario 2 - Guardar la foto de la cartilla de papel (Prioridad: P1)

El padre toma una fotografía de las páginas de la cartilla física (o la elige de su galería) y la guarda en la cartilla de su hijo. Después puede abrirla, verla en grande y regresar a ella cuando el pediatra o la escuela pidan la cartilla. Puede guardar varias fotos (cada página) y quitar una que quedó mal.

**Por qué esta prioridad**: es el respaldo más inmediato de la cartilla de papel y lo que el padre pidió explícitamente; no requiere que transcriba nada para tener valor.

**Prueba Independiente**: un padre guarda dos fotos de la cartilla de un hijo, las abre desde la cartilla y borra una, sin haber registrado ninguna vacuna a mano.

**Escenarios de Aceptación**:

1. **Dado** la cartilla de un hijo, **Cuando** el padre toma o elige una foto y confirma guardarla, **Entonces** la foto queda en la cartilla de ese hijo y puede abrirla en grande.
2. **Dado** varias fotos guardadas, **Cuando** el padre abre la cartilla, **Entonces** las ve ordenadas por la fecha en que las guardó y puede abrir cada una.
3. **Dado** una foto guardada, **Cuando** el padre la borra tras confirmar, **Entonces** desaparece de la cartilla y las vacunas registradas a mano no cambian.
4. **Dado** que el teléfono no puede reducir o leer la imagen elegida, **Cuando** el padre la guarda, **Entonces** se guarda la original o se le avisa con claridad que no se pudo, sin perder lo que ya había escrito.
5. **Dado** que el padre ya guardó el máximo de fotos permitido para ese hijo, **Cuando** intenta guardar otra, **Entonces** se le explica el límite en palabras neutrales y puede borrar una para dejar lugar.

---

### Historia de Usuario 3 - Ayuda para pasar la foto a registros (Prioridad: P2)

Tras elegir una foto, el teléfono intenta leerla y propone filas de vacunas con fecha («Hepatitis B · 14 mar 2021»). El padre revisa cada fila propuesta, corrige lo que se leyó mal, descarta lo que no sirve y confirma las que sí. Nada se guarda sin que el padre lo confirme, y la lectura se hace en el teléfono: la imagen no se envía a ningún servicio externo.

**Por qué esta prioridad**: ahorra trabajo, pero la letra a mano de las cartillas hace que la lectura falle muchas veces; por eso la historia 1 (manual) y 2 (foto) deben funcionar solas y esta es solo una ayuda.

**Prueba Independiente**: con una foto de prueba legible, el padre ve filas propuestas, edita una, descarta otra y confirma el resto; las confirmadas aparecen en la cartilla. Con una foto ilegible, el padre sigue pudiendo guardar la foto y capturar a mano.

**Escenarios de Aceptación**:

1. **Dado** una foto legible, **Cuando** el teléfono termina de leerla, **Entonces** se muestran las filas propuestas, todas editables, descartables y sin guardar.
2. **Dado** filas propuestas, **Cuando** el padre confirma solo algunas, **Entonces** solo esas se guardan en la cartilla.
3. **Dado** una foto que no se puede leer o una lectura sin resultados, **Cuando** termina, **Entonces** el flujo no se bloquea: se dice que no se encontró nada y el padre continúa a mano.
4. **Dado** una fila propuesta con un nombre que no coincide con ninguno de la lista, **Cuando** el padre la revisa, **Entonces** puede conservarlo como «otra» escrita por él o elegir una de la lista, nunca se reemplaza sin avisar.
5. **Dado** cualquier momento del flujo, **Cuando** se lee la imagen, **Entonces** no sale del teléfono más que la foto que el padre eligió guardar, y solo hacia su propia cuenta.

---

### Historia de Usuario 4 - Compartir la cartilla con la familia (Prioridad: P2)

La cartilla de un hijo sigue las mismas reglas de acceso que el resto de los datos del hijo: la dueña de la familia y los Tutores pueden agregar, corregir y borrar vacunas y fotos; un Cuidador puede ver la cartilla pero no cambiarla. Una persona ajena a la familia no ve nada.

**Por qué esta prioridad**: la cartilla es un dato del menor y debe respetar los permisos que ya existen; sin esto no puede salir a producción con familias compartidas.

**Prueba Independiente**: con una familia de dos personas (Tutor y Cuidador), el Tutor registra una vacuna y el Cuidador la ve sin poder editarla ni borrarla, y una tercera cuenta ajena recibe acceso denegado.

**Escenarios de Aceptación**:

1. **Dado** un Tutor invitado a la familia, **Cuando** abre la cartilla de un hijo, **Entonces** puede agregar, corregir y borrar vacunas y fotos.
2. **Dado** un Cuidador, **Cuando** abre la cartilla, **Entonces** ve las vacunas y las fotos pero no ve botones para agregar, corregir ni borrar, y el servidor rechaza esas acciones si las intenta por otra vía.
3. **Dado** una familia cuyo plan de pago terminó, **Cuando** un Tutor abre la cartilla, **Entonces** sigue viendo todo lo registrado, y las reglas de qué puede agregar son las mismas del resto de los datos del hijo.
4. **Dado** una cuenta ajena a la familia, **Cuando** intenta leer la cartilla de ese hijo, **Entonces** recibe el mismo acceso denegado que para cualquier dato de otra familia.

---

### Historia de Usuario 5 - Próxima dosis anotada en la cartilla (Prioridad: P3)

Cuando la cartilla de papel trae escrita la fecha de la próxima dosis que el médico indicó, el padre puede anotarla junto a la vacuna y, si su plan lo incluye, recibir un aviso ese día. La app no calcula ni sugiere ninguna fecha: solo recuerda la que el padre anotó.

**Por qué esta prioridad**: ayuda a no olvidar la fecha que el médico ya dio, reutiliza el mismo mecanismo de avisos de las citas, y es una función de plan de pago; pero el registro y la foto valen sin ella.

**Prueba Independiente**: un padre con plan de pago anota «próxima dosis: 3 nov» en una vacuna y recibe un aviso neutral ese día; un padre del plan gratuito ve el campo explicado como disponible en el plan completo y su cartilla sigue funcionando completa.

**Escenarios de Aceptación**:

1. **Dado** una vacuna registrada y un plan de pago, **Cuando** el padre anota una fecha de próxima dosis indicada por su médico, **Entonces** se guarda con la vacuna y el padre puede elegir recibir un aviso.
2. **Dado** una próxima dosis con aviso, **Cuando** llega el momento, **Entonces** el aviso dice solo qué anotó el padre y cuándo, sin palabras de urgencia ni consejos de salud.
3. **Dado** el plan gratuito, **Cuando** el padre abre el campo de próxima dosis, **Entonces** se le explica en palabras neutrales que ese aviso es del plan completo y todo lo demás de la cartilla sigue disponible.
4. **Dado** que la cuenta deja de pagar, **Cuando** pasa el tiempo, **Entonces** lo ya anotado se conserva y se sigue viendo, y solo deja de poderse agregar avisos nuevos.

---

### Casos Límite

- ¿Qué pasa si el padre agrega la misma vacuna, dosis y fecha dos veces? Se le avisa de forma neutral que ya está registrada y no se duplica sin su confirmación explícita.
- ¿Qué pasa con una fecha exactamente igual al día de nacimiento o al día de hoy? Son válidas.
- ¿Qué pasa si el hijo no tiene fecha de nacimiento confiable? La fecha de nacimiento ya es obligatoria al crear al hijo; se usa para rechazar fechas imposibles.
- ¿Qué pasa si la foto es muy pesada o de un formato que el navegador no puede reducir? Se guarda la original dentro del tamaño máximo; si lo excede, se explica y no se pierde lo capturado.
- ¿Qué pasa si dos tutores editan la misma vacuna al mismo tiempo? Gana el último cambio y ambos ven el resultado al refrescar; nunca se mezclan datos de hijos distintos.
- ¿Qué pasa si el padre cierra la pantalla con vacunas escritas sin guardar? Se le pregunta antes de salir, como en las demás pantallas con formulario.
- ¿Qué pasa con una cuenta sin conexión? Se explica con claridad que no se pudo guardar y no se pierde lo escrito.
- ¿Qué pasa si una vacuna del catálogo se retira? Las ya registradas se siguen viendo con su nombre; solo deja de ofrecerse para agregar nuevas.
- ¿Qué pasa si el padre escribe en una nota algo que parece una indicación médica? La app lo guarda tal cual lo escribió; no lo evalúa ni lo comenta.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

**Registro manual**
- **FR-001**: Los usuarios con acceso completo al hijo DEBEN poder agregar una vacuna a su cartilla indicando el nombre y la fecha de aplicación; el número de dosis, el lote, el lugar o médico y una nota son opcionales.
- **FR-002**: El nombre de la vacuna DEBE poder elegirse de una lista de nombres conocidos o escribirse libremente («otra»); lo escrito se conserva tal cual.
- **FR-003**: La fecha de aplicación NO DEBE ser futura ni anterior al nacimiento del hijo, y el mensaje de error DEBE decir cuál es el problema.
- **FR-004**: Los usuarios con acceso completo DEBEN poder corregir cualquier dato de una vacuna ya registrada y borrarla, previa confirmación neutral.
- **FR-005**: El sistema DEBE avisar, sin bloquear de forma definitiva, cuando se intente registrar de nuevo la misma vacuna con la misma dosis y fecha.

**Foto de la cartilla**
- **FR-006**: Los usuarios con acceso completo DEBEN poder guardar una o varias fotos de la cartilla de un hijo, tomándolas con la cámara o eligiéndolas de la galería del teléfono.
- **FR-007**: Antes de guardarla, la foto DEBE reducirse en el teléfono a un tamaño razonable; si no es posible, se guarda la original dentro de un tamaño máximo.
- **FR-008**: Cada hijo DEBE tener un tope de fotos de cartilla; al llegar al tope, el usuario DEBE recibir una explicación neutral y poder borrar una para dejar lugar, sin perder lo que ya capturó.
- **FR-009**: Quienes pueden ver la cartilla DEBEN poder abrir cada foto en grande y DEBE poder borrarla quien tiene acceso completo, previa confirmación.
- **FR-010**: Las fotos DEBEN guardarse solo en la cuenta y con el acceso del hijo al que pertenecen, y nunca compartirse con terceros.

**Lectura de la foto (ayuda)**
- **FR-011**: Tras elegir una foto, el sistema PUEDE proponer filas de vacunas leídas de la imagen, calculadas en el teléfono del usuario; si la lectura falla o no encuentra nada, el flujo DEBE continuar sin bloqueo.
- **FR-012**: Toda fila propuesta DEBE ser editable y descartable, y NO DEBE guardarse nada sin la confirmación explícita del usuario.
- **FR-013**: La imagen NO DEBE enviarse a ningún servicio externo para leerla; el único destino de la imagen es el almacenamiento de la propia cuenta, y solo si el usuario decide guardarla.

**Vista de la cartilla**
- **FR-014**: La cartilla de un hijo DEBE mostrar las vacunas agrupadas por nombre, con cada dosis aplicada y su fecha, ordenadas de forma estable, y las fotos guardadas.
- **FR-015**: La cartilla DEBE mostrar un estado vacío con una salida clara (agregar a mano o guardar una foto) cuando el hijo no tiene nada registrado.
- **FR-016**: La cartilla NUNCA DEBE indicar qué vacuna «toca», si falta alguna, si hay atrasos, si la cartilla está «completa» o «incompleta», ni mostrar alertas, semáforos o porcentajes de avance.
- **FR-017**: La app DEBE mostrar una frase neutral de que lo registrado es lo que el padre capturó y que no sustituye la cartilla ni el criterio del médico.
- **FR-018**: La cartilla DEBE funcionar en dos diseños (móvil y web de escritorio) como el resto de las pantallas con sesión.

**Acceso y planes**
- **FR-019**: El servidor DEBE decidir los permisos: la dueña y los Tutores tienen acceso completo (ver, agregar, corregir, borrar); el Cuidador solo ve; quien no pertenece a la familia no accede.
- **FR-020**: El registro de vacunas y las fotos de la cartilla DEBEN estar disponibles en el plan gratuito y en el de pago, sin límite por volumen de vacunas; lo registrado NUNCA DEBE ocultarse ni bloquearse al terminar un plan.
- **FR-021**: La próxima dosis anotada con aviso DEBE ser exclusiva del plan de pago; el servidor decide el plan al crearla, y lo ya creado se conserva y sigue avisando si la cuenta deja de pagar.
- **FR-022**: Los avisos de próxima dosis DEBEN usar texto neutral, sin imperativos ni urgencia, mencionar solo lo que el padre anotó, y respetar el mismo apagado por persona que los demás avisos.

**Privacidad y datos de salud de menores**
- **FR-023**: Las vacunas y sus fotos DEBEN tratarse como datos de salud de un menor: nunca anuncios, nunca venta ni cesión, y el texto del aviso de privacidad DEBE mencionarlas.
- **FR-024**: Los textos libres (nombre «otra», lugar, médico, nota) NO DEBEN aparecer en direcciones web, registros de errores ni mensajes de error; viajan solo en el cuerpo de las peticiones.
- **FR-025**: Cada vacuna y foto DEBE conservar quién la registró y cuándo.

**Calidad**
- **FR-026**: Todo el comportamiento anterior DEBE tener pruebas automáticas, incluida una prueba de redacción que verifique que ningún texto de la función aconseja, evalúa, urge ni usa semáforos (Principio I).

### Entidades Clave

- **Vacuna registrada**: una aplicación de una vacuna a un hijo: nombre (de la lista o escrito por el padre), fecha de aplicación, número de dosis opcional, lote opcional, lugar o médico opcional, nota opcional, quién la registró y cuándo. Pertenece a un hijo.
- **Catálogo de vacunas**: lista de nombres conocidos para elegir, mantenida sin publicar la app; solo nombres, sin edades, calendarios ni indicaciones.
- **Foto de la cartilla**: imagen de una página de la cartilla física de un hijo, con quién la guardó y cuándo; pertenece a un hijo y respeta el acceso de ese hijo.
- **Próxima dosis anotada** *(P3)*: fecha que el padre anotó junto a una vacuna, copiada de lo que indicó su médico, con sus avisos por persona.
- **Hijo**: ya existe; la cartilla cuelga de él y hereda sus permisos de familia.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Un padre puede registrar una vacuna a mano en menos de 1 minuto la primera vez y en menos de 30 segundos las siguientes.
- **SC-002**: Un padre puede guardar una foto de la cartilla en menos de 30 segundos desde que abre la pantalla.
- **SC-003**: El 100 % de las acciones de agregar, corregir y borrar vacunas o fotos las rechaza el servidor a quien solo tiene acceso de lectura o no pertenece a la familia.
- **SC-004**: Ninguna pantalla ni aviso de la función contiene palabras de consejo, evaluación, urgencia, atraso, «completa/incompleta», ni colores de alerta, verificado por una prueba automática de redacción.
- **SC-005**: Cuando la lectura de la foto falla o no encuentra nada, el 100 % de los casos permite continuar a mano sin perder la foto ni lo escrito.
- **SC-006**: Un padre con una cartilla de 20 vacunas ve la cartilla completa en menos de 2 segundos con conexión normal.
- **SC-007**: Lo registrado sigue visible tras terminar un plan de pago, en el 100 % de los casos probados.
- **SC-008**: Al menos 7 de cada 10 padres de prueba logran registrar al menos una vacuna o guardar una foto en su primer intento sin ayuda.

## Supuestos

- **Plan**: el registro de vacunas y las fotos son dato del hijo y van en ambos planes (Principio IV: nunca se limita por volumen ni se bloquea acceso a datos ya capturados). Solo el aviso de próxima dosis anotada es del plan de pago, igual que las citas; el servidor lo decide.
- **Sin cálculo ni esquema**: la app no calcula qué vacuna toca, no muestra el esquema oficial con edades ni fechas objetivo y no dice si hay atrasos (Principio I). El catálogo de la lista son solo nombres; su contenido se valida con la Cartilla Nacional de Salud vigente de la Secretaría de Salud antes de publicarse, y se amplía o retira sin publicar la app, como el catálogo de síntomas.
- **Corregible**: a diferencia de las consultas, las vacunas y las fotos pueden corregirse y borrarse, porque son una transcripción del papel que el padre puede haber capturado mal; la foto es la fuente de verdad.
- **Topes**: un máximo de 10 fotos por hijo (cada página de la cartilla); el tope exacto se confirma al planear.
- **Foto**: se trata como la foto de la receta (reducida en el teléfono, almacenada solo en la cuenta, sin servicios externos); la lectura en el teléfono reutiliza la misma ayuda de lectura de la receta, sin servicios de IA en la nube (decisión ya tomada del proyecto).
- **OCR best effort**: las cartillas suelen estar escritas a mano, así que la lectura se considera una ayuda opcional (P2) y no condiciona el valor de la función.
- **Permisos**: se reutilizan los niveles de la spec 032 (dueña y Tutor con acceso completo; Cuidador solo lectura; ajenos sin acceso); el rol «Hijo» queda para su propia entrega.
- **Aviso de privacidad**: el texto «Antes de empezar» y el aviso de privacidad se actualizan para mencionar vacunas y fotos de cartilla, lo que obliga a subir la versión del aviso para que cada cuenta lo vea una vez más.
- **Idioma y formato**: todo en español de México; fechas en el formato fijo ya usado en la app.
- **Fuera de alcance**: recordatorios de vacunas pendientes calculados por la app (spec aparte con asesoría médica y legal), importar registros oficiales o de otros sistemas, certificados o exportación oficial, vacunas de adultos o de mascotas, y la liga o PDF para el pediatra (ya en el backlog).
- **Dependencias**: cuentas con sesión, hijos y niveles de acceso familiar existentes; mecanismo de avisos y plan de pago existentes; ayuda de lectura de imagen en el teléfono ya usada en las recetas.
