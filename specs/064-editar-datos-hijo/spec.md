# Especificación de Funcionalidad: Editar los datos del hijo

**Rama**: `feature/064-editar-datos-hijo`
**Creada**: 2026-11-09
**Estado**: Borrador
**Entrada**: `BACKLOG.md` («Editar los datos del hijo», pedido del dueño del 2026-11-09) y sus decisiones del mismo día. Se corrigen nombre, apellido, fecha de nacimiento, talla y peso, también para arreglar un error de captura. Talla y peso se corrigen en cualquier plan; nombre, apellido y fecha de nacimiento, solo con el plan completo. Editan la dueña y un Tutor. Una fecha de nacimiento posterior a medidas o vacunas ya anotadas se rechaza y la app dice cuáles son. Al corregir talla y peso se ofrece anotarlos también como medida de hoy. Sin mock (sistema visual).

**Reemplaza** la regla FR-006a de la spec 001 (`specs/001-registro-cuenta-usuario/`), que prohibía editar el nombre, el apellido y la fecha de nacimiento de un hijo para que una cuenta gratuita no «recicle» a su único hijo como otro niño. La nueva regla conserva ese propósito: la identidad del hijo solo se corrige con el plan completo, que ya permite 10 hijos y por eso no da motivo para reciclar. **Sigue sin poder borrarse un hijo.**

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Corregir la talla y el peso del registro (Prioridad: P1)

Al dar de alta a Mateo, Ana escribió 9.5 kg cuando eran 12.5, y la talla la dejó vacía. Desde el detalle de Mateo toca «Editar datos», corrige el peso, escribe la talla (88 cm) y guarda. El detalle ya muestra los datos corregidos y, debajo, «Corregido el 9 nov por Ana». Si marca «Anotarlo también como medida de hoy», la misma talla y el mismo peso quedan además como una medida con la fecha de hoy en «Crecimiento».

**Por qué esta prioridad**: es lo que la spec 001 ya dejaba prever. Sirve en todos los planes y no abre la puerta a reciclar un hijo.

**Prueba Independiente**: con una cuenta del plan gratuito, corregir el peso y la talla de su hijo, volver a entrar y verlos corregidos con «Corregido el … por …». Repetirlo con la casilla marcada y ver la medida nueva en «Crecimiento».

**Escenarios de Aceptación**:

1. **Dado** el detalle de un hijo, **Cuando** la dueña (cualquier plan) toca «Editar datos», **Entonces** ve el formulario con el nombre, el apellido, la fecha de nacimiento, la talla y el peso guardados.
2. **Dado** el formulario, **Cuando** corrige el peso y la talla y guarda, **Entonces** se guardan, vuelve al detalle del hijo y ve los valores nuevos y «Corregido el … por Ana».
3. **Dado** el formulario, **Cuando** borra la talla (la deja vacía) y guarda, **Entonces** el hijo queda sin talla en el registro (son opcionales, como al darlo de alta).
4. **Dado** una talla o un peso que no es un número positivo, **Cuando** intenta guardar, **Entonces** ve un error neutral de formato en ese campo y no se guarda nada.
5. **Dado** el formulario con la casilla «Anotarlo también como medida de hoy» marcada, **Cuando** guarda, **Entonces** se corrige el registro **y** se crea una medida con la fecha de hoy y esos valores en «Crecimiento», las dos cosas juntas o ninguna.
6. **Dado** la casilla marcada y un valor fuera de lo que admite una medida de crecimiento (p. ej. 250 kg), **Cuando** intenta guardar, **Entonces** ve el mismo error de la spec 063 («Escribe el peso en kilogramos, entre 0.3 y 200») y no se guarda nada.
7. **Dado** que no cambió la talla ni el peso, **Cuando** mira el formulario, **Entonces** la casilla no se ofrece (no hay nada que anotar).

---

### Historia de Usuario 2 - Corregir el nombre y la fecha de nacimiento (Prioridad: P2)

