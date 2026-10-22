# Especificación de Funcionalidad: Dispositivo del hijo

**Rama de la Funcionalidad**: `feature/047-dispositivo-del-hijo`

**Creado**: 2026-10-22

**Estado**: Borrador

**Entrada**: Descripción del usuario: "Dispositivo del hijo (spec 047, completa la Entrega 3 «rol Hijo» de la spec 032). En lugar de que el hijo inicie sesión con una cuenta propia, la persona Tutora genera para un hijo una liga de un solo uso; quien la abre (el teléfono del niño) recibe una credencial de dispositivo propia de ese hijo, sin correo, sin contraseña y sin datos personales del menor. El hijo ve solo lo suyo (sus tomas de hoy, sus suplementos y sus actividades) y puede marcarlas. Solo plan de pago. La edad queda a responsabilidad del padre."

## Contexto

La spec 032 (compartir con la familia) dejó el rol **Hijo** para una tercera entrega y anotó dos problemas: el consentimiento y la edad legal, y que el proveedor de cuentas quizá no admita menores. Esta spec lo resuelve **sin cuenta para el menor**: el padre da acceso a **un teléfono**, no a una persona con correo. Sustituye lo que la spec 032 decía del rol Hijo (invitación por correo, 10 años o más, consentimiento declarado): ya no hay invitación ni cuenta, y la edad es decisión del padre.

Lo que el hijo puede hacer es lo mismo que ya hace un Cuidador sobre ese hijo (**ver y marcar**), recortado a **solo sus tomas, suplementos y actividades**. Nada nuevo médicamente (Principio I): la app sigue registrando lo que el padre escribió.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Darle el acceso a un hijo y que lo use sin iniciar sesión (Prioridad: P1)

Una persona Tutora (o la dueña) con plan de pago entra a la ficha de su hijo Mateo, toca **«Acceso del hijo»**, le pone un nombre al aparato («Teléfono de Mateo») y obtiene una **liga**. La copia y se la manda al teléfono del niño (por el medio que ella elija). Al abrir la liga, el teléfono del niño queda vinculado y le muestra directamente sus tomas de hoy, sin pedir correo, contraseña ni cuenta. La liga solo sirve una vez.

**Por qué esta prioridad**: es el valor completo de la funcionalidad. Sin esto no hay nada que probar.

**Prueba Independiente**: con un Tutor y un segundo navegador sin sesión: el Tutor genera la liga, el segundo navegador la abre y ve las tomas de hoy de ese hijo y nada más.

**Escenarios de Aceptación**:

1. **Dado** un Tutor con plan de pago y un hijo, **Cuando** genera el acceso del hijo con un nombre de dispositivo, **Entonces** ve una liga lista para copiar, con su vencimiento, y un texto que le dice que quien abra esa liga verá lo de ese hijo.
2. **Dado** una liga vigente, **Cuando** se abre en un navegador sin sesión, **Entonces** ese navegador queda vinculado al hijo y ve su pantalla de tomas de hoy, sin pedir ningún dato.
3. **Dado** una liga ya usada, vencida, cancelada o inventada, **Cuando** se abre, **Entonces** la respuesta es la misma para todas («esta liga ya no sirve») y no revela cuál de esos casos fue.
4. **Dado** un navegador ya vinculado, **Cuando** se vuelve a abrir la app (incluso días después), **Entonces** sigue entrando directo, sin volver a usar la liga.
5. **Dado** una cuenta sin plan de pago, **Cuando** intenta generar el acceso, **Entonces** el servidor lo rechaza con el aviso del plan y no se crea nada.

---

### Historia de Usuario 2 - El hijo ve y marca solo lo suyo (Prioridad: P1)

En su teléfono, el hijo ve **«Tus tomas de hoy»** (medicamentos, suplementos) y **«Tus actividades»**; toca una toma para marcarla («Tomada») o una actividad para marcar «Realizado». La marca queda registrada como **«por Mateo, 08:05»** y sus padres la ven en su propia pantalla. Puede quitar **solo la marca que él puso**.

**Por qué esta prioridad**: es lo que hace útil el acceso; sin marcar, el hijo solo miraría.

**Prueba Independiente**: con el hijo vinculado, marcar una toma; el Tutor, en otra sesión, la ve marcada «por Mateo»; el hijo intenta quitar una marca puesta por el Tutor y no puede.

**Escenarios de Aceptación**:

