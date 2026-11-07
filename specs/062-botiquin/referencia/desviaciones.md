# Desviaciones del mock «Botiquín PediTrack.dc.html»

Construido de las 5 pantallas del mock (teléfono 390 y web 1280) con sus medidas («Medidas para construirlo»). Lo que no es
idéntico y por qué; el dueño decide.

| # | Pantalla | Mock | App | Motivo |
|---|---|---|---|---|
| 1 | 3 · Formulario (teléfono) | «Tomar foto» y «Elegir de la galería» | «Tomar foto» abre la cámara (`capture`); «Elegir de la galería» no la fuerza | La regla del proyecto es no forzar la cámara: aquí la galería siempre está a un toque, así que la cámara directa solo es un atajo |
| 2 | 2 · Lista | Miniatura rayada «foto» | La misma miniatura rayada «foto», no la foto real | Mostrar la foto real pediría descargar cada imagen (hasta 5 MB) en la lista; se ve en el detalle |
| 3 | 3 · Formulario | Mes / Año / Día dibujados como cajas con ▾ | Selectores nativos con la misma caja (52 px, radio 14, borde 1.5) | Accesibles y con la rueda del teléfono |
| 4 | 3 · Formulario (web) | Cantidad y unidad en una fila | La cantidad arriba y las unidades debajo, dentro de su columna | La columna de 560 px se divide en dos (concentración / cantidad); cuatro chips no caben junto al campo |
| 5 | 3 · Editar | No dibujado | «Editar medicamento» con lo guardado, «Guardar cambios» y «Quitar foto» si tiene una | El mock no tiene la pantalla de editar; se reutiliza la de agregar |
| 6 | 4 · Detalle | «Agregado por Ana · 6 nov» | También «Editado por Luis · 7 nov» si alguien lo cambió | El dato existe y no evalúa nada |
| 7 | Web · Barra lateral | «Botiquín» en el grupo Familia | Una fila «Botiquín» justo debajo de «Familia» | La barra no tiene encabezado de grupo para Familia; queda en el mismo lugar |
| 8 | 1 · Inicio | Debajo de «Tus hijos y Tu día» | Debajo de «Tus hijos», antes de «Compartido contigo» y «Lo demás» | Igual que el mock; los bloques de abajo no están dibujados |

**Medición pendiente**: la comparación lado a lado a 390 y 1280 px necesita una sesión de Clerk, que en este equipo no hay
(las llaves solo están en el CI). Las medidas se copiaron del mock como clases (`min-h-[84px]`, `rounded-[22px]`, columnas
`56px 1.6fr 1fr 1fr 1fr 24px`…); falta ver la app en DEV.
