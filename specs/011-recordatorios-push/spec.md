# Especificación de Funcionalidad: Recordatorios de tomas por notificaciones push

**Rama de la Funcionalidad**: `feature/011-recordatorios-push`

**Creado**: 2026-09-27

**Estado**: Borrador

**Entrada**: Descripción del usuario: "Recordatorios de tomas por notificaciones push web. El padre/tutor puede activar, por dispositivo, recordatorios que le avisan a la hora programada de cada toma de medicamento de sus hijos (las tomas ya existen con su hora programada, specs/004 y 006), aunque la app esté cerrada: en la PWA del teléfono (Android; en iPhone solo si instaló la PWA en la pantalla de inicio) y en el navegador de la PC (Chrome, Edge, Firefox). La app pide el permiso de notificaciones solo cuando el padre toca "Activar recordatorios" (nunca al abrir la app), guarda la suscripción de ese dispositivo en su cuenta, y el backend envía el aviso a todos los dispositivos activos de la cuenta cuando llega la hora de cada toma, una sola vez por toma. La notificación dice "Toma programada" con el medicamento, la hora y el nombre del hijo; al tocarla abre la consulta, y puede tener una acción "Tomada" que marca la toma sin abrir la app. Privacidad: el padre elige si la notificación muestra el detalle (medicamento e hijo) o un texto genérico ("Hay una toma programada"), porque se ve en la pantalla de bloqueo; el contenido viaja cifrado por los servicios de push de los navegadores. Principio I: el texto solo recuerda el horario que el padre registró, nunca "debes darle" ni ninguna indicación médica. El padre puede desactivar los recordatorios de un dispositivo en cualquier momento, y si el permiso se revoca o la suscripción caduca el backend deja de usarla. Se debe explicar que es una ayuda y no una alarma garantizada (el aviso llega tarde si el teléfono está apagado o sin datos). Las tomas ya marcadas como tomadas antes de su hora no se avisan. Fuera de alcance: exportar al calendario (.ics), recordatorios por correo o SMS, y avisos para tomas creadas antes de activar los recordatorios que ya pasaron. Requiere que el backend corra siempre (despliegue aún por decidir)."

## Aclaraciones

### Sesión 2026-09-27

- Q: ¿Los avisos empiezan mostrando el detalle o el texto genérico? → A: Ninguno por defecto: al activar los
  recordatorios por primera vez en la cuenta, el padre elige entre "Mostrar detalle" y "Texto genérico" antes de
  terminar; en los siguientes dispositivos ve la opción ya elegida y puede cambiarla.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Recibir el aviso a la hora de cada toma (Prioridad: P1)

Un padre registró una consulta con un medicamento cada 8 horas (spec 004). Activa los recordatorios en su teléfono. A la
hora de cada toma le llega un aviso del sistema, aunque tenga la app cerrada, que le recuerda la toma que él mismo
registró.

**Por qué esta prioridad**: Es el valor completo de la funcionalidad y parte del alcance MVP de la constitución
("recordatorios con dosis tomada", Principio V). Sin esto, el padre tiene que acordarse solo de cada toma.

**Prueba Independiente**: Con una cuenta con una consulta cuyas tomas empiezan en unos minutos, activar los recordatorios
en un dispositivo, cerrar la app y comprobar que llega un aviso por cada toma, a su hora.

**Escenarios de Aceptación**:

1. **Dado** un padre con sesión y una toma programada, **Cuando** toca "Activar recordatorios" y acepta el permiso del
   dispositivo, **Entonces** la app confirma que ese dispositivo recibirá recordatorios.
2. **Dado** un dispositivo con recordatorios activos y la app cerrada, **Cuando** llega la hora programada de una toma no
   marcada, **Entonces** el dispositivo muestra un aviso con el título "Toma programada".
3. **Dado** una toma que el padre ya marcó como tomada antes de su hora, **Cuando** llega esa hora, **Entonces** no se
   envía ningún aviso.
4. **Dado** un padre con recordatorios activos en su teléfono y en su PC, **Cuando** llega la hora de una toma,
   **Entonces** llega un aviso a cada uno de los dos dispositivos, y solo uno por toma en cada uno.
