# Especificación de Funcionalidad: Consulta «solo como registro»

**Rama de la Funcionalidad**: `feature/023-calendario-selector-de-dia` (misma rama que la spec 023, por decisión del usuario)

**Creado**: 2026-10-01

**Estado**: Borrador

**Entrada**: Descripción del usuario: al crear una nueva consulta, un checkbox («consulta anterior, guardar solo como registro») para que la consulta se guarde **sin horarios de tomas ni alertas**: solo informativa. La fecha puede ser de cualquier día pasado.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Guardar una consulta vieja solo como registro (Prioridad: P1)

El padre quiere dejar en la bitácora de su hijo una consulta que ya pasó (la receta de hace meses, lo que dijo el doctor, los síntomas y las notas) sin que la app le arme tomas ni le avise de nada. En «Nueva consulta» marca **«Consulta anterior: guardar solo como registro»**. La consulta se guarda con su doctor, fecha, foto de la receta, síntomas, notas y medicamentos (nombre, cada cuántas horas y cuántos días), pero **sin horarios**: no se le pide «Primera toma» y no se generan tomas.

**Por qué esta prioridad**: es todo el valor pedido: poder registrar el historial sin ensuciar el tratamiento de hoy ni disparar recordatorios de algo que ya pasó.

**Prueba Independiente**: crear una consulta de hace tres meses marcando el checkbox, con un medicamento sin «Primera toma»; se guarda, aparece en el listado con la etiqueta «Solo registro», y no hay tomas, ni tratamiento activo, ni recordatorio de ella.

**Escenarios de Aceptación**:

1. **Dado** el formulario «Nueva consulta», **Cuando** el padre marca «Consulta anterior: guardar solo como registro», **Entonces** el campo «Primera toma» de cada medicamento deja de pedirse (y de mostrarse), y el texto explica que no se crearán horarios ni avisos.
2. **Dado** el checkbox marcado y los demás datos válidos, **Cuando** el padre guarda, **Entonces** la consulta se crea sin ninguna toma y el padre llega a su detalle.
3. **Dado** el checkbox sin marcar (por omisión), **Entonces** todo funciona exactamente como hoy: «Primera toma» obligatoria y tomas generadas.
4. **Dado** que el padre marca el checkbox y luego lo desmarca, **Entonces** «Primera toma» vuelve a pedirse y lo que ya había escrito en ella no se pierde.
5. **Dado** el checkbox marcado, **Cuando** la fecha de la consulta es de cualquier día pasado, **Entonces** se acepta (la fecha no se limita a una ventana reciente).
6. **Dado** el formulario con el checkbox marcado, **Entonces** la lectura de la receta por OCR (spec 004) sigue ayudando a llenar nombre, frecuencia y duración, pero ya no propone hora de inicio.

---

### Historia de Usuario 2 - Ver una consulta solo-registro sin tomas ni alertas (Prioridad: P1)

Una consulta solo-registro se ve como un archivo, no como un tratamiento: no tiene calendario, ni barra de progreso, ni chips de tomas, ni botones de «Finalizar» o «Recorrer tratamiento»; tampoco cuenta en ninguna lista de «Tomas de hoy» ni como tratamiento activo, y no manda recordatorios. Se distingue con una etiqueta neutra **«Solo registro»**.

**Por qué esta prioridad**: sin esto la consulta guardada seguiría pareciendo un tratamiento pendiente y confundiría al padre.

**Prueba Independiente**: abrir la consulta solo-registro del ejemplo anterior: se ve la foto, doctor, fecha, síntomas, notas y la lista de medicamentos con «Cada 8 horas · 7 días», con la etiqueta «Solo registro», sin calendario ni tomas; el hijo no muestra tomas de hoy por ella.

**Escenarios de Aceptación**:

1. **Dado** una consulta solo-registro, **Cuando** el padre abre su detalle, **Entonces** ve la etiqueta «Solo registro» y cada medicamento con su nombre y su horario escrito (cada cuántas horas y cuántos días), sin «primera toma», sin chips, sin barra de progreso, sin botones de finalizar o recorrer y sin calendario del tratamiento.
2. **Dado** una consulta solo-registro, **Entonces** en la web tampoco aparecen «Tratamiento activo» (por ella) ni «Cómo leer el calendario».
3. **Dado** el listado de consultas del hijo, **Entonces** la consulta solo-registro lleva la etiqueta «Solo registro» y se ordena por su fecha como las demás.
4. **Dado** una consulta solo-registro, **Entonces** no hay tomas suyas en «Tomas de hoy» del hijo, del home ni de la web, no cuenta en «tratamiento activo» ni en los conteos de tomas, y no se manda ningún recordatorio por ella (spec 011).
5. **Dado** consultas con tomas y consultas solo-registro del mismo hijo, **Entonces** las primeras siguen exactamente igual (tomas, recordatorios, resumen).

---

### Casos Límite

