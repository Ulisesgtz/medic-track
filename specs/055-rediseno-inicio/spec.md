# Especificación de Funcionalidad: Rediseño del inicio — tu día y el de cada hijo

**Rama de la Funcionalidad**: `feature/055-rediseno-inicio`

**Creado**: 2026-11-01

**Estado**: Borrador

**Entrada**: Descripción del usuario: "Rediseño del home: en primer plano mi nombre con mis tomas, suplementos y actividades en
forma de resumen en mi recuadro; cada recuadro de hijo/hija con el resumen de lo que tiene ese día por tomar, actividad o
suplemento; más fácil, sencillo y con mucha mejor experiencia que el actual." Se hizo una auditoría de UX del inicio actual
(heurísticas de Nielsen + criterios de teléfono) y con ella un prompt para Claude Design; el diseño entregado es
`referencia/Inicio PediTrack.dc.html` (proyecto de Claude Design `f4e28757-d885-471d-b5b9-6e6ca094449a`, «propuesta 1 nov
2026»), que **manda** sobre esta spec en estructura, textos, colores y medidas.

## Contexto

El inicio actual se titula «Tus hijos» y pone lo personal («Personal · Mis suplementos») al final, después de Familia y
Planes. La tarjeta de cada hijo solo dice «N consultas» y «N tomas hoy» (en la web, ni eso): no cuenta suplementos ni
actividades y no deja marcar nada sin entrar al detalle. Familia, Planes, Recordatorios y «Cerrar sesión» pesan lo mismo que
el día de los hijos, y «Cerrar sesión» está junto al nombre, al alcance de un toque accidental.

Lo que sale de la auditoría y del diseño:

1. **«Tu día» va primero**: saludo con el nombre y la fecha, y un resumen compacto de lo personal (Mis tomas, Mis
   actividades, la próxima de cada una y «✓ Realizado»).
2. **La tarjeta del hijo muestra su día, no su historia**: filas de Medicamentos, Suplementos y Actividades con su conteo de
   hoy (solo las que tienen algo), y en el pie la **próxima toma con «Marcar»**, sin entrar al detalle.
3. **«Lo demás» pierde peso**: Familia, Planes, Recordatorios y Cerrar sesión pasan a una lista compacta abajo (filas de
   52 px en el teléfono, una franja de 4 accesos en la web); «Cerrar sesión» sale del encabezado.
4. **La pantalla «Hoy» del teléfono del hijo** (spec 047) usa el mismo lenguaje que la tarjeta del hijo.

Nada cambia en lo que se registra ni en las reglas: es una pantalla nueva sobre los mismos datos. La app **registra, nunca
interpreta** (Principio I): ámbar = «por marcar», «sin registrar» punteado y gris, sin rojo, sin porcentajes de cumplimiento,
sin felicitar ni regañar.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Ver el día de cada hijo y marcar la próxima toma desde el inicio (Prioridad: P1)

Ana abre la app a las 15:50. Ve la tarjeta de Mateo: «Medicamentos · 3 tomas hoy · 1 por marcar», «Suplementos · 1 de 2»,
«Actividades · 2 de 5 hechas», el chip ámbar «1 por marcar» y en el pie «Próxima · Amoxicilina · 16:00» con «Marcar». Le da la
medicina, toca «Marcar» y el pie cambia a «✓ 15:52» sin salir del inicio. La tarjeta de Sofía, que tiene una toma de la mañana
que nadie marcó, lleva el borde punteado gris y «Paracetamol · 08:00 · sin registrar». Tocar cualquier otra parte de una
tarjeta abre el detalle del hijo.

**Por qué esta prioridad**: es lo que la persona hace varias veces al día; hoy le cuesta entrar al hijo, buscar la toma y
volver. Sola, esta historia ya cambia el uso diario.

**Prueba Independiente**: con un hijo con medicamento, suplemento y actividad hoy, el inicio muestra las tres filas con sus
conteos, «Marcar» marca la próxima toma (queda «por Ana» en el detalle) y el conteo se actualiza sin recargar.

**Escenarios de Aceptación**:

1. **Dado** un hijo con tomas de medicamento, de suplemento y actividades hoy, **Cuando** se abre el inicio, **Entonces** su
   tarjeta muestra inicial, nombre, edad, una fila por tipo con su conteo del día y, en el pie, la próxima toma por marcar con
   «Marcar».
2. **Dado** un hijo sin suplementos hoy, **Cuando** se abre el inicio, **Entonces** la fila «Suplementos» no aparece.
3. **Dado** un hijo sin nada programado hoy, **Cuando** se abre el inicio, **Entonces** la tarjeta dice «Hoy no hay tomas ni
   actividades» en gris y no tiene pie.
