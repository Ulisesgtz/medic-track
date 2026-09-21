# Especificación: Homologar las pantallas a los mocks

**Rama**: `feature/007-homologar-pantallas-a-mocks` | **Prioridad**: alta (la más importante del backlog)
**Depende de**: 005 (sistema visual) y 006 (detalle del hijo)

## Contexto

Las pantallas de la app deben ser **iguales a los mocks entregados**, no una interpretación. La regla ya está
en `CLAUDE.md`: se mide el mock (escala, ancho del marco, tamaños, posiciones), se renderiza la app al mismo
ancho, se compara lado a lado sección por sección y se lista cada desviación con su motivo.

## Mocks disponibles y estado

Los mocks llegaron completos: el tablero `PediTrack Front-end.dc.html` (pantallas 1–8) y los archivos
`repo-pr/mockups/01…15` (Tailwind). **Los diseños móvil y web son independientes y nunca se mezclan**
(regla del usuario, 2026-09-20): la app decide con `useIsDesktop` (ventana ≥ 900 px = web) y renderiza uno u
otro; no hay clases responsivas `lg:` que combinen ambos.

| Mock | Pantalla | Diseño | Ruta en la app |
|---|---|---|---|
| 01 | Registro | móvil | `/signup` < 900 px |
| 11 | Registro | web (pantalla partida) | `/signup` ≥ 900 px |
| tablero 2 | Home · listado de hijos (saludo, avatar, chips) | móvil | `/home` < 900 px |
| 15 (fondo) | Home "Hola, Ana / Tus hijos" con barra lateral | web | `/home` ≥ 900 px |
| 02 | Detalle del hijo | móvil | `/children/:id` < 900 px |
| tablero 6 | Escritorio · Home con detalle | web | `/children/:id` ≥ 900 px |
| 03 | Detalle de consulta | móvil | `/consultations/:id` < 900 px |
| 13 | Detalle de consulta | web | `/consultations/:id` ≥ 900 px |
| 04 | Nueva consulta (OCR) | móvil | `/children/:id/consultations/new` < 900 px |
| 14 | Nueva consulta | web | `/children/:id/consultations/new` ≥ 900 px |
| tablero 7 | Modal agregar hijo | ambos | modal desde el home / barra lateral |
| 05 / 15 | Modal límite del plan gratuito | móvil / web | modal al tocar "Agregar hijo" con el plan gratuito lleno |

## Desviaciones respecto a los mocks (decididas o inevitables)

Decididas por el usuario:

- **Contraseña solo validada**: el campo del mock 11 está en el registro (móvil 01 y web 11; mínimo 8 caracteres) pero **no se envía ni se guarda**: la autenticación será con Clerk o AWS Cognito (BACKLOG).
- **Botón "Registrarme con Google"** (no está en el mock; lo pidió el usuario) en ambos registros, tras un separador "o". Sin proveedor de autenticación no puede funcionar aún: al tocarlo avisa "El registro con Google estará disponible pronto."
- Se **conservan los campos actuales**: tutor y hijo con nombre y apellido separados, país/estado (opcionales),
  talla/peso (opcionales) — el mock 01/11 tiene "Correo, Contraseña, Nombre y apellido, Fecha". En ambos registros quedan dentro del orden del mock: Correo, Contraseña, luego Tu nombre/Tu apellido y País/Estado, y el bloque "Hijo 1 · Gratis" (en móvil, columna de máx. 430 px como el mock; Talla y Peso en dos columnas). Igual en el modal
  "Agregar hijo" (el mock tiene "Nombre completo").
- **"Desde (opcional)"** (hora de inicio) en cada medicamento de "Nueva consulta".

Por límites de datos o del producto:

- El mock 04/14 muestra el panel de OCR ya leyendo ("Leyendo receta · Listo"); la app arranca con el botón
  **"Seleccionar archivo"** (hace falta un modo de elegir la foto) y pasa al progreso al elegirla. En móvil, ya
  elegida la foto, el panel es exactamente el del mock (sin fila del selector ni nombre del archivo) y **"Cambiar
  foto"** va en la fila superior, a la derecha de "← Cancelar"; en web se conserva la fila del selector.
- El mock 04 no tiene "Síntomas" en móvil; se conserva el campo (el modelo lo guarda): en móvil va como campo propio
  bajo el grupo "Sugerido por OCR" (que queda idéntico al mock, solo Doctor y Fecha); en web (mock 14) va dentro del grupo.
- El detalle de consulta muestra **una fila de chips por día**, con "← Día anterior / Día siguiente →" cuando
  el tratamiento dura varios días (el mock enseña una sola fila fija); así toda toma queda alcanzable.
- El mock 02 muestra una consulta "sin receta"; el backend exige al menos un medicamento por consulta, así que
  hoy ese caso solo aparecería con datos antiguos (la tarjeta lo soporta).
