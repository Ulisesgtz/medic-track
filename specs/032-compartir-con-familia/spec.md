# Especificación de Funcionalidad: Compartir hijos y consultas con la familia (plan de pago)

**Rama de la Funcionalidad**: `feature/032-compartir-con-familia`

**Creado**: 2026-10-06

**Estado**: Borrador

**Entrada**: Descripción del usuario: que quien paga el plan completo pueda **invitar a otras personas** (su pareja, quien cuida a los niños, y los propios hijos mayores de 10 años) a ver y usar los mismos hijos y consultas, **sin que ellas paguen**, con permisos según su rol. Lo que más importa: **no dar dos veces la misma dosis**. Decidido el 2026-10-05 (`BACKLOG.md`, «Qué incluye el plan de pago» → «Compartir con la pareja y con quien cuida»). Tercer paso del «Orden sugerido» de esa entrada. Es una funcionalidad grande: se entrega **por partes** (ver «Entregas»).

## Vocabulario

- **Familia**: el conjunto de hijos y consultas de una cuenta y las personas que tienen acceso a ellos. **Quien paga** es la **cuenta dueña**: sus datos son los de la familia y su plan es el de toda la familia.
- **Roles** (los elige quien invita): **Tutor** (esposo o esposa; mismo acceso que quien paga), **Cuidador** (abuela, niñera: ve y marca tomas) e **Hijo/hija** (10 años o más: ve y marca **sus** tomas). Dos niveles de permiso: **completo** (Tutor) y **ver y marcar** (Cuidador e Hijo).

## Entregas (por partes)

1. **Entrega 1 — Tutores**: invitar y aceptar a un Tutor (US1), **quién marcó** cada toma (US2), **recordatorios por persona** (US3), **desvincularse** y quitar (US4) y **qué pasa si el plan se cancela** (US5). Sin las dos últimas no se puede lanzar: un tutor invitado nunca podría salir.
2. **Entrega 2 — Cuidador** (US6).
3. **Entrega 3 — Hijo** (US7), sujeta a la confirmación legal (ver Supuestos).

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Invitar a mi pareja y que vea y use lo mismo que yo (Prioridad: P1)

Una madre con el plan completo quiere que el papá vea los mismos hijos y consultas, registre consultas nuevas y marque tomas. En la lista de sus hijos abre **«Familia»** y **invita** al papá con su correo, eligiendo el rol **Tutor**. La app le da una **liga** para mandarle por WhatsApp (y le manda el correo). El papá abre la liga, entra con su cuenta (o la crea), **ve qué va a poder ver** y **acepta**. Desde ese momento ve **todos** los hijos y consultas de la familia, en el mismo home, y puede agregar hijos y consultas y marcar tomas. La madre ve la invitación como **Pendiente** y luego como **Aceptada**.

**Por qué esta prioridad**: es el corazón de la función y lo que se vende con el plan completo.

**Prueba Independiente**: con una cuenta de pago y otra cuenta distinta (con el correo invitado), invitar, abrir la liga con la segunda, aceptar: la segunda cuenta lista los mismos hijos y consultas, registra una consulta que la primera también ve, y la primera ve la invitación como Aceptada.

**Escenarios de Aceptación**:

1. **Dado** una cuenta con plan de pago, **Cuando** abre «Familia» e invita a un correo como **Tutor**, **Entonces** la invitación queda **Pendiente**, con su liga para compartir, y vence a los **7 días**.
2. **Dado** una invitación pendiente, **Cuando** la persona invitada abre la liga **con una cuenta cuyo correo verificado es el invitado** (o la crea), **Entonces** ve qué va a poder ver y hacer (los hijos de la familia y su rol) y puede **aceptar** o **rechazar**.
3. **Dado** que acepta, **Entonces** pasa a ver los hijos y las consultas de la familia junto a los suyos propios (si los tiene), con el mismo orden y las mismas pantallas, y sin pagar nada.
4. **Dado** un Tutor invitado, **Entonces** puede ver, agregar hijos y consultas, marcar tomas e invitar, exactamente como quien paga; lo que registra pertenece a la familia y lo ve todo el mundo con acceso.
5. **Dado** una liga, **Entonces** es de **un solo uso**: tras aceptarse, rechazarse o vencer, no sirve para nada más; y una cuenta con **otro** correo que la abra **no puede aceptarla**.
6. **Dado** el invitador, **Entonces** ve quién tiene acceso (nombre, rol, desde cuándo) y las invitaciones **Pendientes** con su vencimiento; puede **reenviar** (una liga nueva invalida la anterior) y **cancelar** una pendiente.
7. **Dado** una cuenta **sin** el plan de pago, **Entonces** no ve «Familia» para invitar (ve el aviso del plan, el mismo de siempre) y el servidor rechaza invitar.
8. **Dado** la familia ya con el máximo de personas (4, contando a quien paga), **Entonces** no se puede invitar a otra y se dice con claridad.
9. **Dado** que los datos del niño son datos de salud, **Entonces** antes de aceptar la persona ve un texto claro: compartir significa que **otra persona verá datos médicos del menor**; y el aviso «Antes de empezar» (que cada cuenta confirma) incluye ese texto nuevo.

