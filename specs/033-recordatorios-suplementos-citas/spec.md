# Especificación de Funcionalidad: Recordatorios de suplementos y de próxima cita

**Rama de la Funcionalidad**: `feature/033-recordatorios-suplementos-citas`

**Creado**: 2026-10-06

**Estado**: Aclarada, lista para planear

**Entrada**: Descripción del usuario: «Recordatorios de suplementos y de citas (plan de pago, compartido con la familia). Rutinas de suplementos por hijo —y para el propio padre/madre/tutor—, con tomas marcables y avisos por persona; y una "Próxima cita" al registrar una consulta, con avisos un día antes y dos horas antes, editables.» Decisiones del dueño del producto (2026-10-06): (1) solo plan de pago; (2) se comparte con la familia; (3) avisos de cita por defecto un día antes y dos horas antes, que el padre puede editar.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Rutina de suplementos de un hijo (Prioridad: P1)

El padre, madre o tutor registra en el detalle de un hijo una rutina de suplemento (por ejemplo «Vitamina D, todos los días a las 8:00») sin que tenga que ver con una consulta. La app genera las tomas, las muestra en el calendario y en «Tomas de hoy», avisa a la hora de cada una y permite marcarlas como tomadas, igual que las tomas de un medicamento.

**Por qué esta prioridad**: es el valor central de la función y lo que más se repite en el día a día: no dar dos veces ni olvidar un suplemento. Reutiliza lo que ya existe (tomas marcables, avisos, familia), así que es la porción más chica que ya aporta valor completo.

**Prueba Independiente**: con una cuenta de pago y un hijo, crear «Vitamina D · diario · 08:00» y comprobar que aparecen sus tomas, que llega un aviso a la hora de la primera, que se marca como tomada y que desaparece de «por marcar»; todo sin tocar ninguna consulta.

**Escenarios de Aceptación**:

1. **Dado** una cuenta de pago con un hijo, **Cuando** el padre crea una rutina con nombre, horario y periodicidad, **Entonces** la rutina aparece en la sección «Suplementos» del hijo y sus tomas de hoy y de los próximos días aparecen marcables.
2. **Dado** una rutina con una toma a las 08:00 y un dispositivo con avisos activados, **Cuando** llega esa hora y la toma no está marcada, **Entonces** la persona recibe un aviso de esa toma, y solo uno.
3. **Dado** una toma vencida, **Cuando** el padre la marca como tomada, **Entonces** se ve «tomada» con quién la marcó y a qué hora («por Ana, 08:05»), y nadie recibe aviso de ella.
4. **Dado** una rutina «cada 8 horas» con primera toma a las 06:00, **Cuando** se guarda, **Entonces** se generan tomas a las 06:00, 14:00 y 22:00 cada día.
5. **Dado** una rutina sin fecha de fin, **Cuando** pasan los días, **Entonces** siempre hay tomas próximas por marcar sin que el padre tenga que volver a crearla.

---

### Historia de Usuario 2 - Compartir las rutinas con la familia y respetar el plan (Prioridad: P1)

Los Tutores y Cuidadores de la familia ven las rutinas de los hijos y reciben los avisos de cada toma, cada uno en su dispositivo y con su propia elección de aviso con detalle o genérico. Un Cuidador marca tomas pero no crea ni cambia rutinas; un Tutor sí. Solo el plan de pago puede crear rutinas y citas; el plan gratuito sigue viendo y marcando lo que ya exista.

**Por qué esta prioridad**: lo que más vale es no dar dos veces la misma toma (principio de la spec 032). Sin compartir, la rutina pierde su razón de ser en una familia con varias personas cuidando.

**Prueba Independiente**: una familia de pago con un Tutor y un Cuidador; la rutina de un hijo envía un aviso a cada uno; la marca de uno aparece en el teléfono del otro con su nombre y el otro ya no recibe aviso; el Cuidador no ve «Nueva rutina»; una cuenta gratuita no puede crear.

**Escenarios de Aceptación**:

