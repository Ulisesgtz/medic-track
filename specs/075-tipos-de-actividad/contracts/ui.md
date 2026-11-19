# Contrato de UI — Spec 075

Hecho del mock de Claude Design `../referencia/Tipos de actividad PediTrack.dc.html` (estados A, A2, A3, B, C, C2, D, D1, D2, D3
y E; decisiones al final del archivo). Dos diseños con `useIsDesktop`, nunca mezclados; E2E a 390 y 1280 px. Las diferencias que
quedan están en `../referencia/desviaciones.md`. Todos los textos nuevos viven en `features/supplements/activityTypeText.ts` (con su
prueba de redacción: nada que evalúe, aconseje o alarme; Principio I).

## Formulario de actividad (`RoutineForm`, crear y editar; hijo y propia) — estados C y C2

- Campo **«Tipo de actividad · Obligatorio»** (`ActivityTypePicker`) **justo después del nombre** y antes de «Cuándo se hace».
  Leyenda 13/700 de tinta con «· Obligatorio» en `muted` 600; debajo, la ayuda «Solo sirve para ordenar la lista de actividades.»
  (14 px, `body`).
- **Chips de opción única** (los mismos de la ficha 073, `<label>` con `<input type="radio">` oculto de 1 px, así las flechas
  mueven la elección): los tipos **activos** del catálogo en su orden; 44 px de alto, `px-3.5`, borde 1.5 px `hint-border`, texto
  15/800 `action`, fondo `surface`; **el elegido** con relleno y borde de `ink`, texto blanco y una palomita de 16 px a su derecha
  (no depende solo del color). **Ninguno elegido** al crear; al editar, el guardado elegido (si está retirado se muestra elegido y se
  puede cambiar a uno activo).
- «Guardar» **no se deshabilita**. Al guardar sin tipo (o si el servidor dice `activityType`): el grupo queda dentro de un **borde de
  tinta de 2 px** (`rounded-2xl`, `px-3.5 py-3`, la leyenda con `px-1.5`) y debajo, **«Elige el tipo de actividad.»** en 15/800 de
  tinta, `role="alert"`, unido al grupo con `aria-describedby`; sin rojo. No se pierde lo escrito.
- Un 400 `activityType` del servidor (tipo retirado entre la carga y el guardado) vuelve a leer el catálogo y vacía la elección al
  crear.
- Los suplementos no tienen el campo. El catálogo en carga o con error muestra un aviso neutral y no impide guardar el resto del
  formulario (el servidor decide).

## Detalle de la actividad (`RoutineDetailPage`) — estados D, D1, D2, D3

- La fila **«Tipo» va primera en los datos** (dt 13/700 de tinta, dd 15 `body` con el nombre del tipo, también el de un tipo
  retirado). Para quien es `Full` (`canManage`), **«Cambiar»** es un botón de texto **subrayado, de 44 px** (`px-3.5`, 15/800,
  `action`, sin contorno) con nombre accesible **«Cambiar el tipo de actividad, ahora Deportiva»**. Funciona con el plan vencido y en
  una actividad pausada o finalizada. Un Cuidador ve el tipo sin el botón. Una respuesta sin `activityType` (servidor anterior) no
  trae la fila.
- **D1 — `ActivityTypeDialog`**: hoja inferior en el teléfono (fondo `canvas`, esquinas superiores de 28 px, asa de 40×4,
  `px-5 pt-2.5 pb-[26px]`, botones lado a lado con «Guardar» ocupando el resto), diálogo centrado de **520 px** en la web (`canvas`,
  22 px de radio, `p-7`, sombra, botones a la derecha, «Guardar» de 160 px mínimo). Contenido: título «Tipo de actividad» (22/900),
  el nombre de la actividad (15/700), «Solo organiza la lista. No cambia los horarios ni los avisos.» (14, `body`), la leyenda
  **«Elige un tipo · Actual: Deportiva»** y los mismos chips con el actual marcado, «Guardar» sólido (`confirmed`, 52 px) y
  «Cancelar» de contorno. Fondo oscuro `ink/55`. Escape y tocar fuera cancelan (no mientras guarda); el foco entra en la elección y
  vuelve a «Cambiar». Guardar el mismo tipo solo cierra. Un fallo dice «No se pudo cambiar el tipo. Inténtalo de nuevo.» y deja el
  diálogo abierto.
- **D2 — plan vencido** (una actividad con `canEdit` falso para quien puede manejarla, de un hijo o propia): sin «Editar», «Pausar»
  ni «Reanudar»; con «Realizado» y «Cambiar»; la nota `role="note"` «Tu plan completo venció. Puedes ver la actividad, marcar
  «Realizado» y cambiar su tipo. Para editar, pausar o reanudar se necesita el plan completo.» con «Ver el plan completo →» (`/planes`).
- **D3 — finalizada**: sin «Realizado» ni botones de acción; conserva «Cambiar».

## Sección «Actividades» (detalle del hijo y `/yo`, `RegistroCompacto` con `kind = "activity"`) — estados A, A2, A3, B, E

- El **encabezado** de la sección lleva el título (h2: 18/800 en el teléfono, 20/900 en la web) y, a la derecha, **«+ Agregar
  actividad» de contorno** (`border-2 border-action`, 44 px, `rounded-[14px]`; teléfono `px-3` 14 px, web `px-[18px]` 15 px) para
  quien puede crear y mientras no esté el tope.
- **Un segmento por tipo con actividades, cada uno una tarjeta** (`ActivitySegmentCard`: `rounded-[22px]`, borde 1 px `hint-edge`,
  sombra): arriba el **icono del tipo** (E: línea, 20 px, en un cuadro `hint` de 34 px, todos del mismo color `action`,
  `aria-hidden`) y el **nombre** como `h3` de 17/800 de tinta, y a la derecha el conteo («1 actividad» / «2 actividades», 13/700
  `muted`). Sin color propio por tipo, sin conteos de «hechas».
- Orden del catálogo (los retirados en su lugar); sin segmentos vacíos; con **un solo tipo** se conserva el título; un código que el
  catálogo no conoce va al final bajo su código.
- **Filas** compactas separadas por una línea fina (`border-t hint-edge`), sin icono: **teléfono** nombre (16/800) arriba y frecuencia
  (14) abajo, estado a la derecha; **web** una línea con rejilla `1.1fr 1fr auto` (nombre 16/800, frecuencia 15, estado). Estado:
  «Activa» (borde y fondo `hint`, texto `action`) o «Pausada» / «Terminada» (fondo `slate-100`, texto `muted`), 12/800 en mayúsculas.
- **Sin actividades**: el vacío de hoy («Sin actividades registradas»), sin segmentos ni títulos de tipo.
- **Sin catálogo** (error o sin copia sin conexión): la lista sin segmentos, como antes.

## Sin cambios

«Hoy» del hijo, tarjeta del inicio, «Tu día», teléfono del hijo, suplementos (su sección conserva su botón punteado debajo de la
lista).