---

### Historia de Usuario 2 - Saber quién dio la dosis, para no repetirla (Prioridad: P1)

Lo que más vale de compartir: cuando mamá marca la toma de las 8:00, papá, desde su teléfono, la ve **ya marcada** y ve **quién** la marcó: «Tomada · por Ana, 08:05». Así nadie da dos veces la misma dosis. Si el hijo (cuando exista ese rol) marca su toma, dice «por Luis». Un tutor puede **desmarcar** lo que marcó otra persona (por ejemplo, si el niño la marcó sin tomarla).

**Por qué esta prioridad**: es el riesgo real de compartir (dosis doble) y la razón por la que la gente lo pide.

**Prueba Independiente**: dos cuentas de la misma familia; una marca una toma; la otra, con la app abierta, la ve marcada en menos de un minuto con el nombre y la hora de quien la marcó; cada una desmarca la que marcó, y un Tutor desmarca la de otra persona.

**Escenarios de Aceptación**:

1. **Dado** una toma marcada, **Entonces** todas las personas con acceso a ese hijo la ven marcada, y junto al chip de «tomada» se lee **quién** la marcó (su nombre de pila) y **a qué hora**.
2. **Dado** que otra persona marca una toma mientras tengo la pantalla abierta, **Entonces** la veo marcada en **menos de un minuto** sin recargar, y al abrir o volver a la app, de inmediato.
3. **Dado** que marco una toma yo, **Entonces** la ven los demás con mi nombre (no se muestra mi correo).
4. **Dado** una toma marcada, **Cuando** cualquier **Tutor** la desmarca, **Entonces** vuelve a su estado sin marcar y deja de decir quién la marcó; **Cuando** la desmarca la misma persona que la marcó, ocurre lo mismo; otra persona sin ser Tutor **no puede** desmarcar la de alguien más.
5. **Dado** dos personas que marcan la misma toma casi a la vez, **Entonces** queda **una sola** marca (la primera) con su autor, y la segunda ve que ya estaba marcada, sin duplicarla ni sobrescribir quién fue.
6. **Dado** las tomas ya marcadas antes de esta función, **Entonces** se siguen viendo marcadas, sin autor («tomada») y sin ningún error.
7. **Dado** el texto, **Entonces** solo **registra** lo que pasó («por Ana, 08:05»); nunca opina, alerta ni acusa (Principio I).

---

### Historia de Usuario 3 - Que el aviso le llegue a cada quien, sin repetirse ni llegar tarde (Prioridad: P1)

Hoy el aviso de una toma llega a los dispositivos de la cuenta dueña. Con varias personas, **cada una** activa sus propios recordatorios en sus propios dispositivos y elige por sí misma si el aviso muestra el detalle o un texto genérico. A cada persona le llega **a lo más un aviso por toma**, y **no le llega** a quien ya vio la toma marcada.

**Por qué esta prioridad**: sin esto, compartir produciría avisos duplicados o avisos de dosis que alguien ya dio.

**Prueba Independiente**: con dos cuentas de una familia y un dispositivo activo en cada una, una toma vence: a cada cuenta le llega un solo aviso; si una la marca antes de su hora, a ninguna le llega; cada aviso respeta la elección de detalle de su persona.

**Escenarios de Aceptación**:

