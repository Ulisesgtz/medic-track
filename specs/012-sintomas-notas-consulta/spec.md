# Especificación de Funcionalidad: Síntomas seleccionables y notas previas a la consulta

**Rama de la Funcionalidad**: `feature/012-sintomas-notas-consulta`

**Creado**: 2026-09-28

**Estado**: Borrador

**Entrada**: Descripción del usuario: "Síntomas seleccionables y notas previas en 'Nueva consulta'. Al registrar una consulta, el padre/tutor elige los síntomas que tuvo el hijo tocando chips (botones tipo pastilla que se prenden y apagan, agrupados por categoría, selección múltiple, no un drop-down), y el cuadro de texto 'Síntomas' pasa a llamarse 'Notas previas a la consulta' con el ejemplo 'Qué comió antes, cómo se sentía, cómo fue cambiando desde que empezó…' (opcional). Catálogo inicial de síntomas (lo que el padre observa, nunca un diagnóstico — Principio I). El catálogo vive en el backend, sembrado de inicio, para poder agregar síntomas sin publicar la app. La relación usuario/hijo/síntoma de cada consulta se guarda aparte, consultable directo por hijo o por cuenta, inmutable como el resto de la consulta. El texto de síntomas actual pasa a ser las notas. El listado y el detalle muestran los síntomas elegidos. Sin mock todavía. Fuera de alcance: intensidad o duración, 'Otro' con texto libre, estadísticas y cualquier interpretación."

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Elegir los síntomas tocándolos al registrar la consulta (Prioridad: P1)

Al registrar una consulta nueva, el padre ve los síntomas más comunes agrupados por categoría (General, Respiratorio,
Digestivo, Oídos y ojos, Piel, Sueño y ánimo) como botones tipo pastilla. Toca los que tuvo su hijo — se resaltan —, y
puede volver a tocar uno para quitarlo. Al guardar, la consulta queda con esos síntomas.

**Por qué esta prioridad**: es el cambio principal pedido: registrar síntomas en segundos, sin escribir, con las
mismas palabras cada vez, lo que después permite ver qué tuvo el hijo en cada consulta.

**Prueba Independiente**: registrar una consulta tocando "Fiebre" y "Tos", guardarla y ver en su detalle esos dos
síntomas.

**Escenarios de Aceptación**:

1. **Dado** el formulario de nueva consulta, **Cuando** el padre lo abre, **Entonces** ve todos los síntomas activos
   del catálogo agrupados por categoría en el orden definido, ninguno seleccionado.
2. **Dado** un síntoma sin seleccionar, **Cuando** el padre lo toca, **Entonces** queda resaltado como seleccionado;
   **Cuando** lo vuelve a tocar, **Entonces** deja de estarlo.
3. **Dado** que el padre seleccionó "Fiebre" y "Tos", **Cuando** guarda la consulta, **Entonces** la consulta queda
   registrada con exactamente esos dos síntomas.
4. **Dado** que el padre no seleccionó ningún síntoma, **Cuando** guarda la consulta con el resto de los datos
   obligatorios, **Entonces** la consulta se guarda sin síntomas (elegir síntomas es opcional).
5. **Dado** un lector de pantalla o teclado, **Cuando** el padre recorre los síntomas, **Entonces** cada uno se anuncia
   con su nombre y si está seleccionado, y se puede activar con teclado.

---

### Historia de Usuario 2 - Notas previas a la consulta (Prioridad: P1)

El cuadro de texto que hoy se llama "Síntomas" pasa a llamarse **"Notas previas a la consulta"**, con un ejemplo que
orienta qué escribir: *"Qué comió antes, cómo se sentía, cómo fue cambiando desde que empezó…"*. Sigue siendo
opcional. Las consultas ya guardadas conservan su texto, ahora mostrado como notas.

**Por qué esta prioridad**: sin este cambio el formulario tendría dos lugares llamados "síntomas" (los botones y el
cuadro), y el padre no sabría dónde va cada cosa.

**Prueba Independiente**: abrir el formulario y ver el cuadro "Notas previas a la consulta" con su ejemplo; abrir una
consulta registrada antes de esta funcionalidad y ver su texto de síntomas bajo el nuevo nombre.