5. **Dado** un aviso recibido, **Cuando** el padre lo toca, **Entonces** se abre la app en el detalle de la consulta de esa
   toma (con sesión; si no la tiene, primero el login y después la consulta).

---

### Historia de Usuario 2 - Elegir qué muestra el aviso (Prioridad: P1)

El aviso se ve en la pantalla de bloqueo, donde cualquiera puede leerlo. El padre elige si muestra el detalle (medicamento,
hora y nombre del hijo) o un texto genérico que no revela nada de salud.

**Por qué esta prioridad**: Son datos de salud de menores (Principio II). Sin esta opción, activar los recordatorios
obligaría a exponer el nombre del medicamento y del hijo en una pantalla que no está protegida.

**Prueba Independiente**: Con los recordatorios activos, cambiar entre "Mostrar detalle" y "Texto genérico" y comprobar
el texto de los siguientes avisos.

**Escenarios de Aceptación**:

1. **Dado** un padre que activa los recordatorios por primera vez en su cuenta, **Cuando** acepta el permiso del
   dispositivo, **Entonces** la app le pide elegir entre "Mostrar detalle" y "Texto genérico", con un ejemplo de cómo se
   verá cada uno en la pantalla de bloqueo, y la activación no termina hasta que elige.
2. **Dado** un padre que ya eligió en otro dispositivo, **Cuando** activa los recordatorios en uno nuevo, **Entonces**
   no se le vuelve a preguntar: ve la opción elegida y puede cambiarla.
3. **Dado** la opción "Mostrar detalle", **Cuando** llega el aviso de una toma, **Entonces** dice "Toma programada" con el
   nombre del medicamento, la hora de la toma y el nombre del hijo (p. ej. "Amoxicilina · 8:00 · Mateo").
4. **Dado** la opción "Texto genérico", **Cuando** llega el aviso de una toma, **Entonces** dice solo "Hay una toma
   programada", sin medicamento ni hijo.
5. **Dado** cualquiera de las dos opciones, **Cuando** llega un aviso, **Entonces** su texto solo recuerda el horario
   registrado: nunca dice "debes darle", nunca sugiere dosis ni da ninguna indicación médica (Principio I).

---

### Historia de Usuario 3 - Marcar la toma desde el aviso (Prioridad: P2)

Cuando llega el aviso, el padre ya le dio el medicamento al niño. Toca "Tomada" en el propio aviso y la toma queda
marcada, sin abrir la app.

**Por qué esta prioridad**: Ahorra pasos en el momento en que el padre tiene las manos ocupadas, pero la toma también se
puede marcar desde la app como hoy (spec 004), así que no es imprescindible para el valor principal.

**Prueba Independiente**: Con un aviso recibido, tocar "Tomada" y comprobar en la app que esa toma aparece marcada.

**Escenarios de Aceptación**:

1. **Dado** un aviso de una toma no marcada, **Cuando** el padre toca "Tomada", **Entonces** esa toma queda marcada como
   tomada y así se ve en la app, en todos sus dispositivos.
2. **Dado** un navegador o sistema que no muestra botones en los avisos, **Cuando** llega el aviso, **Entonces** se sigue
   pudiendo tocar el aviso para abrir la consulta y marcarla ahí.
3. **Dado** la acción "Tomada" de un aviso, **Cuando** se usa, **Entonces** solo puede marcar esa toma concreta: no sirve
   para marcar otra toma ni para leer datos de la cuenta.

---

### Historia de Usuario 4 - Desactivar y administrar los dispositivos (Prioridad: P2)

El padre ya no quiere avisos en la PC, cambió de teléfono o se lo prestó a alguien. Desactiva los recordatorios de ese
dispositivo, y los dispositivos que ya no sirven dejan de recibirlos solos.

**Por qué esta prioridad**: Sin una forma de apagarlos, los avisos se vuelven una molestia o un riesgo de privacidad.

**Prueba Independiente**: Activar los recordatorios, desactivarlos desde la app y comprobar que ya no llegan avisos a ese
dispositivo mientras siguen llegando a los demás.

