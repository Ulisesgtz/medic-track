# Especificación de Funcionalidad: Detalle de Hijo — Consultas y Recetas

**Rama de la Funcionalidad**: `004-detalle-consulta-hijo`

**Creado**: 2026-09-17

**Estado**: Borrador

**Entrada**: Descripción del usuario: "Pantalla de detalle de un hijo, a la que se llega al hacer click en su nombre desde la home page (specs/003-home-listado-hijos). Muestra el reporte de consultas médicas del hijo: una lista de registros de consulta, cada uno con fecha y nombre del doctor. Al hacer click en un registro de consulta, se abre el detalle de esa consulta: la receta médica (foto tomada con la cámara nativa del celular o cargada desde archivo en desktop — nunca getUserMedia, per Principio III), el nombre del doctor, la fecha, la lista de medicamentos recetados con su horario de toma (cada cuanto: cada 8h, 12h, 24h, etc.), y si el padre definió un horario de inicio (por ejemplo 8am), se listan todas las tomas esperadas como registros individuales que el padre puede marcar como 'tomada' o 'no tomada' (Principio I: la app registra, nunca interpreta ni valida dosis — es un recordatorio simple de check, no un cálculo médico). La duración del tratamiento se captura en número de días, con autollenado desde el dato que haya extraído OCR de la receta del doctor si está presente, dejando ese valor como placeholder editable. Incluye OCR desde el MVP para extraer texto de la foto de la receta como ayuda al llenado manual (el padre siempre confirma/corrige antes de guardar — nunca se guarda directo del OCR sin confirmación, Principio I). También incluye una sección de síntomas: un textbox libre donde el padre registra lo que el niño sintió en esa consulta. Todo esto se captura mediante un formulario nuevo de registro de consulta médica, accesible desde la pantalla de detalle del hijo (ej. un botón 'Registrar consulta')."

## Aclaraciones

### Sesión 2026-09-17

- Q: ¿La foto de la receta médica es obligatoria para guardar una consulta, o se puede guardar sin foto? → A: Obligatoria — no se puede guardar la consulta sin adjuntar la foto de la receta.
- Q: Cuando un medicamento tiene horario de inicio, frecuencia y duración definidos, ¿se generan todas sus tomas esperadas de una sola vez, o progresivamente conforme pasan los días? → A: Todas de una vez, al guardar la consulta.
- Q: ¿Se pueden marcar tomas de un medicamento cuyo tratamiento ya terminó, o el marcado se limita a tratamientos en curso? → A: Siempre disponible, sin importar cuándo fue la toma.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Ver el reporte de consultas de mi hijo (Prioridad: P1)

Como padre/tutor, al hacer click en el nombre de uno de mis hijos desde la home page, quiero ver el listado de sus consultas médicas (fecha y doctor de cada una), para tener a la mano el historial completo sin buscar papeles.

**Por qué esta prioridad**: Es la razón de ser de esta pantalla — completa la navegación que specs/003-home-listado-hijos dejó como ruta placeholder. Sin esto no hay ningún valor visible, y es la base sobre la que se apoyan las historias siguientes.

**Prueba Independiente**: Se puede probar por completo abriendo la pantalla de detalle de un hijo sin consultas registradas (ver el estado vacío) y, por separado, de un hijo con una o más consultas ya registradas vía API (ver el listado ordenado con fecha y doctor).

**Escenarios de Aceptación**:

1. **Dado** que mi hijo tiene una o más consultas registradas, **Cuando** abro su pantalla de detalle, **Entonces** veo una tarjeta por consulta con su fecha y el nombre del doctor, ordenadas de la más reciente a la más antigua.
2. **Dado** que mi hijo no tiene ninguna consulta registrada todavía, **Cuando** abro su pantalla de detalle, **Entonces** veo un estado que me invita a registrar la primera consulta, no una lista vacía sin explicación.
3. **Dado** que hago click en una de las tarjetas de consulta, **Cuando** ocurre la navegación, **Entonces** veo el detalle completo de esa consulta (Historia de Usuario 3).

---

### Historia de Usuario 2 - Registrar una consulta médica nueva (Prioridad: P2)