**Escenarios de Aceptación**:

1. **Dado** el formulario de nueva consulta, **Cuando** el padre lo ve, **Entonces** el cuadro se llama "Notas previas a
   la consulta", muestra el ejemplo como texto de ayuda y no es obligatorio.
2. **Dado** que el padre escribió notas, **Cuando** guarda, **Entonces** el detalle de la consulta las muestra bajo
   "Notas previas a la consulta".
3. **Dado** una consulta registrada antes de esta funcionalidad con el texto "Fiebre y tos", **Cuando** el padre abre
   su detalle, **Entonces** ve ese texto íntegro bajo "Notas previas a la consulta" y ningún síntoma seleccionado.

---

### Historia de Usuario 3 - Ver los síntomas en el listado y en el detalle (Prioridad: P2)

En el detalle de la consulta, los síntomas elegidos se muestran como pastillas (sin poder cambiarlos). En el listado
de consultas del hijo, cada consulta resume sus síntomas por nombre.

**Por qué esta prioridad**: da valor a lo capturado; sin esto los síntomas se guardan pero no se ven.

**Prueba Independiente**: con una consulta que tiene "Fiebre", "Tos" y "Vómito", verla en el listado del hijo y en su
detalle.

**Escenarios de Aceptación**:

1. **Dado** una consulta con síntomas, **Cuando** el padre abre su detalle, **Entonces** ve cada síntoma como pastilla
   de solo lectura, en el orden del catálogo, y después sus notas si las tiene.
2. **Dado** una consulta con síntomas, **Cuando** el padre ve el listado de consultas del hijo, **Entonces** cada
   tarjeta muestra los nombres de los síntomas (hasta 3 y "+N" si hay más) junto con el número de medicamentos.
3. **Dado** una consulta sin síntomas pero con notas (p. ej. una consulta anterior), **Cuando** el padre ve el
   listado, **Entonces** la tarjeta muestra el inicio de las notas, como hoy.
4. **Dado** una consulta sin síntomas ni notas, **Cuando** el padre abre su detalle, **Entonces** no aparece ninguna
   sección de síntomas ni de notas vacía.

---

### Historia de Usuario 4 - Catálogo que se puede ampliar sin publicar la app (Prioridad: P3)

El equipo puede agregar un síntoma nuevo al catálogo, o retirar uno, y la app lo refleja sin publicar una versión nueva.
Un síntoma retirado deja de ofrecerse al registrar consultas, pero las consultas que ya lo usaron lo siguen mostrando.

**Por qué esta prioridad**: el catálogo inicial es una primera versión; se espera ajustarlo con el uso real.

**Prueba Independiente**: marcar un síntoma como retirado en el catálogo y comprobar que ya no aparece en el formulario
pero sí en una consulta anterior que lo tenía.

**Escenarios de Aceptación**:

1. **Dado** un síntoma agregado al catálogo, **Cuando** el padre abre el formulario, **Entonces** aparece en su
   categoría y posición.
2. **Dado** un síntoma retirado, **Cuando** el padre abre el formulario, **Entonces** no aparece; **Cuando** abre una
   consulta que lo tenía, **Entonces** sí lo ve.
3. **Dado** que alguien intenta guardar una consulta con un síntoma retirado o inexistente, **Cuando** se envía,
   **Entonces** se rechaza con un mensaje en español y la consulta no se crea.

---

### Casos Límite

- El catálogo no se puede cargar (sin conexión o error): el formulario muestra un aviso en la sección de síntomas y
  permite guardar la consulta sin síntomas (con notas si las hay); no bloquea el registro.
- El padre selecciona todos los síntomas: se permite; no hay tope.
- El mismo síntoma enviado dos veces en una consulta: se guarda una sola vez.
- Un síntoma se retira mientras el padre tiene el formulario abierto y lo tenía seleccionado: al guardar se rechaza con
  un mensaje claro y el formulario conserva todo lo demás capturado para reintentar.
