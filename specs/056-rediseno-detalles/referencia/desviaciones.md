# Desviaciones de los diseños de la spec 056

Lo que la app hace distinto de los diseños, con su motivo. Se llena al construir y comparar lado a lado (390 y 1280 px).

| # | Pantalla | Qué | Diseño | App | Motivo | Estado |
|---|---|---|---|---|---|---|
| 1 | Detalle de la consulta | Toma de un día futuro | «programada», sin acción | «programada» y **se puede marcar** | Decisión del dueño (2026-11-01): la spec 004 permite marcar cualquier toma sin restricción de fecha | Decidida |
| 2 | Detalle de suplemento / actividad | El cuerpo (P1 del encabezado) | «Hoy» con barra y la toma; «Datos» en filas de 52 px sin la frecuencia (ya está en el subtítulo); «Pausar» con contorno y «Finalizar» como texto | Se cambió el encabezado (H2: «Suplemento de Mateo», frecuencia, chip de estado, «Editar»); el cuerpo sigue el diseño de la spec 035 y la frecuencia se repite en «Datos» | El diseño del encabezado muestra P1 como ejemplo de H2 puesto; el rediseño del cuerpo no está en esta spec | Abierta |
| 3 | Familia | El contador de lugares | Sin contador; «Familia Morales · 3 personas» en el subtítulo | El subtítulo son los nombres de los hijos y el contador «N de 4 personas» queda como tarjeta debajo del encabezado | El contador cuenta también las invitaciones pendientes, que deciden si se puede invitar a alguien más (spec 032) | Abierta |
