# Desviaciones de los diseños de la spec 056

Lo que la app hace distinto de los diseños, con su motivo. Se llena al construir y comparar lado a lado (390 y 1280 px).

| # | Pantalla | Qué | Diseño | App | Motivo | Estado |
|---|---|---|---|---|---|---|
| 1 | Detalle de la consulta | Toma de un día futuro | «programada», sin acción | «programada» y **se puede marcar** | Decisión del dueño (2026-11-01): la spec 004 permite marcar cualquier toma sin restricción de fecha | Decidida |
| 2 | Detalle de suplemento / actividad | El cuerpo (P1 del encabezado) | «Hoy» con barra y la toma; «Datos» en filas de 52 px sin la frecuencia (ya está en el subtítulo); «Pausar» con contorno y «Finalizar» como texto | Se cambió el encabezado (H2: «Suplemento de Mateo», frecuencia, chip de estado, «Editar»); el cuerpo sigue el diseño de la spec 035 y la frecuencia se repite en «Datos» | El diseño del encabezado muestra P1 como ejemplo de H2 puesto; el rediseño del cuerpo no está en esta spec | Aprobada (2026-11-02) |
| 3 | Familia | El contador de lugares | Sin contador; «Familia Morales · 3 personas» en el subtítulo | El subtítulo son los nombres de los hijos y el contador «N de 4 personas» queda como tarjeta debajo del encabezado | El contador cuenta también las invitaciones pendientes, que deciden si se puede invitar a alguien más (spec 032) | Aprobada (2026-11-02) |
| 4 | Detalle del hijo | Próxima cita | Tarjeta compacta (fecha, doctor, lugar, «Abrir en Maps»; sin cita, «+ Agregar cita») | Igual que el diseño (`NextAppointmentCompact`); su texto abre las citas del hijo, donde se edita, se marca y se eligen los avisos | El diseño no dibuja dónde se marca o se edita la cita | Cerrada (2026-11-02) |
| 5 | Detalle del hijo | Tratamiento activo | Tarjeta con «Ver consulta del 28 oct ›» | La tarjeta sin enlace | El resumen del hijo no dice de qué consulta es el tratamiento (sin API nueva, decisión del plan) | Aprobada (2026-11-02) |
| 6 | Detalle del hijo y «Mi día» | Detalle de cada toma | «4 ml · 06:00», «1 cápsula · 08:00» | «06:00», «Suplemento · 08:00» | El API no guarda la cantidad de cada toma (igual que la desviación 8 de la spec 055) | Aprobada (2026-11-02) |
| 7 | Detalle del hijo | «Acceso del hijo» en «Lo demás» | Una fila que lleva a otra pantalla | La fila abre debajo el bloque de la spec 047 (crear liga, teléfonos, quitar) | No existe una pantalla de acceso del hijo; es el mismo patrón que «Recordatorios» en el inicio (spec 055, desviación 5) | Aprobada (2026-11-02) |
| 8 | Detalle del hijo | Cuidador | Sin «Acceso del hijo» | Igual que el diseño: el Cuidador ya no ve la lista de teléfonos del hijo | Antes la veía (spec 047); el diseño la quita para quien no la puede cambiar | Aprobada (2026-11-02) |
| 9 | Detalle de la consulta | Toma «sin registrar» | Solo la etiqueta punteada | La etiqueta punteada y «Marcar» | La spec 013 deja marcarla y desmarcarla | Aprobada (2026-11-02) |
| 10 | Detalle de la consulta | Nombre accesible de cada toma | «Marcar Amoxicilina de las 08:00» | «Toma de 08:00» (fijo) con el estado en `aria-pressed` y la descripción | Se conserva el nombre que ya usan las pruebas y los lectores de pantalla; el medicamento lo dice el grupo («Mañana, Amoxicilina, hoy») | Aprobada (2026-11-02) |
| 11 | Detalle de la consulta (web) | Flechas del mes | No las dibuja (un solo mes) | Sin flechas cuando el tratamiento cabe en un mes; con flechas cuando cruza de mes | Un tratamiento que cruza de mes no se vería completo | Aprobada (2026-11-02) |
| 12 | Detalle del hijo (teléfono) | Barra del índice | Pastillas que caben o se desplazan | Igual, sin barra de desplazamiento visible | Chromium dibujaba la barra bajo las pastillas | Decidida |

## Medido (2026-11-02)

Arnés temporal (Clerk sustituido, API falsa con los datos de los estados A1, C1 y B1), en Chromium:

- **Detalle del hijo, teléfono 390 px**: encabezado (avatar 52 px, «Mateo» 28 px), «Hoy» con Mañana / Tarde / Noche, filas de 60 px, «Marcar» de 44 × 96 px, la fila de actividades, el índice pegado arriba y «Nueva consulta» fijo abajo, como el diseño.
- **Detalle del hijo, web 1280 px**: columna en x = 328, «Hoy» a todo el ancho, columnas `1fr / 296 px` con 28 px entre ellas, «Nueva consulta» de 52 px a la derecha del encabezado; el ancho total es 889 px y no 904 por la barra de desplazamiento de la ventana (como en la spec 055).
- **Detalle de la consulta**: teléfono con la semana («2 nov – 8 nov», flechas de 44 px, celdas de 56 px, «Ver mes»), tarjeta por medicamento con número y color, «12 de 21 tomas · 1 sin registrar» y las filas; web con columnas `1fr / 300 px` (x = 328 y 917) y el encabezado con «Editar consulta» y «Nueva consulta».
- **«Mi día», teléfono**: iniciales en tinta, «Solo tú ves esto», «Hoy» con las tomas y las actividades, el índice y «Cómo funcionan» como enlace.
