# Especificación de Funcionalidad: Ficha de datos permanentes del hijo

**Rama de la Funcionalidad**: `feature/073-ficha-del-hijo`

**Creado**: 2026-11-17

**Estado**: Borrador

**Entrada**: Descripción del usuario: "073 Ficha de datos permanentes del hijo (BACKLOG, «Ideas de la revisión de la app · Producto», anotado 2026-11-10; elegida por el dueño el 2026-11-17). Se agrega una ficha con los datos que no cambian de consulta a consulta, escritos tal cual por el papá: alergias, tipo de sangre, padecimientos o condiciones permanentes, pediatra de cabecera (con «Llamar») y una nota general. Se ve en el detalle del hijo y en la portada del PDF del historial. Principio I estricto: nunca cruza alergias con medicamentos, ni avisa, sugiere, evalúa o colorea. Principio II: datos sensibles de un menor. Escriben la dueña y un Tutor de familia de pago; un Cuidador la ve. Queda «Actualizada el … por Ana»."

## Contexto

Hoy el registro de un hijo guarda nombre, apellido, fecha de nacimiento, talla y peso (spec 001, editables desde la
spec 064). Lo que un papá necesita tener a la mano en una emergencia o al llegar con un médico nuevo —a qué es alérgico,
su tipo de sangre, si tiene un padecimiento de base, quién es su pediatra— no tiene dónde vivir: se repite en las notas
de cada consulta o no se anota. Quien cuida al niño (una abuela, una niñera con el rol Cuidador) tampoco lo tiene.

La ficha es **un registro**, como todo en PediTrack: guarda lo que el papá escribe y lo muestra tal cual. **No es una
herramienta clínica**: no revisa recetas contra alergias, no avisa de nada, no clasifica gravedades (Principio I).

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Anotar y ver la ficha del hijo (Prioridad: P1)

La mamá abre el detalle de su hijo, entra a «Ficha» y anota: alergia a la penicilina («le salen ronchas»), alergia al
cacahuate, tipo de sangre O+, asma como padecimiento, y su pediatra de cabecera con teléfono. Guarda. Desde ese momento,
la ficha aparece en el detalle del hijo con lo que escribió, en el orden en que lo escribió, y dice «Actualizada el 17
nov por Ana».

**Por qué esta prioridad**: es el valor central; sin poder anotar y ver la ficha no hay funcionalidad.

**Prueba Independiente**: con una cuenta y un hijo, llenar la ficha, guardar, salir y volver: todo se ve igual que se
escribió; editar una alergia y quitar otra: el cambio se ve y la fecha de actualización cambia.

**Escenarios de Aceptación**:

1. **Dado** un hijo sin ficha, **Cuando** el papá abre su detalle, **Entonces** ve la sección «Ficha» vacía con una
   invitación neutral a llenarla («Anota alergias, tipo de sangre, padecimientos y su pediatra»), sin alarmas.
2. **Dado** el formulario de la ficha, **Cuando** el papá agrega varias alergias (cada una con su texto y, opcional, un
   tipo —medicamento, alimento u otra— y una nota de reacción), un tipo de sangre, varios padecimientos, el pediatra
   (nombre, teléfono, consultorio opcional) y una nota general, y guarda, **Entonces** todo queda guardado tal cual y se
   muestra en el detalle del hijo.
3. **Dado** una ficha guardada, **Cuando** el papá edita o quita cualquier dato y guarda, **Entonces** la ficha refleja
   el cambio y dice «Actualizada el … por <nombre de pila>» de quien guardó.
4. **Dado** que el papá no sabe el tipo de sangre, **Cuando** llena la ficha, **Entonces** puede dejarlo vacío o elegir
   «No lo sé», y la ficha lo muestra sin juzgar.
5. **Dado** una ficha con pediatra y teléfono, **Cuando** el papá toca «Llamar» en el teléfono, **Entonces** se abre la
   llamada a ese número (en la computadora el número se muestra y se puede copiar).
6. **Dado** que el papá sale del formulario con cambios sin guardar, **Cuando** toca «atrás», **Entonces** la app le
   pregunta si quiere descartarlos (el diálogo de la spec 066).

---

### Historia de Usuario 2 - Que quien cuida al niño la vea (Prioridad: P2)

La abuela tiene el rol Cuidador en la familia. Cuando abre el detalle del nieto ve la ficha completa —alergias,
padecimientos, tipo de sangre y el pediatra con «Llamar»— pero no puede cambiarla. Un Tutor de la familia de pago sí la
puede editar.

**Por qué esta prioridad**: la ficha vale más justamente para quien cuida al niño cuando los papás no están; depende de
la historia 1.

**Prueba Independiente**: con una familia de pago (dueña, un Tutor y un Cuidador), la dueña llena la ficha; el Tutor la
ve y la edita; el Cuidador la ve sin botón de editar y, si intenta guardar por otro camino, se rechaza.

**Escenarios de Aceptación**:

1. **Dado** un Cuidador de la familia, **Cuando** abre el detalle del hijo, **Entonces** ve la ficha completa y no ve
   «Editar ficha».
