# Especificación de Funcionalidad: Invitación a la familia por correo

**Rama de la Funcionalidad**: `feature/040-invitacion-familiar-por-correo`

**Creado**: 2026-10-12

**Estado**: Borrador

**Entrada**: Descripción del usuario: «sigamos con la invitación familiar» (backlog: «Invitaciones a la familia por correo», spec 032). Hoy quien invita **copia la liga a mano** y se la manda por su cuenta. Esta spec hace que el servicio **mande además el correo** con esa misma liga, sin quitar la opción de copiarla. Decisiones del dueño del producto (2026-10-12): la liga va como **hipervínculo normal, sin acortador** (ni de terceros ni propio); el correo lleva **solo** lo que el Principio II permite; la cuota de **100 correos al día** del plan gratis de Resend se **vigila** (y si se rebasa en un momento crítico, se pasa el proveedor a un plan de pago).

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - La persona invitada recibe la invitación en su correo (Prioridad: P1)

Cuando la dueña de la familia (plan de pago) crea una invitación para un correo y un rol —Tutor o Cuidador—, el servicio le manda a ese correo un mensaje de **PediTrack** con un **hipervínculo** a la misma liga que hoy se copia a mano. La liga se abre en la pantalla de invitación de la spec 032 y **aceptar sigue exigiendo que el correo verificado de la sesión sea el invitado**: tener la liga no basta. La dueña **conserva «Copiar liga»**.

**Por qué esta prioridad**: es el valor de la funcionalidad: hoy la invitación depende de que la dueña copie y mande la liga por otro medio, y mucha gente no lo hace o lo hace mal.

**Prueba Independiente**: una dueña de plan de pago invita a un correo; en el correo (un envío falso en las pruebas) hay un solo mensaje con el nombre de pila de quien invita, el rol, la fecha de vencimiento y un hipervínculo cuyo destino es la liga completa de la invitación, y nada más.

**Escenarios de Aceptación**:

1. **Dado** una dueña con plan de pago y el envío de correo disponible, **Cuando** crea una invitación, **Entonces** se manda **un** correo al invitado y la respuesta dice que el correo se está enviando.
2. **Dado** ese correo, **Entonces** lleva: el **nombre de pila** de quien invita, el **rol** que se ofrece con su descripción neutra ya existente, la **fecha en que vence** la liga, el hipervínculo y un aviso de que **si no lo esperaba puede ignorarlo**; escrito en español de México, con tono neutro y sin imperativos médicos.
3. **Dado** ese correo, **Entonces** el hipervínculo apunta a la liga completa de la invitación (la misma que se copia), **sin acortador** ni redirección de ningún servicio, y el mensaje **no usa seguimiento de clics ni de aperturas**.
4. **Dado** la persona invitada, **Cuando** abre la liga con una sesión cuyo correo verificado **no** es el invitado, **Entonces** no puede aceptar (la regla de la spec 032 no cambia).
5. **Dado** que la dueña **reenvía** la invitación, **Entonces** se genera una liga nueva (la anterior deja de servir, spec 032) y el correo que sale lleva **la nueva**.
6. **Dado** que la dueña **cancela** una invitación, **Entonces** no se manda ningún correo.
7. **Dado** una dueña sin plan de pago, **Entonces** no puede invitar y no se manda nada (la regla de la spec 032 no cambia).

---

### Historia de Usuario 2 - La dueña ve qué pasó con el correo y puede copiar la liga (Prioridad: P1)

En la pantalla **Familia**, justo después de crear o reenviar, la tarjeta «Liga lista» dice **«Enviamos la invitación a <correo>»** y se actualiza sola a **«enviado»** o a **«no se pudo enviar, copia la liga»**. «Copiar liga» sigue ahí en todos los casos. La lista de invitaciones muestra el **estado del correo** de cada pendiente.

**Por qué esta prioridad**: el correo puede fallar o no salir (cuota, proveedor, sin configurar); la dueña tiene que saberlo para no esperar una invitación que no llegó y para usar el otro camino.

**Prueba Independiente**: se crea una invitación con el envío disponible (se ve «enviándose» y luego «enviado»), una con el proveedor caído (se ve «no se pudo enviar, copia la liga») y una sin la clave del proveedor (la pantalla funciona como hoy, sin mensaje de correo): en los tres casos la invitación existe y se puede copiar la liga.

**Escenarios de Aceptación**:

