# Especificación de Funcionalidad: Registro de Cuenta de Usuario y Perfiles de Hijos

**Rama de la Funcionalidad**: `feature/001-registro-cuenta-usuario`

**Creado**: 2026-09-15

**Estado**: Borrador

**Entrada**: Descripción del usuario: "Crear la funcionalidad de registro de cuenta de usuario (padre/tutor) con sus hijos para PediTrack. Alcance de este spec: SOLO el flujo de creación (Create). El listado (Read) y la edición (Update) de usuarios se harán en una tarea futura separada — el Update futuro solo permitirá editar talla y peso de los hijos, no otros campos de hijos. Delete no está en el roadmap por ahora. No incluye login/autenticación (eso es fase futura); el email se captura como dato pero no hay sesión ni password en esta fase. Página de creación de cuenta con datos del padre/tutor (nombre, apellido, correo, país y estado opcionales) y un listado de hijos agregable dinámicamente (nombre, fecha de nacimiento obligatoria, talla y peso opcionales), con regla freemium de un hijo gratis por cuenta y aviso de upgrade al intentar agregar un segundo hijo."

## Aclaraciones

### Sesión 2026-09-15

- Q: ¿El campo "Nombre" del hijo debe dividirse en nombre y apellido por separado, igual que el padre/tutor? → A: Sí, separado (Opción A) — nombre y apellido como campos distintos, por consistencia con la entidad Cuenta.
- Q: ¿País y Estado deben ser catálogo (dropdown) o texto libre? → A: Catálogo (Opción A) — lista predefinida de países y estados.
- Q: ¿El banner freemium aparece al guardar o al intentar agregar el 2do hijo, y se pierden los datos ya escritos? → A: El banner aparece de inmediato al presionar "Agregar hijo" por segunda vez (no hasta guardar). Los datos ya capturados (tutor + todos los hijos, incluido el que excede el límite) NUNCA se pierden: si el usuario cierra el banner y continúa en freemium, los datos permanecen en el formulario; si contrata el plan de pago, el sistema retoma esos mismos datos ya listos para completar el alta del segundo hijo sin volver a escribirlos.

### Sesión 2026-09-15 (revisión)

- Q: Al presionar "Agregar hijo" por segunda vez sin plan de pago, ¿se revela el formulario del segundo hijo junto con el banner (decisión original arriba), o el banner aparece SIN revelar ese formulario, bloqueando la creación del segundo hijo hasta pagar? → A: Se bloquea — el banner aparece pero el formulario del segundo hijo NO se crea/revela en absoluto mientras la cuenta no tenga plan de pago. Esto **reemplaza** la decisión de la sesión anterior sobre este punto específico (los Escenarios de Aceptación 1, 2 y 4 de la Historia 3 quedan actualizados abajo). La garantía de "nunca perder datos ya capturados" se mantiene para el tutor y para el primer hijo (el único que sí se puede crear en plan gratuito) — simplemente ya no aplica a un segundo hijo porque su formulario nunca llega a existir sin plan de pago.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Crear cuenta de padre/tutor (Prioridad: P1)

Un padre o tutor llega a la página de registro y crea su cuenta llenando sus datos básicos, sin necesidad de agregar ningún hijo todavía.

**Por qué esta prioridad**: Es el flujo base indispensable — sin una cuenta creada no existe nada más que construir encima. Debe funcionar de forma completamente aislada.

**Prueba Independiente**: Se puede probar por completo llenando únicamente los campos obligatorios de la cuenta (nombre, apellido, correo) sin agregar ningún hijo, y verificando que la cuenta se guarda correctamente.

**Escenarios de Aceptación**:

1. **Dado** que estoy en la página de creación de cuenta, **Cuando** lleno nombre, apellido y correo válidos (sin hijos) y guardo, **Entonces** la cuenta se crea exitosamente.
2. **Dado** que dejo el campo de correo vacío, **Cuando** intento guardar, **Entonces** el sistema muestra un error de validación y no crea la cuenta.
3. **Dado** que ingreso un correo con formato inválido, **Cuando** intento guardar, **Entonces** el sistema muestra un error de validación específico de formato.
4. **Dado** que ingreso un correo que ya existe en el sistema, **Cuando** intento guardar, **Entonces** el sistema rechaza el registro indicando que el correo ya está en uso.