1. **Dado** el dispositivo del hijo con tomas pendientes hoy, **Cuando** marca una, **Entonces** queda marcada y el Tutor la ve «por Mateo, hora» en menos de un minuto.
2. **Dado** una toma que marcó el Tutor, **Cuando** el hijo intenta desmarcarla, **Entonces** no puede (se respeta la regla de la spec 032: solo quien la marcó, o quien puede todo).
3. **Dado** una actividad del hijo, **Cuando** toca «Realizado», **Entonces** se marca la toma que corresponde igual que lo haría un Cuidador.
4. **Dado** el dispositivo del hijo, **Cuando** intenta cualquier otra cosa por la API (consultas, fotos de recetas, notas, cartilla, citas, familia, planes, otros hijos, crear o editar suplementos), **Entonces** el servidor lo rechaza (401 o 403) y no devuelve ni cambia nada.
5. **Dado** el dispositivo del hijo, **Cuando** el Tutor de otro hijo de la misma familia agrega datos a otro hijo, **Entonces** el dispositivo no ve nada de ese otro hijo.

---

### Historia de Usuario 3 - El padre ve los dispositivos y los quita al instante (Prioridad: P1)

En «Acceso del hijo» el Tutor ve la lista de dispositivos vinculados a cada hijo: **nombre, desde cuándo y última vez que se usó**. Puede **quitar** cualquiera. Desde ese momento el dispositivo deja de ver y de marcar, aunque tenga la app abierta.

**Por qué esta prioridad**: es el control de seguridad que hace aceptable el diseño: si la liga se reenvía por error o el teléfono se pierde, el padre corta el acceso en segundos.

**Prueba Independiente**: vincular un dispositivo, quitarlo desde la sesión del Tutor y comprobar que la siguiente petición del dispositivo es rechazada.

**Escenarios de Aceptación**:

1. **Dado** dos dispositivos vinculados a un hijo, **Cuando** el Tutor quita uno, **Entonces** ese deja de funcionar en su siguiente petición y el otro sigue igual.
2. **Dado** un dispositivo quitado, **Cuando** vuelve a abrir la app, **Entonces** ve que ya no tiene acceso (sin datos del hijo) y un texto que le pide avisar a su padre o madre.
3. **Dado** un hijo con el máximo de dispositivos, **Cuando** el Tutor genera otra liga, **Entonces** se le dice que quite uno primero y no se crea nada.
4. **Dado** una liga generada pero sin usar, **Cuando** el Tutor la cancela o genera otra para el mismo dispositivo, **Entonces** la anterior deja de servir.
5. **Dado** un Cuidador, **Cuando** abre «Acceso del hijo», **Entonces** ve la lista pero no puede generar ligas ni quitar dispositivos.

---

### Historia de Usuario 4 - El hijo recibe los avisos de sus tomas (Prioridad: P2)

El dispositivo del hijo puede **activar los avisos** de su teléfono. Cuando llega la hora de una toma o actividad suya, recibe un aviso con texto neutral. Puede tocar **«Tomada»** o **«Realizado»** desde el aviso. No recibe avisos de nada que no sea suyo (ni de otros hijos, ni de citas, ni de la familia).

**Por qué esta prioridad**: es muy valioso (es lo que el niño realmente usará) pero es lo más delicado técnicamente y el acceso ya aporta valor sin él.

**Prueba Independiente**: con un dispositivo de hijo con avisos activados y una toma que vence, se reclama un aviso para ese dispositivo y ninguno para dispositivos de otros hijos.

**Escenarios de Aceptación**:

1. **Dado** un dispositivo de hijo con avisos activados, **Cuando** vence una toma de ese hijo, **Entonces** recibe un aviso, como máximo uno por toma.
2. **Dado** una toma ya marcada por un Tutor, **Cuando** le toca vencer, **Entonces** el dispositivo del hijo no recibe aviso.
3. **Dado** el aviso del hijo, **Cuando** toca «Tomada», **Entonces** se marca como «por Mateo» solo si el dispositivo sigue vinculado.
4. **Dado** un dispositivo quitado, **Cuando** vence una toma, **Entonces** ya no recibe avisos.
5. **Dado** el texto del aviso, **Cuando** el hijo lo lee, **Entonces** es genérico o con detalle según lo que el Tutor haya elegido para ese dispositivo, sin imperativos médicos.

---

### Historia de Usuario 5 - Con el plan caducado, el hijo sigue marcando (Prioridad: P3)

Si la familia deja de pagar, el dispositivo del hijo **sigue viendo y marcando** lo que ya existe, igual que un integrante en solo lectura. El padre no puede crear accesos nuevos hasta volver a pagar.

**Por qué esta prioridad**: evita que un tratamiento en curso quede sin registro por un tema de pago (Principio IV).

