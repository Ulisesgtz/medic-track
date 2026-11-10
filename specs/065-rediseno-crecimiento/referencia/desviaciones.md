# Desviaciones del mock «Crecimiento PediTrack» (spec 065)

Comparé el mock y la app lado a lado, al mismo ancho del mock (390 px y 1280 px), con los mismos datos: Mateo, nacido el 12 sep 2024, con las 8 medidas del mock y «hoy» = 24 oct 2026. Para eso usé un arnés temporal que no está en el repositorio. Medí cada sección con `getBoundingClientRect`, tomando el título (`h1`) como referencia.

**Teléfono (estado A), alto y posición de cada sección contra el mock:**
- iguales al píxel: encabezado, «+ Anotar medida» (52), «Última medida» (112), la tarjeta de la gráfica (657), las pestañas (54), el rango (44), la lectura (58), el SVG (316×264), el selector Niña·Niño (52), la nota (91), la lista (922; filas de 102 / 120 / 125) y la caja del registro (141).

**Web (estado A):**
- iguales al mock: la fila superior (181), la tarjeta de la gráfica (± 3 px), las pestañas, el rango, la lectura (44), la nota (72), el selector (52), la tabla (577; filas de 39 / 64 / 70 / 64) y el SVG de 854×380;
- diferencia: el encabezado común queda 4 px más alto (ver la desviación 9).

Lo que queda distinto, con su motivo, para que el dueño decida:

| # | Dónde | Mock | App | Motivo |
|---|---|---|---|---|
| 1 | Estado E, «Ver la gráfica» | Un aviso propio: «La gráfica es parte del Plan completo», «Conocer el Plan completo» / «Ahora no» | El aviso del plan de toda la app (`FreemiumLimitModal`, motivo `growth_chart`): franja, comparación, precio y «Ahora no» / «Ver el plan completo» | Regla de la app: un solo aviso de plan para todos los límites (spec 034). La tarjeta bloqueada sí es la del mock |
| 2 | Web, barra lateral | Simplificada: Inicio, Tus hijos, Familia, Botiquín y Mi día | La barra real de la app (`ChildrenSidebar`), que no cambia | La pantalla vive dentro del `AppShell` de todas las pantallas |
| 3 | Estado F | «Vista de Cuidadora.» | «Vista de Cuidadora.» para un Cuidador y «Solo lectura.» para otro rol sin escritura, como un Tutor de una familia que dejó de pagar | Para no decirle a alguien un rol que no tiene. El resto de la frase es la del mock |
| 4 | Eje Y | Valores fijos por rango (cm 0–3 años: 44–106, marcas de 10; cm hasta 19 años: marcas en 60/100/140/180) | Se calcula de los datos: cm 0–3 años da 45–105 con marcas de 10, y hasta 19 años da marcas en 80/120/160 | La app tiene que servir para cualquier hijo, no solo para los datos del mock. Peso 0–3 años sale igual al mock (2–18 con 4/8/12/16) |
| 5 | Estado D (sin tabla) | El eje Y conserva el rango de las curvas | El eje Y se ajusta a los puntos del hijo | Sin tabla elegida, la API no manda curvas, así que no se conoce su rango. «Hasta 10 años» sí se ofrece: los límites de la referencia son fijos |
| 6 | Formulario, «Fecha» | Texto «24 oct 2026» con un ícono de calendario | El selector de fecha nativo del teléfono o del navegador, ya lleno con hoy | Es el campo de fecha de todos los formularios de la app (con `min` = nacimiento y `max` = hoy); en el iPhone abre su rueda |
| 7 | G2, peso «116» | Muestra el error «Escribe el peso en kilos, con punto decimal…» | 116 kg se acepta: la regla del servidor es de 0.3 a 200 kg. El mensaje del mock sale cuando lo escrito no es un número (por ejemplo «1.1.6»), y un valor fuera de rango tiene su propio mensaje («El peso se anota entre 0.3 y 200 kg…») | Rechazar un valor posible sería juzgar el dato (Principio I); la regla es la de la spec 063 |
| 8 | Teléfono, «Guardar medida» fijo | Barra blanca con borde `#cfe8ec`, 14 px arriba y 34 abajo | La barra fija común (`StickyActionBar`): fondo canvas, borde hint-edge y el margen inferior del área segura del iPhone | Es la misma barra de todos los formularios (spec 056) |
| 9 | Web, encabezado | El título a 6 px de «← Mateo» | 4 px más | Es el encabezado común `PageHeader` (spec 056) |
| 10 | Estado F, nota de solo lectura | Dentro del encabezado, a 12 px del subtítulo | Primer bloque del contenido, a 16 px | El encabezado común no tiene lugar para una nota; queda en la misma posición visual con 4 px de diferencia |
| 11 | Errores de Peso y Talla | Solo se dibuja el error del peso | Si los dos tienen error, se ven los dos, uno debajo del otro, bajo la fila | Caso que el mock no dibuja |
| 12 | Un hijo mayor que la referencia (más de 10 años en peso) | No dibujado | El rango llega hasta su última medida y se rotula «Todo»; los puntos pasados los 10 años se dibujan sin curvas, con la nota «La referencia de la OMS de peso para la edad llega a los 10 años.» | Caso límite de la spec (los puntos nunca se esconden) |
| 13 | Referencia de la OMS apagada (sin permiso de licencia) | No dibujado | Solo los puntos, con la frase «La referencia de la OMS aún no está disponible…», sin invitación, sin selector y sin la nota de las curvas | Caso límite de la spec |
