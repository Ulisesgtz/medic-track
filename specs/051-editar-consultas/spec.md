# Especificación de Funcionalidad: Editar consultas ya guardadas

**Rama de la Funcionalidad**: `feature/051-editar-consultas`

**Creado**: 2026-10-26

**Estado**: Borrador

**Entrada**: Descripción del usuario: "Editar consultas ya guardadas. Sale de «Pendientes de decisión» del BACKLOG («Editar consultas y medicamentos»), decidido por el dueño el 2026-10-26: se edita todo (doctor, fecha, síntomas, notas y cada medicamento: nombre, frecuencia, duración, primera toma; también agregar un medicamento); un cambio de horario solo rehace las tomas futuras sin marcar; se puede quitar un medicamento sin tomas marcadas, la consulta completa no se borra; edita el nivel Full (dueña y Tutor) en cualquier plan; la consulta dice «Editada el … por Ana», sin historial de versiones."

## Contexto

Hoy una consulta guardada no se puede corregir (spec 004, FR-014): si el padre escribió mal el nombre del doctor, eligió una
frecuencia equivocada o se le olvidó un medicamento, el único camino es vivir con el error o capturar otra consulta. Ya hay
tres excepciones a esa regla, cada una acotada: finalizar un tratamiento (spec 016), recorrerlo (spec 020) y la próxima cita
(spec 033, parte 2). Esta spec agrega la **cuarta y más amplia**: editar la consulta, con una regla que protege lo ya
registrado — **lo que ya se marcó y lo que ya pasó no cambia nunca**; solo lo que todavía no llega se acomoda.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Corregir los datos de la consulta (Prioridad: P1)

La mamá abre una consulta guardada y ve que escribió «Dra. Laura Cazares» sin acento, que marcó «Tos» cuando era «Fiebre» y
que la nota quedó a medias. Toca «Editar consulta», corrige doctor, síntomas, notas y el nombre de un medicamento, y guarda.
El detalle muestra lo corregido y, abajo del encabezado, «Editada el 26 oct por Ana». Las tomas no se tocan.

**Por qué esta prioridad**: es el error más común (un dato mal escrito) y el más seguro de corregir: no cambia ninguna toma.
Sola ya resuelve la mayoría de los casos.

**Prueba Independiente**: editar doctor, fecha, síntomas, notas y el nombre de un medicamento de una consulta con tomas
marcadas, y comprobar que el detalle, la lista, el historial y «Tomas de hoy» muestran lo nuevo y que todas las tomas (y sus
marcas «por Ana») siguen iguales.

**Escenarios de Aceptación**:

1. **Dado** una consulta de la dueña, **Cuando** abre el detalle, **Entonces** ve «Editar consulta» y, al tocarlo, una página
   con el formulario de «Nueva consulta» lleno con los datos guardados.
2. **Dado** el formulario de edición, **Cuando** cambia doctor, síntomas, notas y el nombre de un medicamento y guarda,
   **Entonces** el detalle muestra los datos nuevos y «Editada el <día> por <nombre de pila>».
3. **Dado** una consulta con tomas marcadas por otra persona, **Cuando** se edita solo el nombre del medicamento,
   **Entonces** todas las tomas, su estado y «por Ana, 08:05» quedan exactamente como estaban.
4. **Dado** una consulta, **Cuando** se cambia la fecha a un día futuro, **Entonces** el formulario lo rechaza igual que al
   crear y no se guarda nada.
5. **Dado** el formulario con cambios sin guardar, **Cuando** el padre toca «← Cancelar» o sale, **Entonces** se le pide
   confirmar antes de perder lo escrito.
6. **Dado** una consulta, **Cuando** un Cuidador, un Tutor de una familia que dejó de pagar o el teléfono del hijo la abre,
   **Entonces** no ve «Editar consulta» y, si lo intenta por su cuenta, el servidor lo rechaza sin cambiar nada.

---

### Historia de Usuario 2 - Corregir el horario de un medicamento (Prioridad: P2)

El papá capturó «cada 6 h» cuando la receta decía «cada 8 h». Ya marcó las tomas de ayer. Edita la frecuencia; antes de
guardar, la app le dice en palabras neutras: «Las tomas que ya marcaste no cambian; las que aún no llegan se acomodan al
nuevo horario.» Al guardar, las tomas de ayer (marcadas o no) siguen ahí y las que faltan quedan cada 8 h.