1. **Dado** una toma que vence, **Cuando** hay varias personas con acceso a ese hijo y recordatorios activos, **Entonces** a **cada una** (en sus dispositivos activos) le llega **un** aviso, y nunca dos por la misma toma.
2. **Dado** que una persona ya marcó la toma (o la vio marcada en su pantalla antes de que se enviara), **Entonces** a **nadie** se le avisa de ella.
3. **Dado** que cada persona eligió su forma de aviso (detalle o genérico), **Entonces** cada aviso la respeta; lo elegido por una no cambia lo de otra.
4. **Dado** el botón **«Tomada»** del aviso, **Entonces** marca la toma **a nombre de quien lo tocó** (su dispositivo) y los demás la ven marcada con su nombre.
5. **Dado** una persona que no tiene acceso a un hijo (un Hijo con otro hermano, o quien ya se desvinculó), **Entonces** nunca recibe avisos de él.
6. **Dado** una persona que deja de tener acceso, **Entonces** sus dispositivos dejan de recibir avisos de esa familia desde ese momento.
7. **Dado** que una persona activa recordatorios por primera vez, **Entonces** no recibe avisos de tomas que ya pasaron (como hoy).

---

### Historia de Usuario 4 - Salir de una familia, y quién puede quitar a quién (Prioridad: P1)

Quien fue invitado puede **desvincularse** cuando quiera: es **inmediato**, sin que nadie lo apruebe. Un **Tutor no puede quitarle el acceso a otro Tutor** (pensando en una separación o disputa de custodia): quien quiere salir es quien lo pide. Quien paga y los demás Tutores **sí** pueden quitar a un Cuidador o a un Hijo. Quien se desvincula **no se lleva nada** de la familia (los datos son de la cuenta dueña) pero antes ve un aviso claro; su propia cuenta y sus propios datos (si los tenía) siguen intactos.

**Por qué esta prioridad**: sin una salida, un tutor invitado quedaría atado para siempre; es parte inseparable de lanzar a los Tutores.

**Prueba Independiente**: un Tutor invitado se desvincula y deja de ver y recibir todo de esa familia al instante, conservando su cuenta; quien paga **no tiene** ninguna forma de quitarle el acceso; en cambio quita a un Cuidador y este lo pierde al instante.

**Escenarios de Aceptación**:

1. **Dado** una persona invitada, **Cuando** pide **desvincularse** y confirma, **Entonces** deja de ver a los hijos de esa familia, de recibir sus avisos y de poder marcar sus tomas, **de inmediato**.
2. **Dado** el aviso previo, **Entonces** le dice qué deja de ver, que **no se lleva** copia de lo de la familia y que sus propios hijos y datos (si tenía) no cambian.
3. **Dado** un **Tutor**, **Entonces** la app y el servidor **no ofrecen ni permiten** que otro Tutor (ni quien paga) lo quite; solo él puede salir.
4. **Dado** un **Cuidador** o un **Hijo**, **Entonces** cualquier Tutor (o quien paga) puede quitarlo, y lo pierde al instante, con confirmación previa.
5. **Dado** quien **paga**, **Entonces** no se puede desvincular de su propia familia (es la dueña de los datos); sus invitados salen, ella no.
6. **Dado** lo que la persona registró mientras estuvo (consultas, tomas marcadas), **Entonces** **se queda en la familia** y sigue visible para ella, con su nombre en «por …» en las tomas que marcó.
7. **Dado** una persona que se desvinculó, **Entonces** puede ser invitada de nuevo más adelante (una invitación nueva).

---

### Historia de Usuario 5 - Si quien paga deja de pagar (Prioridad: P1)

Si el plan de la cuenta dueña **deja de ser de pago**, nadie pierde nada de lo ya registrado: los invitados quedan en **solo lectura** (ven todo; **no pueden agregar** hijos ni consultas ni invitar) pero **siguen pudiendo marcar tomas** (es seguridad, no «agregar»). Para volver a usar la app con normalidad, el invitado **se desvincula** (US4); después de eso solo puede **unirse a otra familia con plan de pago**, o ser invitado de nuevo si el plan se reactiva. Quien pagaba vuelve a las reglas del plan gratuito (spec 029/030) sin perder lo registrado.

**Por qué esta prioridad**: es lo que hace honesto el corte de producto (Principio IV: lo ya capturado nunca se oculta ni se bloquea).

**Prueba Independiente**: pasar la cuenta dueña de `paid` a `free` con invitados: el invitado ve todo, no puede agregar, sí puede marcar; la dueña conserva todo; al volver a `paid`, el invitado recupera su rol sin invitarlo de nuevo.

**Escenarios de Aceptación**:

1. **Dado** que el plan de la cuenta dueña deja de ser de pago, **Entonces** todas las personas siguen viendo **todo** lo que veían, sin pérdida ni ocultamiento.
2. **Dado** ese estado, **Entonces** los invitados (cualquier rol) **no pueden** agregar hijos ni consultas ni invitar, ni la app lo ofrece; **sí pueden** marcar y desmarcar sus tomas.
3. **Dado** ese estado, **Entonces** la persona ve un aviso neutral de que es de solo lectura porque el plan de la familia ya no es de pago y que puede desvincularse.
4. **Dado** que el plan vuelve a ser de pago, **Entonces** las personas recuperan sus roles tal como estaban, sin nueva invitación.
5. **Dado** quien paga en el plan gratuito, **Entonces** se aplican las reglas de siempre (un hijo nuevo, un tratamiento activo a la vez, etc.) y **no puede invitar** de nuevo hasta volver al plan de pago.
6. **Dado** una persona que se desvincula en este estado, **Entonces** no puede unirse a otra familia **sin plan de pago**: el servidor lo rechaza con el aviso del plan.

---

### Historia de Usuario 6 - Que la abuela o la niñera vea y marque las tomas (Prioridad: P2)

Quien paga (o un Tutor) invita a una persona como **Cuidador**: ve a los hijos y sus consultas (incluida la receta) y **marca tomas** —desde la app o desde el aviso—, pero **no agrega** hijos ni consultas ni invita a nadie. Cualquier Tutor puede quitarla (US4).

**Por qué esta prioridad**: muy útil, pero la familia ya funciona con solo Tutores.

**Prueba Independiente**: invitar a un Cuidador; ve la lista y el detalle de las consultas, marca y desmarca la toma que marcó ella, recibe sus avisos; no ve «Nueva consulta», «Agregar hijo» ni «Familia» para invitar; el servidor rechaza si lo intenta por otro camino.

**Escenarios de Aceptación**:

1. **Dado** un Cuidador, **Entonces** ve todos los hijos de la familia y sus consultas, y recibe recordatorios si los activa.
2. **Dado** un Cuidador, **Entonces** marca tomas (queda «por …») y desmarca **solo** las que marcó ella.
3. **Dado** un Cuidador, **Entonces** no ve ni puede usar: agregar hijo, nueva consulta, finalizar o recorrer tratamiento, invitar o quitar a nadie; el servidor lo rechaza si se intenta.
4. **Dado** que el plan de la familia deja de ser de pago, **Entonces** el Cuidador no nota diferencia en lo que ya hacía (ver y marcar).

---

### Historia de Usuario 7 - Que un hijo mayor vea y marque sus propias tomas (Prioridad: P3)

Un tutor puede invitar a su hijo o hija de **10 años o más** como **Hijo/hija**, con **su consentimiento** explícito como tutor (queda registrado quién lo dio y cuándo). El hijo ve **su** tratamiento, recibe **sus** avisos y **marca sus propias tomas** (también desde el aviso con «Tomada»). No agrega nada, no invita, **no ve a sus hermanos**. Lo que marca queda como «por Luis» y un tutor puede desmarcarlo.

**Por qué esta prioridad**: valor real pero de menor volumen, y depende de la confirmación legal sobre menores.

**Prueba Independiente**: invitar a un Hijo desde un Tutor (con la casilla de consentimiento); el hijo ve solo las consultas y tomas suyas, marca una toma, y esta aparece «por Luis» para la familia; con dos hijos en la familia, ninguno ve al otro.

**Escenarios de Aceptación**:

1. **Dado** el rol Hijo, **Entonces** solo se puede invitar para un hijo que **ya tiene 10 años o más** (por su fecha de nacimiento) y el invitador debe **declarar su consentimiento** como tutor; sin eso no se envía.
2. **Dado** un Hijo, **Entonces** ve únicamente **su** perfil, sus consultas y sus tomas; nunca a sus hermanos ni a otros.
3. **Dado** un Hijo, **Entonces** marca sus tomas (queda «por <su nombre>») y desmarca **solo** las que marcó él; un Tutor puede desmarcar cualquiera.
4. **Dado** el registro de consentimiento, **Entonces** queda guardado quién lo dio, cuándo y para quién; un Tutor puede **retirar** el acceso del hijo en cualquier momento (US4).
5. **Dado** un Hijo, **Entonces** no ve «Familia», «Nueva consulta», «Agregar hijo» ni botones de finalizar o recorrer.

---

### Casos Límite

