# Encabezado de página común — medidas y decisiones

Diseño: proyecto de Claude Design `f4e28757-d885-471d-b5b9-6e6ca094449a`, archivo **`Encabezado PediTrack.dc.html`**
(propuesta 1 nov 2026). Se lee con DesignSync `get_file` (solo lectura). Este resumen copia del diseño sus medidas y sus
decisiones; el diseño manda.

## Medidas

| | Teléfono (390 px) | Web (1280 px, barra lateral 280 px) |
|---|---|---|
| Fondo | `canvas`, **sin banda oscura** | `canvas` |
| Arriba | zona segura (barra de estado, 47 px en el iPhone del diseño) | relleno de la página 28 px arriba, 48 px a los lados; columna máx. 904 px |
| Márgenes | 20 px a los lados, 16 px abajo | 24 px hasta el contenido |
| Regresar | «← …» arriba a la izquierda, 44 px de alto, 15/700 `action` | igual |
| Línea superior | 13/800, mayúsculas, tracking 0.06em, `action` | igual |
| Título | 28/900, interlineado 1.15, tracking −0.03em, `ink`, `text-wrap: balance`, parte por palabra | 34/900 |
| Subtítulo | 15/400 `body` (interlineado 1.45) | 16/400 |
| Chip de estado | «Activo»: fondo `hint`, borde 1 `hint-border`, texto `action` 13/800; «Solo registro» / «Terminado»: solo borde 1 `hint-border`, texto `body` | igual |
| Acciones | **bajo el título**, fila con separación 8 px; principal sólida `confirmed` 48 px radio 16 (16/800); secundaria contorno 2 `action` 48 px radio 16; «Editar» contorno 44 px radio 14 | **a la derecha**, centradas con el bloque del título; «Editar» 44 px, secundaria 48 px, principal 52 px |
| «Solo lectura» | nota del inicio, 12 px debajo | 10 px debajo |
| Búsqueda (Historial) | campo de 48 px pegado arriba al hacer scroll (`sticky`, borde inferior `hint-edge`) | debajo del título, máx. 560 px |
| Formulario | «← Cancelar»; **«Guardar…» fijo abajo** (52 px, ancho completo, sólido) | «Guardar…» al final del formulario |
| Cargando | «← …» funciona; esqueleto 110×14, 220×32, 180×18 | 130×14, 340×39, 240×20 |
| Error | «← …» funciona; recuadro punteado `hint-border` con título 17/800, texto y «Reintentar» con contorno | igual, en fila |

## Variantes (H1–H10) y pantallas completas (P1–P3)

H1 simple (Familia, Planes) · H2 línea superior + subtítulo + chip + «Editar» (detalle de suplemento/actividad) · H3 acción
principal + secundaria (Cartilla: «+ Agregar vacuna» / «Exportar a PDF») · H4 formulario (guardar fijo abajo) · H5 personal
(«Solo tú ves esto») · H6 con «Solo lectura» · H7 con búsqueda (Historial) · H8 título largo · H9 cargando · H10 error.
P1 detalle de suplemento («Hoy» con barra y la toma, «Datos» en filas de 52 px, «Pausar» con contorno y «Finalizar» como
texto), P2 Cartilla (vacunas en filas de 60 px con icono de libreta y «›», la frase «Lo registrado es lo que tú capturaste…»),
P3 Familia (personas en filas de 64 px, invitación pendiente con círculo punteado y «Reenviar», «+ Invitar a alguien»
punteado).

La barra lateral del diseño: Inicio · TUS HIJOS · Mateo · Sofía · PERSONAL · **Mi día**.

## Decisiones del diseño

1. Se va la banda oscura; la tinta queda solo en la barra lateral web.
2. Regresar siempre arriba a la izquierda, con el nombre de a dónde vuelves; en un formulario, «← Cancelar».
3. La línea superior dice de quién o de cuándo («Suplemento de Mateo», «18 oct 2026»).
4. En el teléfono las acciones van bajo el título (44–48 px); en la web, a la derecha.
5. «Editar» siempre con contorno; solo es sólida la acción principal de la pantalla.
6. Guardar no va en el encabezado de un formulario: fijo abajo en el teléfono, al final en la web.
7. Chips de estado neutros: nunca verde ni ámbar.
8. Títulos largos parten por palabra, hasta dos o tres líneas.
9. La búsqueda del Historial se pega arriba al hacer scroll.
10. Carga y error dejan salir; el error ofrece «Reintentar» sin rojo.
