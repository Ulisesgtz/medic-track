# Especificación de Funcionalidad: Tipos de actividad

**Rama de la Funcionalidad**: `feature/075-tipos-de-actividad`

**Creado**: 2026-11-19

**Estado**: Borrador

**Entrada**: Descripción del usuario: "075 Tipos de actividad del hijo. Al crear o editar una actividad del hijo (specs 035/036: kind = 'activity' en supplement_routines), el padre elige su tipo de un catálogo cerrado: Escolar, Deportiva, Artística y cultural, Terapia y seguimiento, Hábitos y cuidado diario, Otra (ampliable con SQL, como los síntomas de la spec 012). En la sección «Actividades» del detalle del hijo y en su lista, las actividades se agrupan por segmentos de ese tipo en un orden fijo; los segmentos vacíos no se muestran. Las actividades existentes reciben un tipo por omisión (Hábitos y cuidado diario). Principio I: el tipo solo organiza, nunca interpreta ni aconseja; sin rojo/verde/ámbar de alerta. Dos diseños con useIsDesktop; diseño por mock de Claude Design. Decisiones abiertas: si el tipo es obligatorio, si se puede escribir un tipo propio, si las actividades personales del titular (/yo) también llevan tipo, si «Hoy» del hijo, la tarjeta del inicio y el teléfono del hijo también agrupan, icono por tipo."

## Contexto

Desde la spec 035 una familia registra **actividades** de cada hijo (y propias, en `/yo`): a una hora fija («práctica de
fut» martes y jueves a las 17:00) o varias veces al día («tomar agua» cada hora de 08:00 a 20:00), con «Realizado». Hoy
todas aparecen en una sola lista en la sección «Actividades» del detalle del hijo. Con la escuela, el deporte, las
clases de música, una terapia y los hábitos de la casa, la lista se vuelve difícil de leer.

Esta funcionalidad agrega un **tipo de actividad** —escolar, deportiva, etc.— que el padre elige al crearla, y separa la
sección «Actividades» en segmentos por tipo. El tipo **solo organiza**: no cambia horarios, avisos, marcas ni el plan, y
la app nunca opina sobre él (Principio I).

**Término**: «tipo de actividad» es la categoría que elige el padre (Escolar, Deportiva…). Es distinto de la separación
que ya existe entre **suplementos** y **actividades** (spec 035); los suplementos no llevan tipo de actividad.

**Decisiones del dueño (2026-11-19)**: el tipo es **obligatorio**; **solo el catálogo**, sin tipos escritos por el
padre; se agrupa **solo la sección «Actividades»** (del detalle del hijo y de `/yo`), no «Hoy», la tarjeta del inicio
ni el teléfono del hijo; las **actividades personales** del titular **también** llevan tipo.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Elegir el tipo al crear una actividad (Prioridad: P1)

Ana agrega a Mateo la actividad «Práctica de fut» martes y jueves a las 17:00. En el formulario, además del nombre y el
horario, elige el tipo **Deportiva** entre seis opciones. Guarda. En el detalle de la actividad se ve «Deportiva».

**Por qué esta prioridad**: sin un tipo guardado no hay nada que agrupar.

**Prueba Independiente**: crear una actividad con tipo, abrir su detalle y ver el tipo; intentar guardar sin tipo: el
formulario no deja y lo dice junto al campo.

**Escenarios de Aceptación**:

1. **Dado** el formulario de una actividad nueva (de un hijo o propia), **Cuando** el padre lo abre, **Entonces** ve el
   campo «Tipo de actividad» con los seis tipos del catálogo, en su orden, y **ninguno elegido**.
2. **Dado** el formulario sin tipo elegido, **Cuando** el padre toca «Guardar», **Entonces** no se guarda y el campo dice
   que falta elegir el tipo, sin perder lo escrito.
3. **Dado** un tipo elegido, **Cuando** el padre guarda, **Entonces** la actividad queda con ese tipo y su detalle lo
   muestra.
4. **Dado** el formulario de un **suplemento**, **Cuando** el padre lo abre, **Entonces** no ve el campo de tipo.

---

### Historia de Usuario 2 - Ver las actividades separadas por tipo (Prioridad: P1)

Al abrir el detalle de Mateo, la sección «Actividades» ya no es una sola lista: muestra un segmento «Escolar» con
«Tarea de inglés», uno «Deportiva» con «Práctica de fut» y uno «Hábitos y cuidado diario» con «Tomar agua». No aparece
ningún segmento sin actividades.

**Por qué esta prioridad**: es lo que pidió el dueño: encontrar una actividad sin recorrer una lista larga.

**Prueba Independiente**: con actividades de tres tipos, abrir el detalle del hijo a 390 y 1280 px: tres segmentos con
su título, en el orden del catálogo, cada actividad en el suyo; los otros tres tipos no aparecen.