1. **Dado** una familia con un Tutor y un Cuidador con dispositivo, **Cuando** vence una toma de suplemento sin marcar, **Entonces** cada uno recibe un solo aviso, con su propio detalle o texto genérico.
2. **Dado** que el Tutor ya marcó la toma, **Cuando** el Cuidador abre la app, **Entonces** la ve marcada «por Luis» y no recibió aviso.
3. **Dado** un Cuidador, **Cuando** abre el detalle del hijo, **Entonces** ve los suplementos y puede marcar tomas, pero no ve «Nueva rutina» ni opciones de editar, pausar o finalizar, y si lo intenta por otra vía el servidor lo rechaza.
4. **Dado** una cuenta gratuita, **Cuando** intenta crear una rutina, **Entonces** ve el aviso del plan completo y no se crea nada; lo que ya hubiera registrado se sigue viendo y marcando.
5. **Dado** una persona invitada a una familia que dejó de pagar, **Cuando** abre las rutinas, **Entonces** las ve y marca tomas, pero no crea ni cambia nada (solo lectura que sigue marcando).

---

### Historia de Usuario 3 - Pausar, editar y finalizar una rutina (Prioridad: P2)

El padre puede pausar una rutina (por ejemplo, durante un viaje o porque el pediatra lo indicó), reanudarla, cambiar sus horarios o su periodicidad, y finalizarla. A diferencia de las consultas, que son un registro médico inmutable, las rutinas son del padre y se pueden cambiar; lo ya marcado nunca se pierde.

**Por qué esta prioridad**: las rutinas cambian con frecuencia (se ajusta una hora, se suspende un suplemento) y sin poder editar el padre tendría que borrar y recrear; pero la función ya aporta valor sin esto.

**Prueba Independiente**: crear una rutina, marcar algunas tomas, cambiar el horario y comprobar que las tomas ya marcadas y las pasadas se conservan y que las futuras siguen el horario nuevo; pausar y comprobar que dejan de generarse avisos; reanudar y finalizar.

**Escenarios de Aceptación**:

1. **Dado** una rutina activa, **Cuando** el padre la pausa, **Entonces** deja de avisar y de generar tomas nuevas, las tomas marcadas siguen visibles y la rutina aparece como «Pausada».
2. **Dado** una rutina pausada, **Cuando** el padre la reanuda, **Entonces** vuelve a generar tomas desde ese momento, sin crear tomas «atrasadas» del tiempo en pausa.
3. **Dado** una rutina con tomas ya marcadas, **Cuando** el padre cambia el horario, **Entonces** las tomas pasadas y las marcadas no cambian y las futuras sin marcar siguen el horario nuevo.
4. **Dado** una rutina, **Cuando** el padre la finaliza, **Entonces** deja de generar tomas y avisos, no se puede reanudar, y el historial de tomas queda visible («Terminada el 30 sep · 12 de 14 tomas»).

---

### Historia de Usuario 4 - Próxima cita al registrar una consulta (Prioridad: P2)

Al registrar una consulta, el padre puede anotar la «Próxima cita» que le dio el pediatra: fecha, hora y una nota opcional. La app avisa por defecto un día antes y dos horas antes.

**Por qué esta prioridad**: es el momento natural (el pediatra la indica en la consulta) y cubre el recordatorio que más se olvida. Es independiente de los suplementos.

**Prueba Independiente**: registrar una consulta con «Próxima cita» dentro de dos días y comprobar que aparece en el detalle del hijo y de la consulta y que se programan los dos avisos por defecto.

**Escenarios de Aceptación**:

1. **Dado** el formulario «Nueva consulta», **Cuando** el padre llena «Próxima cita» (fecha y hora) y guarda, **Entonces** la cita queda ligada a la consulta, se ve en el detalle del hijo como «Próxima cita» y se programan avisos un día antes y dos horas antes.
2. **Dado** una cita para dentro de 3 horas, **Cuando** se guarda, **Entonces** solo se programa el aviso que todavía está en el futuro (dos horas antes) y no se manda uno atrasado.
3. **Dado** el formulario, **Cuando** el padre pone una fecha anterior a la de la consulta, **Entonces** el campo marca un error y no se guarda hasta corregirlo.
4. **Dado** una consulta sin «Próxima cita», **Cuando** se guarda, **Entonces** funciona exactamente como hoy.
5. **Dado** una cuenta gratuita, **Cuando** abre «Nueva consulta», **Entonces** el campo «Próxima cita» se ve deshabilitado con «Disponible en el plan completo» y el resto del formulario funciona igual.