**Por qué esta prioridad**: corrige el error que más afecta el seguimiento y los recordatorios, pero toca tomas, así que
necesita la regla de protección completa. Depende de la Historia 1 (la página de edición).

**Prueba Independiente**: con un medicamento de 3 días cada 6 h y algunas tomas pasadas (marcadas y sin marcar), cambiar a
cada 8 h y comprobar que lo pasado y lo marcado quedan, que las futuras sin marcar se rehacen cada 8 h y que no hay dos tomas
a la misma hora.

**Escenarios de Aceptación**:

1. **Dado** un medicamento con tomas pasadas y futuras, **Cuando** se cambia su frecuencia, duración o primera toma y se
   confirma, **Entonces** se quitan solo sus tomas futuras sin marcar y se agregan las del nuevo horario que aún no llegan.
2. **Dado** el nuevo horario, **Cuando** una de sus horas coincide con una toma que se conservó, **Entonces** no se crea otra
   toma a esa misma hora.
3. **Dado** el nuevo horario, **Cuando** alguna de sus horas ya pasó, **Entonces** no se crea una toma en el pasado.
4. **Dado** una toma futura que alguien ya marcó por adelantado, **Cuando** cambia el horario, **Entonces** esa toma se
   conserva con su marca y su autor.
5. **Dado** un cambio que rehace tomas, **Cuando** el padre toca «Guardar», **Entonces** ve la confirmación neutral antes de
   que se guarde; un cambio que no toca horarios no la pide.
6. **Dado** un tratamiento finalizado (spec 016), **Cuando** se edita, **Entonces** su frecuencia, duración y primera toma no
   se pueden cambiar (el nombre sí).
7. **Dado** una consulta «solo registro» (spec 024), **Cuando** se edita, **Entonces** sus medicamentos se editan sin
   «Primera toma» y no se crea ninguna toma.

---

### Historia de Usuario 3 - Agregar o quitar un medicamento (Prioridad: P3)

A la mamá se le olvidó capturar el jarabe para la tos. Desde «Editar consulta» agrega un medicamento con su horario. Otra
vez, capturó dos veces el mismo antibiótico; quita el repetido, que no tiene ninguna toma marcada.

**Por qué esta prioridad**: menos frecuente que corregir un dato o un horario, y agregar un medicamento cruza con la regla del
plan gratuito (un tratamiento activo a la vez).

**Prueba Independiente**: agregar un medicamento a una consulta existente y ver sus tomas en el detalle, en «Tomas de hoy» y en
los recordatorios; quitar un medicamento sin marcas y comprobar que desaparece con sus tomas; intentar quitar uno con una toma
marcada y comprobar que no se puede.

**Escenarios de Aceptación**:

1. **Dado** la edición de una consulta, **Cuando** se agrega un medicamento con frecuencia, duración y primera toma,
   **Entonces** se crean sus tomas que aún no llegan, como si se hubiera capturado con la consulta.
2. **Dado** un medicamento sin ninguna toma marcada, **Cuando** se quita y se guarda, **Entonces** desaparece de la consulta
   con todas sus tomas.
3. **Dado** un medicamento con al menos una toma marcada, **Cuando** se intenta quitar, **Entonces** la app no ofrece
   «Quitar» para él y el servidor lo rechaza.
4. **Dado** una consulta con un solo medicamento, **Cuando** se intenta quitarlo, **Entonces** no se puede (una consulta
   tiene al menos uno, como al crearla).
5. **Dado** una cuenta del plan gratuito con un tratamiento activo en **otra** consulta, **Cuando** se agrega un medicamento
   con tomas por delante a esta consulta, **Entonces** el servidor lo rechaza con el aviso del plan («un tratamiento activo a
   la vez») y no se guarda ningún cambio de esa edición.

---

### Casos Límite

- **Dos personas editan la misma consulta a la vez** (la dueña y un Tutor, o dos dispositivos): la segunda en guardar recibe
  un aviso de que la consulta cambió mientras la editaba y la app vuelve a cargar los datos; nunca se mezclan dos ediciones.
- **Alguien marca una toma mientras otro edita el horario**: la marca gana — al guardar, el servidor revisa de nuevo qué tomas
  están marcadas en ese momento y nunca quita una marcada.