1. **Dado** una invitación recién creada o reenviada con el envío disponible, **Entonces** la tarjeta dice que se está enviando a ese correo y pasa a «enviado» cuando sale.
2. **Dado** que el correo no pudo salir (falla del proveedor o tope diario), **Entonces** la tarjeta lo dice, ofrece copiar la liga y **la invitación sigue creada y vigente**.
3. **Dado** una invitación pendiente, **Entonces** la lista muestra el estado del correo (`no pedido`, `enviándose`, `enviado`, `no enviado`) y cuándo.
4. **Dado** el servicio sin la clave del proveedor, **Entonces** no hay estado de correo que mostrar y todo funciona como hoy: solo copiar la liga.
5. **Dado** web y móvil, **Entonces** el estado se ve en los dos diseños ya existentes de la pantalla Familia, sin una pantalla nueva.
6. **Dado** el aviso legal de datos médicos de la spec 032, **Entonces** no cambia.

---

### Historia de Usuario 3 - Una falla de correo nunca estorba a la invitación (Prioridad: P1)

Si el proveedor no responde o rechaza el envío, la invitación **se crea igual** y el servicio **reintenta de forma acotada** sin hacer esperar a la dueña; si no sale, la invitación queda con estado de correo «no enviado» y la falla se **reporta** como falla de proceso (`job:mailer`) con un mensaje fijo, sin la dirección del invitado, sin la clave y sin la liga.

**Por qué esta prioridad**: invitar a alguien nunca debe depender de que un servicio externo esté de buen humor.

**Prueba Independiente**: con un proveedor que falla las dos primeras veces y acepta la tercera, el correo sale; con uno que falla siempre, la invitación existe, su estado de correo es «no enviado» y queda **una** entrada `job:mailer` sin ningún dato personal.

**Escenarios de Aceptación**:

1. **Dado** un fallo temporal del proveedor, **Entonces** se reintenta hasta 3 veces en total con esperas cortas, **sin** bloquear la respuesta a la dueña.
2. **Dado** que se agotan los intentos o el proveedor rechaza el envío de forma definitiva, **Entonces** el estado queda «no enviado» y se reporta una vez con un mensaje fijo.
3. **Dado** que el servicio se apaga durante un envío, **Entonces** el estado no queda «enviándose» para siempre: se resuelve como «no enviado» y la dueña puede reenviar o copiar la liga.
4. **Dado** cualquier falla, **Entonces** ni la creación ni el reenvío ni la cancelación de invitaciones se ven afectados.

---

### Historia de Usuario 4 - Se vigila la cuota diaria y no se abusa del envío (Prioridad: P2)

El plan gratis del proveedor permite **100 correos al día**, que comparte con el digest semanal de errores (spec 039). El servicio **cuenta los correos mandados cada día** (hora de Ciudad de México), **avisa al llegar a 80** por el mismo canal de fallas de proceso (`job:mailer`) —así aparece en `error_logs` y en el digest semanal— y **deja de mandar invitaciones al llegar a un tope** (por omisión 95), reservando el resto para el digest. Además limita los reenvíos con correo (por invitación y por familia al día) para que nadie use el servicio para escribirle a direcciones arbitrarias.

**Por qué esta prioridad**: el dueño quiere **ver venir** el límite y decidir si pasa a un plan de pago; y proteger la reputación del dominio es necesario antes de que cualquiera pueda mandar correos desde PediTrack. El servicio funciona sin esto, por eso es P2.

**Prueba Independiente**: con un contador simulado en 79, 80, 94 y 95, se comprueba que el aviso sale una sola vez al llegar a 80, que a partir del tope no se manda el correo (y la invitación se crea con «no enviado»), y que el digest semanal **sí** puede mandarse con el contador en el tope. Con reenvíos repetidos de una misma invitación, el cuarto del día ya no manda correo.

**Escenarios de Aceptación**:

1. **Dado** un día nuevo en hora de Ciudad de México, **Entonces** el contador empieza en cero.
2. **Dado** que el día llega a **80** correos, **Entonces** se reporta **una vez** ese día un aviso de cuota con un mensaje fijo.
3. **Dado** que el día llega al **tope** (95 por omisión), **Cuando** se crea o reenvía una invitación, **Entonces** el correo **no** se manda, la invitación **sí** se crea o reenvía, el estado del correo es «no enviado» y la respuesta lo dice para que la app ofrezca copiar la liga.
4. **Dado** el tope alcanzado, **Entonces** el digest semanal **sí** puede mandarse (las invitaciones no consumen los últimos correos del día).
5. **Dado** una invitación reenviada más de **3 veces** en un día, o una familia con más de **10** envíos de invitación en un día, **Entonces** los reenvíos de más no mandan correo (la liga nueva sí se genera y se puede copiar).
6. **Dado** el contador, **Entonces** solo guarda cuántos correos salieron cada día: nunca direcciones, ligas ni textos.

---

### Casos Límite