---

### Historia de Usuario 5 - Editar avisos y estado de la cita, o agregarla después (Prioridad: P3)

El padre puede cambiar cuándo se avisa de una cita (agregar, quitar o cambiar las antelaciones), marcarla como realizada o cancelada, cambiarle la fecha, y agregar la cita a una consulta que ya había guardado sin ella.

**Por qué esta prioridad**: las citas se reprograman y a veces se anotan después; pero el valor principal ya está en la historia 4.

**Prueba Independiente**: abrir una cita, cambiar los avisos a «el mismo día, 3 horas antes», marcar «Realizada» y comprobar que deja de avisar; agregar una cita a una consulta antigua.

**Escenarios de Aceptación**:

1. **Dado** una cita con los avisos por defecto, **Cuando** el padre cambia los avisos (por ejemplo, quita «un día antes» y agrega «tres horas antes»), **Entonces** solo se envían los avisos nuevos.
2. **Dado** una cita, **Cuando** el padre la marca «Realizada» o «Cancelada», **Entonces** deja de avisar, se conserva visible en el historial con su estado y no cuenta como «próxima».
3. **Dado** una consulta guardada sin cita, **Cuando** el padre agrega una «Próxima cita» desde su detalle, **Entonces** se programa igual que si la hubiera puesto al crearla; el resto de la consulta (doctor, fecha, foto, medicamentos, síntomas, notas) no cambia.
4. **Dado** una cita pasada que nadie marcó, **Cuando** llega su hora, **Entonces** se muestra como pasada (sin alarma) y el padre puede marcarla realizada o cancelada.
5. **Dado** una familia, **Cuando** un Tutor edita la cita, **Entonces** los demás ven el cambio y los avisos ya enviados no se repiten; un Cuidador la ve pero no la edita.

---

### Historia de Usuario 6 - Suplementos del propio padre, madre o tutor (Prioridad: P3)

La persona que usa la cuenta también puede crear rutinas de suplementos **para sí misma** (por ejemplo, un suplemento propio), con las mismas tomas marcables y avisos, en una sección personal. Esas rutinas no se comparten con la familia salvo que más adelante se decida lo contrario.

**Por qué esta prioridad**: pedido explícito del dueño del producto, pero se aparta del foco pediátrico del producto; va al final y conviene entregarlo por separado.

**Prueba Independiente**: con una cuenta de pago, crear una rutina personal, comprobar que aparece solo en la sección personal de esa cuenta, que avisa solo a esa persona y que su pareja (otro Tutor de la familia) no la ve ni recibe avisos.

**Escenarios de Aceptación**:

1. **Dado** una cuenta de pago, **Cuando** la persona crea una rutina «Para mí», **Entonces** aparece en su sección personal y sus tomas se marcan igual que las de un hijo.
2. **Dado** una rutina personal, **Cuando** otro integrante de la familia abre la app, **Entonces** no la ve ni recibe avisos de ella.
3. **Dado** una persona invitada como Cuidador o Tutor, **Cuando** crea su propia rutina personal, **Entonces** necesita que **su propia cuenta** (o la que la invitó, si no tiene) sea de pago [ver Supuestos].
4. **Dado** la pantalla de rutinas personales, **Cuando** se abre por primera vez, **Entonces** se muestra el aviso de que la app solo recuerda lo que la persona registró y no sugiere ni opina sobre suplementos.

---

### Casos Límite

