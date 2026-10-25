# Especificación de Funcionalidad: Exportar el historial de un hijo a PDF

**Rama de la Funcionalidad**: `feature/050-exportar-historial-pdf`
**Creado**: 2026-10-25
**Estado**: Borrador
**Entrada**: Exportar el historial de un hijo (consultas, tomas y cartilla de vacunación) a un PDF para llevarlo al pediatra. Función del plan completo. Hecha del mock entregado por Claude Design: «Exportar PDF - Pantallas» (con el componente «ExportarPanel») y «Exportar PDF - Documento» (`referencia/`).

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Generar el PDF del historial y llevarlo al pediatra (Prioridad: P1)

Una madre con plan completo va a la consulta de su hijo. Desde el Historial del hijo toca «Exportar a PDF», deja «Todo el historial» con consultas y cartilla, toca «Generar PDF», ve el avance página por página y al terminar lo comparte con el pediatra (o lo descarga para imprimirlo). El PDF abre con una portada que resume quién es el niño, qué incluye el documento, el tratamiento en curso y la próxima cita, y sigue con las consultas de la más reciente a la más antigua y la cartilla de vacunación.

**Por qué esta prioridad**: es el valor de la función: en un minuto el médico ve lo que la familia registró, sin depender del teléfono de la madre.

**Prueba Independiente**: con un hijo que tiene varias consultas y vacunas, generar el PDF desde el Historial y comprobar que el archivo descargado tiene la portada, las consultas en orden, la cartilla completa, el encabezado y el pie en cada página, y el nombre del archivo esperado.

**Escenarios de Aceptación**:

1. **Dado** un hijo con 4 consultas y 10 vacunas y una cuenta con plan completo, **Cuando** la madre toca «Exportar a PDF» en el Historial, deja «Todo el historial», Consultas y Cartilla encendidos y toca «Generar PDF», **Entonces** ve «Generando PDF…» con «Página N de M» y una barra que avanza, y después «Tu PDF está listo» con el nombre del archivo, el número de páginas, el tamaño y el periodo.
2. **Dado** el PDF listo, **Cuando** lo abre, **Entonces** la portada dice «Historial de salud», el nombre, la fecha de nacimiento, la edad, la talla y el peso (o «Sin dato»), «Qué incluye este PDF», el conteo «4 consultas · 10 vacunas registradas», el tratamiento en curso con «Indicado por», la próxima cita y el índice con las páginas de cada sección.
3. **Dado** una consulta con dos medicamentos, **Cuando** se lee en el PDF, **Entonces** muestra fecha, doctor, síntomas, notas, cada medicamento con su indicación («cada 8 h · 7 días · primera toma 08:00 del 18 oct»), su etiqueta («En curso», «Terminado el 20 oct» o «Se recorrió el 15 sep · +2 tomas») y el registro de tomas («16 de 18 tomas marcadas · 2 sin registrar · 3 por venir · Última marca: 24 oct, 08:05, por Ana»).
4. **Dado** que una consulta no cabe en la página, **Cuando** se genera el PDF, **Entonces** la página dice «Continúa en la página 3 →» y la siguiente retoma la consulta con «(continuación)».
5. **Dado** el PDF listo en el teléfono, **Cuando** toca «Compartir», **Entonces** se abre la hoja de compartir del sistema con el archivo; en la web el botón principal es «Descargar».
6. **Dado** cualquier página del PDF, **Entonces** lleva el encabezado «PediTrack · Mateo Morales» y el pie «Generado con PediTrack el 24 oct 2026 · Página 2 de 5» con la frase «Lo registrado es lo que la familia capturó. No sustituye el expediente ni el criterio de tu médico.»

---

### Historia de Usuario 2 - Elegir el periodo y qué incluir (Prioridad: P2)

El padre solo quiere llevar lo de este año, o justo lo que ya filtró en el Historial (un doctor y un síntoma), y decide si incluir fotos de las recetas y de la cartilla.

**Por qué esta prioridad**: un historial de años no le sirve al médico de urgencias; elegir el periodo hace el PDF útil y ligero.

**Prueba Independiente**: con consultas en varios meses, generar con «Un rango de fechas» y con «Usar los filtros del historial», y comprobar qué consultas aparecen, que la cartilla sale completa y que la portada describe el periodo, los filtros y las secciones.

**Escenarios de Aceptación**:

1. **Dado** el panel abierto, **Cuando** elige «Un rango de fechas» del 1 ene 2026 al 24 oct 2026, **Entonces** el PDF solo trae las consultas de esas fechas y la portada dice «Del 1 ene 2026 al 24 oct 2026».
2. **Dado** que en el Historial hay filtros activos (Dra. Laura Cázares, Fiebre), **Cuando** abre el panel, **Entonces** la opción «Usar los filtros del historial» muestra ese resumen y, al elegirla, el PDF trae solo esas consultas y la portada lista los filtros.
3. **Dado** cualquier periodo elegido, **Cuando** la cartilla está incluida, **Entonces** el PDF trae **todas** las vacunas registradas y la portada dice «Todas las vacunas registradas, sin filtro de periodo».
4. **Dado** el interruptor «Fotos de recetas y de la cartilla» (apagado al abrir), **Cuando** lo enciende, **Entonces** el PDF agrega «Anexo: fotos» con cada foto y su leyenda («Receta de la consulta del 18 oct 2026 · Dra. Laura Cázares · tomada el 18 oct 2026»), cada consulta con foto dice «Receta · Foto en p. 5» y el índice incluye el anexo.
5. **Dado** que entra desde la Cartilla de vacunación, **Cuando** se abre el panel, **Entonces** la cartilla viene encendida y las consultas apagadas.
6. **Dado** que apaga Consultas y Cartilla a la vez, **Entonces** no se puede generar un PDF vacío (el botón no actúa o dice qué falta elegir).
7. **Dado** un periodo sin consultas ni vacunas, **Cuando** toca «Generar PDF», **Entonces** ve «No hay registros en este periodo» con las fechas y el nombre del hijo, y «Cambiar periodo» lo regresa a las opciones.

---

### Historia de Usuario 3 - Plan gratuito: conocer la función sin poder usarla (Prioridad: P3)

Una cuenta con plan gratuito ve el mismo botón «Exportar a PDF» con la marca «Plan completo»; al tocarlo se abre el aviso del plan que explica qué hace y cómo verlo, con «Ahora no».

**Por qué esta prioridad**: la función es del plan completo; ocultarla impediría descubrirla.

**Prueba Independiente**: con una cuenta gratuita, comprobar el botón con la marca, el aviso al tocarlo y que el servidor rechaza pedir los datos del PDF aunque alguien lo intente directamente.

**Escenarios de Aceptación**:

1. **Dado** una cuenta gratuita, **Cuando** entra al Historial o a la Cartilla, **Entonces** ve «Exportar a PDF» con la marca «Plan completo» (en el teléfono a todo el ancho).
2. **Dado** ese botón, **Cuando** lo toca, **Entonces** ve «Exportar a PDF es parte del plan completo» y «Genera un PDF con las consultas, tomas y cartilla de vacunación de Mateo para llevarlo al pediatra.», con el enlace a los planes y «Ahora no».
3. **Dado** una cuenta gratuita que pide los datos del PDF por fuera de la pantalla, **Entonces** el servidor responde que es del plan completo y no entrega ningún dato.
4. **Dado** una persona invitada a una familia con plan completo, **Entonces** puede exportar aunque su propia cuenta sea gratuita.

---

### Casos Límite

- **Error al generar**: si algo falla, ve «No se pudo generar el PDF.» «Inténtalo de nuevo. Tus registros no cambiaron.» con «Intentar de nuevo» y «Cerrar»; nunca un color de alerta.
- **Cancelar a la mitad**: «Cancelar» durante la generación detiene el trabajo y no deja archivo; volver a abrir el panel empieza de cero.
- **Hijo sin consultas pero con vacunas**: la portada dice «No hay consultas registradas en este periodo.» y el índice solo lista la cartilla.
- **Hijo sin vacunas**: la portada dice «No hay vacunas registradas.» en la sección de la cartilla.
- **Consulta «solo registro»**: lleva la etiqueta «Solo registro»; sus medicamentos dicen «sin registro de tomas en la app»; una consulta sin síntomas ni medicamentos dice «Sin síntomas marcados · Sin medicamentos».
- **Vacuna escrita por la familia** (fuera del catálogo): lleva «Nombre escrito por la familia»; una corregida, «Corregida el 3 oct por Ana».
- **Talla o peso sin dato**: «Sin dato». Nunca se muestra la fecha en que se anotaron (no se guarda).
- **Notas largas**: el texto completo, partido entre páginas con «Continúa en la página…» si hace falta; nada se corta en silencio.
- **Fotos grandes o muchas**: con fotos el archivo pesa más (se avisa en el interruptor); la generación sigue mostrando el avance.
- **Hijo con muchas consultas**: el PDF se genera completo; el avance se ve por página.
- **El teléfono no puede compartir archivos**: «Compartir» no aparece o descarga el archivo; «Descargar» siempre funciona.
- **Cambia el plan mientras está abierto el panel**: el servidor decide en el momento de generar; si ya no es plan completo, se ve el aviso del plan.
- **Persona sin acceso a ese hijo**: no puede pedir sus datos (mismo rechazo que cualquier recurso ajeno).

## Requisitos *(obligatorio)*

