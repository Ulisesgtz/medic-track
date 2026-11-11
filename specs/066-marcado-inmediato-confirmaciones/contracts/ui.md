# Contrato de pantalla: Marcado inmediato de tomas y confirmaciones propias

No hay contrato de API: ningún endpoint cambia (research R2). Este es el contrato de lo que la persona ve y de lo que las pruebas revisan.

## 1. Marcar, quitar la marca y «Realizado»

Aplica a: detalle de la consulta, «Hoy» del detalle del hijo, tarjeta del hijo y «Tu día» del inicio, `/yo`, `/personas/:accountId`, detalle de suplemento y de actividad, y `/hijo/hoy`.

| Momento | La toma | El botón | Conteos y barras |
|---|---|---|---|
| Al tocar «Marcar» | marcada, «✓ 16:02» (hora del toque, sin autor) | `aria-pressed="true"`, habilitado | avanzan |
| Al tocar una marca propia | sin marcar, sin etiqueta de estado | `aria-pressed="false"`, habilitado | retroceden |
| Al tocar «✓ Realizado» | — | habilitado mientras quede algo por marcar | «3 de 6», barra y «Última» avanzan |
| Pasan 2 s sin respuesta | se agrega «guardando…» | su descripción accesible incluye «guardando» | igual |
| Respuesta del servidor | lo que el servidor guardó: «✓ 16:02 · por Ana» y su estado | igual que hoy | los del servidor |
| Falla | vuelve al estado anterior | igual que antes del toque | vuelven |

- El nombre accesible de cada botón no cambia («Toma de 08:00», «Marcar Amoxicilina de las 08:00 de Mateo»…).
- Un botón que hoy está bloqueado por permiso (candado) sigue bloqueado y no cambia nada.
- Ningún botón de marcar se deshabilita por estar esperando al servidor.

## 2. El aviso de la marca (`MarkNotice`)

- Una sola región por pantalla, `role="status"`, fija abajo (encima del aviso «Hay una versión nueva»), con un botón «Cerrar» de 44 px.
- Barra a lo ancho en el diseño del teléfono; tarjeta en la esquina inferior derecha en el diseño web.
- Los textos, palabra por palabra, son los de la tabla de research R7.
- Hasta tres renglones; con más, un último renglón «y N más».
- No mueve el foco. Se quita al guardarse esa toma, con «Cerrar» o al cambiar de pantalla.
- El aviso «{Ana} ya había marcado…» usa el tono informativo; los demás, el neutro. Ninguno usa rojo ni la palabra «error».

## 3. El diálogo de descartar

Es `ConfirmDialog` (research R9) con `tone: 'ink'`. Las palabras son las de hoy, repartidas así:

| Formulario | Título | Cuerpo |
|---|---|---|
| Nueva consulta | ¿Descartar la consulta? | Se perderá lo que capturaste. |
| Editar consulta | ¿Descartar los cambios? | Se perderá lo que cambiaste. |
| Cita (nueva y editar) | ¿Descartar la cita? | Se perderá lo que capturaste. |
| Suplemento / actividad | ¿Descartar el suplemento? / ¿Descartar la actividad? | Se perderá lo que capturaste. |
| Botiquín | ¿Salir de todos modos? | Lo que escribiste no se ha guardado. |
| Medida de crecimiento | ¿Salir sin guardarla? | Tienes una medida sin guardar. |
| Editar datos del hijo | ¿Salir sin guardarlos? | Tienes cambios sin guardar. |
| Vacuna | ¿Salir sin guardar? *(título nuevo: la frase de hoy no trae pregunta)* | Si sales, se pierde lo que escribiste. |
| «Actualizar» versión | ¿Actualizar ahora? | Se perderá lo que capturaste. |

Botones: **«Seguir editando»** (foco inicial; también Escape, «×» y tocar fuera) y **«Descartar»** (en la actualización, **«Actualizar»**).

Comportamiento:
- `role="dialog"`, `aria-modal="true"`, título y cuerpo enlazados; Tab no sale; al cerrar, el foco vuelve al control que se tocó.
- Hoja desde abajo con los botones apilados en el teléfono; cuadro centrado de 560 px con los botones a la derecha en la web.
- «Seguir editando» deja el formulario exactamente como estaba, con la foto elegida.
- «Descartar» va a donde la persona iba.
- Sin cambios en el formulario no se abre nada.
- Nunca hay dos confirmaciones abiertas. Sobre el diálogo de vacuna, la confirmación queda encima y la vacuna no responde hasta que se cierre.

## 4. Lo que no cambia

- «Marcar tomas» (todas las de hoy) y «Tomada» del aviso push.
- El botón «atrás» del sistema, cerrar y recargar la pestaña.
- Las rutas, los permisos y todas las respuestas del servidor.