- **Cambio de hora o de zona horaria**: las tomas y los avisos se calculan en la hora local de quien creó la rutina, como las tomas de medicamentos; un viaje no debe duplicar ni perder avisos.
- **Rutina «cada N horas» que cruza la medianoche**: las tomas siguen su cadencia sin reiniciar por día.
- **Muchas rutinas**: hay un tope razonable de rutinas activas por hijo y por persona; al llegar al tope se explica y se pide finalizar o pausar una.
- **Aviso cuyo momento ya pasó al guardar** (cita muy próxima o primera toma de hace un rato): no se manda un aviso atrasado; solo los que siguen en el futuro.
- **Dos personas marcan la misma toma a la vez**: gana la primera y la otra ve la toma como ya marcada (mismo comportamiento que las tomas de medicamentos).
- **Edición que deja una toma sin sentido** (se cambia el horario después de que ya pasó): las pasadas no cambian nunca; solo las futuras sin marcar.
- **Persona que sale o es quitada de la familia**: deja de recibir avisos y de ver las rutinas y citas desde el siguiente aviso; sus marcas pasadas se conservan con su nombre.
- **Cuenta que deja de pagar**: los avisos de lo ya creado siguen llegando y todo se sigue viendo y marcando; solo se bloquea crear y editar (FR-020); nada se oculta ni se borra.
- **Nombre de suplemento o nota con datos de salud**: nunca aparece en la dirección de una petición ni en los registros de errores; los avisos genéricos no llevan nombre del suplemento ni del hijo.
- **Cita eliminada de una consulta cancelada**: la consulta es un registro inmutable; una cita se cancela (queda visible), no se borra.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

**Rutinas de suplementos**

- **FR-001**: El sistema DEBE permitir a un padre, madre o tutor de una cuenta de pago crear una rutina de suplemento para un hijo con: nombre, hora(s) del día, periodicidad (todos los días, ciertos días de la semana o cada N horas), primera toma, fecha de fin opcional (sin fin por omisión) y nota opcional.
- **FR-002**: El sistema DEBE generar a partir de la rutina las tomas marcables, de modo que siempre existan tomas próximas mientras la rutina esté activa y sin fin, sin que el padre las recree.
- **FR-003**: El sistema DEBE mostrar las tomas de suplemento junto a las de medicamentos en «Tomas de hoy» y en el calendario del hijo, distinguiéndolas con el nombre de la rutina y la etiqueta «Suplemento», con el mismo chip, estados (por marcar, tomada, sin registrar) y progreso.
- **FR-004**: El sistema DEBE permitir marcar y desmarcar una toma de suplemento con las mismas reglas de las tomas de medicamentos: la primera marca gana, se guarda quién y cuándo la marcó, y solo el autor o quien puede todo desmarca la ajena.
- **FR-005**: El sistema DEBE permitir pausar, reanudar, editar (nombre, horarios, periodicidad, fin, nota) y finalizar una rutina. Una rutina finalizada no se reanuda.
- **FR-006**: Una edición DEBE afectar solo a las tomas futuras sin marcar; las pasadas y las marcadas NUNCA cambian ni se ocultan. Reanudar no crea tomas atrasadas del periodo en pausa.
- **FR-007**: El sistema DEBE mostrar, por cada rutina, su estado (activa, pausada, finalizada), su periodicidad en lenguaje natural y su progreso, sin evaluar ni aconsejar.

**Próxima cita**

- **FR-008**: El sistema DEBE permitir, al registrar una consulta, anotar opcionalmente una «Próxima cita» con fecha, hora y nota opcional, ligada a esa consulta y a su doctor.
- **FR-009**: La fecha de la próxima cita NO PUEDE ser anterior a la de la consulta; el formulario debe indicar el error junto al campo.
- **FR-010**: El sistema DEBE programar por defecto avisos **un día antes** y **dos horas antes** de la cita, y no programar los que ya pasaron al guardar.
- **FR-011**: El padre DEBE poder cambiar los avisos de una cita: agregar, quitar o modificar las antelaciones, con un máximo razonable de avisos por cita.
- **FR-012**: El padre DEBE poder cambiar la fecha y la nota de una cita, marcarla «Realizada» o «Cancelada», y agregar una próxima cita a una consulta ya guardada. Una cita nunca se borra; su estado queda visible.
- **FR-013**: Agregar o editar la cita NO DEBE cambiar ningún otro dato de la consulta (doctor, fecha, foto, medicamentos, síntomas, notas, tomas): es una excepción acotada a la inmutabilidad de la spec 004, porque la cita no es parte del registro médico.
- **FR-014**: El sistema DEBE mostrar la próxima cita pendiente más cercana en el detalle del hijo y en el de la consulta, y las citas realizadas, canceladas o pasadas como historial.