- Notas muy largas: se mantiene el límite de longitud que hoy tiene el cuadro de síntomas.
- La lectura de la receta (OCR) no toca los síntomas ni las notas: ni selecciona síntomas ni escribe en las notas.
- Otra cuenta intenta leer los síntomas de una consulta ajena: se rechaza igual que el resto de la consulta (solo el
  dueño).

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: El formulario de nueva consulta (diseño móvil y diseño web) DEBE mostrar los síntomas activos del
  catálogo como botones tipo pastilla de selección múltiple, agrupados por categoría con su título, en el orden
  definido por el catálogo; no como lista desplegable.
- **FR-002**: Cada síntoma DEBE poder seleccionarse y deseleccionarse tocándolo; el estado seleccionado DEBE
  distinguirse visualmente por algo más que el color, anunciarse a tecnologías de asistencia como estado del botón
  (con nombre fijo) y tener un área táctil de al menos 44 × 44 px.
- **FR-003**: Seleccionar síntomas DEBE ser opcional; una consulta sin síntomas es válida.
- **FR-004**: El catálogo inicial DEBE contener exactamente, por categoría y en este orden:
  General — Fiebre, Cansancio o decaimiento, Irritabilidad o llanto, Poco apetito, Dolor de cabeza, Escalofríos;
  Respiratorio — Tos, Mocos o nariz tapada, Estornudos, Dolor de garganta, Dificultad para respirar, Silbido al
  respirar; Digestivo — Vómito, Diarrea, Dolor de estómago, Náuseas, Estreñimiento; Oídos y ojos — Dolor de oído, Ojos
  rojos o con lagañas; Piel — Salpullido o ronchas, Comezón; Sueño y ánimo — Duerme mal, Duerme más de lo normal.
- **FR-005**: Los nombres de síntomas DEBEN describir lo que el padre observa, nunca un diagnóstico, y la app NO DEBE
  mostrar sugerencias, alertas, niveles de gravedad ni recomendaciones a partir de los síntomas elegidos (Principio I).
- **FR-006**: El catálogo DEBE vivir en el servidor: agregar, reordenar o retirar un síntoma NO DEBE requerir
  publicar una versión nueva de la app.
- **FR-007**: Cada síntoma DEBE tener un identificador estable que no cambie aunque cambie su nombre visible.
- **FR-008**: Un síntoma retirado NO DEBE ofrecerse al registrar consultas, pero DEBE seguir mostrándose en las
  consultas que ya lo tienen.
- **FR-009**: Al crear una consulta, el sistema DEBE guardar qué síntomas se eligieron vinculados a la consulta, al hijo
  y a la cuenta, de forma que se puedan consultar directamente por hijo o por cuenta, y DEBE garantizar que ese hijo y
  esa cuenta sean siempre los de la consulta.
- **FR-010**: El sistema DEBE rechazar una consulta que incluya un síntoma inexistente o retirado, con un mensaje en
  español que diga qué pasó, sin crear la consulta.
- **FR-011**: Los síntomas de una consulta DEBEN ser inmutables una vez creada, como el resto de la consulta (spec 004);
  no hay edición ni borrado.
- **FR-012**: El cuadro de texto "Síntomas" DEBE llamarse "Notas previas a la consulta", ser opcional, conservar su
  límite de longitud actual y mostrar como texto de ayuda: "Qué comió antes, cómo se sentía, cómo fue cambiando desde
  que empezó…".
- **FR-013**: El texto de síntomas de las consultas registradas antes de esta funcionalidad DEBE conservarse íntegro y
  mostrarse como sus notas previas; esas consultas quedan sin síntomas seleccionados.
- **FR-014**: El detalle de la consulta (móvil y web) DEBE mostrar los síntomas elegidos como pastillas de solo lectura,
  en el orden del catálogo, y las notas bajo "Notas previas a la consulta"; cada sección se omite si está vacía.
- **FR-015**: Cada tarjeta del listado de consultas del hijo DEBE resumir los síntomas por nombre (hasta 3 y "+N" con
  los restantes) junto al número de medicamentos; si no hay síntomas, DEBE mostrar el inicio de las notas como hoy.
- **FR-016**: Si el catálogo no se puede cargar, el formulario DEBE avisarlo en la sección de síntomas y permitir
  guardar la consulta sin síntomas.