**Escenarios de Aceptación**:

1. **Dado** un dispositivo con recordatorios activos, **Cuando** el padre toca "Desactivar recordatorios", **Entonces**
   ese dispositivo deja de recibir avisos y los demás dispositivos de la cuenta siguen igual.
2. **Dado** un dispositivo con recordatorios activos, **Cuando** el padre cierra sesión en él, **Entonces** ese dispositivo
   deja de recibir los avisos de esa cuenta.
3. **Dado** un dispositivo en el que el padre quitó el permiso de notificaciones desde el navegador o el sistema, o cuya
   suscripción caducó, **Cuando** el sistema intenta avisarle, **Entonces** deja de usar ese dispositivo sin afectar a los
   demás.
4. **Dado** la app abierta en un dispositivo, **Cuando** el padre mira la opción de recordatorios, **Entonces** ve si están
   activos en ese dispositivo.

---

### Historia de Usuario 5 - Saber qué esperar de los recordatorios (Prioridad: P3)

Antes de activar los recordatorios, el padre entiende que son una ayuda y no una alarma garantizada, y en qué dispositivos
funcionan.

**Por qué esta prioridad**: Evita que un padre confíe en un aviso que puede no llegar (teléfono apagado, sin datos,
navegador cerrado), pero no bloquea el uso de la funcionalidad.

**Prueba Independiente**: Abrir la opción de recordatorios en un iPhone desde el navegador, en un iPhone con la app
instalada y en una PC, y comprobar el mensaje de cada caso.

**Escenarios de Aceptación**:

1. **Dado** la opción de recordatorios, **Cuando** el padre la abre, **Entonces** ve que los avisos son una ayuda, que
   pueden llegar tarde o no llegar si el dispositivo está apagado, sin conexión o con el navegador cerrado, y que debe
   seguir las indicaciones de su médico.
2. **Dado** un iPhone o iPad con la app abierta en el navegador (sin instalar), **Cuando** el padre abre la opción de
   recordatorios, **Entonces** en vez del botón de activar ve cómo agregar la app a la pantalla de inicio, que es lo que
   hace posibles los avisos en ese dispositivo.
3. **Dado** un navegador que no admite notificaciones, **Cuando** el padre abre la opción de recordatorios, **Entonces**
   ve que ese navegador no puede recibir recordatorios, en vez de un botón que no funciona.
4. **Dado** un dispositivo en el que el padre negó el permiso, **Cuando** vuelve a la opción, **Entonces** ve cómo
   volver a permitirlo desde la configuración del navegador o del sistema (la app no puede volver a preguntar).

---

### Casos Límite

- **Cambio de horario de verano / zona horaria**: la hora de cada toma ya es un instante real guardado con la zona del
  padre (spec 006). El aviso sale en ese instante y muestra la hora en la zona del dispositivo que lo recibe.
- **El sistema estuvo apagado o sin enviar un rato**: las tomas cuya hora pasó hace poco (hasta 60 minutos) se avisan en
  cuanto se pueda; las más viejas ya no se avisan, porque un aviso de horas atrás confunde más de lo que ayuda.
- **Tomas programadas antes de activar los recordatorios**: las que ya pasaron no se avisan; las futuras sí.
- **Varios hijos o varias consultas con tomas a la misma hora**: un aviso por toma (no se agrupan). Con el texto genérico
  cada aviso dice lo mismo, lo que el padre ya sabe al elegir esa opción.
- **Un dispositivo compartido por dos tutores**: al cerrar sesión el primero, su dispositivo deja de recibir sus avisos
  (Historia 4, escenario 2); si el segundo activa los recordatorios, el dispositivo recibe solo los del segundo.
- **La toma se marca como tomada entre que se envía el aviso y el padre lo ve**: el aviso ya salió y se queda; tocar
  "Tomada" en él no causa error, la toma sigue marcada.