- **Una persona con su propia cuenta y sus propios hijos** que acepta una invitación: conserva sus datos y plan propios; ve los hijos de la familia **junto** a los suyos; lo que ella ve de la familia se rige por su rol y el plan de la familia, y lo de su cuenta, por su propio plan (nada de una familia se mezcla en la otra).
- **Una persona en varias familias**: se permite pertenecer a **una** familia como invitada a la vez (para unirse a otra, primero se desvincula); sigue siendo dueña de su propia cuenta.
- **Invitar a quien ya tiene acceso o ya tiene una invitación pendiente**: se avisa, no se duplica.
- **Invitación vencida, cancelada, usada o de otro correo**: la liga responde con un mensaje claro y sin revelar datos de la familia.
- **Correo de la invitación vs. cuenta**: aceptar exige que la cuenta con la sesión iniciada tenga ese correo **verificado**; quien no lo tiene ve cómo entrar con el correo correcto.
- **Quitar a alguien mientras tiene la pantalla abierta**: su siguiente petición se rechaza con un mensaje claro y vuelve a su home; no ve datos nuevos.
- **Dos Tutores a la vez**: invitar, quitar o marcar al mismo tiempo no deja estados a medias (una invitación se usa una sola vez; una toma queda marcada una sola vez).
- **Tope de hijos** (1 gratis, 10 de pago): lo que un Tutor invitado agrega cuenta para el tope de la familia.
- **Consultas inmutables** (spec 004): compartir no agrega edición ni borrado.
- **Tomas ya marcadas antes de esta función**: sin autor, se muestran como «tomada» sin «por …».
- **Un Hijo y la edad**: si un hijo aún no cumple 10 años, no se le puede invitar; si ya es Hijo, el acceso no se revoca solo por nada que cambie con la edad.
- **Privacidad**: la persona invitada ve el **nombre de pila** de quien marcó una toma, nunca su correo; lo que una persona hizo no se muestra a quien no tiene acceso al hijo.
- **Móvil y web**: cada diseño con el suyo (nunca mezclados), a 390 y 1280 px, sin desplazamiento horizontal a 390 px.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

**Invitaciones y acceso**

- **FR-001**: Una cuenta con **plan de pago** DEBE poder invitar a otras personas a su familia eligiendo un **rol**: Tutor, Cuidador o Hijo. Quien no tiene plan de pago NO DEBE poder invitar (la app muestra el aviso del plan; el servidor lo rechaza).
- **FR-002**: Cada invitación DEBE estar dirigida a un **correo**, venir con una **liga de un solo uso** que vence a los **7 días**, y mostrarse a quien invita como **Pendiente / Aceptada / Vencida / Cancelada**.
- **FR-003**: Aceptar DEBE exigir una sesión cuya cuenta tenga el **correo verificado** de la invitación; la persona DEBE ver, antes de aceptar, **qué va a ver y hacer** (rol y hijos) y el texto de que verá **datos médicos del menor**, y poder **rechazar**.
- **FR-004**: Una invitación DEBE usarse **una sola vez**; reenviar emite una liga nueva e invalida la anterior; quien invita puede **cancelar** una pendiente.
- **FR-005**: La familia DEBE tener un **máximo de 4 personas** (contando a quien paga); el servidor lo hace cumplir.
- **FR-006**: Una persona con acceso DEBE ver los hijos y consultas **de la familia junto a los suyos propios**, con las mismas pantallas, y todo dato nuevo que registre un Tutor DEBE pertenecer a la familia.
- **FR-007**: El **servidor** DEBE decidir en cada petición **si la persona tiene acceso a ese hijo y con qué rol**; nunca basta con lo que muestre la app.

**Roles y permisos**

- **FR-008**: El **Tutor** DEBE poder todo lo que puede quien paga (ver, agregar hijos y consultas, marcar tomas, finalizar y recorrer tratamientos, invitar, quitar a Cuidadores e Hijos, buscar en el historial), salvo ser quitado por otro Tutor y salvo cambiar el plan.
- **FR-009**: El **Cuidador** DEBE poder **ver** todos los hijos y consultas y **marcar** tomas; NO DEBE poder agregar hijos ni consultas, finalizar ni recorrer tratamientos, invitar ni quitar.
- **FR-010**: El **Hijo** DEBE ver **solo su perfil**, sus consultas y sus tomas, y marcar sus propias tomas; NO DEBE ver a otros hijos ni agregar, invitar o quitar. Solo se le puede invitar si ya tiene **10 años o más** y con el **consentimiento declarado** de un tutor, que queda registrado (quién, cuándo, para quién).
- **FR-011**: Cada persona DEBE poder **desmarcar solo las tomas que marcó**; un **Tutor** DEBE poder desmarcar **cualquiera**.