**Prueba Independiente**: con el plan de la dueña en gratuito, el dispositivo vinculado sigue marcando; generar una liga nueva se rechaza.

**Escenarios de Aceptación**:

1. **Dado** una familia cuyo plan terminó, **Cuando** el dispositivo del hijo marca una toma, **Entonces** funciona.
2. **Dado** esa misma familia, **Cuando** el Tutor intenta generar otro acceso, **Entonces** recibe el aviso del plan.
3. **Dado** que la familia vuelve a pagar, **Cuando** el Tutor genera un acceso, **Entonces** funciona y los dispositivos que ya estaban siguen.

---

### Casos Límite

- ¿Qué pasa si la liga se abre en dos teléfonos casi al mismo tiempo? Solo el primero la canjea; el segundo recibe «esta liga ya no sirve».
- ¿Qué pasa si el padre abre por error la liga en su propio teléfono? Queda ese teléfono vinculado al hijo; el padre lo ve en la lista y lo quita. La app dice con claridad en la pantalla de la liga que no debe abrirla quien no sea el hijo.
- ¿Qué pasa si el niño borra los datos del navegador o cambia de teléfono? Pierde el acceso; el padre genera otra liga y, si quiere, quita el dispositivo anterior.
- ¿Qué pasa si el padre quita al hijo de la familia o el hijo se elimina? Todos sus dispositivos dejan de servir.
- ¿Qué pasa si el mismo teléfono ya tiene una sesión de un padre? Las dos sesiones no se mezclan; el dispositivo del hijo se usa en su propia pantalla y nunca hereda ni da permisos de la sesión del padre.
- ¿Qué pasa si la credencial del dispositivo se roba? Mientras no se quite, funciona; por eso se muestra «última vez que se usó», se puede quitar al instante y la credencial se renueva periódicamente.
- ¿Qué pasa con un dispositivo sin usar durante mucho tiempo? Caduca solo; el padre ve que venció y puede generar otra liga.
- ¿Qué pasa si el padre genera muchas ligas seguidas? Hay un límite de peticiones y de dispositivos y ligas pendientes por hijo.
- ¿Qué pasa si el hijo cumple una mayoría de edad o ya quiere su propia cuenta? Fuera de alcance: puede ser invitado como Tutor o Cuidador con su correo, como cualquier persona (spec 032).

## Requisitos *(obligatorio)*

### Requisitos Funcionales

**Crear el acceso**

- **FR-001**: Una persona con permiso total sobre un hijo (la dueña o un Tutor de una familia de pago) DEBE poder generar, para **ese hijo**, una **liga de un solo uso** asociada a un **nombre de dispositivo** que ella escribe (por ejemplo «Teléfono de Mateo»).
- **FR-002**: La liga DEBE verse **una sola vez**, justo al generarla, junto con su vencimiento y con un aviso de que solo debe abrirla el hijo; no se puede volver a ver después.
- **FR-003**: La liga DEBE llevar su ficha en la parte de la dirección que **nunca viaja al servidor** y, al canjearla, la ficha DEBE enviarse solo en el cuerpo de la petición; nunca en una dirección, un registro, un mensaje de error ni `error_logs`. El servidor DEBE conservar solo una huella de la ficha, no la ficha.
- **FR-004**: La liga DEBE vencer (supuesto: 24 horas), servir una sola vez y poder cancelarse; generar una nueva para el mismo dispositivo DEBE invalidar la anterior.
- **FR-005**: El servidor DEBE decidir el plan **bajo el bloqueo de la cuenta dueña**: generar un acceso exige plan de pago (422 con motivo propio, mismo patrón que los demás límites del plan); ver la lista, quitar un dispositivo y usar un dispositivo ya vinculado **nunca** piden plan.
- **FR-006**: El sistema DEBE limitar los dispositivos vinculados más las ligas pendientes por hijo (supuesto: 3) y rechazar el excedente con un mensaje que diga qué quitar.

**Canjear la liga y usar el dispositivo**

