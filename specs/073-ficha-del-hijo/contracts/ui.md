# Contrato de UI — Ficha del hijo

Fuente: mock de Claude Design «Ficha del hijo PediTrack» (canvas del proyecto, propuesta del 2026-11-17), copiado en
`referencia/Ficha del hijo PediTrack.dc.html`: siete estados (A, B, C, D, D2, E, F), teléfono 390 px y web 1280 px (con
la barra lateral), la portada del PDF en Carta. **Se construye tal cual** (textos, orden, tamaños y colores del mock;
medir a 390 y 1280 y listar desviaciones en `referencia/desviaciones.md`).

## Estados

| Estado | Qué es |
|---|---|
| **A** | Detalle del hijo con la tarjeta «Ficha» llena: al final del cuerpo, junto a la Cartilla, y **última pastilla del índice** (Consultas · Suplementos · Actividades · Cartilla · Ficha). En web, columna principal; Hoy y Tratamiento siguen a la derecha. «Editar ficha» de contorno (44 px). «Nueva consulta» sigue siendo el único sólido. |
| **B** | La tarjeta vacía con la invitación neutral y «Empezar la ficha» (contorno). |
| **C** | Cuidador: la ficha completa, «Llamar», sin «Editar ficha» y una línea de que solo la familia edita. Sin ningún sólido. |
| **D** | Formulario «Editar ficha» (página propia, `PageHeader` con «← Mateo»): cada alergia y padecimiento es un `fieldset` con `label`s; tipo de alergia y tipo de sangre = botones de opción en pastillas de 44 px (la elegida en tinta); «Subir»/«Bajar» de 44 px con nombre accesible («Subir alergia 2»); «Quitar» como texto de acción (no rojo); «Agregar alergia» punteado; barra fija abajo en el teléfono con «Cancelar» (contorno) y «Guardar» (sólido); error de campo **sin rojo** (borde de tinta 2 px, fondo gris claro, mensaje en negrita y contador «96 de 80», `aria-invalid` + `aria-describedby`). |
| **D2** | Tope de 30: el contador dice «30 de 30», desaparece «Agregar alergia» y una línea explica el motivo y qué hacer; se ven dos alergias y «y 28 más» con «Ver las 30». |
| **E** | Conflicto: aviso `hint` (fondo `#ecfeff`, borde `#a5f3fc`) que dice quién guardó y a qué hora, que lo escrito sigue ahí y que guardar reemplaza lo de esa persona; «Ver la versión nueva» (aparte, sin cerrar el formulario) y «Seguir editando»; «Guardar» sigue siendo el único sólido. |
| **F** | Portada del PDF: bloque «Ficha» con borde de tinta, **antes** del tratamiento y la próxima cita; «Ficha» en «Secciones» y en «Contenido»; la frase fija dentro del bloque; portada compactada (título 38 px, resumen 16 px, menos espacio) para que siga cabiendo en una hoja. En «Exportar a PDF», la casilla **«Incluir la ficha»**, activada de inicio (el mock no la dibujó: se hace con el estilo de las otras casillas del panel). |

## Reglas del mock (a respetar)

- **Los grupos vacíos no se muestran** y la app nunca escribe «Sin alergias» ni «Sin padecimientos».
- Medicamento, Alimento y Otra son la **misma** etiqueta neutra (sin colores por tipo ni orden por gravedad).
- Frase fija en la tarjeta y en el PDF: «Lo anotado es lo que la familia escribió y no sustituye la opinión de su
  médico».
- «Llamar»: enlace `tel:` con aspecto de botón de contorno.
- En web se puede sumar arrastrar para reordenar, nunca como único camino (esta entrega: solo «Subir»/«Bajar»).

## Desviaciones conocidas (a confirmar)

1. **Largo de los nombres**: el mock muestra «Máximo 80 caracteres» como ejemplo; el plan fija 120 para nombres (data
   model). Se usa el número real del límite en el mensaje.
2. **Error de campo**: el mock lo dibujó sin rojo (tinta) y lo dejó a decidir. **Decidido por el dueño el 2026-11-17:
   el rojo del sistema** para los errores de formulario (el token `error` de `@theme`, como en el resto de los
   formularios), con el resto del estado D igual (mensaje en negrita, contador, `aria-invalid`/`aria-describedby`). El
   rojo solo aparece en esos errores del formulario; la ficha vista nunca lleva rojo.
3. **Casilla «Incluir la ficha»** en el panel de exportación: no dibujada; se hace con el estilo existente.
