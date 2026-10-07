# Suplementos — decisiones y desviaciones del sistema visual (de Claude Design)

Copia de `repo-pr/specs/005-identidad-visual-front-end/suplementos-decisiones.md` del proyecto de Claude Design
(`https://claude.ai/design/p/f4e28757-d885-471d-b5b9-6e6ca094449a`), 2026-10-06.

**Mock**: `Suplementos PediTrack.dc.html`, que importa `SuplementosSeccion`, `RutinaTarjeta`, `RutinaForm`, `RutinaDetalle`,
`TomasHoyPanel` y `TomaChip` (todos `.dc.html` en ese proyecto; se vuelven a bajar con `DesignSync get_file` al implementar, no se
copian aquí). Los ids (S1m, R4w, D5m…) son los del tablero: S = sección en el detalle del hijo, R = formulario, D = detalle de la
rutina, T = «Tomas de hoy». Fuente: `design-tokens.md`. Cada punto queda **pendiente de aprobación**.

## A. Tokens

Sin tokens nuevos. Se usan por su nombre: `ink`, `ink-soft`, `action`, `bright`, `confirmed`, `confirmed-soft`, `confirmed-strong`,
`pending`, `pending-soft`, `pending-strong`, `on-pending`, `on-pending-muted`, `canvas`, `surface`, `hint`, `hint-border`,
`hint-edge`, `bright-soft`, `body`, `ink-muted`, `ink-edge`, `med-1`, `calendar-muted`, `calendar-text`; de Tailwind `slate-100/300/500/600`,
`emerald-800` (hover del sólido), `red-700` y `red-50` (el mismo de Familia). Fondo de diálogo `bg-ink/70`. En React: campos con
`fieldModal`/`labelClass`/`errorClass`; pantallas en `<AppShell activeChildId>`; el chip de toma es el mismo `DoseChip`.

## B. Desviaciones o tratamientos nuevos

1. **Estado de la rutina sin verde ni ámbar.** «Activa» = chip `hint` + borde `hint-border` + texto `action` (5.2:1). «Pausada» y
   «Terminada» = `slate-100` + `slate-600` (7:1). El verde queda solo para «tomada» y el ámbar solo para «sin marcar».
2. **Etiqueta «Suplemento».** En «Tomas de hoy» la toma de suplemento lleva el chip `hint`/`action` «SUPLEMENTO» bajo el nombre; la de
   medicamento lleva su círculo numerado `med-N` y «Consulta del…». Los suplementos no entran a la rotación de colores `med-1…6`.
3. **Puntos del calendario de una rutina en `action`.** Una rutina tiene un solo «medicamento», así que no usa la paleta `med-N`;
   relleno = marcada, anillo = sin marcar; en el día elegido, `bright` / `hint-border` como en la spec 022.
4. **Un solo sólido por pantalla.** Sección del hijo: «Nueva consulta» (los botones de crear rutina van con contorno o punteado).
   Formulario: «Guardar rutina». Detalle activo: ninguno (Pausar/Editar con contorno, Finalizar como texto). Detalle pausado:
   «Reanudar». Diálogo: «Finalizar rutina» en `ink`, no rojo.
5. **«Plan completo» con botón de contorno**, no sólido, porque la pantalla ya tiene «Nueva consulta». Bloque `hint`, sin ámbar.
6. **Aviso de tope** como bloque `hint` (`role=status`) en el lugar de «+ Nueva rutina», con salida «Ir a las rutinas activas» y el
   texto de qué hacer (pausar o finalizar).
7. **Pausar sin confirmación** (se deshace con «Reanudar»); **Finalizar con diálogo** de tres filas: qué deja de pasar, qué se
   conserva, qué sigue.
8. **Chips de toma a 44 px de alto** también dentro del panel «Tomas de hoy»; el texto de quién marcó va dentro: «✓ Tomada / por Ana, 08:05».
9. **Días de la semana** como barra de 7 segmentos de 48 px de alto y ≥ 44 px de ancho a 390 px («Lu Ma Mi Ju Vi Sá Do», con `aria-label` completo).
10. **Vista previa de horas** en «Cada N horas»: bloque `hint` con el cálculo de lo capturado («06:00, 14:00 y 22:00»). Es aritmética de
    lo que puso el padre, no una sugerencia.
11. **Sin ejemplos de suplemento en placeholders** («Como lo llaman en casa», no «Ej. Vitamina D»), para no sugerir nada. Frase fija
    bajo el formulario: «PediTrack guarda lo que escribas tal cual…».
12. **Formulario en página**, no en modal (es largo y cambia según la periodicidad). En web, columna de 640 px dentro de la app.
13. **Avisos por persona** en el detalle («Tus avisos», interruptor `action`), visible también para Cuidador. No aparece en pausadas
    ni terminadas.
14. **Nombres largos**: `overflow-wrap:anywhere` en tarjeta, encabezado y filas.

## C. Supuestos de producto que el diseño hace visibles

1. El tope de **10 activas es por hijo**, y las **pausadas no cuentan**.
2. Las tomas de suplemento **cuentan en el resumen «Tomas de hoy»**. No cuentan como «Tratamiento activo».
3. Un Cuidador **sí elige sus avisos** y **sí marca** tomas; no crea, edita, pausa ni finaliza.
4. Al **finalizar**, las tomas de hoy sin marcar desaparecen; las marcadas se conservan con nombre y hora.
5. Una rutina **terminada no se reanuda ni se edita**; se crea otra.
6. **Editar** aplica desde la siguiente toma; lo marcado no cambia.
7. Si la cuenta pasa a **plan gratuito** con rutinas creadas: pregunta del diseño, ver la decisión de la spec 033 (FR-020: los avisos ya
   creados siguen; solo se bloquea crear y editar; se ve y se marca como en «Familia» solo lectura).
8. El progreso con barra («Día 5 de 19») solo aparece si la rutina tiene fecha de fin; sin fin se muestra el conteo («24 tomas marcadas de 26»).

## D. Contraste verificado

`action` sobre `hint` 5.2:1 · `slate-600` sobre `slate-100` 7.0:1 · `pending-strong` sobre `pending-soft` 6.4:1 · blanco sobre `confirmed`
5.5:1 · `on-pending` sobre `pending` 9.6:1 · `on-pending-muted` sobre `pending` 5.0:1 · `confirmed-strong` sobre `confirmed-soft` 7.4:1 ·
`calendar-muted` sobre blanco 4.76:1 · `red-700` sobre blanco 6.5:1 · `ink-muted` sobre `ink` 4.6:1.

## E. Notas de la spec 033 sobre este mock (al 2026-10-06)

- **«Tus avisos» por persona (B13)** es una función nueva respecto a la spec: cada persona puede apagar los avisos de una rutina
  concreta sin afectar a las demás. Hay que reflejarla en la spec/plan (nueva preferencia por persona y rutina).
- El mock da una **sola hora o varias** por rutina («08:00 y 20:00») y la periodicidad «cada N horas» con vista previa; la spec ya cubre ambas.
- La barra lateral del mock es de 348 px (como en Familia); la app usa 280 px: desviación ya conocida (ver `familia-mock-desviaciones.md`).