- **Correo del invitado inválido o rechazado por el proveedor**: cuenta como falla de envío («no enviado»); la invitación sigue creada.
- **El correo de la invitación ya es miembro o ya tiene una pendiente**: las reglas de la spec 032 se aplican antes; no se manda nada.
- **Reenvío justo cuando el correo anterior aún se está enviando**: gana la liga nueva; el correo con la liga vieja, si aún no salió, **no** debe salir (llevaría una liga que ya no sirve).
- **Invitación aceptada, cancelada o vencida antes de que salga el correo**: no sale.
- **El proveedor responde que ya recibió esa solicitud** (reintento de lo mismo): se trata como enviado, sin mandar un segundo correo.
- **Cambio de día con envíos en curso**: cada envío cuenta en el día en que sale.
- **Varias copias del servicio**: el contador y el tope valen para todas juntas (una sola cuota de proveedor).
- **Sin clave del proveedor**: ningún correo de invitación se manda y la pantalla Familia funciona como hoy.
- **Un nombre de pila muy largo o con caracteres raros**: se recorta y se limpia para que no rompa el correo.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: Al crear una invitación, el servicio DEBE mandar un correo al invitado con un **hipervínculo a la liga completa** de la invitación; la opción de copiar la liga DEBE seguir disponible.
- **FR-002**: Al reenviar una invitación, el correo DEBE llevar la **liga nueva**; la anterior sigue dejando de servir (spec 032). Cancelar NO DEBE mandar correo.
- **FR-003**: La liga NO DEBE pasar por ningún **acortador ni redirección** (de terceros ni propia), y el mensaje NO DEBE usar **seguimiento de clics ni de aperturas**.
- **FR-004**: El correo DEBE llevar **solo**: el nombre de pila de quien invita, el rol ofrecido con su descripción neutra, la fecha de vencimiento de la liga, el hipervínculo y un aviso de que puede ignorarse si no se esperaba. NUNCA DEBE llevar nombres, edades ni datos de salud de los hijos, ni cuántos hijos hay, ni el apellido ni el correo de quien invita.
- **FR-005**: El texto DEBE estar en español de México, con tono neutro y sin imperativos médicos (Principio I).
- **FR-006**: Aceptar una invitación DEBE seguir exigiendo que el **correo verificado de la sesión** sea el invitado; recibir el correo no cambia ningún permiso.
- **FR-007**: Una falla del proveedor, de la cuota o de la configuración NUNCA DEBE impedir ni revertir la creación, el reenvío o la cancelación de una invitación.
- **FR-008**: El envío NO DEBE bloquear la respuesta a quien invita; DEBE reintentarse de forma acotada (hasta 3 intentos con esperas cortas, la política de la spec 039) y, si no sale, el estado del correo DEBE quedar «no enviado».
- **FR-009**: Cada invitación DEBE tener un **estado de correo** (`no pedido`, `enviándose`, `enviado`, `no enviado`) y el momento en que cambió, devuelto en la lista de invitaciones y en las respuestas de crear y reenviar. NO DEBE guardarse el correo del invitado otra vez, la liga, la ficha ni el texto del mensaje.
- **FR-010**: Un envío NO DEBE quedar en «enviándose» indefinidamente: si el servicio se apaga o el envío no termina, el estado DEBE resolverse a «no enviado».
- **FR-011**: El servicio DEBE **contar los correos mandados por día** (hora de Ciudad de México), compartiendo el contador entre invitaciones y el digest semanal y entre todas las copias del servicio.
- **FR-012**: Al llegar a **80** correos en un día, el servicio DEBE reportar **una vez** ese día un aviso de cuota como falla de proceso `job:mailer`, con un mensaje fijo, de modo que aparezca en `error_logs` y en el digest semanal.
- **FR-013**: Al llegar al **tope diario** (configurable, por omisión 95) las invitaciones NO DEBEN mandar correo (siguen creándose con estado «no enviado»), y el digest semanal DEBE poder seguir mandándose con los correos reservados.
- **FR-014**: DEBE haber un límite de envíos de correo por invitación por día (por omisión 3) y por familia por día (por omisión 10); pasado el límite, el reenvío genera la liga pero no manda correo.
- **FR-015**: El correo del invitado, la liga y la ficha NUNCA DEBEN escribirse en logs, `error_logs`, mensajes de error, el contador ni los reportes; los reportes usan mensajes fijos.
- **FR-016**: Sin la clave del proveedor NO DEBE mandarse ningún correo de invitación y todo DEBE funcionar como hoy; el estado de correo DEBE ser «no pedido».
- **FR-017**: La pantalla Familia (web y móvil, diseños existentes de la spec 032) DEBE mostrar tras crear o reenviar «Enviamos la invitación a <correo>» con su estado, conservar «Copiar liga» y mostrar el estado del correo en cada invitación pendiente. El aviso legal no cambia.
- **FR-018**: Los endpoints de invitaciones ya existentes DEBEN ampliar sus respuestas con el estado del correo, sin romper a quien aún no lo lea; la documentación de la API DEBE regenerarse.
- **FR-019**: Toda la lógica nueva DEBE tener pruebas que mantengan la cobertura por encima del 90 % (Principio VI), con envío falso y con la base real para el contador y los estados.