- **FR-007**: Quien abra una liga vigente DEBE quedar vinculado **sin dar ningún dato** (sin correo, contraseña, nombre ni edad) y recibir una **credencial de dispositivo propia de ese hijo**, que se guarda en el dispositivo.
- **FR-008**: Una liga usada, vencida, cancelada o desconocida DEBE responder **igual** (sin distinguir el caso) y el canje DEBE estar limitado en peticiones por dirección.
- **FR-009**: La credencial DEBE tener una caducidad por falta de uso (supuesto: 90 días) y renovarse al usarse; el servidor DEBE guardar solo su huella y poder reconocerla en cada petición.
- **FR-010**: El servidor DEBE reconocer, además de la sesión de una persona, la credencial de un dispositivo de hijo **detrás del mismo control de nivel de acceso**, y esa credencial DEBE dar **solo** el nivel de ver y marcar sobre **su único hijo**, nunca más. Un dispositivo de hijo nunca puede usar una ruta que exija una cuenta o un nivel total.
- **FR-011**: Las rutas que el dispositivo del hijo PUEDE usar DEBEN ser una lista cerrada y explícita: ver las tomas de hoy de su hijo, ver sus suplementos y actividades, marcar y desmarcar **sus propias** marcas, «Realizado», activar y desactivar sus avisos y el cierre de su propio acceso. **Todo lo demás DEBE rechazarse (401 o 403) sin devolver ni cambiar datos.** La lista DEBE estar en una prueba que recorra todas las rutas protegidas.
- **FR-012**: El dispositivo del hijo NO DEBE poder ver ni cambiar: consultas, recetas y sus fotos, notas, síntomas, cartilla de vacunación, citas, la familia, los planes, otros hijos, la cuenta de nadie, ni crear, editar, pausar o finalizar suplementos o actividades.

**Quitar, renovar y ver**

- **FR-013**: El servidor DEBE decidir en cada petición si la credencial sigue vigente (no cacheada): quitar un dispositivo, cancelar el acceso, quitar al hijo o caducar la credencial DEBEN surtir efecto en la siguiente petición.
- **FR-014**: Quien tiene permiso total DEBE poder ver, por hijo, la lista de dispositivos con **nombre, fecha de vinculación, última vez que se usó y estado** (activo, quitado, vencido), y quitar cualquiera. Un Cuidador DEBE poder ver la lista pero no generar ni quitar.
- **FR-015**: La credencial DEBE rotarse periódicamente sin que el niño haga nada, de modo que una copia robada deje de servir.
- **FR-016**: Cuando el dispositivo ya no tiene acceso DEBE ver un mensaje claro y sin datos del hijo que le diga que pida otro acceso a su padre o madre.

**Marcas con autor y avisos**

- **FR-017**: Cada marca hecha desde un dispositivo de hijo DEBE guardar **quién la hizo** como ese hijo, mostrarse como «por Mateo, 08:05» y respetar la regla de la spec 032: el hijo solo puede desmarcar lo que él marcó; un Tutor o la dueña pueden desmarcar cualquier marca. Los datos existentes (marcas por cuentas) DEBEN seguir funcionando y mostrándose igual.
- **FR-018**: Un dispositivo de hijo con avisos activados DEBE recibir los avisos de **solo las tomas y actividades de su hijo**, como máximo uno por toma y por dispositivo, ninguno si la toma ya está marcada y ninguno si el dispositivo fue quitado; NO DEBE recibir avisos de citas ni de nada de la familia.
- **FR-019**: El aviso del hijo DEBE usar texto neutral y sin imperativos médicos, genérico o con detalle según lo elija la persona Tutora para ese dispositivo (por omisión, genérico), y su acción «Tomada» / «Realizado» DEBE marcar «por Mateo» solo si el dispositivo sigue vinculado.

**Privacidad y textos**

- **FR-020**: El sistema NO DEBE guardar nada personal del menor para esto: ni correo, ni nombre real distinto al ya registrado del hijo, ni edad, ni ubicación, ni identificadores del aparato más allá del nombre que le puso el padre y la fecha de uso. El nombre del dispositivo es texto libre del padre y DEBE viajar solo en el cuerpo de las peticiones.
- **FR-021**: La pantalla de generar el acceso DEBE decir con claridad que **darle un teléfono a un niño es decisión y responsabilidad del padre**, que quien abra la liga ve las tomas y actividades de ese hijo, y cómo quitar el acceso. La app NO DEBE preguntar ni validar edad.
- **FR-022**: El aviso «Antes de empezar» DEBE incluir una frase sobre este acceso y subir su versión para que cada cuenta lo vuelva a confirmar; la pantalla de Familia DEBE explicar el acceso del hijo en palabras neutrales.
- **FR-023**: Los textos DEBEN ser neutrales: nada de «debes», «toca», «atraso» ni consejos de salud (Principio I).

**Pantallas**

- **FR-024**: En la ficha del hijo y en Familia DEBE haber un bloque **«Acceso del hijo»** con: generar, copiar la liga, la lista de dispositivos y quitar; en los dos diseños (móvil y web) ya existentes.
- **FR-025**: El dispositivo del hijo DEBE tener una vista mínima, pensada para móvil primero, con **solo** sus tomas de hoy, sus suplementos y sus actividades, sus botones de marcar y el activar avisos; sin menú de familia, planes, cuenta ni cerrar sesión de padre.

