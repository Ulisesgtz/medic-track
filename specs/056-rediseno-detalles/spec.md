# Especificación de Funcionalidad: Rediseño de las pantallas de detalle — encabezado común, detalle del hijo, «Mi día» y detalle de la consulta

**Rama de la Funcionalidad**: `feature/056-rediseno-detalles` (sale de `feature/055-rediseno-inicio`: reutiliza sus tokens,
`DayRow`, chips y textos)

**Creado**: 2026-11-01

**Estado**: Borrador

**Entrada**: Tres diseños de Claude Design (proyecto `f4e28757-d885-471d-b5b9-6e6ca094449a`, «propuesta 1 nov 2026»), pedidos
después de la auditoría de UX que siguió al rediseño del inicio (spec 055): **`Encabezado PediTrack.dc.html`** (medidas y
decisiones en `referencia/encabezado-medidas.md`), **`referencia/Detalle y Mi día PediTrack.dc.html`** y
**`referencia/Detalle de la consulta PediTrack.dc.html`**. Los diseños **mandan** en estructura, textos, colores y medidas.

## Contexto

Desde la spec 055 la app tiene dos idiomas visuales: el inicio y «Hoy» del hijo usan el nuevo (título sobre la página,
tarjetas, filas con icono, chips del día) y casi todo lo demás, en el teléfono, conserva la **banda oscura** del diseño de
septiembre. La auditoría encontró además:

- en el **detalle del hijo**, «Tomas de hoy» queda debajo de las consultas y siete secciones pesan igual, sin índice;
- en el **detalle de la consulta** (teléfono), los medicamentos —donde se marca— van al final, después de la foto, la cita,
  los síntomas, las notas y el calendario;
- lo **personal** está partido en dos páginas («Mis suplementos», «Mis actividades») y «Ver todo» del inicio solo lleva a una.

Lo que se registra y sus reglas **no cambian**. La app registra, nunca interpreta (Principio I): ámbar = «por marcar»,
«sin registrar» punteado gris, «cancelada» tachada y gris, sin rojo ni porcentajes de cumplimiento.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - El detalle del hijo abre con su día (Prioridad: P1)

Ana abre a Mateo desde el inicio. Lo primero es «Hoy»: las tomas de medicamentos y suplementos por Mañana / Tarde / Noche,
cada una con «Marcar», «✓ 08:05» suyo (que puede desmarcar) o «✓ por Rosa, 08:05» (texto, sin acción), y las actividades
con su conteo y «✓ Realizado». Debajo, el tratamiento activo y la próxima cita, compactos. Luego un índice
**Consultas · Suplementos · Actividades · Cartilla** (pastillas que se pegan arriba en el teléfono) que salta a cada
sección. «Nueva consulta» es el único botón sólido: fijo abajo en el teléfono, arriba a la derecha en la web. «Acceso del
hijo» y «Familia que lo ve» bajan a «Lo demás».

**Por qué esta prioridad**: es la pantalla a la que lleva cada tarjeta del inicio; hoy esconde lo diario.

**Prueba Independiente**: con un hijo con medicamento, suplemento, actividad, cita y consultas, «Hoy» va primero, se marca
desde ahí, el índice lleva a cada sección y las tomas no se repiten en Suplementos ni en Actividades.

**Escenarios de Aceptación**:

1. **Dado** el detalle del hijo, **Entonces** el orden es: encabezado común («← Inicio», avatar, nombre, edad y fecha de
   nacimiento) → «Hoy» → tratamiento activo → próxima cita → índice → Consultas → Suplementos → Actividades → Cartilla →
   «Lo demás».
2. **Dado** «Hoy», **Cuando** se toca «Marcar», **Entonces** la toma queda marcada por quien tocó, igual que en el resto
   de la app; una marca de otra persona es texto con su nombre y no se puede desmarcar.
3. **Dado** las secciones Suplementos y Actividades, **Entonces** muestran solo nombre, frecuencia y estado neutro
   («Activo / Pausado / Terminado»); sus tomas de hoy están solo en «Hoy».