- **"Tomada" pulsado sin conexión**: el padre ve que no se pudo marcar y puede hacerlo desde la app después.
- **La acción "Tomada" sobre una toma de una cuenta que ya no es la del dispositivo**: no marca nada.
- **El padre activa los recordatorios dos veces en el mismo dispositivo**: sigue siendo un solo dispositivo; no recibe
  avisos dobles.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: La app DEBE ofrecer, a un padre con sesión, la opción de activar los recordatorios en el dispositivo actual,
  accesible desde el home en los dos diseños (móvil y web).
- **FR-002**: La app DEBE pedir el permiso de notificaciones del dispositivo solo cuando el padre toca "Activar
  recordatorios", nunca al abrir la app ni de forma automática.
- **FR-003**: Al activar, el sistema DEBE registrar ese dispositivo como receptor de recordatorios de la cuenta; activar
  otra vez en el mismo dispositivo no crea un segundo registro.
- **FR-004**: El sistema DEBE enviar un aviso a cada dispositivo activo de la cuenta cuando llega la hora programada de
  cada toma de cualquiera de sus hijos que no esté marcada como tomada, aunque la app esté cerrada.
- **FR-005**: El sistema DEBE enviar como máximo un aviso por toma y por dispositivo, aunque se reinicie o reintente.
- **FR-006**: El sistema NO DEBE enviar el aviso de una toma que ya estaba marcada como tomada a su hora, ni de una toma
  cuya hora pasó hace más de 60 minutos.
- **FR-007**: El aviso DEBE decir "Toma programada" y, según la preferencia del padre, el medicamento, la hora de la toma y
  el nombre del hijo, o solo "Hay una toma programada". Ningún aviso puede contener indicaciones, dosis sugeridas ni
  frases imperativas sobre la salud del niño (Principio I).
- **FR-008**: El padre DEBE poder elegir entre "Mostrar detalle" y "Texto genérico"; la preferencia es de la cuenta y
  aplica a todos sus dispositivos. No hay valor por defecto: la primera activación de la cuenta DEBE pedir la elección,
  mostrando un ejemplo de cada una, antes de dar los recordatorios por activados; después se puede cambiar en cualquier
  momento desde la opción de recordatorios.
- **FR-009**: Tocar el aviso DEBE abrir la app en el detalle de la consulta de esa toma, pasando antes por el login si el
  dispositivo no tiene sesión.
- **FR-010**: El aviso DEBE ofrecer la acción "Tomada" donde el sistema operativo lo permita; usarla DEBE marcar esa toma
  como tomada exactamente como si se marcara en la app (spec 004), y DEBE servir solo para esa toma.
- **FR-011**: El padre DEBE poder desactivar los recordatorios del dispositivo actual en cualquier momento; a partir de ese
  momento ese dispositivo no recibe avisos.
- **FR-012**: Al cerrar sesión, el dispositivo DEBE dejar de recibir los recordatorios de esa cuenta.
- **FR-013**: Cuando el servicio de avisos del navegador indica que un dispositivo ya no es válido (permiso retirado,
  suscripción caducada), el sistema DEBE dejar de usarlo sin afectar a los demás dispositivos.
- **FR-014**: La opción de recordatorios DEBE mostrar si están activos en el dispositivo actual y DEBE explicar que son una
  ayuda y no una alarma garantizada (pueden llegar tarde o no llegar si el dispositivo está apagado, sin conexión o con el
  navegador cerrado).
- **FR-015**: En un iPhone o iPad con la app abierta en el navegador (sin instalar), la opción DEBE explicar cómo agregarla
  a la pantalla de inicio en vez de ofrecer activar; en un navegador sin notificaciones DEBE decir que no las admite; con
  el permiso negado DEBE explicar cómo volver a permitirlo.
- **FR-016**: El contenido de cada aviso DEBE viajar cifrado de extremo a extremo hasta el dispositivo, de modo que los
  servicios de avisos de los navegadores no puedan leerlo, y NO DEBE contener el correo del padre ni identificadores de la
  cuenta más allá de lo necesario para abrir la consulta o marcar la toma.
- **FR-017**: Un padre solo DEBE poder registrar, ver y desactivar dispositivos de su propia cuenta, y los avisos de una
  cuenta NO DEBEN llegar nunca a un dispositivo registrado por otra (mismo aislamiento que la spec 008).
