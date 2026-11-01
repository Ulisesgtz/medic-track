# Desviaciones del diseño del inicio (spec 055)

Lo que la app hace distinto de `Inicio PediTrack.dc.html`, con su motivo. Se llena al construir y comparar lado a lado
(390 y 1280 px).

| # | Qué | Diseño | App | Motivo | Estado |
|---|---|---|---|---|---|
| 1 | Familia de un Cuidador en «Lo demás» | «Familia Morales · cuidadora» | «Familia Morales · Cuidador» (la etiqueta del rol de `family/roles.ts`) | La app no sabe ni supone el género de la persona | Abierta |
| 2 | Nombre de la familia de un Cuidador (subtítulo de los hijos) | «Familia Morales · puedes ver y marcar» | «Familia de Ana · puedes ver y marcar» | El API da el nombre de pila de la dueña (`family.ownerName`), no un apellido de familia; es la misma forma de «Incluido por la familia de Ana» (spec 034) | Abierta |
| 3 | La tarjeta del hijo tras «Marcar» | «✓ 13:22» se queda | «✓ HH:MM» un minuto (un refresco) y luego la siguiente toma por marcar | Si se quedara, la siguiente toma no aparecería hasta salir del inicio | Abierta |
| 4 | La barra lateral web | Inicio, hijos, «+ Agregar hijo», Personal y la cuenta | Además conserva «Familia» y «Planes» | La barra está en todas las pantallas; sin ellos, en la web no habría cómo llegar a Familia o a Planes desde otra pantalla que no sea el inicio | Abierta |
| 5 | «Recordatorios» en «Lo demás» | Una fila con «Activados» | La fila abre debajo la tarjeta de recordatorios (activar, desactivar, qué muestran) | No hay una pantalla de recordatorios y el permiso del navegador se pide desde esa tarjeta (spec 011) | Abierta |
| 6 | El menú de la cuenta | Botón «Menú de cuenta» (no dibuja el panel) | Un panel con nombre, plan y «Cerrar sesión» | El diseño no dibuja el contenido del menú | Abierta |
| 7 | Botón de una toma en «Hoy» del hijo | El nombre accesible cambia con el estado («Marcar … de las …», «Marcada por ti…») y lo de otra persona es texto | Nombre fijo «Marcar Amoxicilina de las 08:00» con el estado en `aria-pressed`; lo de otra persona es ese botón deshabilitado con el aspecto del texto | Convención del proyecto para los botones que se alternan (frontend/CLAUDE.md) | Abierta |
| 8 | Detalle de una toma en «Hoy» del hijo | «5 ml · 08:00» | «08:00» o «Suplemento · 08:00» | El API no guarda la cantidad de cada toma | Abierta |
| 9 | Una actividad que se repite en el día, en «Hoy» del hijo | Una hora por actividad | Su conteo («2 de 24 hechas») y «✓ Realizado» marca la más temprana sin marcar | Una actividad «varias veces al día» (spec 035) no tiene una sola hora; el diseño solo dibujó actividades de una vez al día | Abierta |
| 10 | «Avisos» en «Hoy» del hijo | «Te llega un aviso a la hora de cada toma.» + «Activar» / «✓ Activados» | El estilo del diseño con las frases y los botones de la spec 047 (activar, apagar, «Es una ayuda, no una alarma garantizada») | La frase de la ayuda es obligatoria (spec 011, FR-014) y apagar los avisos debe seguir siendo posible | Abierta |
| 11 | Aviso «Antes de empezar» (estado 3) | Un texto corto de ejemplo | El texto completo y vigente de las specs 009/010 (`WelcomeDisclaimer`) | Es el aviso legal que la cuenta confirma por versión; no se cambia por diseño | Abierta |
| 12 | Nota para instalar la app en «Hoy» del hijo | No aparece | «Para que no se pierda, agrega esta app…» mientras no corre instalada | Ya existía (spec 047): sin la app instalada se pierde el acceso en iPhone | Abierta |
| 13 | Barra lateral web | «Inicio» a 90 px del borde y la cuenta abajo | Unos 8 px más arriba (el logo y los espacios de la barra de siempre) | La barra es la misma en todas las pantallas; se ajustó lo que pide el diseño (grupo, cuenta con menú) sin mover el resto | Abierta |
| 14 | «Marcar» que falla (sin red) | No dibujado | El botón vuelve a «Marcar» sin mensaje | El diseño no tiene el estado; queda pendiente decidir el texto | Abierta |

## Medido (2026-11-01)

Arnés temporal (Clerk sustituido, API falsa) contra el diseño servido con su `support.js`, estado 1:

- **Teléfono 390 px**: saludo, «Tu día» (82 / 273 px), «Tus hijos», las dos tarjetas (409 / 308 y 729 / 297), la fila de medicamentos, «+ Agregar hijo», «Lo demás», «✓ Realizado» y «Marcar» en **la misma posición y tamaño** que el diseño (el ancho del saludo cambia con la fecha).
- **Web 1280 px**: «Tu día», «Tus hijos», tarjetas, «+ Agregar hijo», «Lo demás», «✓ Realizado» y «Marcar» iguales; el ancho de la columna difiere en 15 px por la barra de desplazamiento de la ventana.
- Estados 3, 4, 5, 7a y 7c revisados a la vista. Para igualar el diseño, el inicio y la pantalla del hijo usan alto de línea `normal` y tamaños exactos (`text-[14px]`…), como el diseño.