4. **Dado** que todo lo de hoy que ya llegó está marcado, **Cuando** se abre el inicio, **Entonces** la tarjeta dice
   «✓ Todo marcado hasta ahora» en menta.
5. **Dado** una toma sin registrar hoy, **Cuando** se abre el inicio, **Entonces** la tarjeta lleva el borde punteado gris y el
   texto «… · sin registrar», nunca ámbar ni rojo.
6. **Dado** el pie con «Marcar», **Cuando** se toca, **Entonces** esa toma queda marcada por quien tocó, el pie dice «✓ HH:MM»
   y los conteos cambian; tocar el resto de la tarjeta abre el detalle del hijo.
7. **Dado** la web (≥ 900 px), **Cuando** se abre el inicio, **Entonces** las tarjetas van en una rejilla de 2 columnas con
   las **mismas** filas y el mismo pie que en el teléfono.

---

### Historia de Usuario 2 - «Tu día»: mi resumen personal primero (Prioridad: P2)

Lo primero que ve Ana es «Hola, Ana · jueves 1 de noviembre» con sus iniciales, y la tarjeta «Tu día»: «Mis tomas · 2 de 4
hoy · Próxima: Vitamina D · 14:00» con su barra, y «Mis actividades · 3 de 8 hechas · Próxima: Caminar 30 min · 18:00» con
«✓ Realizado». «Ver todo» lleva a sus suplementos y actividades.

**Por qué esta prioridad**: es lo que pidió el dueño (su nombre y su resumen en primer plano), pero el uso diario más
frecuente sigue siendo el de los hijos.

**Prueba Independiente**: con una cuenta con suplementos y actividades personales, el inicio abre con «Tu día» arriba de los
hijos, con conteos y próxima de cada uno, y «✓ Realizado» marca la actividad sin salir.

**Escenarios de Aceptación**:

1. **Dado** una cuenta con suplementos y actividades personales, **Cuando** se abre el inicio, **Entonces** el saludo con el
   nombre y la fecha y la tarjeta «Tu día» van antes de los hijos.
2. **Dado** «Tu día», **Cuando** se toca «✓ Realizado», **Entonces** se marca la siguiente toma de la actividad (la misma
   regla de la spec 035) y se ve «✓ Caminar 30 min · 13:22».
3. **Dado** que todo lo personal de hoy está marcado, **Entonces** «Tu día» dice «✓ Todo marcado hasta ahora».
4. **Dado** una cuenta de pago sin suplementos ni actividades personales, **Entonces** «Tu día» es una línea con «Agrega tus
   propios suplementos o actividades» (enlace, no botón sólido).
5. **Dado** el plan gratuito, **Entonces** «Tu día» es una línea «Tu día · tus suplementos y actividades» con la marca
   «Plan completo», que abre el aviso del plan.
6. **Dado** la web, **Entonces** «Tu día» se abre en dos columnas (Mis tomas | Mis actividades).

---

### Historia de Usuario 3 - «Lo demás» y la cuenta, fuera del camino (Prioridad: P3)

Familia, Planes, Recordatorios y Cerrar sesión quedan al final como lista compacta (cada fila con su valor: «3 personas»,
«Plan completo», «Activados»). Las iniciales del encabezado abren el menú de la cuenta, donde también está «Cerrar sesión».

**Por qué esta prioridad**: baja el ruido y evita cerrar sesión por accidente, pero no cambia lo que se hace cada día.

**Prueba Independiente**: el encabezado ya no tiene «Cerrar sesión»; la lista del final lleva a Familia, Planes y
Recordatorios y cierra sesión.

**Escenarios de Aceptación**:

1. **Dado** el inicio, **Entonces** «Cerrar sesión» no está en el encabezado; está en el menú de las iniciales y al final de
   «Lo demás».
2. **Dado** «Lo demás» en el teléfono, **Entonces** son filas de 52 px (Familia, Planes, Recordatorios, Cerrar sesión) con su
   valor a la derecha; en la web, una franja de 4 accesos.
3. **Dado** un Cuidador, **Entonces** «Lo demás» tiene Familia («Familia Morales · cuidadora»), Recordatorios y Cerrar
   sesión (sin Planes).

---

### Historia de Usuario 4 - La pantalla «Hoy» del teléfono del hijo con el mismo lenguaje (Prioridad: P3)

Mateo abre su app (spec 047): «Hola, Mateo · jueves 1 de noviembre», «Tus tomas · 4 hoy · 1 por marcar» agrupadas en
Mañana / Tarde / Noche con las mismas filas, iconos y chips de la tarjeta del inicio, «Tus actividades» con «✓ Realizado», y al
final la tarjeta chica «Avisos». Lo que marcó su mamá dice «✓ por Ana, 08:05» como texto, sin botón; lo que marca él lo puede
desmarcar.

**Por qué esta prioridad**: la pantalla ya funciona; esto la alinea visualmente con el inicio nuevo.