---

### Historia de Usuario 2 - Agregar hijos durante el registro (Prioridad: P2)

Mientras crea su cuenta, el padre/tutor agrega uno o más hijos usando el botón "Agregar hijo", que revela los campos correspondientes por cada hijo.

**Por qué esta prioridad**: Es el valor central del producto — una cuenta sin hijos no tiene para qué existir en PediTrack. Depende de que la Historia 1 (creación de cuenta) ya funcione, por eso es P2 y no P1.

**Prueba Independiente**: Se puede probar por completo agregando un hijo con nombre, apellido y fecha de nacimiento (los únicos campos obligatorios de hijo), dejando talla y peso vacíos, y verificando que la cuenta se guarda con ese hijo asociado.

**Escenarios de Aceptación**:

1. **Dado** que estoy creando mi cuenta, **Cuando** presiono el botón "Agregar hijo", **Entonces** aparecen los campos nombre, apellido, fecha de nacimiento, talla y peso para ese hijo.
2. **Dado** que lleno nombre, apellido y fecha de nacimiento de un hijo (sin talla ni peso), **Cuando** guardo la cuenta, **Entonces** se crea exitosamente con ese hijo asociado.
3. **Dado** que dejo la fecha de nacimiento de un hijo vacía, **Cuando** intento guardar, **Entonces** el sistema muestra un error de validación en ese campo.
4. **Dado** que ingreso una fecha de nacimiento futura para un hijo, **Cuando** intento guardar, **Entonces** el sistema la rechaza como inválida.
5. **Dado** que agregué un bloque de hijo por error, **Cuando** lo remuevo antes de guardar, **Entonces** ese hijo no se incluye en la cuenta ni cuenta para ningún límite.
6. **Dado** que ya guardé mi cuenta con un hijo persistido, **Cuando** reviso mi cuenta, **Entonces** no existe ninguna opción visible para eliminar ese hijo, ni para editar su nombre, apellido o fecha de nacimiento (fuera de alcance de este spec; talla/peso se editarán en una tarea futura).

---

### Historia de Usuario 3 - Aviso de límite freemium al agregar un segundo hijo (Prioridad: P3)

Un padre/tutor con plan gratuito intenta agregar un segundo hijo y el sistema le informa de inmediato, mediante un banner, que debe contratar el plan completo para dar de alta más de uno — sin crear el formulario de ese segundo hijo mientras no pague, y sin perder en ningún momento los datos del tutor ni del primer hijo ya capturados.

**Por qué esta prioridad**: Es la regla de negocio de monetización (Principio IV de la constitución) — importante para el modelo de negocio, pero depende de que ya exista el flujo de agregar hijos (Historia 2), por eso es P3.

**Prueba Independiente**: Se puede probar por completo llenando los datos de un primer hijo y luego presionando "Agregar hijo" una segunda vez, verificando que el banner aparece de inmediato, que NO aparece un segundo bloque de campos, y que los datos del tutor y del primer hijo permanecen intactos.

**Escenarios de Aceptación**:

1. **Dado** que ya llené los datos de un hijo, **Cuando** presiono "Agregar hijo" por segunda vez, **Entonces** el sistema muestra de inmediato un banner indicando que el plan gratuito incluye solo un hijo y que debe contratar el plan completo para dar de alta más, con un botón hacia la página de planes — y NO se crea ni se revela un segundo bloque de campos de hijo.
2. **Dado** que veo el banner, **Cuando** lo cierro o simplemente sigo en la página, **Entonces** los datos del tutor y del primer hijo permanecen en el formulario sin perderse, y sigo teniendo únicamente un bloque de hijo (el segundo nunca se creó).
3. **Dado** que veo el banner y presiono el botón "Ver planes", **Entonces** soy redirigido a una ruta/página de planes (no implementada aún — puede ser un placeholder o ruta pendiente en esta fase).
4. **Dado** que presiono "Agregar hijo" repetidamente estando en plan gratuito con ya un hijo agregado, **Cuando** cada intento ocurre, **Entonces** el sistema vuelve a mostrar el mismo banner y sigue sin crear bloques adicionales — el límite de campos de hijo visibles en plan gratuito es siempre 1.

