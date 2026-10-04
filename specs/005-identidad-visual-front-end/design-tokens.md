# Sistema visual — PediTrack

Referencia única de color, tipografía y componentes base. Toda pantalla nueva sale de aquí.
Mock de referencia: `PediTrack Front-end.dc.html` (sesión 2026-09-18). Logo: opción 2a del tablero `Logo PediTrack.dc.html`.

## Por qué cambió

La paleta anterior era un solo cyan claro sobre blanco: bordes `cyan-100`, badges `cyan-600`, enlaces `cyan-700`, tarjetas blancas con borde `slate-100`. Todo compartía el mismo valor tonal, así que ningún elemento tomaba jerarquía y la interfaz se percibía apagada. El sistema nuevo separa cuatro roles por color y usa la escala tipográfica —no los bordes— para jerarquizar.

## Color

| Token | Valor | Rol |
|---|---|---|
| `--color-ink` | `#04252b` | Base oscura: headers, splash, sidebar, botón de última instancia |
| `--color-ink-soft` | `#0b3b44` | Paneles dentro de superficies oscuras (p. ej. el bloque de OCR) |
| `--color-action` | `#0e7490` | Enlaces, botones secundarios, badges sobre claro |
| `--color-bright` | `#22d3ee` | Acento sobre oscuro, barras de progreso, avatares, borde de campo sugerido |
| `--color-confirmed` | `#047857` | Acción primaria y estado "tomada" con texto blanco |
| `--color-confirmed-soft` | `#d1fae5` | Fondo suave de confirmado con texto `#065f46` |
| `--color-pending` | `#f59e0b` | Estado "sin marcar"; texto encima siempre `#451a03` |
| `--color-pending-soft` | `#fef3c7` | Chip pendiente con texto `#92400e` |
| `--color-canvas` | `#f8feff` | Fondo de pantalla |
| `--color-surface` | `#ffffff` | Tarjetas y modales |
| `--color-hint` | `#ecfeff` / borde `#a5f3fc` | Bloques de sugerencia de OCR y agrupaciones de formulario |

### Colores de medicamento (specs 019 y 022)

El calendario del tratamiento da un color a cada medicamento de la consulta (por su orden: el 1.º `med-1`, …, el 7.º vuelve
a `med-1`). Los usa en los **puntos** de cada día (anillo de 2 px del color, relleno si todas las dosis del día se dieron), en
los círculos con número de la leyenda y de la lista de tomas. Los tres primeros son los del diseño de Claude Design
(`referencia/` de la spec 022); del 4.º al 6.º, la propuesta aprobada por el usuario (2026-09-30).

| Token | Valor | Contraste del número blanco / del punto sobre `#ecfeff` |
|---|---|---|
| `--color-med-1` | `#0e7490` | 5.36 / 5.15 |
| `--color-med-2` | `#7c3aed` | 5.70 / 5.48 |
| `--color-med-3` | `#db2777` | 4.60 / 4.42 |
| `--color-med-4` | `#2563eb` | 5.17 / 4.97 |
| `--color-med-5` | `#475569` | 7.58 / 7.29 |
| `--color-med-6` | `#78350f` | 9.07 / 8.72 |

El rosa `#db2777` es el del diseño: ya no se descartan los rosas (no es un color de alerta médica y se usa como identidad
de un medicamento, nunca para un estado). `--color-med-1` (`#0e7490`) es el mismo valor que `--color-action`: **se deja así** (decisión del 2026-10-02): `action` va en botones y enlaces y `med-1` en puntos y círculos numerados, y el lugar fijo, el número y el nombre lo distinguen. Siguen sin usarse el verde (`confirmed` = «tomada»), el ámbar (`pending` = «por
marcar») y el rojo. Los tres del diseño quedan a ΔE ≈ 8 entre sí en deuteranopía y protanopía: por eso **el color nunca va solo**:
cada punto tiene su **lugar fijo** por medicamento (su posición dice cuál es), la leyenda y la lista llevan el número y el
nombre, y el nombre accesible de cada día lista los medicamentos y si su dosis se dio. En el día elegido (fondo `ink`) los
puntos son cian: relleno `#22d3ee`, vacío `#a5f3fc`.

Reglas:

- Un solo botón sólido por pantalla (`--color-confirmed`); las acciones secundarias van con contorno `--color-action` de 2 px.
- Texto blanco solo sobre `--color-ink`, `--color-action` y `--color-confirmed`. Nunca sobre `--color-bright` ni `--color-pending` (ahí va tinta oscura).
- Ámbar significa "el padre no lo ha marcado". No existe rojo de alerta médica en la app (Principio I). El único rojo permitido es `red-700` para errores de validación de formulario y la acción destructiva "Quitar" — nunca para datos de salud.
- Tintas de texto sobre superficies de estado: `--color-on-pending` (#451a03) sobre ámbar, `--color-pending-strong` (#92400e) sobre `--color-pending-soft`, `--color-confirmed-strong` (#065f46) sobre `--color-confirmed-soft`.
- Máximo dos superficies de fondo por pantalla: `--color-canvas` y `--color-ink`.

## Tipografía

Figtree (ya cargada en `index.css`), con pesos 400/500/700/800/900.

| Uso | Tamaño | Peso | Tracking |
|---|---|---|---|
| Titular de pantalla | 30–38 px | 900 | `-0.03em` |
| Título de sección | 20 px | 900 | `-0.02em` |
| Nombre en tarjeta | 19–20 px | 800 | `-0.02em` |
| Cuerpo | 16 px | 500 | normal |
| Etiqueta de campo | 13 px | 700 | normal |
| Badge / overline | 12 px | 800 | `0.1em`, mayúsculas |

Formatos: fechas como "15 sep 2026" (`shared/date.ts`, `formatDateShort`; no mostrar `2026-09-15` al usuario), edad larga "5 años 6 meses" y corta "5a 6m" (`shared/age.ts`, `formatAgeLong`/`formatAgeShort`).

Mínimo absoluto de texto: 13 px. Los números de resumen (edad, conteos) van en 34 px peso 900 — la app se lee de un vistazo por tamaño, no por color de borde.

## Componentes base

- **Header de pantalla**: fondo `--color-ink`, esquina inferior recta, contiene volver / logo / título. (El avatar de inicial del hijo en el header no se implementó; solo aparece en las tarjetas y en la barra lateral.) Se usa siempre `AppHeader`, no se rearma a mano. En la vista de un hijo: eyebrow = "Nombre Apellido · fecha de nacimiento", titular = su edad ("5 años 6 meses"), y con la barra lateral visible (escritorio) el encabezado es **claro** como en el mock — titular en tinta sobre el fondo, eyebrow en `--color-action`, sin fila del logo — y el botón "Nueva consulta" va siempre en la esquina superior derecha, de 151 × 48 px (texto 15 px/800, radio 16 px): a la derecha del titular con la barra lateral, y frente al logo sin ella (móvil y anchos menores a 900 px). Nunca a todo lo ancho. La barra lateral mide `clamp(240px, 28vw, 348px)` (348 px en el marco de 1240 px del mock), sin etiqueta "Tus hijos" visible.
- **Tarjeta**: `--color-surface`, radio 20–22 px, sombra `0 8px 20px rgba(4,37,43,0.07)`, padding 20–22 px. Sin borde gris.
- **Tarjeta de consulta**: la misma, con barra de acento izquierda de 5 px — `--color-bright` para la más reciente, `#cffafe` para las anteriores.
- **Campo de formulario**: radio 14 px, borde 1.5 px `#cbd5e1`; enfocado o con valor confirmado, borde 2 px `--color-ink`; sugerido por OCR, borde 2 px `--color-bright`.
- **Chip de toma**: radio 12 px, alto mínimo 44 px. Tomada: `--color-confirmed` + blanco. Pendiente: `--color-pending-soft` + borde ámbar. Futura: `#f1f5f9` + `#475569` (con `#64748b` el contraste es 4.34:1 y no llega a 4.5:1).
- **Modal**: radio 24 px, padding 28 px, encabezado con título 24 px/900 y botón de cierre (X) con área táctil de 44 px, acciones alineadas a la derecha (contorno + sólido). El de límite freemium lleva franja superior ámbar con overline "Plan gratuito".
- **Vacío / agregar**: contorno punteado 2 px `#67e8f9`, radio 22 px, texto 15 px/800 en `--color-action`.

## Detalle del hijo (mock de escritorio)

Tres tarjetas de resumen, columna de consultas y panel a la derecha: *Tomas de hoy* en ámbar (`--color-pending` con texto `--color-on-pending`; verde suave `--color-confirmed-soft` cuando todas están marcadas), *Consultas* en blanco ("desde AAAA") y *Tratamiento activo* en `--color-ink` (overline y nota en `--color-bright`, nombre en blanco 22 px/900). El panel *Tomas de hoy* es una tarjeta con filas de 44 px: hora + medicamento y un chip de 30 px ("Marcar": `--color-pending-soft` con borde ámbar y texto `--color-pending-strong`; "Tomada": `--color-confirmed` con texto blanco). Se implementa en `features/consultations/` (`SummaryCard`, `TodayDosesPanel`). Detalle funcional: `specs/006-resumen-detalle-hijo/`.

## Logo e iconos

Marca: cápsula con rotación de -45°, partida a la mitad — mitad clara (registro) y mitad emerald (dosis confirmada), con la junta en el color del fondo.

- Icono de app: cápsula blanca/emerald sobre cuadro `--color-bright` (`#22d3ee`), radio 15/64 del lado.
- Sobre header oscuro: misma composición; el wordmark va "Pedi" blanco + "Track" `#67e8f9`.
- Sobre fondo claro: cuadro `--color-action`, wordmark "Pedi" `#04252b` + "Track" `#0e7490`.
- Exportaciones: `favicon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (20% de safe area).
- `theme_color` y `background_color` del manifest: `#04252b`.
- Dónde aparece: el header de la app, la pantalla de registro, la barra lateral y el icono/splash; no se repite dentro del contenido de las pantallas.

## Colores de apoyo (tokens)

Eran literales (`text-[#…]`) repartidos por las pantallas; desde el refactor 028 son tokens de `@theme` con **los mismos valores** y `noColorLiterals.test.ts` impide volver a escribir uno en una clase. Una pantalla nueva los usa por su nombre; si necesita un tono nuevo, se agrega a `index.css` y a esta tabla.

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--color-bright-soft` | `#67e8f9` | cian claro: textos y bordes sobre tinta, borde del bloque del hijo | — |
| `--color-hint-edge` | `#cffafe` | borde fino de las superficies `hint` y texto claro sobre tinta | — |
| `--color-body` | `#1f3d44` | texto corrido sobre superficie | — |
| `--color-ink-muted` | `#62909d` | edad inactiva en la barra lateral (el mock da `#5b8b94`: 4.3:1, bajo el mínimo) | 4.60:1 sobre `--color-ink` |
| `--color-ink-edge` | `#0b5763` | borde punteado sobre tinta («+ Agregar hijo» de la barra lateral) | — |
| `--color-on-pending-muted` | `#613102` | texto secundario sobre ámbar (`SummaryCard`) | 5.02:1 sobre `#f59e0b` |
| `--color-mint` | `#a7f3d0` | verde menta: avatar de hijo y borde del aviso de éxito | — |
| `--color-calendar-muted` | `#64748b` | días de la semana y días fuera del tratamiento | 4.76:1 sobre blanco |
| `--color-calendar-text` | `#334155` | texto de la tarjeta «Cómo leer el calendario» | — |
| `--color-calendar-name` | `#1e293b` | nombres de medicamento en la leyenda del calendario | — |

Los tres tonos pizarra del calendario llevan el valor **exacto** del diseño (spec 022): los `slate-500/700/800` de Tailwind v4 son oklch y salen 2–3 niveles distintos. `#451a03` (texto sobre ámbar, y fondo del botón de `TodayDosesBlock`) ya era `--color-on-pending`; `#065f46`, `--color-confirmed-strong`; `#92400e`, `--color-pending-strong`; `#a5f3fc`, `--color-hint-border`. El logo de Google (`GoogleSignupButton`) conserva los colores de su marca.

## Recetas de implementación (Tailwind v4)

Las clases exactas que ya usan las pantallas. Viven en `frontend/src/shared/ui/formStyles.ts` (`fieldAuth`, `fieldCompact`, `fieldModal`, `fieldMedication`, `fieldMultiline`, `fieldProposed`, `fieldBorder`, `labelClass`, `errorClass`): una pantalla nueva las importa de ahí, no las reinventa ni las copia. Los radios y el relleno **difieren a propósito** entre los mocks (registro móvil 16 px, web 12 px, modal 14 px), por eso hay variantes con nombre y no un solo campo; `formStyles.test.ts` fija las clases de cada una. Los placeholders van en `slate-500` como mínimo: `slate-400` sobre blanco da ~2.6:1.
Los tokens se usan como utilidades: `bg-ink`, `text-action`, `bg-confirmed`, `bg-canvas`, `bg-surface`, `border-hint-border`, etc.

| Pieza | Clases |
|---|---|
| Campo | las variantes de `formStyles.ts`; en esencia `min-h-11 w-full min-w-0 rounded-[14px] border-[1.5px] border-slate-300 bg-surface px-4 text-base font-medium text-ink placeholder:text-slate-500 focus:border-2 focus:border-ink focus:outline-none` (radio y relleno vertical según la variante) |
| Campo sugerido por OCR | mismo, con `border-2 border-bright` en lugar del borde gris |
| Etiqueta de campo | `mb-1.5 block text-[13px] font-bold text-ink` (y `font-medium text-slate-500` para "opcional") |
| Error de campo | `mt-1.5 block text-sm font-semibold text-red-700` |
| Overline | `text-xs font-extrabold uppercase tracking-[0.1em] text-action` |
| Botón sólido (uno por pantalla) | `min-h-11 cursor-pointer rounded-2xl bg-confirmed px-8 py-3.5 text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50` |
| Botón con contorno | `min-h-11 cursor-pointer rounded-2xl border-2 border-action px-5 py-2.5 text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint` |
| Tarjeta | `rounded-3xl bg-surface p-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]` |
| Tarjeta de resumen | `SummaryCard` (`features/consultations/`): overline + número de 34 px/900 |
| Vacío / agregar | `rounded-3xl border-2 border-dashed border-hint-border px-5 py-5 text-base font-extrabold text-action hover:bg-hint` |
| Header | `<AppHeader eyebrow title action>` de `shared/ui/` |
| Pantalla con sesión | envolver en `<AppShell activeChildId>` (agrega la barra lateral desde 900 px) |

Además de los colores: hover con `transition-colors duration-200`, `cursor-pointer` en todo lo clicable, foco visible, mínimo 44 px de alto en todo control (FR-009), contraste ≥ 4.5:1 (FR-008), sin scroll horizontal de 320 a 1920 px.