Como padre/tutor, después de llevar a mi hijo al doctor, quiero registrar la consulta con la foto de la receta, el doctor, la fecha, los medicamentos recetados (con su horario de toma) y lo que mi hijo sintió, para no perder esa información y poder llevar el seguimiento de las tomas después.

**Por qué esta prioridad**: Es el único mecanismo para generar datos reales en esta funcionalidad — sin esto, la Historia 1 solo muestra estados vacíos y la Historia 3 no tiene nada que mostrar. Se prioriza después de "ver el reporte" porque, igual que en specs/003, el listado (aunque vacío) ya es útil por sí solo para orientar al usuario hacia el botón de registrar.

**Prueba Independiente**: Se puede probar por completo abriendo el formulario desde el botón "Registrar consulta", llenando doctor/fecha/una foto de receta/al menos un medicamento con su horario/duración del tratamiento/síntomas, guardando, y verificando que la consulta aparece de inmediato en el listado de la Historia 1.

**Escenarios de Aceptación**:

1. **Dado** que estoy en la pantalla de detalle de mi hijo, **Cuando** presiono "Registrar consulta" y lleno doctor, fecha, foto de la receta, al menos un medicamento con su frecuencia de toma y duración en días, y guardo, **Entonces** la consulta se persiste y aparece en el listado de consultas de ese hijo.
2. **Dado** que estoy llenando el formulario en un celular, **Cuando** elijo adjuntar la foto de la receta, **Entonces** se usa la cámara nativa del dispositivo (o su galería), nunca una vista de cámara en vivo dentro de la app.
3. **Dado** que subo una foto de receta con texto legible, **Cuando** el sistema la procesa, **Entonces** los campos del formulario (p. ej. duración del tratamiento) se autollenan como sugerencia editable a partir de lo que el OCR pudo extraer, sin bloquear el llenado manual si el OCR no encuentra nada útil.
4. **Dado** que el OCR sugirió un valor en algún campo, **Cuando** guardo la consulta, **Entonces** se guarda el valor que quedó en el campo al momento de guardar (el que yo confirmé o corregí), nunca el valor crudo del OCR sin pasar por el campo editable.
5. **Dado** que agrego más de un medicamento a la misma consulta, **Cuando** cada uno tiene su propia frecuencia de toma, **Entonces** cada medicamento mantiene su propio horario de forma independiente de los demás.
6. **Dado** que escribo texto en la sección de síntomas, **Cuando** guardo la consulta, **Entonces** ese texto queda asociado a la consulta y visible en su detalle.

---

### Historia de Usuario 3 - Ver el detalle de una consulta y marcar las tomas (Prioridad: P3)

Como padre/tutor, quiero abrir una consulta ya registrada y marcar cada toma programada de cada medicamento como "tomada" o "no tomada", para llevar el control de si le di a mi hijo su medicina a tiempo.

**Por qué esta prioridad**: Es el uso recurrente/diario de la funcionalidad (revisar y marcar tomas), pero depende por completo de que ya exista al menos una consulta con medicamentos (Historia 2) — por eso va después, aunque sea el valor de uso más frecuente una vez que hay datos.

**Prueba Independiente**: Se puede probar registrando una consulta con un medicamento con horario de inicio definido, abriendo su detalle, y marcando una de las tomas esperadas como "tomada"; por separado, verificando que un medicamento sin horario de inicio no genera ninguna toma individual para marcar.

**Escenarios de Aceptación**:

1. **Dado** que abro el detalle de una consulta, **Cuando** la pantalla carga, **Entonces** veo la foto de la receta, el doctor, la fecha, la lista de medicamentos con su frecuencia y duración, y los síntomas registrados.
2. **Dado** que un medicamento tiene un horario de inicio definido (p. ej. 8am) y una frecuencia (p. ej. cada 8h) y una duración (p. ej. 5 días), **Cuando** veo su detalle, **Entonces** veo listada cada toma esperada durante esos 5 días como un registro individual marcable.
3. **Dado** que una toma esperada todavía no ha sido marcada, **Cuando** le doy click, **Entonces** queda marcada como "tomada" (o "no tomada" si la desmarco), y el cambio se refleja de inmediato sin recargar la página.
4. **Dado** que un medicamento no tiene horario de inicio definido, **Cuando** veo su detalle, **Entonces** veo su frecuencia y duración pero ningún listado de tomas individuales para marcar (no hay suficiente información para generarlas).
5. **Dado** que marco o desmarco una toma, **Cuando** ocurre esta acción, **Entonces** el sistema únicamente registra el estado tomada/no tomada tal como lo indiqué — nunca calcula, valida ni advierte sobre dosis, horarios acumulados o interacciones (Principio I).