### Entidades Clave *(incluir si la funcionalidad involucra datos)*

- **Acceso de dispositivo del hijo**: de qué hijo, nombre del dispositivo, quién lo creó, cuándo, estado (pendiente de canjear, activo, quitado, vencido), última vez usado y cuándo caduca. La huella de la liga (mientras está pendiente) y la huella de la credencial (cuando está activo); nunca las fichas.
- **Marca con autor**: la marca de una toma ahora puede ser de una cuenta (como hoy) o de un dispositivo de hijo (nombre del hijo); la regla de quién puede desmarcar es la de la spec 032.
- **Aviso por persona**: el aviso por toma y por persona de la spec 032 se extiende para que el destinatario pueda ser un dispositivo de hijo, con las mismas garantías (como máximo uno por toma y destinatario).
- **Hijo**, **Familia / dueña**: ya existen (specs 003 y 032); el acceso del hijo cuelga del hijo y hereda el plan de la dueña.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Un Tutor completa «generar el acceso y que el teléfono del niño lo use» en **menos de 2 minutos**, sin que el niño escriba nada.
- **SC-002**: **Cero accesos indebidos**: el **100 %** de las rutas protegidas se prueba con la credencial de un dispositivo de hijo y solo las de la lista cerrada responden algo; el resto responde 403.
- **SC-003**: Quitar un dispositivo corta el acceso en la **siguiente petición** (menos de 5 segundos desde que el Tutor lo quita, aun con la app abierta).
- **SC-004**: Una marca del hijo aparece «por Mateo» en la sesión del Tutor en **menos de 1 minuto** (la pantalla ya se refresca cada 60 s).
- **SC-005**: Una liga usada, vencida, cancelada o inventada es **indistinguible** para quien la abre (misma respuesta) en el **100 %** de los casos probados.
- **SC-006**: El **100 %** de las marcas y avisos existentes (de cuentas) siguen funcionando igual después del cambio.
- **SC-007**: Con el plan caducado, el dispositivo del hijo **sigue marcando**; en ningún caso un tratamiento en curso queda sin poder registrarse por el plan.
- **SC-008**: Ningún dato personal del menor se guarda por esta función (revisión de lo guardado: solo huellas, el nombre del dispositivo que escribió el padre y fechas).

## Supuestos

- **Plan**: solo cuentas de pago generan accesos; el servidor decide el plan bajo el bloqueo de la cuenta dueña (decisión del dueño, 2026-10-22). Ver, quitar y usar un dispositivo ya vinculado nunca piden plan.
- **Edad**: la app no la pregunta ni la valida; es responsabilidad del padre (decisión del dueño, 2026-10-22). Esto sustituye lo que la spec 032 decía del rol Hijo (10 años o más y consentimiento declarado). El texto de FR-021 lo deja claro.
- **Valores por omisión** (se pueden cambiar sin rehacer la spec): la liga vence a las **24 horas**; **3** dispositivos (más ligas pendientes) por hijo; la credencial caduca a los **90 días sin uso** y se renueva al usarse; los avisos del dispositivo están **apagados** hasta que el hijo los active.
- **Qué ve el hijo**: sus tomas de hoy (medicamentos y suplementos), sus suplementos y sus actividades, con las mismas fichas y botones que ya existen; sin consultas, fotos de recetas, notas, cartilla, citas, familia ni planes (decisión del dueño). Las actividades y suplementos de la **persona** (personales) no son del hijo.
- **Rol Hijo existente**: el nivel del rol Hijo de la spec 032 (ver y marcar, solo su hijo) se reutiliza; lo que cambia es **cómo se identifica** quien lo ejerce (un dispositivo con credencial en lugar de una cuenta de correo).
- **Sin cuenta de proveedor para menores**: el hijo nunca se registra en el proveedor de cuentas; esto es lo que evita los problemas de edad del proveedor.
- **Un dispositivo, un hijo**: una credencial pertenece a un solo hijo. Para otro hijo se genera otra liga.
- **Aviso de privacidad (LFPDPPP)**: como en las demás funciones con datos de menores, el texto legal es pendiente del dueño y bloquea el lanzamiento real, no la implementación.
- **Sin mock**: no hay diseño entregado; se hace con el sistema visual, móvil primero para la vista del hijo, y se ofrece pedir uno a Claude Design.
- **Fuera de alcance**: login de menores con el proveedor de cuentas, cuenta propia del hijo, pasar el acceso a otro teléfono con QR, control parental o límites de tiempo, y pagos.