Luis registró a su hija como «Sofia» y con la fecha de nacimiento un mes adelantada. Con el plan completo, en «Editar datos» corrige «Sofía» y la fecha. Al guardar, la edad que se muestra en toda la app y la de cada punto de su gráfica de crecimiento se calculan con la fecha nueva.

**Por qué esta prioridad**: es el error de captura más visible, pero cambia la identidad del hijo y por eso solo es del plan completo.

**Prueba Independiente**: con una cuenta de pago, corregir el nombre y la fecha de nacimiento de un hijo y verlos en el inicio, en el detalle y en la edad de sus medidas. Con una cuenta del plan gratuito, comprobar que esos campos se ven bloqueados con «Plan completo» y que el servidor rechaza el cambio aunque se mande directo.

**Escenarios de Aceptación**:

1. **Dado** una cuenta con el plan completo, **Cuando** corrige el nombre, el apellido o la fecha de nacimiento y guarda, **Entonces** se guardan y se ven en el inicio, la barra lateral, el detalle del hijo y las demás pantallas que lo nombran.
2. **Dado** una cuenta del plan gratuito, **Cuando** abre «Editar datos», **Entonces** ve el nombre, el apellido y la fecha de nacimiento deshabilitados, con la marca «Plan completo», y tocar la marca abre el aviso del plan con su motivo propio. La talla y el peso siguen editables.
3. **Dado** una cuenta del plan gratuito, **Cuando** de cualquier forma manda un cambio de nombre, apellido o fecha de nacimiento, **Entonces** el servidor lo rechaza con el aviso del plan y no cambia nada, tampoco la talla ni el peso que venían en la misma petición.
4. **Dado** un nombre con dígitos o símbolos, vacío o de más de 100 caracteres, **Cuando** intenta guardar, **Entonces** ve el mismo error de formato del registro (spec 001) en ese campo.
5. **Dado** una fecha de nacimiento futura, **Cuando** intenta guardar, **Entonces** ve el error en ese campo y no se guarda nada.
6. **Dado** un hijo con medidas de crecimiento o vacunas anotadas en fechas anteriores a la fecha de nacimiento nueva, **Cuando** intenta guardar, **Entonces** no se guarda nada y ve cuántas son y en qué fechas («Hay 2 medidas (3 mar 2022, 14 abr 2022) y 1 vacuna (10 mar 2022) anotadas antes de esa fecha. Corrígelas primero o elige otra fecha»).
7. **Dado** una fecha de nacimiento nueva igual o anterior a todo lo anotado, **Cuando** guarda, **Entonces** se guarda y la edad de cada medida en «Crecimiento» se recalcula con la fecha nueva.

---

### Historia de Usuario 3 - Quién puede editar (Prioridad: P2)

Carmen es Cuidadora en la familia de Ana. Ve los datos de Mateo pero no tiene «Editar datos». Luis, Tutor de la misma familia de pago, sí lo tiene. Cuando la familia deja de pagar, Luis pasa a solo ver.

**Por qué esta prioridad**: son los datos del hijo; deben corregirlos solo las personas con nivel completo, igual que todo lo demás.

**Prueba Independiente**: con una familia de pago, comprobar que la dueña y un Tutor editan; que un Cuidador no ve el botón y el servidor le responde «prohibido»; que el teléfono del hijo no tiene ninguna forma de editar.

**Escenarios de Aceptación**:

1. **Dado** un Tutor de una familia de pago, **Cuando** abre el detalle del hijo, **Entonces** ve «Editar datos» y puede corregir todo (el plan es el de la familia, que es de pago).
2. **Dado** un Cuidador, o un Tutor de una familia que dejó de pagar, **Cuando** abre el detalle del hijo, **Entonces** no ve «Editar datos», y si manda el cambio directo el servidor lo rechaza.
3. **Dado** el teléfono del hijo (spec 047), **Cuando** usa la app, **Entonces** no tiene ninguna forma de ver ni editar los datos del registro.
4. **Dado** una corrección guardada por Luis, **Cuando** Ana abre el detalle del hijo, **Entonces** ve «Corregido el 9 nov por Luis» (solo el nombre de pila).

