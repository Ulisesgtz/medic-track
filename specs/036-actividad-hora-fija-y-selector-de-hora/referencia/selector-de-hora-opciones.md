# Selector de hora — opciones que se evaluaron (2026-10-08)

Motivo: el selector nativo de Chrome en Windows es una lista larga de horas y minutos con un fondo azul del sistema; en el iPhone es una rueda
cómoda pero el campo se desbordaba de la tarjeta. Se compararon tres opciones (con maqueta interactiva en la conversación) y el dueño del
producto eligió la **A**.

| | Opción | Pros | Contras |
|---|---|---|---|
| **A** | **Cuadrícula de horas** (la elegida): campo compacto + panel con 24 horas y 12 minutos | Sin dependencias; un toque por hora y por minuto; igual en web y móvil; usa los colores y los 44 px de PediTrack; encaja con el mínimo de 5 minutos | Hay que escribirla y probarla (hecho) |
| B | Rueda tipo iPhone | Se ve bien en móvil | En web es incómoda con teclado; más código para lo mismo |
| C | Botones − / + (de 5 minutos y de 1 hora) | Útil para ajustar un valor ya puesto | Llegar de 08:00 a 20:00 lleva muchos toques |

**Librerías revisadas** (React 19 + Tailwind 4) y por qué no: `react-aria-components` (`TimeField` segmentado; muy accesible pero hay que
estilizar todo y el teclado manda sobre el toque) y MUI X / Mantine (pesadas y con su propio estilo, que choca con el diseño).

**Dónde se usa**: formulario de suplementos y actividades, «Hora de la cita» y «Hora del aviso» de la próxima cita. **No** se usa en la
«Primera toma» de un medicamento de la consulta (mock de la consulta y lectura de la receta): sigue nativo.

**Decisiones**: vacío al empezar («Elegir hora», ninguna hora sugerida — Principio I); minutos de 5 en 5; el panel se cierra al elegir los
minutos después de la hora; Escape, «Listo» y el toque fuera lo cierran; el campo del lado derecho de una fila cuelga de su borde derecho.