---

### Casos Límite

- ¿Qué pasa si la foto de la receta no se puede procesar por OCR (foto borrosa, manuscrita, o el proveedor de OCR falla)? El formulario DEBE seguir siendo completamente utilizable de forma manual — el OCR es una ayuda opcional, nunca un bloqueante.
- ¿Qué pasa si el padre intenta guardar la consulta sin ningún medicamento? El sistema rechaza el guardado (FR-015) — una consulta sin receta queda fuera de alcance de esta funcionalidad.
- ¿Qué pasa si dos medicamentos de la misma consulta tienen frecuencias distintas (uno cada 8h, otro cada 24h)? Cada uno genera su propio listado de tomas de forma independiente.
- ¿Qué pasa si el padre no puede tomar/subir una foto en ese momento? No puede guardar la consulta todavía — la foto es obligatoria (ver Aclaraciones); debe volver a intentarlo cuando la tenga.
- ¿Se puede editar o borrar una consulta ya guardada? No — es inmutable una vez guardada (FR-014), igual que los hijos en specs/001-registro-cuenta-usuario.
- ¿Se puede marcar una toma de un tratamiento cuya duración ya terminó (p. ej. hace 2 meses)? Sí, el marcado queda siempre disponible sin importar cuándo fue la toma (ver Aclaraciones).

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: Al abrir la pantalla de detalle de un hijo (navegación desde specs/003-home-listado-hijos), el sistema DEBE mostrar el listado de sus consultas médicas, cada una con fecha y nombre del doctor, ordenadas de la más reciente a la más antigua.
- **FR-002**: Si el hijo no tiene ninguna consulta registrada, el sistema DEBE mostrar un estado que invite a registrar la primera consulta, no una lista vacía sin explicación.
- **FR-003**: La pantalla de detalle del hijo DEBE incluir un control ("Registrar consulta") que abra un formulario para capturar una nueva consulta médica.
- **FR-004**: El formulario de registro de consulta DEBE capturar: nombre del doctor, fecha de la consulta, una foto de la receta médica (obligatoria — ver Aclaraciones), uno o más medicamentos (cada uno con nombre, frecuencia de toma y duración del tratamiento en días), y un texto libre de síntomas.
- **FR-005**: La captura de la foto de la receta DEBE usar `<input type="file" accept="image/*" capture>` (cámara nativa en móvil, selector de archivo en escritorio) — el sistema NO DEBE usar `getUserMedia` ni ninguna vista de cámara en vivo dentro de la app (Principio III).
- **FR-006**: El sistema DEBE intentar extraer texto de la foto de la receta mediante OCR y usarlo para sugerir/autollenar campos del formulario (al menos la duración del tratamiento) como valores editables — el padre SIEMPRE debe poder revisar y corregir esos valores antes de guardar, y el sistema NUNCA DEBE persistir un valor extraído por OCR sin que haya pasado por el campo editable que el padre confirmó (Principio I).
- **FR-007**: Si el OCR no logra extraer ningún dato útil de la foto, el formulario DEBE seguir siendo completamente utilizable llenando los campos manualmente, sin bloquear ni degradar el resto del flujo.
- **FR-008**: Cada medicamento dentro de una consulta DEBE tener su propia frecuencia de toma y duración, independientes de los demás medicamentos de la misma consulta.
- **FR-009**: Si el padre define un horario de inicio para un medicamento, el sistema DEBE generar y mostrar, al guardar la consulta, un registro individual marcable por cada toma esperada del tratamiento completo (calculado a partir del horario de inicio, la frecuencia y la duración) — no progresivamente conforme pasan los días (ver Aclaraciones).
- **FR-010**: Si el padre no define un horario de inicio para un medicamento, el sistema NO DEBE generar ningún registro individual de toma para ese medicamento (solo se muestran su frecuencia y duración).
- **FR-011**: El padre DEBE poder marcar cualquier toma esperada como "tomada" o "no tomada", y ese cambio DEBE reflejarse de inmediato en la pantalla.
- **FR-012**: El sistema NO DEBE calcular, validar, advertir ni opinar sobre dosis, acumulación de tomas, interacciones entre medicamentos ni ningún otro juicio médico — únicamente registra fielmente lo que el doctor recetó y lo que el padre marcó (Principio I, NON-NEGOTIABLE).
- **FR-013**: Al abrir el detalle de una consulta ya registrada, el sistema DEBE mostrar la foto de la receta, el doctor, la fecha, la lista de medicamentos con su frecuencia/duración, sus tomas marcables (si aplica), y los síntomas registrados.
- **FR-014**: Una vez guardada, una consulta (y sus medicamentos) NO DEBE poder editarse ni eliminarse — es un registro histórico fiel de lo que ocurrió, igual que la inmutabilidad ya aplicada a los hijos en specs/001-registro-cuenta-usuario (FR-006a).
- **FR-015**: El sistema DEBE requerir al menos un medicamento para guardar una consulta — una consulta sin medicamentos no es válida en este alcance (una consulta que no derive en receta queda fuera de alcance, ver Supuestos).
- **FR-016**: El padre DEBE poder marcar o desmarcar cualquier toma sin importar si su fecha ya pasó o si la duración del tratamiento ya terminó — el marcado no se bloquea ni se vuelve de solo lectura en ningún momento (ver Aclaraciones).