2. **Dado** un Tutor de una familia de pago, **Cuando** edita la ficha, **Entonces** se guarda y dice «Actualizada el …
   por <su nombre de pila>».
3. **Dado** un Tutor de una familia que dejó de pagar, **Cuando** abre la ficha, **Entonces** la ve pero no la puede
   editar (como el resto de lo del hijo, spec 032).
4. **Dado** una persona sin acceso al hijo, **Cuando** intenta ver o cambiar su ficha, **Entonces** no obtiene nada.

---

### Historia de Usuario 3 - Llevarla en el PDF y en la descarga de datos (Prioridad: P3)

Cuando el papá exporta el historial a PDF (spec 050), la portada incluye la ficha, para entregarla a un médico nuevo. Y
cuando descarga todos sus datos (spec 070) o elimina su cuenta, la ficha va incluida o se borra con lo demás.

**Por qué esta prioridad**: amplía el alcance de la ficha a lo que ya existe; no es necesaria para el valor principal.

**Prueba Independiente**: con una ficha llena, generar el PDF del historial: la portada muestra la ficha; descargar los
datos de la cuenta: el archivo incluye la ficha; eliminar la cuenta (al vencer la gracia): la ficha ya no existe.

**Escenarios de Aceptación**:

1. **Dado** un hijo con ficha, **Cuando** se genera el PDF del historial, **Entonces** la portada muestra sus alergias,
   tipo de sangre, padecimientos, pediatra y nota tal cual, con la fecha de su última actualización.
2. **Dado** un hijo sin ficha, **Cuando** se genera el PDF, **Entonces** la portada no muestra una sección vacía.
3. **Dado** una cuenta con fichas, **Cuando** se descargan todos los datos, **Entonces** la ficha de cada hijo está en el
   archivo.
4. **Dado** una cuenta que se elimina, **Cuando** se completa el borrado, **Entonces** no queda ninguna ficha de sus
   hijos.

### Casos Límite

- **Ficha a medias**: cualquier campo puede quedar vacío; una ficha con solo una alergia es válida.
- **Textos largos**: cada texto tiene un largo máximo razonable; si se pasa, el formulario lo dice antes de guardar.
- **Muchas entradas**: un tope de alergias y de padecimientos por hijo (p. ej. 30 cada uno) para que la ficha siga
  siendo legible; al llegar al tope el botón de agregar se deshabilita con una explicación neutral.
- **Teléfono con formato libre**: se acepta como el papá lo escriba (con espacios, guiones, lada); «Llamar» usa solo
  los dígitos y el signo +.
- **Dos personas editan a la vez**: si otra persona guardó la ficha después de que se abrió el formulario, al guardar
  se avisa que cambió y se ofrece ver la versión nueva, sin perder lo escrito.
- **Alergia a un medicamento que está en una receta**: la app **no** lo detecta ni lo señala (Principio I); la ficha y
  la receta se muestran cada una por su lado.
- **Sin conexión** (spec 067): la ficha ya vista se puede ver; guardar necesita conexión, como todo.
- **Teléfono del hijo** (spec 047): no ve la ficha (ver FR-016).

## Requisitos *(obligatorio)*

### Requisitos Funcionales

**La ficha**

- **FR-001**: Cada hijo DEBE poder tener una ficha con: alergias (lista), tipo de sangre, padecimientos o condiciones
  permanentes (lista), pediatra de cabecera y una nota general. Todo es opcional.
- **FR-002**: Cada alergia DEBE tener lo que el papá escriba como nombre (obligatorio dentro de la entrada), un tipo
  opcional (medicamento, alimento u otra) y una nota opcional (p. ej. la reacción).
- **FR-003**: Cada padecimiento DEBE tener lo que el papá escriba como nombre y una nota opcional.
- **FR-004**: El tipo de sangre DEBE elegirse de una lista cerrada (O+, O−, A+, A−, B+, B−, AB+, AB−) o «No lo sé», o
  quedar vacío.
- **FR-005**: El pediatra de cabecera DEBE tener nombre, teléfono y, opcional, consultorio o dirección.
- **FR-006**: Los textos son **libres** (sin catálogos médicos de alergias ni de padecimientos) y se muestran **tal
  cual**, en el orden en que el papá los dejó; el papá puede reordenarlos.
- **FR-007**: La ficha DEBE decir cuándo se actualizó por última vez y el **nombre de pila** de quien la guardó; guardar
  sin cambios no cuenta como actualización.
- **FR-008**: Guardar DEBE avisar si otra persona guardó la ficha mientras tanto (sin sobrescribir a ciegas) y conservar
  lo que el papá escribió.

**Principio I (no negociable)**

- **FR-009**: La app NUNCA DEBE comparar la ficha con recetas, medicamentos, suplementos, vacunas ni nada más, ni
  avisar, sugerir, evaluar o clasificar por gravedad. Sin colores de alarma (rojo, ámbar), sin íconos de peligro, sin
  textos como «riesgo», «peligro», «grave» o «urgente» escritos por la app.
- **FR-010**: La sección de la ficha DEBE llevar una frase fija, neutral, de que es lo que la familia anotó y no
  sustituye la opinión del médico (en el tono del aviso «Antes de empezar»).