**Prueba Independiente**: con un teléfono de hijo canjeado, `/hijo/hoy` muestra las tres variantes del diseño (con cosas por
marcar, todo marcado, sin nada hoy) y marca como hoy.

**Escenarios de Aceptación**:

1. **Dado** el teléfono del hijo con tomas y actividades hoy, **Entonces** ve los grupos Mañana / Tarde / Noche con «Marcar»
   y sus actividades con «✓ Realizado», y nada más (ni consultas, fotos, notas, familia, planes ni datos de sus papás).
2. **Dado** una toma marcada por otra persona, **Entonces** se ve «✓ por Ana, 08:05» en menta, sin acción.
3. **Dado** un día sin nada, **Entonces** dice «Hoy no tienes tomas ni actividades».
4. **Dado** los avisos, **Entonces** la tarjeta «Avisos» va al final, con contorno, «Activar» / «✓ Activados».

---

### Casos Límite

- **Cuenta nueva sin hijos** (estado 3): el aviso «Antes de empezar» arriba de todo; «Aún no registras a tus hijos» con el
  único botón sólido de la pantalla, «Agregar hijo»; «Tu día» en su forma vacía.
- **Plan gratuito con un hijo** (estado 4): «+ Agregar hijo» punteado y la nota «Tu plan incluye un hijo».
- **Cuidador** (estado 5): el título es «Hijos compartidos contigo» con «Familia Morales · puedes ver y marcar»; sin
  «+ Agregar hijo»; marca igual que la dueña.
- **Tutor de una familia que dejó de pagar** («Solo lectura»): una nota arriba («Solo lectura. La familia no tiene un plan
  activo. Puedes seguir marcando tomas y actividades.»), sin «+ Agregar hijo», con «Marcar».
- **Cargando** (estado 6): esqueletos con la altura final de «Tu día» y de dos tarjetas: nada salta cuando llegan los datos.
- **Dos personas marcan la misma toma a la vez** desde el inicio: la primera marca gana (spec 032); la otra ve la toma ya
  marcada «por Ana» y no se marca dos veces.
- **La próxima toma es de un suplemento**: «Marcar» la marca por su rutina, igual que en el detalle.
- **Una toma cancelada** (tratamiento finalizado, spec 016) o de una consulta «solo registro» (spec 024): no cuenta ni
  aparece.
- **Cambio de día a medianoche** con la app abierta: los conteos pasan al nuevo día (`useLocalDay`).
- **Una petición falla** (un hijo, o «Tu día»): esa tarjeta lo dice con «Reintentar» y las demás siguen; nunca la pantalla
  en blanco.
- **Muchos hijos** (plan de pago, hasta 10): el inicio no tarda más por cada hijo de lo que tarda hoy (ver SC-003).

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: El inicio DEBE construirse **exactamente** como el diseño entregado (`referencia/Inicio PediTrack.dc.html`), con
  sus dos diseños separados (teléfono 390 px, web 1280 px con la barra lateral de 280 px) elegidos con `useIsDesktop`, sin
  mezclarlos. Toda desviación se lista en `referencia/desviaciones.md` con su motivo.
- **FR-002**: El inicio DEBE abrir con el saludo («Hola, {nombre}»), la fecha local de hoy y las iniciales, seguido de
  «Tu día» y después los hijos.
- **FR-003**: «Tu día» DEBE mostrar, de lo **personal** de quien abre la app (spec 033 parte 3 y spec 035): «Mis tomas» (N de
  M hoy, barra y la próxima) y «Mis actividades» (N de M hechas, la próxima y «✓ Realizado»), «✓ Todo marcado hasta ahora»
  cuando corresponde, «Ver todo» a sus páginas, su forma vacía sin rutinas personales y su forma de plan gratuito.
- **FR-004**: Cada tarjeta de hijo DEBE mostrar inicial, nombre, edad y una fila por tipo **con algo hoy** (Medicamentos,
  Suplementos, Actividades) con el conteo del día local, y DEBE quitar «N consultas».
- **FR-005**: La tarjeta DEBE tener uno de cuatro estados: con cosas por marcar (chip ámbar «N por marcar»), todo marcado
  («✓ Todo marcado hasta ahora», menta), nada hoy («Hoy no hay tomas ni actividades», gris) y sin registrar (borde punteado
  gris y «… · sin registrar»; nunca ámbar ni rojo).
- **FR-006**: El pie de la tarjeta DEBE mostrar la **próxima toma por marcar** (medicamento o suplemento) con «Marcar» (44 px,
  con contorno, a la derecha); tocarlo DEBE marcar esa toma con las mismas reglas y el mismo autor que el detalle (specs 013,
  032) sin salir del inicio. El resto de la tarjeta abre el detalle del hijo.
