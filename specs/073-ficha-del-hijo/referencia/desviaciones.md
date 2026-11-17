# Desviaciones del mock — Ficha del hijo (spec 073)

Mock: `Ficha del hijo PediTrack.dc.html` (Claude Design, 2026-11-17). Comparado el 2026-11-17 con capturas del build de
E2E a 390×844 y 1280×844 (A, B, C, D, D2, E) y la portada del PDF renderizada (F).

Coincide: la tarjeta al final del detalle junto a la Cartilla y «Ficha» como última pastilla del índice; grupos vacíos
ocultos; etiquetas de tipo neutras; «Editar ficha»/«Llamar» de contorno; «Actualizada el … por» y la frase fija; el
formulario con `fieldset`, pastillas de 44 px (la elegida en tinta), «Subir»/«Bajar», «Quitar» como texto, «Agregar»
punteado y la barra fija «Cancelar»/«Guardar»; D2 con «30 de 30» y «y 28 más / Ver las 30»; el aviso de conflicto `hint`
con «Ver la versión nueva»; en el PDF el bloque «Ficha» con borde de tinta antes del tratamiento, «Ficha» en
«Secciones» y la frase fija dentro.

| # | Desviación | Motivo | Estado |
|---|---|---|---|
| 1 | Límites reales en los contadores: nombres 120, nota general 1000 (el mock mostraba 80 y 500 de ejemplo) | Son los del modelo de datos y la base | Aceptada |
| 2 | Errores de campo con el **rojo del sistema** (borde rojo de 2 px sobre fondo blanco) en vez del borde de tinta con fondo gris | Decisión del dueño (2026-11-17) | Decidida |
| 3 | El contador de los nombres solo aparece al pasarse; el de la nota general es permanente | Menos ruido en un formulario con muchas entradas | Aceptada |
| 4 | «Guardar» usa el botón sólido de 52 px de `pageHeaderButton` (barra fija y encabezado web) | Igual que los demás formularios de la app | Aceptada |
| 5 | «Quitar» lleva nombre accesible «Quitar alergia 2» (el texto visible sigue «Quitar») | Distinguir las entradas para el lector de pantalla | Aceptada |
| 6 | Cuidador sin ficha: «Aún no hay ficha» y la línea de solo lectura, sin invitación | El mock no dibujó ese caso | Aceptada |
| 7 | El índice real ya trae «Crecimiento» (spec 065): «Ficha» queda después de Crecimiento, no de Cartilla | El mock usó el índice anterior | Aceptada |
| 8 | Web: el teléfono y el consultorio del pediatra parten en dos renglones junto a «Llamar» en la columna derecha | Ancho de la columna; se lee bien | Aceptada (ajustable si se quiere) |
| 9 | Portada del PDF compactada un poco más que el mock cuando hay ficha (filas y cajas más apretadas) | Que el caso denso (filtros + cartilla) siga en una hoja | Aceptada |
| 10 | En la vista compacta del tope (D2) no hay «Subir/Bajar» hasta expandir con «Ver las 30» | El mock solo dibuja las dos primeras | Aceptada |