### Requisitos Funcionales

**Entrada y panel**

- **FR-001**: El Historial de un hijo y su Cartilla de vacunación MUST mostrar «Exportar a PDF» (botón de contorno) a quien puede ver ese hijo.
- **FR-002**: En el plan gratuito, el botón MUST llevar la marca «Plan completo» y abrir el aviso del plan con el título «Exportar a PDF es parte del plan completo», el texto del mock y «Ahora no»; MUST NOT abrir el panel de opciones.
- **FR-003**: El panel MUST mostrar «Exportar a PDF», «Historial de <nombre completo>» y un botón de cerrar; en el teléfono MUST ser una hoja desde abajo y en la web un diálogo centrado, cada uno con su diseño del mock y sin mezclarse.
- **FR-004**: El panel MUST ofrecer el periodo como una sola elección entre «Todo el historial», «Un rango de fechas» (con «Desde» y «Hasta») y «Usar los filtros del historial» (con el resumen de los filtros actuales; solo disponible si hay filtros).
- **FR-005**: El panel MUST ofrecer tres interruptores: «Consultas», «Cartilla de vacunación» y «Fotos de recetas y de la cartilla» (con «Con fotos, el archivo pesa más.»). Desde el Historial MUST abrir con consultas y cartilla encendidas y fotos apagadas; desde la Cartilla, con la cartilla encendida y consultas y fotos apagadas.
- **FR-006**: El panel MUST mostrar, antes de generar, el aviso «Este PDF contiene datos de salud de <nombre>. Compártelo solo con quien lo necesite.» y MUST NOT generar si no hay al menos una sección elegida.
- **FR-007**: Mientras se genera, MUST mostrarse «Generando PDF…», «Página N de M», una barra de avance, qué se está preparando y «Cancelar», que detiene el trabajo sin dejar archivo.
- **FR-008**: Al terminar MUST mostrarse «Tu PDF está listo» con el nombre del archivo (`<Nombre>-<Apellido>-historial-<d>-<mes>-<aaaa>.pdf`), el número de páginas, el tamaño y el periodo. En el teléfono «Compartir» MUST ser la acción principal y «Descargar» la secundaria; en la web al revés. «Compartir» MUST usar la opción de compartir del sistema o del navegador cuando exista.
- **FR-009**: Si el periodo elegido no tiene consultas ni vacunas, MUST mostrarse «No hay registros en este periodo» con el rango y el nombre, y «Cambiar periodo».
- **FR-010**: Si la generación falla, MUST mostrarse «No se pudo generar el PDF.» y «Inténtalo de nuevo. Tus registros no cambiaron.» con «Intentar de nuevo» y «Cerrar», sin color de alerta.

**Contenido del documento**

- **FR-011**: El documento MUST ser de tamaño Carta y legible también impreso en A4, con encabezado (PediTrack y el nombre del hijo) y pie («Generado con PediTrack el <fecha> · Página X de Y» y la frase «Lo registrado es lo que la familia capturó. No sustituye el expediente ni el criterio de tu médico.») en cada página.
- **FR-012**: La portada MUST mostrar «Historial de salud»; nombre, fecha de nacimiento, edad, talla y peso (o «Sin dato», sin fecha de anotación); «Qué incluye este PDF» (periodo, filtros, secciones, fotos y que la cartilla incluye todas las vacunas sin filtro de periodo); el conteo neutral de consultas, vacunas y fotos; el tratamiento en curso (medicamento, frecuencia, desde cuándo e «Indicado por»), si lo hay; la próxima cita (fecha, hora, doctor y lugar), si la hay; y el índice con la página de cada sección.
- **FR-013**: La sección «Consultas» MUST listar las consultas del periodo de la más reciente a la más antigua con: fecha, doctor, etiqueta «Solo registro» si aplica, síntomas, notas previas completas, referencia a la foto de la receta en el anexo si se incluyen fotos, cada medicamento (indicación, etiqueta de estado y registro de tomas) y la próxima cita de la consulta.
- **FR-014**: El registro de tomas de cada medicamento MUST ser solo conteo de lo registrado: tomas marcadas de las previstas, sin registrar, por venir, y la última marca con fecha, hora y quién la hizo. Las tomas canceladas al finalizar un tratamiento MUST NOT contarse como previstas.
- **FR-015**: Una consulta que cruza de página MUST cerrar la página con «Continúa en la página N →» y retomarse con «(continuación)».
- **FR-016**: La sección «Cartilla de vacunación» MUST traer **todas** las vacunas registradas del hijo, sin importar el periodo, agrupadas por vacuna y con dosis, fecha, lote, lugar y nota; «Corregida el <fecha> por <nombre>» cuando aplique y «Nombre escrito por la familia» para las que no son del catálogo.
- **FR-017**: El «Anexo: fotos», solo si se pidieron fotos, MUST traer las fotos de la cartilla de papel y de las recetas del periodo, cada una con su leyenda y fecha.
- **FR-018**: El documento MUST distinguir los estados de las tomas por forma además de color (marcada: relleno con ✓; sin registrar: punteado; por venir: contorno) para que se lea impreso en blanco y negro.
- **FR-019**: Ningún texto del panel ni del documento MUST interpretar, evaluar o recomendar (nada de «faltantes», «atrasos», «completo», porcentajes de cumplimiento, rangos ni rojo) (Principio I).