- Se decide **al crear** y no se puede cambiar después: las consultas son inmutables (spec 004). No hay forma de convertir una solo-registro en una con tomas.
- Una consulta solo-registro **sin medicamentos** se permite igual que hoy una consulta sin medicamentos.
- Un medicamento solo-registro conserva sus reglas de nombre, frecuencia y duración (positivas); lo único que deja de pedirse es la hora de inicio.
- El padre que marca el checkbox por error y guarda: queda la consulta sin tomas; no hay deshacer (lo ve en el listado con «Solo registro»). El texto del checkbox lo advierte.
- Las consultas **ya existentes** no cambian: todas conservan sus tomas, y no se marcan como solo-registro.
- Una consulta solo-registro con una **fecha de hoy o futura** se acepta igual (no se valida contra el pasado: es información que el padre escribió).
- Móvil y web: el checkbox y la etiqueta existen en ambos diseños, cada uno con el suyo.
- Pantallas de 390 px: sin desplazamiento horizontal.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: «Nueva consulta» DEBE ofrecer un checkbox «Consulta anterior: guardar solo como registro», desmarcado por omisión, con una explicación breve de que no se crearán horarios ni avisos y de que no se podrá cambiar después.
- **FR-002**: Con el checkbox marcado, la «Primera toma» de cada medicamento NO DEBE pedirse ni validarse; con el checkbox desmarcado, sigue obligatoria como hoy (FR-010 de la spec 004/012).
- **FR-003**: Una consulta guardada como solo-registro DEBE guardarse con todos sus datos (doctor, fecha, foto, síntomas, notas, medicamentos con nombre, frecuencia y duración) y **sin ninguna toma**.
- **FR-004**: La fecha de una consulta solo-registro DEBE aceptar cualquier día (pasado incluido), igual que hoy una consulta normal.
- **FR-005**: Una consulta solo-registro NO DEBE generar tomas, recordatorios ni entradas en «Tomas de hoy», en el tratamiento activo ni en ningún conteo de tomas; las consultas con tomas NO DEBEN cambiar.
- **FR-006**: El detalle de una consulta solo-registro DEBE mostrar la etiqueta «Solo registro» y cada medicamento con su nombre y su horario escrito, y NO DEBE mostrar calendario, tomas, barra de progreso, «Finalizar tratamiento», «Recorrer tratamiento», «Tratamiento activo» ni «Cómo leer el calendario».
- **FR-007**: El listado de consultas del hijo DEBE marcar las consultas solo-registro con la etiqueta «Solo registro».
- **FR-008**: Que una consulta sea solo-registro DEBE decidirse al crearla y NO DEBE poder cambiarse después (inmutable).
- **FR-009**: Las consultas existentes DEBEN seguir iguales: ninguna pasa a ser solo-registro.
- **FR-010**: Los textos DEBEN ser neutros y en español, sin consejo ni evaluación (Principio I): la etiqueta y el checkbox dicen qué es, no qué hacer.
- **FR-011**: Móvil y web DEBEN diseñarse por separado con los tokens de diseño y la privacidad existente (la foto se guarda solo en la cuenta).

### Entidades Clave

- **Consulta solo-registro**: una consulta con una marca fija, puesta al crearla, que dice que no tiene horarios. Tiene los mismos datos que cualquier consulta, sus medicamentos no tienen hora de inicio y no tiene tomas.
- **Medicamento de una consulta solo-registro**: nombre, cada cuántas horas y cuántos días, solo como información; sin hora de inicio ni tomas.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: El padre registra una consulta anterior completa (con receta, síntomas y medicamentos) sin escribir ninguna hora de toma, en una sola pantalla de captura.
- **SC-002**: El 100 % de las consultas solo-registro creadas tienen **cero** tomas y generan **cero** recordatorios.
- **SC-003**: Ninguna pantalla de tomas («Tomas de hoy» del hijo y del home, tratamiento activo, conteos) incluye algo de una consulta solo-registro.
- **SC-004**: Las consultas existentes y las nuevas sin el checkbox se comportan igual que antes de esta funcionalidad (sin diferencias en sus tomas, recordatorios ni pantallas).
- **SC-005**: Los flujos pasan sus pruebas de extremo a extremo a 390 y 1280 px, y las unitarias (frontend y backend) mantienen >90 % de cobertura.

## Supuestos

- La decisión del checkbox es **una sola vez al crear** y vive con la consulta; no hay forma de cambiarla (inmutabilidad de la spec 004).
- Los medicamentos de una consulta solo-registro conservan frecuencia y duración como **información** (escritas como «Cada 8 horas · 7 días»), con las mismas validaciones de hoy (números positivos); solo la hora de inicio se omite. Una consulta solo-registro puede no tener medicamentos, como cualquier consulta.
- La foto de la receta, el doctor y la fecha siguen siendo obligatorios como hoy; el OCR del teléfono sigue siendo opcional y no propone horas.
- «Solo registro» es una etiqueta neutra (chip) en el detalle y en el listado, con los tokens de diseño; no usa rojo ni ámbar (Principio I).
- Se hace en la misma rama que la spec 023 (decisión del usuario, 2026-10-01); sigue después del PR de la 023.
- Requiere backend (la consulta se guarda sin tomas y con su marca; migración de solo agregar una columna con valor por omisión «no») y frontend (checkbox, formulario, detalle y listado).
- Fuera de alcance: convertir una consulta solo-registro en una con tomas, editar consultas, importar varias consultas viejas de una vez, y cualquier cambio de los recordatorios ya enviados.
- Depende de: specs 004 (consultas inmutables y OCR), 011 (recordatorios: sin tomas, sin avisos), 012 (síntomas y notas), 013/016/020 (estados, finalizar y recorrer: no aplican sin tomas), 019/022/023 (calendario y tarjetas: no se muestran sin tomas).