---

### Casos Límite

- **Dos personas editan a la vez**: gana la última que guarda; la revisión de la fecha de nacimiento contra lo anotado se hace en el mismo momento en que se guarda, así que una medida anotada al mismo tiempo nunca queda antes del nacimiento.
- **Se anota una medida o una vacuna mientras otra persona cambia la fecha de nacimiento**: una de las dos operaciones espera a la otra; el resultado nunca deja una medida o vacuna antes del nacimiento.
- **Guardar sin cambios**: no se registra una corrección ni cambia «Corregido el … por …».
- **Una familia que pasa a plan gratuito**: lo ya corregido se conserva; la dueña puede seguir corrigiendo talla y peso, pero ya no el nombre ni la fecha.
- **Fecha de nacimiento y otros registros**: consultas, suplementos, actividades y citas no dependen hoy de la fecha de nacimiento (el plan lo verifica); solo las medidas de crecimiento y las vacunas la usan como límite.
- **La casilla con el tope de 500 medidas alcanzado**: no se guarda nada y se muestra el aviso del tope de la spec 063.
- **Salir del formulario con cambios sin guardar**: la app pide confirmar, igual que los demás formularios.
- **Cambiar la fecha de nacimiento a un día anterior**: siempre se permite (si no es futura); las medidas y las vacunas siguen después del nacimiento.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: El sistema DEBE permitir corregir, de un hijo ya registrado, su nombre, apellido, fecha de nacimiento, talla y peso del registro. Un hijo sigue sin poder borrarse.
- **FR-002**: Corregir la talla y el peso DEBE estar disponible en cualquier plan; corregir el nombre, el apellido o la fecha de nacimiento, solo cuando la cuenta dueña del hijo tiene el plan completo. El servidor decide el plan en el momento de guardar y, sin plan completo, rechaza **toda** la petición con el aviso del plan (motivo propio) sin cambiar nada.
- **FR-003**: Pueden editar quienes tienen nivel completo sobre el hijo: la dueña y un Tutor de una familia de pago. Quien solo ve y marca (Cuidador, Tutor de una familia que dejó de pagar) NO DEBE poder editar. Un integrante Hijo y el teléfono del hijo NO DEBEN tener ninguna forma de editar.
- **FR-004**: El nombre y el apellido DEBEN cumplir la misma regla del registro (spec 001, FR-001a): solo letras (con acentos y ñ), espacios, guiones y apóstrofes, de 1 a 100 caracteres, revisada en el teléfono y en el servidor.
- **FR-005**: La fecha de nacimiento NO DEBE ser futura y NO DEBE quedar después de la fecha de ninguna medida de crecimiento ni de ninguna vacuna ya anotadas de ese hijo. Si queda después, el sistema DEBE rechazar el cambio sin guardar nada y decir cuántas medidas y cuántas vacunas lo impiden y en qué fechas, para que el padre las corrija primero. La revisión DEBE hacerse en el mismo momento en que se guarda, para que una medida o vacuna anotada al mismo tiempo no la evada.
- **FR-006**: La talla y el peso del registro son opcionales; se pueden vaciar. Si se escriben, DEBEN ser números positivos (la regla del registro).
- **FR-007**: Cuando la talla o el peso cambian, el formulario DEBE ofrecer la casilla «Anotarlo también como medida de hoy», sin marcar por omisión. Marcada, el sistema DEBE crear además una medida de crecimiento con la fecha de hoy y los valores escritos (los que no estén vacíos), con las reglas de la spec 063 (rangos 0.3–200 kg y 30–220 cm, tope de 500 por hijo), y guardar la corrección y la medida juntas o ninguna.
- **FR-008**: Cada corrección guardada DEBE registrar quién la hizo y cuándo; el detalle del hijo DEBE mostrar «Corregido el … por …» con la fecha y solo el nombre de pila de quien corrigió la última vez. Guardar sin cambios NO DEBE contar como corrección.
- **FR-009**: Los datos corregidos DEBEN verse en todas las pantallas que muestran al hijo (inicio, barra lateral web, detalle, historial, PDF, crecimiento, cartilla), y la edad de cada medida de crecimiento DEBE recalcularse con la fecha de nacimiento nueva.
- **FR-010**: En el plan gratuito, el formulario DEBE mostrar el nombre, el apellido y la fecha de nacimiento deshabilitados con la marca «Plan completo», que abre el aviso del plan con su motivo propio; quien no puede contratar (un Tutor) ve en su lugar una frase de que la dueña de la familia tiene el plan.
- **FR-011**: El detalle del hijo DEBE tener una entrada «Editar datos» (teléfono y web, diseños separados) solo para quien puede editar; lleva a una página propia del formulario, que pide confirmar si se sale con cambios sin guardar.
- **FR-012**: Los nombres y los valores NUNCA DEBEN viajar en la dirección de una petición ni quedar en el registro de errores.
- **FR-013**: Los textos NO DEBEN evaluar los datos del hijo (Principio I): nada como «bajo peso», «normal» o «debería»; la prueba de redacción existente o una nueva DEBE vigilar los textos de esta pantalla.