- Los mocks (tablero 2, 6, 13–15) muestran un segundo hijo ("Sofía") en el plan gratuito, que permite un solo
  hijo; la app muestra los hijos reales.
- Barra lateral de **280 px** (mocks 13/14/15 finales). El tablero declara 300 px pero, al no tener
  `box-sizing: border-box`, se dibuja de 348 px: es un artefacto del tablero.
- **Detalle del hijo móvil (02)**: medido elemento por elemento contra el mock a 430 px (posiciones, tamaños,
  tipografía, colores, y el estado verde tras "Marcar tomas"): idéntico. Solo difiere el área táctil de
  "← Tus hijos" y "+ Nueva" (44 px con margen negativo, misma posición visual) y, por el dato del punto anterior,
  "sin receta". Columna centrada de máx. 430 px, como el mock.
- **Detalle de consulta móvil (03)**: medido elemento por elemento a 430 px; encabezado, tarjeta de la foto
  (110 px), síntomas y medicamentos quedan en la misma posición y con las mismas medidas que el mock. Diferencias:
  la miniatura muestra la foto real (el mock dibuja un documento), el área táctil de 44 px de "← Mateo Morales" y
  "Ver completa" (margen negativo, misma posición visual), el selector "← Día anterior / Día siguiente →" bajo
  los chips (+32 px por medicamento; el mock enseña una sola fila fija y sus tres chips no siguen una regla de
  horario, p. ej. Paracetamol cada 6 h con 3 tomas), y el texto de la toma futura en `slate-600` por contraste.
  Columna centrada de máx. 430 px.
- **Nueva consulta móvil (04)**: medido elemento por elemento a 430 px; cabecera (286 px), panel del OCR, grupo
  "Sugerido por OCR" y tarjeta de medicamento (nombre y dosis, c/8 h, 7 días) en la misma posición, con las mismas
  medidas y `font-semibold` en Doctor y Fecha. Diferencias: "Cambiar foto", "Síntomas" y "Desde (opcional)"
  (extras decididos), etiquetas solo para lector de pantalla en los campos del medicamento, el estado inicial
  del panel (sin foto) y que al guardar se abre el detalle de la consulta (el mock muestra "Consulta guardada ✓").
  Columna centrada de máx. 430 px.
- Punto de corte web/móvil en **900 px** (el mock usa `lg` = 1024 px).
- Los registros son más altos que sus mocks por los campos conservados y el botón de Google: web 1219 vs 900 px
  (a 1440 px de ancho; el formulario no queda centrado en vertical en ventanas bajas) y móvil ~1600 vs 921 px.

Por accesibilidad (mínimo 4.5:1, prevalece sobre el mock; se marca, no se rompe en silencio):

- Verde de confirmado `#047857` (el `#059669` del mock no llega a 4.5:1 con texto blanco).
- Edad inactiva en la barra lateral `#62909d` (el `#5b8b94` del mock da 4.3:1 sobre el fondo oscuro).
- Chip de toma futura con `text-slate-600`.

## Requisitos

- **FR-001**: Cada pantalla con mock DEBE quedar visualmente igual: mismas secciones, orden, textos, colores y
  tamaños, medidos sobre el mock y comparados lado a lado al ancho del marco del mock.
- **FR-002**: Si el mock muestra datos que la API no tiene, se construye el dato (endpoint + spec); no se
  sustituye el contenido.
- **FR-003**: Toda desviación (p. ej. un color que incumple 4.5:1) se lista con su motivo y la decide el usuario.
- **FR-004**: Después de igualar cada pantalla se prueban **todos** sus botones y campos de texto en un
  navegador real, a escritorio y a móvil (abrir/cerrar, validaciones, envío, foco, Escape, sin errores de consola).
- **FR-005**: En web (≥ 900 px) `/home` es "Hola, Ana / Tus hijos" con la cuadrícula de hijos y la barra lateral
  (mock 15); el detalle del hijo activo vive en `/children/:id` (tablero 6). Con cero hijos se muestra el estado
  vacío. *(Corrige la primera versión, que redirigía `/home` al detalle y contradecía el mock 15.)*
- **FR-006**: Los diseños móvil y web se renderizan por separado (`useIsDesktop`); ningún componente mezcla el
  uno con el otro con clases responsivas.
- **FR-007**: "Agregar hijo" con el plan gratuito lleno muestra de inmediato el pop-up del plan (mocks 05/15),
  sin pedir llenar el formulario primero.
- **FR-008**: "Nueva consulta" es una **página** (no un modal): "← Cancelar" vuelve al hijo y, si ya hay algo
  capturado (campos o foto), pide confirmar antes de descartar.

## Criterios de éxito

- **SC-001**: Por cada mock, una comparación lado a lado (captura del mock y de la app al mismo ancho) sin diferencias de estructura.
- **SC-002**: El recorrido automático de botones y campos no reporta desbordes, elementos tapados ni errores de consola.