- **FR-017**: La lectura de la receta en el dispositivo (OCR) NO DEBE seleccionar síntomas ni escribir en las notas.
- **FR-018**: Solo el dueño de la cuenta DEBE poder ver los síntomas de sus consultas (mismas reglas de acceso que el
  resto de la consulta, spec 008).
- **FR-019**: Las pantallas nuevas o cambiadas DEBEN diseñarse en su versión móvil y su versión web siguiendo el
  sistema visual del proyecto (tokens de diseño), sin mezclar ambos diseños; como no hay mock, el diseño se presenta al
  usuario para aprobarlo antes de darlo por terminado, y cualquier desviación respecto a los mocks existentes (p. ej.
  el cuadro de síntomas del mock web de nueva consulta) queda anotada con su motivo.

### Entidades Clave

- **Síntoma (catálogo)**: algo que el padre puede observar en su hijo. Tiene un identificador estable, el nombre que se
  muestra (español), la categoría a la que pertenece, su posición dentro del catálogo y si está activo (ofrecido) o
  retirado.
- **Síntoma de una consulta**: el registro de que, en una consulta concreta, el padre marcó un síntoma. Vincula la
  consulta, el hijo, la cuenta y el síntoma, y guarda cuándo se registró. Un síntoma aparece como máximo una vez por
  consulta. Inmutable.
- **Consulta** (existente, spec 004): gana los síntomas elegidos; su texto libre de síntomas pasa a ser las **notas
  previas a la consulta**.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Un padre puede marcar 3 síntomas en menos de 10 segundos, sin escribir.
- **SC-002**: El 100 % de las consultas registradas antes de esta funcionalidad conserva su texto de síntomas, visible
  como notas previas, sin pérdida de un solo carácter.
- **SC-003**: Un síntoma agregado o retirado del catálogo se refleja en el formulario en la siguiente carga, sin
  publicar una versión nueva de la app.
- **SC-004**: El 100 % de los síntomas guardados coincide con el hijo y la cuenta de su consulta (no puede quedar uno
  asociado a otro hijo u otra cuenta).
- **SC-005**: Ningún texto de la funcionalidad sugiere un diagnóstico, gravedad o acción médica (revisión de todos los
  textos contra el Principio I antes de cerrar).
- **SC-006**: Los flujos de elegir síntomas, guardar y verlos en el listado y el detalle pasan sus pruebas de extremo a
  extremo en el diseño móvil (390 px) y en el web (1280 px).

## Supuestos

- Elegir síntomas es opcional: hay consultas de control o revisión sin síntomas.
- No hay tope de síntomas por consulta.
- "Otro" con texto libre queda fuera: para lo que no esté en el catálogo están las notas.
- El catálogo se mantiene por el equipo (cambio de datos en el servidor); no hay pantalla de administración del catálogo
  en esta funcionalidad.
- Los síntomas se eligen solo al crear la consulta (las consultas son inmutables); corregirlos depende de la edición de
  consultas, que sigue pendiente de decisión en el backlog.
- El resumen del listado muestra hasta 3 síntomas por espacio; el detalle muestra todos.
- El usuario pidió explícitamente que la relación síntoma–consulta guarde también el hijo y la cuenta para consultarla
  directo; el diseño de datos concreto (catálogo, relación y cómo se garantiza la consistencia) se detalla en el plan.
- Fuera de alcance: intensidad o duración de cada síntoma, estadísticas o gráficas de síntomas por hijo, y cualquier
  sugerencia o interpretación a partir de los síntomas.
- Depende de: spec 004 (consultas inmutables, formulario y detalle), spec 007 (mocks 04/14 de nueva consulta y 03/13 de
  detalle, y su lista de desviaciones), spec 008 (acceso solo del dueño).
- Fuentes del catálogo inicial (investigación 2026-09-28): en México las afecciones respiratorias (~38 %) y digestivas
  (~10 %) son los principales motivos de consulta pediátrica (Secretaría de Salud/IMSS); en consultas pediátricas
  ambulatorias la tos (~61 %) y la fiebre (~43 %) son los síntomas más reportados (PMC4012523).