- **FR-018**: Los recordatorios DEBEN estar disponibles en el plan gratuito (son parte del alcance MVP y no se limitan por
  plan, Principio IV).
- **FR-019**: Los errores del registro de dispositivos y de la acción "Tomada" DEBEN quedar en el registro de errores del
  sistema como cualquier otra operación del sistema (spec 002), sin guardar el contenido de la suscripción ni el texto del aviso.

### Entidades Clave

- **Dispositivo de recordatorios**: un navegador o PWA instalada en el que un padre activó los recordatorios. Pertenece a
  una cuenta; guarda lo que el servicio de avisos del navegador necesita para hacerle llegar mensajes cifrados, cuándo se
  activó y si sigue activo.
- **Preferencia de recordatorios**: de la cuenta; si los avisos muestran el detalle o el texto genérico.
- **Aviso enviado**: la constancia de que ya se avisó una toma a un dispositivo, para no repetirla (FR-005). Se relaciona
  con una toma existente (spec 004) y con un dispositivo.
- **Toma** (existente, spec 004/006): ya tiene su hora programada como instante real y su estado tomada/no tomada; esta
  funcionalidad solo la lee y, con la acción "Tomada", la marca.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Con el dispositivo encendido y conectado, el 95% de los avisos llega en menos de 2 minutos después de la hora
  programada de la toma.
- **SC-002**: Ninguna toma genera más de un aviso por dispositivo (0 duplicados en las pruebas de aceptación, incluidas las
  que reinician el sistema durante el envío).
- **SC-003**: Ninguna toma marcada como tomada antes de su hora genera aviso.
- **SC-004**: Un padre activa los recordatorios en un dispositivo, incluida la elección del texto la primera vez, en
  menos de 45 segundos y con un solo permiso del sistema.
- **SC-005**: Con "Texto genérico", ningún aviso contiene el nombre de un medicamento, de un hijo ni ningún otro dato de
  salud (revisión de todos los textos de aviso en las pruebas).
- **SC-006**: Tras desactivar los recordatorios o cerrar sesión en un dispositivo, ese dispositivo recibe 0 avisos de la
  cuenta.
- **SC-007**: Una sesión nunca puede registrar un dispositivo en otra cuenta ni marcar con "Tomada" una toma de otra cuenta
  (0 casos en las pruebas de aislamiento).
- **SC-008**: Marcar una toma desde el aviso se refleja en la app de todos los dispositivos de la cuenta la próxima vez
  que se abre o recarga.

## Supuestos

- La hora de cada toma ya se guarda como un instante real en la zona del padre (specs 004 y 006); esta funcionalidad no
  cambia cómo se generan las tomas.
- Se avisa a la hora exacta de la toma, sin anticipación y sin repetir si no se marca (una posible "anticipación de N
  minutos" o "recordar de nuevo" queda para después).
- Un aviso por toma, sin agrupar las tomas simultáneas.
- Todos los hijos de la cuenta generan avisos; no hay activación por hijo en esta versión.
- La opción de recordatorios vive en el home (en ambos diseños); no existe todavía una pantalla de configuración.
- Dispositivos compatibles: Android (navegador o PWA instalada), iPhone/iPad solo con la PWA instalada en la pantalla de
  inicio, y navegadores de escritorio que admiten notificaciones (Chrome, Edge, Firefox; en PC el navegador debe seguir
  abierto en segundo plano).
- El backend debe correr todo el tiempo para enviar los avisos a su hora; el despliegue sigue pendiente (BACKLOG.md,
  "Despliegue"). En desarrollo local los avisos solo salen mientras el backend local corre.
- Hoy la app no puede recibir avisos con la app cerrada; esta funcionalidad agrega esa capacidad, pero no el uso sin
  conexión de la PWA (ver pantallas sin internet), que queda fuera.
- Fuera de alcance: exportar las tomas al calendario (.ics), recordatorios por correo o SMS, avisos de tomas que ya
  pasaron antes de activar, y avisos al médico o a otros tutores.