**Tomas: quién las marcó**

- **FR-012**: Cada toma marcada DEBE guardar **quién** la marcó y **cuándo**, y mostrarlo a todas las personas con acceso («por Ana, 08:05»), con el nombre de pila y nunca el correo.
- **FR-013**: Una marca hecha por una persona DEBE aparecer a las demás en **menos de un minuto** con la app abierta, y al instante al abrirla o volver a ella.
- **FR-014**: Dos marcas simultáneas de la misma toma DEBEN dejar **una sola**, con el autor de la primera; la segunda persona ve que ya estaba marcada.
- **FR-015**: Las tomas marcadas **antes** de esta función DEBEN seguir viéndose marcadas, sin autor y sin error.

**Recordatorios por persona**

- **FR-016**: Los recordatorios DEBEN ser **por persona y por dispositivo**: cada persona activa los suyos y elige por sí misma entre detalle y texto genérico.
- **FR-017**: Para cada toma, **cada persona con acceso** a ese hijo y con un dispositivo activo DEBE recibir **a lo más un** aviso; el aviso **no** DEBE enviarse a nadie si la toma ya está marcada al momento de enviarlo.
- **FR-018**: El botón **«Tomada»** del aviso DEBE marcar la toma **a nombre de la persona del dispositivo** que lo tocó.
- **FR-019**: Una persona sin acceso a un hijo (o que ya salió de la familia) NO DEBE recibir avisos de él; al perder el acceso, sus dispositivos dejan de recibir los de esa familia de inmediato.

**Salir, quitar y cancelar el plan**

- **FR-020**: Una persona invitada DEBE poder **desvincularse** cuando quiera, **de inmediato** y sin aprobación, tras ver un aviso de lo que pierde; su propia cuenta y sus propios datos no cambian.
- **FR-021**: Un **Tutor** NO DEBE poder ser quitado por otro Tutor ni por quien paga: ni la app lo ofrece ni el servidor lo permite; solo él puede salir. Quien **paga** no puede desvincularse de su propia familia.
- **FR-022**: Quien paga o cualquier Tutor DEBE poder **quitar** a un Cuidador o a un Hijo, con confirmación previa, con efecto inmediato.
- **FR-023**: Lo que una persona registró (consultas, tomas marcadas) DEBE **quedarse en la familia** al salir; quien sale **no conserva** acceso ni copia.
- **FR-024**: Si el plan de la cuenta dueña **deja de ser de pago**, nada ya registrado DEBE ocultarse ni borrarse; todas las personas invitadas DEBEN quedar en **solo lectura** (sin agregar ni invitar) conservando el **marcar y desmarcar** sus tomas, con un aviso neutral; al volver el plan de pago recuperan su rol sin nueva invitación.
- **FR-025**: Una persona que se desvincula DEBE poder **unirse solo a una familia con plan de pago** (el servidor lo rechaza si no) y pertenecer a **una** familia como invitada a la vez.

**Privacidad y datos**

- **FR-026**: El texto del aviso «Antes de empezar» DEBE incluir que compartir significa que otra persona ve datos médicos del menor, y subir su versión para que cada cuenta lo confirme de nuevo.
- **FR-027**: La app NUNCA DEBE opinar, alertar ni acusar sobre quién dio o no una dosis (Principio I): solo registra y muestra.
- **FR-028**: La persona que queda sin acceso (quitada o por su salida) DEBE recibir, en su siguiente petición, un rechazo claro y no ver datos nuevos.
- **FR-029**: Móvil y web DEBEN tener cada uno su propio diseño de «Familia», de la invitación y de «por …» en las tomas, sin desplazamiento horizontal a 390 px y con áreas táctiles de 44 px.

### Entidades Clave