### Entidades Clave

- **Hijo**: ya existe. Nombre, apellido, fecha de nacimiento, talla y peso del registro (sin fecha), ahora corregibles; se agregan quién lo corrigió por última vez y cuándo.
- **Medida de crecimiento** (spec 063): se crea una al guardar con la casilla marcada.
- **Vacuna anotada** (spec 046) y **medida de crecimiento**: sus fechas limitan qué fecha de nacimiento se puede guardar.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Un padre corrige un dato de su hijo en menos de 30 segundos desde el detalle del hijo.
- **SC-002**: Una cuenta del plan gratuito nunca logra cambiar el nombre, el apellido ni la fecha de nacimiento de un hijo en el 100 % de las pruebas, también mandando la petición directo al servidor.
- **SC-003**: Después de cualquier corrección guardada, ninguna medida de crecimiento ni vacuna de ese hijo queda con fecha anterior a su nacimiento, también con dos personas guardando al mismo tiempo.
- **SC-004**: Un Cuidador, un Tutor de familia vencida, un integrante Hijo, el teléfono del hijo y una persona de otra familia no pueden editar en el 100 % de las pruebas de acceso.
- **SC-005**: El dato corregido se ve igual en todas las pantallas que nombran al hijo justo después de guardar.
- **SC-006**: La pantalla funciona a 390 px y a 1280 px con diseños separados.

## Supuestos

- La talla y el peso del registro siguen sin fecha (spec 063 los muestra aparte); la casilla es la forma de convertirlos en una medida fechada.
- «Hoy» para la medida de la casilla es la fecha del teléfono del padre, con el mismo margen que ya acepta la spec 063 (hasta mañana en UTC).
- Las correcciones no guardan un historial de valores anteriores: solo la huella de la última (quién y cuándo), como las medidas y las vacunas.
- La tabla de la OMS elegida para la gráfica (niña o niño, spec 063) no es parte de este formulario; se sigue cambiando desde la gráfica.
- No se notifica a la familia de una corrección; se ve en el detalle del hijo.
- Sin mock: se construye con el sistema visual (`design-tokens.md`) y los componentes de las páginas de formulario existentes.
- Fuera de esta entrega: borrar un hijo, cambiar a qué cuenta pertenece, y editar los datos de la persona titular.
- La spec 001 (FR-006a) se anota con una nota de que esta spec la reemplaza.