### Entidades Clave

- **Consulta**: una visita médica de un hijo. Atributos: hijo al que pertenece, fecha, nombre del doctor, foto de la receta, síntomas (texto libre). Inmutable una vez guardada (FR-014).
- **Medicamento**: un medicamento recetado dentro de una Consulta. Atributos: nombre, frecuencia de toma (cada cuántas horas), duración del tratamiento (número de días), horario de inicio opcional.
- **Toma**: una ocurrencia esperada de un Medicamento, generada solo si el Medicamento tiene horario de inicio. Atributos: fecha/hora esperada, estado (tomada / no tomada).

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Un padre puede ver el historial completo de consultas de un hijo en menos de 2 segundos después de abrir su pantalla de detalle.
- **SC-002**: Un padre puede registrar una consulta completa (doctor, fecha, foto, al menos un medicamento y síntomas) sin salir del flujo del formulario, de principio a fin, en un solo intento.
- **SC-003**: El 100% de las consultas ya guardadas permanecen visibles y sin cambios en visitas posteriores — ninguna acción del padre puede editarlas o borrarlas.
- **SC-004**: Un padre puede marcar una toma como tomada/no tomada con una sola interacción, y ver el cambio reflejado sin recargar la página.
- **SC-005**: El 100% de los formularios de registro de consulta permanecen utilizables de principio a fin incluso cuando el OCR no extrae ningún dato de la foto.

## Supuestos

- El OCR se ejecuta contra la foto ya subida/tomada, del lado del servidor o de un servicio externo — el mecanismo específico se decide en la fase de planificación; esta especificación solo exige que su resultado sea una sugerencia editable, nunca un valor guardado directamente (Principio I).
- El horario de inicio de un medicamento, cuando se define, es una hora del día (p. ej. "8:00 am") aplicada desde la fecha de la consulta — el cálculo exacto de cuántas tomas genera (frecuencia × duración) es un detalle de implementación a definir en la fase de planificación, no una decisión de negocio nueva.
- Una consulta sin ningún medicamento asociado (p. ej. una revisión sin receta) queda fuera de alcance de esta funcionalidad — ver FR-015. Registrar visitas sin receta es una posible funcionalidad futura separada.
- No existe límite en la cantidad de medicamentos por consulta ni de consultas por hijo en este alcance.
- La pantalla de detalle de hijo y el formulario de registro de consulta heredan la misma falta de autenticación real que specs/003-home-listado-hijos (el `account_id` en `localStorage` sigue siendo la única "sesión") — no se introduce ningún cambio al respecto aquí.
- El almacenamiento de la foto de la receta (dónde se guarda el archivo) es un detalle técnico a decidir en planificación; esta especificación solo exige que la foto quede asociada a la consulta y sea visible en su detalle.