**Suplementos propios de la persona**

- **FR-015**: El sistema DEBE permitir a la persona de la cuenta crear, ver, marcar, pausar, editar y finalizar rutinas de suplemento **para sí misma**, en una sección personal separada de los hijos.
- **FR-016**: Las rutinas personales NO DEBEN ser visibles ni generar avisos para otros integrantes de la familia.

**Avisos y familia**

- **FR-017**: Los avisos de tomas de suplemento y de citas DEBEN llegar por persona: a cada integrante con acceso al hijo y un dispositivo activo, a lo más un aviso por toma (o por aviso de cita) y persona, ninguno si la toma ya está marcada, con el texto genérico o con detalle que esa persona eligió. Las rutinas personales avisan solo a su dueña.
- **FR-018**: Los avisos de suplemento DEBEN tener la acción «Tomada» igual que los de medicamentos. Los textos son neutros: nunca imperativos ni consejos.
- **FR-019**: Tutores y Cuidadores de la familia DEBEN ver las rutinas y citas de los hijos. Un Cuidador puede marcar tomas pero NO crear, editar, pausar, finalizar rutinas ni crear o editar citas; un Tutor sí. El servidor rechaza lo no permitido aunque el cliente lo intente.

**Plan**

- **FR-020**: Crear y editar rutinas y citas DEBE ser exclusivo del plan de pago, decidido por el servidor (nunca por el cliente). La cuenta gratuita sigue viendo y marcando lo ya registrado, y ve el aviso del plan completo al intentar crear. Cuando una cuenta deja de pagar, los avisos de las rutinas y citas ya creadas SIGUEN enviándose (decidido el 2026-10-06): solo se bloquea crear y editar, y la app lo dice con claridad.
- **FR-021**: Una persona invitada que quede en solo lectura porque la familia dejó de pagar DEBE seguir viendo todo y pudiendo marcar tomas de suplemento, sin crear ni cambiar rutinas ni citas.

**Principios y privacidad**

- **FR-022**: La app SOLO registra y recuerda lo que el padre capturó: NO DEBE sugerir suplementos, dosis, horarios ni fechas, ni ofrecer catálogo, interacciones, alertas o evaluaciones (Principio I).
- **FR-023**: Lo escrito por el padre (nombre del suplemento, notas) NO DEBE viajar en la dirección de ninguna petición ni quedar en los registros de errores; los avisos genéricos no llevan nombre de suplemento, de hijo ni de doctor (Principio II).
- **FR-024**: Nada de lo ya registrado se oculta ni se borra por bajar de plan, pausar, finalizar o salir de una familia (Principio IV).
- **FR-025**: Cada pantalla nueva DEBE tener su diseño móvil y su diseño web separados, y sus flujos probados a 390 y 1280 px.

### Entidades Clave *(incluir si la funcionalidad involucra datos)*