---

### Casos Límite

- ¿Qué pasa si el usuario remueve un hijo ya agregado antes de guardar? No debe contar para el límite freemium ni persistirse.
- ¿Qué pasa si un usuario con plan gratuito intenta eliminar un hijo ya persistido para "liberar espacio" y agregar otro? No debe ser posible — no existe función de eliminar hijos persistidos en ninguna fase planeada hasta ahora, precisamente para evitar este abuso del límite freemium.
- ¿Qué pasa si el correo ingresado ya existe en el sistema? El sistema debe rechazar el registro con un mensaje claro de correo duplicado (ver Historia 1, escenario 4).
- ¿Qué pasa si la fecha de nacimiento de un hijo es una fecha futura? Debe rechazarse como inválida (ver Historia 2, escenario 4).
- ¿Qué pasa si el usuario intenta guardar con cero hijos? Debe permitirse — la cuenta se crea sin hijos; se podrán agregar después en una tarea futura de edición/listado.
- ¿Qué pasa si talla o peso se llenan con valores no numéricos o negativos? El sistema debe rechazarlos como inválidos si se proporcionan, aunque el campo en sí sea opcional.
- ¿Qué pasa si el usuario presiona "Agregar hijo" varias veces sin plan de pago? El mismo banner de la Historia 3 se muestra cada vez; el sistema nunca crea un segundo bloque de campos de hijo en plan gratuito, sin importar cuántas veces se presione el botón.
- ¿Se pierden los datos capturados si el usuario ve el banner freemium sin contratar un plan? No — los datos del tutor y del primer hijo permanecen en el formulario; simplemente no se crea un segundo bloque de hijo mientras no haya plan de pago activo.
- (Defensa en profundidad) ¿Qué pasa si, por algún medio distinto al formulario (p. ej. llamar la API directamente), llegan 2 o más hijos en la solicitud de una cuenta sin plan de pago? El servidor DEBE rechazar la solicitud igualmente (ver FR-007) — la validación del límite no depende únicamente de que el frontend nunca envíe más de un hijo.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: El sistema DEBE permitir crear una cuenta de padre/tutor con nombre, apellido y correo electrónico como campos obligatorios, y país y estado como campos opcionales, seleccionables desde un catálogo predefinido (no texto libre).
- **FR-002**: El sistema DEBE validar que el correo electrónico tenga un formato válido y sea único entre las cuentas existentes.
- **FR-003**: El sistema DEBE permitir agregar hijos dentro del mismo formulario de creación de cuenta, mediante un botón "Agregar hijo" que revela dinámicamente los campos de un nuevo hijo — hasta el límite que permita el plan de la cuenta (1 hijo en el plan gratuito, ver FR-007). Al alcanzar el límite, el botón NO DEBE revelar un bloque adicional; en su lugar aplica FR-007.
- **FR-004**: Por cada hijo agregado, el sistema DEBE requerir nombre, apellido y fecha de nacimiento (como campos separados, igual que en la Cuenta), y DEBE permitir talla y peso como campos opcionales.
- **FR-005**: El sistema DEBE validar que la fecha de nacimiento de un hijo no sea una fecha futura.
- **FR-006**: El sistema DEBE permitir remover un bloque de hijo ya agregado **antes** de guardar la cuenta (mientras el formulario no se ha persistido).
- **FR-006a**: Una vez que un hijo queda persistido (la cuenta fue guardada exitosamente), el sistema NO DEBE permitir eliminarlo bajo ninguna circunstancia en esta fase, y NO DEBE permitir editar su nombre, apellido ni fecha de nacimiento (una futura tarea de edición solo permitirá modificar talla y peso). Razón: evitar que una cuenta con plan gratuito "rote" hijos (elimina uno, agrega otro) para dar de alta más niños de los que su plan permite.
- **FR-007**: El sistema DEBE aplicar la regla de negocio freemium: al presionar "Agregar hijo" cuando la cuenta (sin plan de pago activo) ya tiene 1 hijo en el formulario, el sistema DEBE mostrar de inmediato un banner de aviso (plan gratuito incluye solo un hijo) con un botón que redirige a la página de planes, y NO DEBE crear ni revelar un bloque de campos para ese hijo adicional. El banner NO DEBE eliminar ni alterar los datos ya escritos del tutor ni del primer hijo. Como defensa adicional del lado del servidor (ver research.md), si de cualquier forma llega una solicitud con más de un hijo para una cuenta sin plan de pago, el sistema NO DEBE persistirla.
- **FR-008**: El sistema NO DEBE calcular, mostrar ni inferir ninguna interpretación médica (p. ej. percentiles de crecimiento OMS) a partir de los datos de fecha de nacimiento, talla o peso capturados en este flujo — solo se almacenan como datos para uso en funcionalidades futuras (Principio I de la constitución del proyecto).
- **FR-009**: El sistema NO DEBE solicitar contraseña ni implementar inicio de sesión/autenticación en este alcance — el correo electrónico se captura únicamente como dato de la cuenta.
- **FR-010**: El sistema DEBE persistir la cuenta junto con sus hijos asociados (si los hay y respetan el límite del plan) una vez que la validación sea exitosa.