**Escenarios de Aceptación**:

1. **Dado** un hijo con actividades de varios tipos, **Cuando** el padre abre su detalle, **Entonces** la sección
   «Actividades» muestra un segmento por cada tipo con al menos una actividad, con el nombre del tipo como título, en el
   orden fijo del catálogo (Escolar, Deportiva, Artística y cultural, Terapia y seguimiento, Hábitos y cuidado diario,
   Otra).
2. **Dado** un tipo sin actividades, **Entonces** su segmento no se muestra.
3. **Dado** un segmento, **Entonces** sus actividades conservan el orden y la información de hoy (la misma fila
   compacta, «Realizado», pausada o finalizada como hoy).
4. **Dado** que todas las actividades del hijo son de un solo tipo, **Entonces** se ve un solo segmento con su título.
5. **Dado** un hijo sin actividades, **Entonces** la sección se ve vacía como hoy (sin segmentos).
6. **Dado** la sección «Actividades» de `/yo`, **Entonces** se separa por tipo con las mismas reglas.
7. **Dado** «Hoy» del hijo, la tarjeta del hijo en el inicio y el teléfono del hijo, **Entonces** se ven como hoy, sin
   segmentos.

---

### Historia de Usuario 3 - Cambiar el tipo y las actividades que ya existen (Prioridad: P2)

Las actividades que la familia registró antes de esta funcionalidad aparecen en «Hábitos y cuidado diario». Ana edita
«Clase de piano» y le cambia el tipo a «Artística y cultural»; la actividad pasa a ese segmento. Lo mismo puede hacer
aunque su plan ya venció, porque solo está ordenando lo suyo.

**Por qué esta prioridad**: sin esto, todo lo anterior quedaría mal clasificado; depende de las historias 1 y 2.

**Prueba Independiente**: con una actividad creada antes, verla en «Hábitos y cuidado diario»; cambiarle el tipo y
verla en el segmento nuevo, sin que cambien sus tomas, marcas ni avisos; repetir con una cuenta de plan vencido.

**Escenarios de Aceptación**:

1. **Dado** una actividad creada antes de esta funcionalidad, **Entonces** tiene el tipo «Hábitos y cuidado diario».
2. **Dado** una actividad, **Cuando** quien puede editarla le cambia el tipo y guarda, **Entonces** pasa al segmento de
   su tipo nuevo y **nada más cambia**: sus tomas pasadas y futuras, sus marcas, sus avisos y su estado (activa, pausada,
   finalizada) quedan igual.
3. **Dado** una cuenta (o familia) cuyo plan venció, **Cuando** quien puede editar la actividad cambia **solo su tipo**,
   **Entonces** se guarda (cambiar el horario o el nombre sigue pidiendo el plan, como hoy).
4. **Dado** una actividad **finalizada** o **pausada**, **Cuando** se le cambia el tipo, **Entonces** se guarda y sigue
   finalizada o pausada.
5. **Dado** un Cuidador, **Entonces** ve el tipo y los segmentos pero no puede cambiar el tipo (como no puede editar).

---

### Casos Límite

- **Tipo retirado del catálogo**: si alguna vez se retira un tipo con SQL, las actividades que ya lo tienen lo
  conservan y siguen en su segmento; solo deja de ofrecerse al crear o al cambiar el tipo.
- **Tipo nuevo agregado con SQL**: aparece en el formulario y en su lugar del orden sin publicar la app.
- **Petición sin tipo o con un tipo que no existe** (una versión vieja de la app, o un error): el servidor la rechaza al
  crear; al editar sin mandar tipo, la actividad conserva el que tenía (una app vieja abierta no la borra ni la cambia).
- **Sin conexión** (spec 067): la sección se ve agrupada con la última copia; cambiar el tipo necesita conexión, como
  cualquier edición.
- **Unir un hijo duplicado** (spec 074): las actividades viajan con su tipo.
- **Descargar todos mis datos** (spec 070): cada actividad incluye su tipo.
- **Teléfono del hijo** (spec 047): no muestra el tipo ni segmentos (el dato puede viajar en la respuesta de la
  actividad, que el teléfono ya recibe; no es un dato de salud).
- **Plan vencido o actividad finalizada**: el botón «Editar» no aparece (spec 033/035), así que el tipo se cambia desde
  el detalle de la actividad, junto a donde se muestra.
- **Una actividad con nombre que parece de otro tipo** («Natación» marcada como Escolar): la app respeta lo que eligió
  el padre; nunca sugiere ni corrige el tipo.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: El sistema DEBE tener un **catálogo de tipos de actividad**, en este orden: Escolar, Deportiva, Artística
  y cultural, Terapia y seguimiento, Hábitos y cuidado diario, Otra. El catálogo se amplía o se retira un tipo sin
  publicar la app; un tipo retirado no se ofrece pero las actividades que lo tienen lo conservan.