- **Una toma «por marcar» (ya pasó su hora, aún no se marca)**: es pasado; se conserva y se puede seguir marcando.
- **Tomas agregadas por un recorrido (spec 020)**: son tomas del medicamento; si cambia el horario, las futuras sin marcar se
  quitan como las demás y el nuevo horario no repite el recorrido. El registro «Se recorrió el … · +2 tomas» se queda (es
  historia).
- **Cambiar la fecha de la consulta** en una consulta con tratamiento cambia cuándo empieza cada medicamento: se trata como
  un cambio de horario de todos sus medicamentos (con la misma confirmación y la misma regla de protección).
- **Un síntoma retirado del catálogo** que la consulta ya tenía: se conserva si el padre no lo quita; no se puede volver a
  marcar uno retirado.
- **Cambiar la foto de la receta**: se reemplaza; el tope de 100 recetas con foto por cuenta (spec 043) aplica cuando una
  consulta sin foto recibe una.
- **Recordatorios**: un aviso ya enviado no se reenvía; las tomas nuevas se avisan como cualquier toma; una toma quitada ya no
  se avisa.
- **Un medicamento finalizado** no se puede quitar si tiene tomas marcadas, igual que cualquiera; sin marcas sí.
- **Una consulta con próxima cita** (spec 033): editar la consulta no cambia la cita.
- **El plan gratuito** edita igual que el de pago: solo se rechaza lo que crearía un segundo tratamiento activo en la cuenta.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

**Quién y cuándo**

- **FR-001**: Solo quien tiene nivel completo sobre el hijo (la dueña de la cuenta y un Tutor de una familia con plan de pago)
  DEBE poder editar una consulta; un Cuidador, un Tutor de una familia que dejó de pagar, un integrante con rol de Hijo y el
  teléfono del hijo NO DEBEN poder. El servidor lo decide en cada petición.
- **FR-002**: Editar NO DEBE requerir el plan de pago (corregir lo propio no se cobra; Principio IV). Las reglas del plan
  gratuito al crear se conservan (FR-015).
- **FR-003**: La app DEBE ofrecer «Editar consulta» en el detalle de la consulta, en ambos diseños, solo a quien puede editar y
  solo cuando ya sabe quién es la persona.

**Qué se edita**

- **FR-004**: Se DEBEN poder editar: el nombre del doctor, la fecha de la consulta (no futura), los síntomas marcados (solo
  del catálogo activo, conservando los retirados que ya tenía), las notas previas, la foto de la receta (reemplazarla) y, de
  cada medicamento, su nombre, frecuencia, duración y primera toma; con las mismas reglas de validación que al crear.
- **FR-005**: Se DEBE poder agregar un medicamento a una consulta existente y quitar uno **que no tenga ninguna toma
  marcada**, siempre que la consulta conserve al menos un medicamento. La consulta completa NO se borra.
- **FR-006**: Una consulta «solo registro» DEBE seguir siéndolo: se editan sus datos y medicamentos sin primera toma ni tomas;
  no se puede convertir en una con tratamiento ni al revés.
- **FR-007**: De un tratamiento finalizado NO se DEBEN poder cambiar frecuencia, duración ni primera toma (sí su nombre).

**Las tomas**

- **FR-008**: Un cambio de horario de un medicamento (frecuencia, duración, primera toma, o la fecha de la consulta) DEBE
  quitar **solo** sus tomas cuya hora aún no llega y que no están marcadas.
- **FR-009**: Las tomas marcadas (con su autor y su hora de marca) y las tomas cuya hora ya pasó NO DEBEN cambiar nunca por una
  edición, aunque el nuevo horario no las incluya.
- **FR-010**: Después de quitar, se DEBEN crear las tomas del nuevo horario (calculado como al crear: desde la fecha y la
  primera toma, cada «frecuencia» horas, durante «duración» días, en la zona horaria del padre) **cuya hora aún no llega y
  que no coinciden con una toma que se conservó**. Nunca se crea una toma en el pasado ni dos a la misma hora.
- **FR-011**: Un cambio que no toca el horario (doctor, notas, síntomas, nombre, foto) NO DEBE tocar ninguna toma.
- **FR-012**: Antes de guardar un cambio que rehace tomas, la app DEBE mostrar una confirmación neutral: «Las tomas que ya
  marcaste no cambian; las que aún no llegan se acomodan al nuevo horario.» Un cambio sin horarios no la pide.
- **FR-013**: Lo derivado de las tomas (estado de cada toma, «Tomas de hoy», tratamiento activo, progreso, calendario,
  recordatorios, historial y PDF) DEBE reflejar el resultado sin reglas propias de la edición. Un recordatorio ya enviado no
  se reenvía.