### Entidades Clave

- **Cuenta (Padre/Tutor)**: representa al usuario que se registra. Atributos: nombre, apellido, correo electrónico, país (opcional), estado (opcional), plan (gratuito por defecto al crearse).
- **Hijo**: representa a un niño asociado a una cuenta. Atributos: nombre, apellido, fecha de nacimiento, talla (opcional), peso (opcional). Relación: pertenece a exactamente una Cuenta; una Cuenta puede tener cero o más Hijos, sujeto al límite del plan.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Un padre/tutor puede completar el registro de su cuenta junto con un hijo en menos de 3 minutos.
- **SC-002**: El 100% de los intentos de guardar con campos obligatorios faltantes son bloqueados con un mensaje de error claro y específico, sin que se pierdan los datos ya ingresados en el resto del formulario.
- **SC-003**: El 100% de los intentos de registrar más de un hijo sin plan de pago activo muestran el aviso de límite freemium en lugar de persistir silenciosamente el exceso de hijos.
- **SC-004**: Al menos el 90% de los usuarios completa la creación de su cuenta (con o sin hijos) en el primer intento, sin necesitar soporte.

## Supuestos

- El correo electrónico es el identificador único de la cuenta en esta fase (no existe un nombre de usuario separado).
- El plan de toda cuenta nueva es "gratuito" por defecto; el sistema de planes de pago (checkout, facturación, activación del plan completo) se implementará en una tarea futura — en este spec solo se requiere el banner de aviso y un botón/ruta placeholder hacia la página de planes.
- No hay envío de correo de confirmación ni verificación de email en este spec, dado que no existe autenticación todavía en esta fase.
- No existe un estado de "sesión iniciada" persistente después de crear la cuenta — eso corresponde a la fase futura de login (incluyendo el ingreso vía Google, que autocompletará el correo cuando se implemente).
- Las unidades de talla y peso (p. ej. cm/kg) se definirán como detalle de implementación en el plan técnico, no como decisión de producto en este spec.
- El catálogo de País/Estado se selecciona de una lista predefinida (no texto libre); la fuente de datos exacta del catálogo (lista estática vs. servicio externo) y si el listado de Estado depende del País seleccionado son detalles de implementación a definir en el plan técnico.