- **Rutina de suplemento**: lo que el padre quiere recordar tomar. Pertenece a un hijo o a la propia persona; tiene nombre, horarios, periodicidad, primera toma, fin opcional, nota opcional y estado (activa, pausada, finalizada).
- **Toma de suplemento**: una ocurrencia de la rutina a una hora; se marca como tomada con autor y hora, igual que una toma de medicamento; puede estar por marcar, tomada o sin registrar.
- **Próxima cita**: fecha y hora anotadas en una consulta, con nota opcional y estado (pendiente, realizada, cancelada). Es del padre, no del registro médico.
- **Aviso de cita**: una antelación (por ejemplo «1 día antes», «2 horas antes») que dispara un recordatorio de la cita; editable.
- **Recordatorio**: el aviso que recibe una persona por una toma o por un aviso de cita; a lo más uno por persona y por ocurrencia.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Un padre crea una rutina de suplemento diaria para un hijo y la ve con sus primeras tomas en menos de 1 minuto.
- **SC-002**: El 100 % de las tomas de suplemento vencidas sin marcar genera exactamente un aviso por persona con acceso y dispositivo, y ninguno si ya estaba marcada.
- **SC-003**: Una toma marcada por una persona se ve marcada, con su nombre, en el teléfono de las demás en menos de 1 minuto.
- **SC-004**: Una cita guardada con los valores por defecto genera dos avisos (un día antes y dos horas antes) en el 100 % de los casos en que esos momentos aún no pasaron, y ninguno atrasado.
- **SC-005**: Ningún Cuidador, cuenta gratuita ni persona en solo lectura puede crear o cambiar una rutina o una cita (0 casos en las pruebas por rol), y todos pueden seguir viendo y, cuando corresponde, marcando.
- **SC-006**: Editar o pausar una rutina, o cambiar los avisos de una cita, nunca modifica una toma pasada ni una marca (0 casos en las pruebas).
- **SC-007**: Ninguna petición lleva el nombre de un suplemento o una nota en su dirección, y ningún registro de errores contiene esos textos (verificado por prueba).
- **SC-008**: Las pantallas nuevas funcionan sin desplazamiento horizontal a 390 px y se usan completas a 1280 px en los flujos principales.

## Aclaraciones

### Sesión 2026-10-06

- Q: ¿Qué pasa con los avisos ya creados si la cuenta deja de pagar? → A: se siguen enviando; solo se bloquea crear y editar.
- Supuestos de la spec confirmados por el dueño del producto: rutinas personales no compartidas y avisan solo a su dueña, entrega en 3 PR, topes iniciales (10 rutinas activas, 5 avisos por cita), una cita por consulta, editar nunca cambia lo pasado ni lo marcado.

## Supuestos

- **Entrega por partes**: (1) rutinas de suplementos de hijos con familia y plan (historias 1–3), (2) próxima cita (historias 4–5), (3) rutinas personales del padre (historia 6). Cada parte es un PR; la primera no depende de las demás.
- **Rutinas personales (historia 6)**: se interpretan como suplementos de la propia persona de la cuenta. Se alejan del foco pediátrico del producto y exigen un texto de privacidad propio, por lo que se entregan al final y pueden recortarse sin afectar el resto. Se asume que no se comparten (ni con la pareja) y que avisan solo a su dueña.
- **Quién paga las rutinas personales**: la regla de plan de la persona es la de **su propia cuenta**; si es una persona invitada a una familia de pago, puede usarlas mientras esa familia pague (misma lógica de «familia de pago» de la spec 032).
- **Hora local**: igual que las tomas de medicamentos, el cliente manda su diferencia horaria y las tomas se calculan en la hora local de quien crea la rutina o la cita.
- **Tomas de suplemento** se tratan como tomas normales: mismos estados («por marcar», «tomada», «sin registrar»), mismas reglas de marcar y desmarcar, mismo progreso; la regla de «sin registrar» usa la cadencia de la rutina.
- **Topes**: hasta 10 rutinas activas por hijo y por persona, y hasta 5 avisos por cita; son valores iniciales que se pueden subir sin cambiar el diseño.
- **Cita**: una por consulta (la «próxima»); varias citas sueltas no ligadas a una consulta son futuro (opción E del análisis). Si la consulta ya tiene una cita pendiente y se agrega otra, reemplaza a la anterior, que queda como cancelada en el historial.
- **Canal de avisos**: notificaciones push de la app instalada (spec 011); sin correo, SMS ni WhatsApp.
- **Aviso de privacidad**: el texto de «Antes de empezar» y su versión se actualizan para mencionar los suplementos y las citas.
- **Dependencias**: reutiliza los dispositivos, el reclamo de avisos por persona y los permisos por nivel de las specs 011 y 032, y la regla de plan decidida por el servidor de las specs 030 y 031.
- **Fuera de alcance**: cobro con Mercado Pago, correo saliente, citas sueltas sin consulta, sugerencias o catálogo de suplementos, interacciones medicamentosas, SMS o WhatsApp, PDF, compartir las rutinas personales.