4. **Dado** el índice en el teléfono, **Cuando** se hace scroll, **Entonces** se queda pegado arriba y cada pastilla salta
   a su sección.
5. **Dado** la web, **Entonces** se quita la tarjeta «Consultas: N desde 2024»; el tratamiento, la cita y el resumen del día
   van fijos en la columna derecha.
6. **Dado** un hijo recién agregado, **Entonces** «Hoy» dice que no hay nada hoy y no se muestran secciones vacías; el
   único sólido es «Nueva consulta».

---

### Historia de Usuario 2 - El encabezado común en las pantallas secundarias (Prioridad: P1)

Al pasar del inicio a cualquier pantalla secundaria se ve la misma app: el título sobre la página, «← …» arriba a la
izquierda, la línea superior de contexto («Suplemento de Mateo»), el subtítulo y el chip de estado neutro, y las acciones
bajo el título (teléfono) o a la derecha (web). En un formulario, «← Cancelar» y «Guardar» fijo abajo en el teléfono.

**Por qué esta prioridad**: un solo componente quita la banda oscura de unas 14 pantallas y es la base de las otras dos
historias.

**Prueba Independiente**: las pantallas de la lista de FR-010 ya no tienen banda oscura y usan el mismo encabezado, en sus
variantes H1–H10, a 390 y 1280 px.

**Escenarios de Aceptación**:

1. **Dado** cualquier pantalla de FR-010 en el teléfono, **Entonces** no hay banda oscura y el encabezado respeta la zona
   segura de arriba.
2. **Dado** un formulario en el teléfono, **Entonces** el botón de guardar está fijo abajo, a todo lo ancho, y no en el
   encabezado.
3. **Dado** un título largo, **Entonces** se parte por palabra en dos o tres líneas y las acciones no se salen.
4. **Dado** que la pantalla carga o falla, **Entonces** «← …» ya funciona; al cargar hay un esqueleto con la altura del
   título y al fallar «No pudimos cargar…» con «Reintentar», sin rojo.
5. **Dado** el Historial, **Entonces** el campo de búsqueda se pega arriba al hacer scroll.

---

### Historia de Usuario 3 - El detalle de la consulta: tratamiento primero (Prioridad: P2)

Durante un tratamiento, Ana abre la consulta y ve primero el calendario (una semana en el teléfono, que se despliega a mes)
y una tarjeta por medicamento con su barra y las tomas del día elegido por Mañana / Tarde / Noche. Lo que marcó otra persona
lleva candado y su nombre. Las tomas canceladas se ven tachadas y en gris. «Finalizar» y «Recorrer» están al pie de cada
medicamento, con contorno. Debajo, la próxima cita y «Datos de la consulta» (foto, síntomas, notas), plegados en el
teléfono con su resumen («Foto · 2 síntomas · notas») y abiertos en la web. «Editar consulta» va con contorno en el
encabezado.

**Por qué esta prioridad**: es la pantalla que más se abre durante un tratamiento, y hoy marcar exige bajar toda la pantalla.

**Prueba Independiente**: en el teléfono, la primera tarjeta bajo el encabezado es el tratamiento; marcar una toma del día
elegido no exige scroll pasando la foto ni las notas.

**Escenarios de Aceptación**:

1. **Dado** una consulta con tratamiento, **Entonces** el orden en ambos diseños es: encabezado común → tratamiento
   (calendario + tarjetas de medicamento) → próxima cita → datos de la consulta.
2. **Dado** el calendario en el teléfono, **Entonces** muestra la semana del día elegido y se despliega a mes; conserva el
   diseño de la spec 022 (pastillas, puntos por medicamento, elegido en tinta, aro de hoy).
3. **Dado** una toma marcada por otra persona, **Entonces** lleva candado y «✓ 07:05 · por Ana» y no es un botón.
4. **Dado** una consulta «solo registro», **Entonces** no hay calendario ni tomas; los medicamentos se listan con frecuencia
   y duración, y los datos de la consulta se abren solos.