**Acceso**

- **FR-011**: Ver la ficha: cualquiera con acceso al hijo de nivel de lectura (la dueña, un Tutor y un Cuidador de la
  familia, spec 032).
- **FR-012**: Editar la ficha: la dueña y un Tutor de una familia de pago (nivel completo, como editar los datos del
  hijo en la spec 064); un Cuidador y un Tutor de una familia vencida solo la ven.
- **FR-013** *(decidido por el dueño, 2026-11-17)*: la ficha es de **cualquier plan**: ver y editar no dependen del plan
  (Principio IV: es el registro del propio hijo). Solo el nivel de acceso decide quién escribe (FR-012).

**Privacidad (Principio II)**

- **FR-014**: Los datos de la ficha DEBEN viajar solo en el cuerpo de las peticiones y respuestas, nunca en una
  dirección; NUNCA DEBEN aparecer en el registro de errores, en la consola del servidor, en correos ni en avisos push.
- **FR-015**: La ficha DEBE incluirse en la descarga de todos los datos (spec 070) y borrarse por completo con la cuenta.
- **FR-016** *(decidido por el dueño, 2026-11-17)*: el teléfono del hijo (spec 047) **no** ve la ficha ni puede pedirla:
  ese teléfono solo ve sus tomas y actividades de hoy.

**Dónde se ve**

- **FR-017**: En el detalle del hijo, una sección «Ficha» en ambos diseños (teléfono y web, nunca mezclados), con
  «Editar ficha» para quien puede y «Llamar» al pediatra.
- **FR-018**: En la portada del PDF del historial (spec 050), la ficha completa cuando existe; si no hay ficha, nada.
- **FR-019** *(decidido por el dueño, 2026-11-17)*: el diseño se pide a **Claude Design** (la sección en el detalle del
  hijo, el formulario y la portada del PDF, a 390 y 1280 px) y se construye tal cual el mock; mientras llega se avanza
  con el backend.
- **FR-020** *(decidido por el dueño, 2026-11-17)*: el dueño confirmó explícitamente esta funcionalidad, que toca los
  Principios I y II (datos sensibles de salud de un menor), como pide la constitución.

### Entidades Clave

- **Ficha del hijo**: una por hijo; tipo de sangre, nota general, pediatra (nombre, teléfono, consultorio), cuándo se
  actualizó y quién.
- **Alergia**: pertenece a la ficha; nombre libre, tipo opcional (medicamento, alimento, otra), nota opcional, orden.
- **Padecimiento**: pertenece a la ficha; nombre libre, nota opcional, orden.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Un papá llena una ficha típica (2 alergias, tipo de sangre, 1 padecimiento y el pediatra) en menos de 3
  minutos en el teléfono.
- **SC-002**: Lo guardado se ve **exactamente** como se escribió (mismo texto, mismo orden) en el detalle del hijo y en
  el PDF, en el 100 % de los casos probados.
- **SC-003**: Un Cuidador llega de la pantalla de inicio a la ficha del hijo y al botón «Llamar» del pediatra en 2
  toques o menos.
- **SC-004**: En una revisión de todas las pantallas, el PDF y los textos de la funcionalidad, **cero** colores de
  alarma, avisos, comparaciones con recetas o juicios escritos por la app.
- **SC-005**: En las pruebas, **cero** apariciones de datos de la ficha en el registro de errores, la consola del
  servidor o direcciones de las peticiones.
- **SC-006**: El 100 % de los intentos de editar por alguien sin permiso (Cuidador, Tutor de familia vencida, persona
  ajena) se rechaza sin cambiar nada.

## Supuestos

- La ficha cuelga del hijo y se edita en su propio formulario (no se mezcla con «Editar datos» de la spec 064, que
  corrige nombre, fecha, talla y peso).
- Topes razonables: 30 alergias y 30 padecimientos por hijo; nombres de hasta 120 caracteres, notas de hasta 300, nota
  general de hasta 1000, teléfono de hasta 30.
- El aviso «Antes de empezar» (spec 010) ya dice que la app es informativa; si el texto cambia para mencionar la ficha,
  sube su versión y se vuelve a pedir a todas las cuentas (se decide en el plan; por omisión no cambia).
- El aviso de privacidad debe mencionar que se guardan alergias, tipo de sangre, padecimientos y datos del pediatra:
  **pendiente del dueño**, no bloquea la construcción.
- «Llamar» abre la marcación del teléfono; la app no llama ni guarda registro de llamadas.
- La ficha de las consultas propias del titular (spec 058, `/yo`) queda fuera de esta entrega (BACKLOG).

## Fuera de alcance

- Cruzar alergias con recetas o avisar de cualquier cosa (prohibido por el Principio I, no es trabajo futuro).
- Catálogos médicos de alergias, padecimientos o medicamentos.
- Contactos de emergencia distintos del pediatra, vacunas en la ficha (ya está la cartilla, spec 046) y compartir la
  ficha por liga pública o código QR (BACKLOG si se quiere).
- Ficha del titular (`/yo`).
