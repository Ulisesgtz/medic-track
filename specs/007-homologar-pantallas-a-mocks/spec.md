# Especificación: Homologar las pantallas a los mocks

**Rama**: `feature/007-homologar-pantallas-a-mocks` | **Prioridad**: alta (la más importante del backlog)
**Depende de**: 005 (sistema visual) y 006 (detalle del hijo)

## Contexto

Las pantallas de la app deben ser **iguales a los mocks entregados**, no una interpretación. La regla ya está
en `CLAUDE.md`: se mide el mock (escala, ancho del marco, tamaños, posiciones), se renderiza la app al mismo
ancho, se compara lado a lado sección por sección y se lista cada desviación con su motivo.

## Mocks disponibles y estado

| # | Pantalla | Mock disponible | Estado |
|---|---|---|---|
| 6 | Escritorio · Home con detalle (barra lateral + detalle del hijo) | Imagen del tablero (1314 × 710) | Detalle del hijo igual (spec 006). En escritorio `/home` ahora abre directo el detalle del hijo activo, como el mock ("Home con detalle") |
| — | Home móvil (listado de hijos) y modal "Agregar hijo" | Código del diseño (`repo-pr/`: `HomePage`, `ChildCard`, `AddChildModal`) | Idéntico al código entregado (verificado por diff); solo se agregó el `AppShell` de escritorio y el portal del modal |
| — | Encabezado, logo, tokens de color y tipografía | Código y `design-tokens.md` del diseño | Integrado |
| 1–5 | Registro, detalle del hijo móvil, detalle de consulta, formulario de consulta, modal freemium | **Faltan**: el tablero `PediTrack Front-end.dc.html` no está en el equipo; solo se recibió la imagen 6 | Pendiente de recibir los mocks. Hoy son diseño propio a partir de los tokens |

## Requisitos

- **FR-001**: Cada pantalla con mock DEBE quedar visualmente igual: mismas secciones, orden, textos, colores y
  tamaños, medidos sobre el mock y comparados lado a lado al ancho del marco del mock.
- **FR-002**: Si el mock muestra datos que la API no tiene, se construye el dato (endpoint + spec); no se
  sustituye el contenido.
- **FR-003**: Toda desviación (p. ej. un color que incumple 4.5:1) se lista con su motivo y la decide el usuario.
- **FR-004**: Después de igualar cada pantalla se prueban **todos** sus botones y campos de texto en un
  navegador real, a escritorio y a móvil (abrir/cerrar, validaciones, envío, foco, Escape, sin errores de consola).
- **FR-005**: En escritorio (barra lateral visible) `/home` muestra el detalle del hijo activo; con cero hijos
  muestra el estado vacío con la barra lateral.

## Criterios de éxito

- **SC-001**: Por cada mock, una comparación lado a lado (captura del mock y de la app al mismo ancho) sin diferencias de estructura.
- **SC-002**: El recorrido automático de botones y campos no reporta desbordes, elementos tapados ni errores de consola.