- **FR-002**: Toda actividad (de un hijo o propia) DEBE tener **exactamente un tipo** del catálogo. Los suplementos no
  tienen tipo.
- **FR-003**: Al **crear** una actividad el tipo es **obligatorio**: el formulario no lo trae elegido y no deja guardar
  sin él; el servidor rechaza crear sin tipo o con uno que no existe o está retirado.
- **FR-004**: Las actividades que ya existen DEBEN recibir el tipo «Hábitos y cuidado diario».
- **FR-005**: Quien puede editar una actividad DEBE poder **cambiar su tipo**; cambiar **solo el tipo** se permite en
  **cualquier plan** y en cualquier estado (activa, pausada, finalizada), y no cambia tomas, marcas, avisos ni estado.
  Cambiar cualquier otro dato sigue las reglas de plan de hoy (spec 033/035).
- **FR-006**: Si una edición no trae tipo, la actividad DEBE conservar el que tenía.
- **FR-007**: La sección «Actividades» del **detalle del hijo** y la de **`/yo`** DEBEN mostrar las actividades en
  **segmentos por tipo**, con el nombre del tipo como título, en el orden del catálogo; un segmento sin actividades no
  se muestra; dentro de un segmento, las actividades conservan el orden y la fila de hoy.
- **FR-008**: El **detalle de cada actividad** DEBE mostrar su tipo, y el formulario de edición DEBE traer el tipo
  guardado ya elegido.
- **FR-009**: «Hoy» del hijo, la tarjeta del hijo en el inicio, «Tu día» y el **teléfono del hijo** NO cambian: no
  muestran segmentos ni el tipo.
- **FR-010**: El tipo DEBE ser solo un dato que organiza: sin consejos, juicios, conteos comparativos, sugerencias
  automáticas de tipo ni colores de alerta (rojo, verde o ámbar) (Principio I). Si el diseño lleva un icono o un color
  por tipo, son decorativos y el nombre del tipo siempre está escrito.
- **FR-011**: Ver el tipo sigue el nivel de ver la actividad (un Cuidador lo ve); cambiarlo, el de editarla (la dueña y
  un Tutor; lo personal, solo su dueña).
- **FR-012**: El tipo DEBE incluirse en la **descarga de todos los datos** (spec 070), viajar con la actividad al **unir
  un hijo** (spec 074) y verse **sin conexión** con la última copia (spec 067).
- **FR-013**: Las pantallas DEBEN tener los **dos diseños** (teléfono y web) del mock de Claude Design, sin mezclarlos.

### Entidades Clave

- **Tipo de actividad**: una entrada del catálogo — un código estable, su nombre visible, su lugar en el orden y si
  sigue ofreciéndose.
- **Actividad** (existente, spec 035): gana su tipo de actividad (uno, obligatorio).

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: El 100 % de las actividades (nuevas y anteriores) tiene un tipo después del cambio; ninguna queda sin
  segmento.
- **SC-002**: Con 10 actividades de 4 tipos, el padre encuentra una actividad dada abriendo solo la sección
  «Actividades», sin desplazarse por actividades de otros tipos fuera de su segmento.
- **SC-003**: Agregar una actividad con tipo no suma más de un toque y una elección respecto de hoy.
- **SC-004**: Cambiar el tipo de una actividad no altera ninguna toma, marca ni aviso (verificado en pruebas antes y
  después del cambio).
- **SC-005**: Ningún texto de la funcionalidad contiene juicios o consejos (prueba de redacción), y ninguna pantalla
  usa rojo, verde o ámbar para el tipo.
- **SC-006**: Las pantallas se ven correctas a 390 px y a 1280 px (E2E en ambos anchos).

## Supuestos

- Los seis tipos y su orden son la propuesta del BACKLOG (2026-11-19); los textos finales los fija el mock.
- Cambiar solo el tipo en cualquier plan sigue el Principio IV: ordenar lo propio no se cobra; el plan sigue
  decidiendo crear, reanudar y cambiar horarios.
- El tope de 10 actividades activas (spec 035) no cambia ni se cuenta por tipo.
- Los avisos push de una actividad no cambian de texto (no mencionan el tipo).
- El PDF del historial (spec 050) no incluye actividades, así que no cambia.
- Sin dependencia nueva; requiere una migración (el catálogo y el tipo de cada actividad), que el dueño aplica en DEV
  antes del merge.
- El aviso «Antes de empezar» no cambia de versión: el tipo no es un dato de salud nuevo.

## Fuera de Alcance

- Tipos escritos por el padre.
- Segmentos en «Hoy», el inicio, «Tu día» o el teléfono del hijo.
- Filtrar o buscar por tipo, contar actividades por tipo o un resumen por tipo.
- Tipo para los suplementos.