**Plan, acceso y privacidad**

- **FR-020**: El servidor MUST decidir si la familia del hijo tiene el plan completo antes de entregar los datos del documento; si no, MUST responder que es del plan completo (código `freemium_consultation_limit_exceeded`, motivo `pdf_export`) sin ningún dato.
- **FR-021**: Puede exportar cualquier persona que ya pueda ver al hijo (dueña, Tutor o Cuidador de la familia) cuando la familia tiene el plan completo; quien no tiene acceso al hijo MUST recibir el mismo rechazo que con cualquier recurso ajeno. El teléfono del hijo (spec 047) MUST NOT poder exportar.
- **FR-022**: El documento MUST armarse sin enviar los datos del hijo a ningún servicio de terceros, y el periodo, los filtros y el texto libre MUST NOT viajar en una dirección ni quedar en el registro de errores.
- **FR-023**: Generar el PDF MUST NOT cambiar ningún registro (solo lectura).

### Entidades Clave

- **Pedido de exportación**: hijo, periodo (todo, rango o filtros del historial), secciones elegidas (consultas, cartilla, fotos). No se guarda: vive mientras se genera.
- **Datos del documento**: lo que el servidor entrega para armar el PDF: datos del hijo (nombre, nacimiento, talla, peso), consultas del periodo con medicamentos, tomas, autores de las marcas y próxima cita, el tratamiento en curso, la próxima cita general, todas las vacunas y, si se pidieron, las fotos. Son lecturas de lo que ya existe; no hay datos nuevos.
- **Documento PDF**: el archivo resultante, con su nombre, número de páginas y tamaño. No se guarda en el servidor.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Una persona con plan completo obtiene el PDF de un historial de hasta 20 consultas y 20 vacunas, sin fotos, en menos de 15 segundos desde que toca «Generar PDF» en un teléfono de gama media.
- **SC-002**: El 100 % de las consultas del periodo y de las vacunas registradas aparece en el PDF, con los mismos datos que muestra la app (comprobado en pruebas con casos de muchas consultas, sin consultas y con filtros).
- **SC-003**: El PDF impreso en blanco y negro permite distinguir tomas marcadas, sin registrar y por venir en el 100 % de los casos de prueba.
- **SC-004**: Una cuenta gratuita nunca recibe datos del documento (0 respuestas con datos en las pruebas de plan gratuito).
- **SC-005**: Ningún texto del panel ni del documento contiene palabras de evaluación o recomendación (comprobado por una prueba de redacción que recorre todos los textos).
- **SC-006**: Los datos del hijo no salen hacia ningún servicio que no sea el de PediTrack mientras se arma el documento (verificado en la prueba de extremo a extremo).

## Supuestos

- **Talla y peso sin fecha** (decisión del dueño, 2026-10-25): el «anotada el…» del mock no se construye porque esa fecha no se guarda; llegará con las curvas de crecimiento del backlog. Desviación del mock anotada.
- **Cartilla siempre completa** (decisión del dueño, 2026-10-25): el periodo y los filtros solo aplican a las consultas.
- **Datos «propuestos» del mock aceptados** porque salen de lo ya guardado: índice, próxima cita en portada, «Indicado por», «En curso» y tomas por venir, «Última marca … por Ana», «Nombre escrito por la familia» y «Continúa en la página…».
- **Quién exporta**: quien ya puede ver todo el historial del hijo (dueña, Tutor y Cuidador) cuando la familia paga; un PDF no muestra nada que esa persona no vea ya en la app. El plan de la spec puede restringirlo a Tutor/dueña si se decide.
- **La barra superior web del mock** (Hoy / Historial / Cartilla / Familia) es contexto del diseño; la app conserva su estructura actual (barra lateral) y solo agrega el botón y el diálogo.
- **No se guarda el PDF** en el servidor ni en un historial de exportaciones; cada vez se genera de nuevo.
- **La fecha del pie y el nombre del archivo** usan el día local de quien exporta.
- Fuera de alcance: exportar varios hijos en un PDF, enviar el PDF por correo desde la app, liga de solo lectura para el médico, plantillas personalizables, idiomas distintos del español.
