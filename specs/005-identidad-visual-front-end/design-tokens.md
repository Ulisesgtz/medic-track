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

Reglas:

- Un solo botón sólido por pantalla (`--color-confirmed`); las acciones secundarias van con contorno `--color-action` de 2 px.
- Texto blanco solo sobre `--color-ink`, `--color-action` y `--color-confirmed`. Nunca sobre `--color-bright` ni `--color-pending` (ahí va tinta oscura).
- Ámbar significa "el padre no lo ha marcado". No existe rojo de alerta en la app (Principio I).
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

Mínimo absoluto de texto: 13 px. Los números de resumen (edad, conteos) van en 34 px peso 900 — la app se lee de un vistazo por tamaño, no por color de borde.

## Componentes base

- **Header de pantalla**: fondo `--color-ink`, esquina inferior recta, contiene volver / logo / título y, cuando aplica, el avatar de inicial.
- **Tarjeta**: `--color-surface`, radio 20–22 px, sombra `0 8px 20px rgba(4,37,43,0.07)`, padding 20–22 px. Sin borde gris.
- **Tarjeta de consulta**: la misma, con barra de acento izquierda de 5 px — `--color-bright` para la más reciente, `#cffafe` para las anteriores.
- **Campo de formulario**: radio 14 px, borde 1.5 px `#cbd5e1`; enfocado o con valor confirmado, borde 2 px `--color-ink`; sugerido por OCR, borde 2 px `--color-bright`.
- **Chip de toma**: radio 12 px, alto mínimo 44 px. Tomada: `--color-confirmed` + blanco. Pendiente: `--color-pending-soft` + borde ámbar. Futura: `#f1f5f9` + `#64748b`.
- **Modal**: radio 24 px, padding 28 px, encabezado con título 24 px/900 y botón de cierre cuadrado de 34 px, acciones alineadas a la derecha (contorno + sólido). El de límite freemium lleva franja superior ámbar con overline "Plan gratuito".
- **Vacío / agregar**: contorno punteado 2 px `#67e8f9`, radio 22 px, texto 15 px/800 en `--color-action`.

## Logo e iconos

Marca: cápsula con rotación de -45°, partida a la mitad — mitad clara (registro) y mitad emerald (dosis confirmada), con la junta en el color del fondo.

- Icono de app: cápsula blanca/emerald sobre cuadro `--color-bright` (`#22d3ee`), radio 15/64 del lado.
- Sobre header oscuro: misma composición; el wordmark va "Pedi" blanco + "Track" `#67e8f9`.
- Sobre fondo claro: cuadro `--color-action`, wordmark "Pedi" `#04252b` + "Track" `#0e7490`.
- Exportaciones: `favicon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (20% de safe area).
- `theme_color` y `background_color` del manifest: `#04252b`.

El logo aparece en el header de la app, en la pantalla de registro y como icono/splash. No se repite dentro del contenido de las pantallas.