### Entidades Clave

- **Invitación** (existente, spec 032): ahora con un **estado de correo** (`no pedido`, `enviándose`, `enviado`, `no enviado`) y cuándo cambió.
- **Contador diario de correos**: cuántos correos salieron cada día (hora de Ciudad de México) y si ya se avisó del 80 %; nada más.
- **Mensaje de invitación**: el correo que se arma al momento de enviar; no se guarda.
- **Proveedor de correo**: servicio externo que recibe solo el mensaje de la invitación (nombre de pila de quien invita, rol, vencimiento y la liga).

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Con el servicio configurado, el 100 % de las invitaciones creadas o reenviadas dentro de los límites produce **exactamente un** correo al invitado.
- **SC-002**: En condiciones normales el correo sale en menos de **1 minuto** desde que se crea la invitación, y la dueña ve «enviado» sin recargar la pantalla.
- **SC-003**: En el 100 % de las fallas (proveedor, cuota, límites, sin configuración), la invitación existe, se puede copiar la liga y la pantalla lo dice.
- **SC-004**: La respuesta de crear o reenviar una invitación **no tarda más** por el envío del correo.
- **SC-005**: En pruebas, **0** direcciones, ligas, fichas o datos de los hijos aparecen en los registros, el contador o los reportes, y **0** datos de los hijos en el correo.
- **SC-006**: Con el contador en el tope, el digest semanal **sí** se manda en el **100 %** de las pruebas.
- **SC-007**: Al llegar a 80 correos en un día, el aviso queda en `error_logs` **una sola vez** ese día.
- **SC-008**: Quien opera sabe cuántos correos salieron cada día **sin entrar al proveedor**.
- **SC-009**: Las pruebas del backend y del frontend mantienen la cobertura por encima del **90 %**.

## Supuestos

- **Quién invita y a quién**: solo la dueña de la familia con plan de pago (spec 032); los roles son Tutor y Cuidador. El rol Hijo (Entrega 3) queda fuera.
- **La liga** es la de la spec 032 (`/familia/invitacion#<ficha>` sobre el origen del frontend), armada en el servidor con el origen ya configurado. La ficha es la que ya existe; el correo es un canal más para entregarla. Quien tenga el buzón tiene la liga, pero no basta para aceptar (FR-006).
- **Remitente y proveedor**: los mismos del digest (Resend, la misma clave y el dominio ya verificado). El texto es solo texto con un hipervínculo (o HTML mínimo para que el enlace se vea como botón, sin imágenes ni seguimiento).
- **Cuota**: aviso a los **80**, tope de invitaciones en **95** (se reservan 5 al día para el digest), límites de **3** envíos por invitación y **10** por familia al día; todo configurable, con esos valores por omisión (propuestas mías, un solo lugar para cambiarlas). Si el uso real se acerca al tope, la decisión de pasar a un plan de pago es del dueño y queda fuera de esta spec.
- **Diseño técnico esperado** (decisión de diseño, no de producto, se detalla en el plan): el adaptador de envío de la spec 039 pasa a un paquete común que usan el digest y las invitaciones, y ahí viven el contador y el tope para que compartan la misma cuota.
- **Estado «enviándose»**: un envío que no termina se resuelve a «no enviado» al apagar el servicio o tras un tiempo máximo corto; la dueña siempre puede reenviar o copiar la liga.
- **Privacidad (Principio II)**: el proveedor es un tercero que recibe el correo de una persona que aún no es usuaria; es el mínimo necesario para entregar la invitación y no se usa para nada más. No hay venta ni compartición de datos.
- **Principio V**: pieza pequeña (un mensaje, un contador, un estado y un par de textos en pantalla); no agrega pantallas ni dependencias.
- **Fuera de alcance**: acortador de URL; correo de bienvenida o de aviso a la dueña cuando alguien acepta; recordatorios de invitaciones sin responder; plantillas con imágenes; cambiar de proveedor; el plan de pago de Resend; el rol Hijo.
- **Depende de**: spec 032 (invitaciones, roles, liga, pantalla Familia), spec 039 (proveedor, clave, dominio verificado, política de reintentos, `jobreport`) y spec 018 (`job:*`).
- Sin mock nuevo: los cambios de pantalla son mínimos sobre los diseños de la spec 032 (`specs/032-compartir-con-familia/referencia/Familia PediTrack.dc.html`).