- **FR-007**: Los conteos y estados DEBEN salir de las mismas reglas del servidor que ya usa la app (estados de la toma de la
  spec 013, cancelada de la spec 016, solo registro de la spec 024, actividades de la spec 035): el inicio no inventa ningún
  estado ni evalúa nada.
- **FR-008**: «Lo demás» DEBE ir al final: en el teléfono filas de 52 px (Familia, Planes, Recordatorios, Cerrar sesión con
  su valor); en la web una franja de 4 accesos. «Cerrar sesión» DEBE salir del encabezado y estar en el menú de las iniciales
  y en «Lo demás».
- **FR-009**: Lo que ve cada quien DEBE seguir saliendo de `useChildAccess`/`addChildTarget` (spec 032): dueña y Tutor todo;
  Cuidador sin agregar ni Planes; Tutor en solo lectura con la nota, sin agregar y con «Marcar».
- **FR-010**: El aviso «Antes de empezar» (specs 009/010) DEBE seguir arriba de todo mientras no se confirme.
- **FR-011**: La barra lateral web DEBE quedar como en el diseño («Inicio», los hijos o «Familia Morales» para un Cuidador,
  «+ Agregar hijo», el grupo «Personal» con Mis suplementos y Mis actividades, y la cuenta con su plan).
- **FR-012**: La carga DEBE mostrar esqueletos con la altura final; una falla de una parte DEBE decirse en esa parte con
  «Reintentar», sin dejar la pantalla en blanco.
- **FR-013**: La pantalla «Hoy» del teléfono del hijo (`/hijo/hoy`, spec 047) DEBE seguir el estado 7 del diseño (variantes
  con cosas por marcar, todo marcado y sin nada hoy), sin agregar ningún dato que hoy no ve.
- **FR-014**: Todos los textos DEBEN vivir en un solo módulo con una prueba de redacción que prohíba palabras que evalúan
  («debes», «atrasado», «falta», «toca», porcentajes de cumplimiento, felicitaciones o regaños) — Principio I.
- **FR-015**: Áreas táctiles de al menos 44 px, contraste de 4.5:1 y estado nunca solo por color (siempre con texto o «✓»).
- **FR-016**: Los datos de salud (nombres de medicamentos, notas) NO DEBEN viajar en direcciones ni quedar en `error_logs`
  (Principio II).

### Entidades Clave

- **Resumen del día de un hijo**: por hijo y día local — conteos de medicamentos (total, por marcar, sin registrar),
  suplementos (marcadas / total), actividades (hechas / total) y la próxima toma por marcar (id, tipo, nombre, hora). Se
  deriva de las tomas y rutinas existentes; no se guarda nada nuevo.
- **Resumen personal del día**: lo mismo para las rutinas personales de quien abre la app (spec 033 parte 3).

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Al abrir el inicio, la persona identifica lo que falta marcar hoy de cada hijo **sin entrar a ningún detalle**
  (en la prueba: todo lo que muestra el detalle como «por marcar» hoy aparece contado en la tarjeta).
- **SC-002**: Marcar la próxima toma de un hijo cuesta **1 toque** desde el inicio (hoy: al menos 3 y dos pantallas).
- **SC-003**: Con 10 hijos, el inicio muestra todas sus tarjetas en no más de lo que tarda hoy en mostrar la lista con sus
  chips (medido en E2E con la red local).
- **SC-004**: Nada salta al cargar: la posición de «Tu día» y de la primera tarjeta no cambia más de 4 px entre el esqueleto
  y los datos.
- **SC-005**: El inicio y la pantalla del hijo, comparados lado a lado con el diseño a 390 y 1280 px, no tienen desviaciones
  fuera de `referencia/desviaciones.md`.
- **SC-006**: Cobertura de pruebas unitarias > 90 % (Principio VI) y E2E de los estados 1–5 y del 7 a 390 y 1280 px.

## Supuestos

- Es un rediseño de presentación: **sin migración**. Si para SC-003 conviene que el servidor arme el resumen del día de todos
  los hijos en una sola respuesta (en vez de pedir resumen y actividades hijo por hijo), se decide en el plan; las reglas de
  los estados siguen siendo las del servidor.
- «Ver todo» de «Tu día» lleva a «Mis suplementos» (y desde ahí a «Mis actividades»), las páginas que ya existen.
- El menú de las iniciales solo tiene, por ahora, el nombre, el plan y «Cerrar sesión».
- La fecha del saludo usa los nombres fijos de `shared/date.ts` (sin `Intl`).
- El «Solo lectura» del diseño es un ajuste del mock para dibujar al Tutor de una familia que dejó de pagar; en la app lo
  decide `useChildAccess(...).readOnly`.
- Fuera de esta spec: cambiar el detalle del hijo, el de la consulta o las páginas personales (siguen como están).