5. **Dado** la web, **Entonces** «Nueva consulta» es el único sólido; en el teléfono esta pantalla no tiene botón sólido.

---

### Historia de Usuario 4 - «Mi día»: lo personal en una sola página (Prioridad: P3)

Ana toca «Ver todo» en «Tu día» del inicio y llega a «Mi día» (`/mi-dia`): «Solo tú ves esto», «Hoy» con sus tomas por
Mañana / Tarde / Noche y sus actividades, y un índice Suplementos · Actividades con sus filas compactas y «+ Agregar». En la
barra lateral, «Personal» tiene una sola entrada: «Mi día».

**Por qué esta prioridad**: une dos páginas que ya funcionan; mejora la navegación, no una tarea diaria nueva.

**Prueba Independiente**: «Ver todo» lleva a «Mi día»; desde ahí se marcan tomas y actividades y se llega a crear un
suplemento o una actividad; `/mis-suplementos` y `/mis-actividades` llevan a «Mi día».

**Escenarios de Aceptación**:

1. **Dado** «Mi día», **Entonces** muestra «Hoy» y luego Suplementos y Actividades, sin secciones vacías.
2. **Dado** que la persona no ha creado nada, **Entonces** el único sólido es «Agregar mi primer suplemento» dentro de
   «Hoy» y la actividad va con contorno.
3. **Dado** la primera vez, **Entonces** se muestra «Cómo funcionan»; después queda como enlace para volver a abrirlo.
4. **Dado** el plan gratuito o vencido, **Entonces** lo creado se ve y se marca, y el aviso compacto del plan reemplaza
   «+ Agregar».

---

### Casos Límite

- **Cuidador** en el detalle del hijo y de la consulta: ve y marca; sin «Nueva consulta», «Editar consulta», «Finalizar»,
  «Recorrer» ni agregar suplementos, actividades o citas; sin «Acceso del hijo».
- **Tutor de una familia que dejó de pagar**: la nota «Solo lectura…» bajo el encabezado; marca, sin agregar ni editar.
- **Plan gratuito**: lo registrado siempre se ve; «Buscar en el historial» y «Exportar a PDF» con la marca «Plan completo»;
  donde iría «+ Agregar» aparece el aviso compacto del plan.
- **Una toma de un día futuro** en el calendario de la consulta: dice «programada» y se puede marcar (FR-018).
- **Varios teléfonos marcando a la vez**: la primera marca gana (spec 032); la pantalla se pone al día en el siguiente
  refresco.
- **Avisos y ligas viejas**: un aviso de una rutina personal sigue abriendo su detalle; `/mis-suplementos` y
  `/mis-actividades` llevan a «Mi día».
- **El teclado del teléfono** en un formulario con «Guardar» fijo abajo: el botón no tapa el campo que se está escribiendo.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: Las tres pantallas y el encabezado DEBEN construirse **exactamente** como sus diseños, con dos diseños
  separados (teléfono 390 px, web 1280 px con la barra lateral) elegidos con `useIsDesktop`. Toda desviación se lista en
  `referencia/desviaciones.md` con su motivo.
- **FR-002**: Debe existir **un solo componente de encabezado de página** con las partes y variantes del diseño (regresar,
  línea superior, título, subtítulo, chip neutro, acciones, «Solo lectura», búsqueda pegada, carga y error).
- **FR-003**: En el teléfono el encabezado NO lleva banda oscura y respeta la zona segura; las acciones van bajo el título.
  En la web van a la derecha.
- **FR-004**: En un formulario, guardar NO va en el encabezado: fijo abajo en el teléfono (a todo lo ancho, sin tapar el
  campo activo) y al final en la web.
- **FR-005**: El detalle del hijo DEBE abrir con «Hoy» (tomas de medicamentos y suplementos por Mañana / Tarde / Noche y
  actividades con «✓ Realizado»), marcando con las mismas funciones y reglas de autor que el resto de la app.
- **FR-006**: El detalle del hijo DEBE tener el índice Consultas · Suplementos · Actividades · Cartilla, pegado arriba en el
  teléfono, y no repetir en Suplementos ni en Actividades las tomas que ya están en «Hoy».