- **Familia**: la cuenta dueña, sus hijos, sus consultas y las personas con acceso; el plan de la dueña es el de la familia.
- **Persona con acceso (membresía)**: una cuenta, su rol (Tutor, Cuidador, Hijo), de qué hijo (solo para el rol Hijo), quién la invitó, cuándo aceptó y su estado (activa, quitada, salió).
- **Invitación**: familia, correo, rol, hijo (rol Hijo), quién invita, estado, vencimiento, liga de un solo uso, y para el rol Hijo el **consentimiento** del tutor (quién y cuándo).
- **Marca de toma**: la toma, **quién** la marcó y **cuándo**.
- **Recordatorio por persona**: dispositivo, persona y su elección de detalle; un solo aviso por toma y por persona.
- **Cuenta** (ya existe): su plan decide qué se puede hacer (invitar, agregar, etc.).

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Una persona con plan de pago **invita a su pareja y esta acepta y ve los hijos de la familia en menos de 3 minutos**, sin ayuda.
- **SC-002**: Con la app abierta, una toma marcada por una persona **aparece marcada, con su autor, a las demás en menos de 1 minuto** (y al instante al abrir la app) en el **100 %** de los casos probados.
- **SC-003**: **Cero avisos duplicados**: a cada persona con dispositivo activo le llega **a lo más un** aviso por toma, y **ninguno** si la toma ya estaba marcada, en el **100 %** de los casos probados.
- **SC-004**: **Cero accesos indebidos**: ninguna petición de una persona sin acceso a un hijo (o con un rol que no lo permite) devuelve o cambia datos; el **100 %** de las rutas protegidas se comprueba con cada rol.
- **SC-005**: **Ningún Tutor puede ser quitado por otro**; el **100 %** de los intentos (por la app o por llamada directa) se rechaza.
- **SC-006**: Al cancelarse el plan, el **100 %** de lo ya registrado sigue visible para todas las personas y el **100 %** puede seguir marcando tomas.
- **SC-007**: Al desvincularse o ser quitada, una persona **pierde el acceso y los avisos de inmediato** (en su siguiente petición) en el **100 %** de los casos.
- **SC-008**: Una persona que no tiene familia compartida (la mayoría) **no nota ningún cambio** en la app.

## Supuestos

- **Una sola cuenta dueña por familia** guarda los datos; las personas invitadas **no** copian ni mueven datos: acceden a los de la dueña (por eso, al salir, no se llevan nada).
- **El correo de la invitación es el candado**: la liga es práctica (WhatsApp) pero **solo la cuenta con ese correo verificado la acepta**; es lo que evita que un Tutor (que no se puede quitar) entre por una liga reenviada por error.
- **Cuidador y Hijo según los hijos**: el Cuidador ve **todos** los hijos de la familia (elegir hijos por Cuidador queda para después); el Hijo, **solo el suyo**.
- **El Cuidador ve la consulta completa** (incluida la foto de la receta, solo lectura); el Hijo ve **sus** consultas y tomas.
- **Quién desmarca**: cada persona, lo suyo; un Tutor, cualquiera (el Cuidador y el Hijo no desmarcan lo de otros).
- **Máximo de 4 personas incluye a quien paga**; puede ajustarse sin cambiar el comportamiento.
- **Una familia como invitada a la vez** por persona; ser dueña de la propia cuenta no cuenta como pertenecer a una familia.
- **Hijo y la edad**: 10 años o más y **consentimiento declarado** de un tutor (decidido el 2026-10-05). **Pendiente legal** (antes de lanzar la Entrega 3): confirmar con alguien legal el consentimiento y la edad, y si el proveedor de cuentas admite menores de 13 años; si **no** los admite, el Hijo entrará con un acceso dado por el tutor (liga o código en su dispositivo, sin cuenta propia) y la spec de esa entrega lo definirá. Hasta entonces la Entrega 3 no se construye.
- **Pendiente legal** (antes de lanzar la Entrega 1): que un Tutor no pueda quitar al otro y que quien paga siga viendo lo que ve un ex-tutor; se confirma con alguien legal (LFPDPPP, datos de salud de menores).
- **El plan se da a mano** (SQL) hasta que exista el cobro (spec 029); «cancelar» el plan es que deje de ser de pago. El cobro, la pantalla de planes, el PDF, la liga para el pediatra y el Historial de todos los hijos **quedan fuera** (siguen en `BACKLOG.md`).
- **Aviso de nueva toma marcada por otra persona** (notificar «Ana marcó la toma») queda fuera: se ve al abrir la app o en el siguiente refresco; el aviso solo evita avisar de lo ya marcado.
- **Móvil y web**: no hay mocks entregados para «Familia» ni para la invitación; se diseñan con el sistema visual existente en dos diseños separados y se muestran al usuario para ajustes.