**Integridad**

- **FR-014**: Una edición DEBE guardarse completa o no guardarse (datos, medicamentos y tomas en un solo paso). Si otra persona
  guardó una edición de la misma consulta después de que se abrió el formulario, el servidor DEBE rechazar la segunda con un
  aviso de conflicto, sin cambiar nada, y la app DEBE volver a cargar la consulta.
- **FR-015**: En una cuenta del plan gratuito, una edición que deje a esta consulta con tomas por delante **mientras otra
  consulta de la cuenta tiene un tratamiento activo** DEBE rechazarse con el mismo aviso del plan que al crear
  («un tratamiento activo a la vez»), sin guardar nada. Editar la consulta que ya es el tratamiento activo no se rechaza.

**Registro y privacidad**

- **FR-016**: Al guardar, la consulta DEBE registrar quién la editó por última vez y cuándo; el detalle DEBE decir «Editada
  el <día> por <nombre de pila>» (nunca el correo). No se guarda historial de versiones.
- **FR-017**: Los textos libres (doctor, notas, nombres de medicamentos) DEBEN viajar solo en el cuerpo de la petición, nunca
  en la dirección ni en el registro de errores.
- **FR-018**: Ningún texto de la edición DEBE evaluar o aconsejar (Principio I): ni «faltan tomas», ni «corrige tu
  tratamiento», ni colores de alerta.
- **FR-019**: Salir del formulario con cambios sin guardar DEBE pedir confirmación; al guardar, «atrás» NO DEBE volver al
  formulario ya enviado.

### Entidades Clave

- **Consulta**: gana «editada por» (la cuenta) y «editada el» (el momento) de la última edición; nada más cambia de su forma.
- **Medicamento**: sus datos pueden cambiar; puede agregarse o quitarse (sin marcas) dentro de una consulta existente.
- **Toma**: las futuras sin marcar se quitan y se crean según el horario; las marcadas y las pasadas son intocables.
- **Recorrido (spec 020)** y **fin del tratamiento (spec 016)**: se conservan como registro; el fin impide cambiar el horario.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Corregir un dato de una consulta (p. ej., el nombre del doctor) toma menos de 30 segundos desde el detalle.
- **SC-002**: En el 100 % de las ediciones, ninguna toma marcada ni ninguna toma pasada cambia de hora, estado o autor.
- **SC-003**: Después de un cambio de horario no existen dos tomas del mismo medicamento a la misma hora ni tomas nuevas en el
  pasado (verificado en las pruebas con cambios de frecuencia, duración, primera toma y fecha).
- **SC-004**: Dos ediciones simultáneas de la misma consulta nunca producen una mezcla: una se guarda entera y la otra recibe
  el aviso de conflicto.
- **SC-005**: Ninguna persona sin nivel completo logra cambiar una consulta (verificado ruta por ruta para dueña, Tutor,
  Tutor de familia vencida, Cuidador, Hijo y teléfono del hijo).
- **SC-006**: El texto libre editado no aparece en ninguna dirección ni en el registro de errores.

## Supuestos

- Las decisiones del dueño del 2026-10-26 (BACKLOG, «Editar consultas y medicamentos»): se edita todo; el horario solo cambia
  a futuro; se quita un medicamento solo sin marcas; edita el nivel completo en cualquier plan; «Editada el … por Ana».
- «Ya pasó» se decide con el reloj del servidor (como el estado de las tomas, spec 013); «aún no llega» = hora posterior al
  momento de guardar.
- El nuevo horario se calcula entero con los datos nuevos y solo se crean sus horas futuras libres; no se intenta «continuar»
  el horario viejo ni conservar el número de tomas.
- La confirmación de conflicto usa el momento de la última edición (o de la creación) que el formulario recibió al abrirse.
- No hay mock entregado: la página reutiliza el formulario de «Nueva consulta» (dos diseños, sistema visual de la spec 005).
- La foto se puede reemplazar, no quitar (la consulta sin foto es solo la que se guardó así por el tope de la spec 043).
- La próxima cita, los recordatorios por persona y la familia funcionan como hoy; el PDF (spec 050) mostrará «Editada el…»
  cuando se termine esa spec, si se decide.
- Esta es la cuarta excepción a la inmutabilidad de la spec 004 (FR-014); la constitución y los mapas lo dirán al cerrar.