- **FR-007**: «Nueva consulta» es el único botón sólido del detalle del hijo: fijo abajo en el teléfono, arriba a la derecha
  en la web; no aparece para un Cuidador ni en solo lectura.
- **FR-008**: «Acceso del hijo» y «Familia que lo ve» van en «Lo demás», al final, como filas de 52 px.
- **FR-009**: La web del detalle del hijo DEBE quitar la tarjeta «Consultas: N desde …» y llevar tratamiento, cita y resumen
  del día en la columna derecha.
- **FR-010**: El encabezado común DEBE usarse en: detalle y formulario de suplemento y de actividad, «Mi día», Cartilla,
  Historial, historial y formulario de citas, Familia, Planes, regreso del pago, Nueva / Editar consulta, detalle del hijo y
  detalle de la consulta. No en el inicio ni en iniciar sesión / registro.
- **FR-011**: El detalle de la consulta DEBE ordenar: encabezado → tratamiento (calendario + tarjetas) → próxima cita → datos
  de la consulta, en ambos diseños.
- **FR-012**: El calendario del teléfono DEBE mostrar la semana del día elegido y desplegarse a mes, conservando el diseño de
  la spec 022 y la marca de hoy de la spec 027.
- **FR-013**: Una toma marcada por otra persona DEBE llevar candado y «✓ HH:MM · por Nombre» y no ser un botón; la propia se
  puede desmarcar.
- **FR-014**: «Datos de la consulta» DEBE plegarse en el teléfono con su resumen y abrirse en la web; en «solo registro» se
  abre solo.
- **FR-015**: «Mi día» (`/mi-dia`) DEBE unir los suplementos y las actividades personales; «Ver todo» de «Tu día» y la
  entrada única «Mi día» de la barra lateral llevan ahí; `/mis-suplementos` y `/mis-actividades` redirigen a «Mi día».
- **FR-016**: Todos los textos nuevos DEBEN vivir en módulos de textos con su prueba de redacción (Principio I).
- **FR-017**: Áreas táctiles de 44 px, contraste de 4.5:1 y estado nunca solo por color.
- **FR-018**: Una toma de un **día futuro** se dibuja «programada» en el calendario de la consulta, **y se puede marcar** como cualquier otra (spec 004: marcar no tiene restricción de fecha). Solo cambia la palabra. *(Decidido por el dueño el 2026-11-01; desviación del diseño, que la dejaba sin acción.)*

### Entidades Clave

Sin datos nuevos. Las pantallas se derivan de las respuestas que ya existen: el resumen del hijo y sus rutinas (spec 055),
el detalle de la consulta (specs 013, 016, 020, 051) y las rutinas personales (specs 033 parte 3, 035).

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: En el teléfono, marcar una toma de hoy desde el detalle del hijo o de la consulta no exige pasar de la primera
  pantalla (sin scroll a 390 × 844 con un tratamiento de dos medicamentos).
- **SC-002**: Ninguna pantalla con sesión, salvo el inicio y la del hijo, conserva la banda oscura en el teléfono.
- **SC-003**: Comparadas lado a lado con sus diseños a 390 y 1280 px, las pantallas no tienen desviaciones fuera de
  `referencia/desviaciones.md`.
- **SC-004**: Llegar a «Mis actividades» desde el inicio en el teléfono cuesta un toque menos que hoy.
- **SC-005**: Cobertura de pruebas unitarias > 90 % y E2E de cada historia a 390 y 1280 px.

## Supuestos

- Solo frontend, sin migración ni API nueva, salvo que el plan encuentre un dato que falte (se decide en `/speckit-plan`).
- La rama sale de la 055 (aún sin fusionar); se rebasa sobre `develop` cuando la 055 se fusione.
- El orden de construcción es el del plan: encabezado común primero (lo usan las demás), luego el detalle del hijo, la
  consulta y «Mi día».
- Iniciar sesión, registro y la pantalla «Hoy» del hijo quedan fuera (tienen su propio diseño).
