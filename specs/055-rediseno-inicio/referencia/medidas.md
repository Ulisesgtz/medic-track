# Medidas del diseño del inicio (spec 055)

Leídas del código del diseño (`Inicio PediTrack.dc.html`, estilos en línea; el teléfono es un marco de **390 px**, la web
de **1280 px** con barra de **280 px**). Los colores van por su token de `@theme` (columna derecha).

## Colores del diseño → tokens

| Diseño | Token | Nota |
|---|---|---|
| `--color-muted` `#475569` | `--color-muted` (nuevo) | títulos de fila, «Próxima», vacío; 7.58:1 sobre blanco |
| `--color-skel` `#e2eef0` | `--color-skel` (nuevo) | esqueletos |
| `#78350f` (texto del chip «por marcar») | `--color-on-pending-chip` (nuevo) | 8.9:1 sobre `pending-soft` |
| `#b45309` (anillo del chip «por marcar») | `--color-pending-dot` (nuevo) | decorativo: el texto dice el estado |
| `#64748b` (borde punteado «sin registrar») | `--color-calendar-muted` (ya existe) | mismo valor |
| `#a5f3fc` / `#67e8f9` en la barra | `--color-hint-border` / `--color-bright-soft` | ya existen |
| avatar de hijo | `action` (1.º, 3.º…) / `confirmed` (2.º, 4.º…) | texto blanco |

## Teléfono (390 px)

- Contenido: `padding 8px 20px 32px`, columna con `gap 20px`; fondo `canvas`. **Sin banda oscura**: el saludo va sobre el fondo.
- Aviso «Antes de empezar»: `padding 18px 20px`, radio 22, borde 1.5 `hint-border`, fondo `hint`; título 17/800; texto
  15/1.55 `body`; «Entendido» contorno 2 `action`, radio 16, 44 alto, 15/800.
- Nota «Solo lectura»: `padding 14px 16px`, radio 16, borde 1.5 `hint-border`, fondo `surface`, 14/1.5 `body`, «Solo
  lectura.» en `ink` fuerte.
- Saludo: h2 28/900, tracking −0.03em, `ink`; fecha 15 `body`; gap 2. Botón de iniciales 48×48, círculo `ink`, 15/800 blanco,
  `aria-label` «Menú de cuenta».
- «Tu día» (tarjeta): fondo `surface`, radio 22, sombra `0 8px 20px rgba(4,37,43,0.07)`, padding 18, gap 14. Encabezado:
  h3 18/800 + «Ver todo» 14/700 enlace de 44 de alto. Chip «✓ Todo marcado hasta ahora»: `6px 12px`, píldora, `confirmed-soft`
  / `confirmed-strong`, 14/800. Filas: icono 36×36 radio 10 fondo `hint` (SVG 20, trazo `action` 2); título 13/700 `muted`;
  valor 15/800 `ink`; barra 6 px `hint` con relleno `action`; próxima 14 `body`. Separador 1 px `hint-edge`. «✓ Realizado»:
  contorno 2 `action`, radio 14, 44 alto, `0 18px`, 15/800, alineado a la derecha; hecho: `confirmed-soft`, «✓ {nombre} · HH:MM».
- «Tu día» vacío: `padding 12px 16px`, radio 16, borde 1.5 `hint-edge`, 15/1.5 `body`, enlace 700.
- «Tu día» plan: botón 56 alto, `0 16px`, radio 16, borde 1.5 `hint-border`, fondo `surface`; marca «Plan completo» `4px 10px`,
  píldora, fondo `hint`, borde 1 `hint-border`, 12/800 `action`.
- Hijos: sección `gap 12`; título h3 18/800 + subtítulo 14 `body`.
- Tarjeta de hijo: `surface`, radio 22, misma sombra, borde 1.5 transparente (o `2px dashed calendar-muted` en «sin
  registrar»). Enlace `padding 16px 16px 6px`, gap 10. Avatar 44 círculo, 18/900 blanco. Nombre 17/800 `ink` + «· edad» 500
  `body`. Chips 13/800 píldora: por marcar `3px 10px` `pending-soft` / `on-pending-chip` con anillo 9×9 borde 2
  `pending-dot`; ok `confirmed-soft`; sin registrar `2px 10px` borde 1.5 punteado `calendar-muted`, texto `body`. «›» 22
  `action`. Vacío: `4px 0 10px 56px`, 15 `muted`. Fila: 44 alto, gap 12, icono 36; título 13/700 `muted`; valor 15/700 `ink`.
  Línea sin registrar: `margin-left 48`, `6px 10px`, radio 10, borde 1.5 punteado, 14 `body`.
- Pie: `margin-top 8`, `padding 10px 16px 14px`, borde superior 1 `hint-edge`; «Próxima» 13/700 `muted`, valor 15/800 `ink`;
  «Marcar» 44 alto, mín. 96 ancho, `0 18px`, contorno 2 `action`, radio 14, 15/800; marcada: sin borde, `confirmed-soft`,
  `0 14px`, «✓ HH:MM».
- Sin hijos: `22px 20px`, radio 22, borde 2 punteado `hint-border`, gap 12; título 17/800; texto 15/1.5; «Agregar hijo»
  sólido `confirmed` 52 alto, radio 16, 17/800.
- «+ Agregar hijo»: 56 alto, radio 22, borde 2 punteado `hint-border`, 16/800 `action`; «Tu plan incluye un hijo» 13/600 `body`.
- «Lo demás»: `nav` «Más opciones», `margin-top 8`, borde superior 1 `hint-edge`; filas 52 alto con borde inferior 1
  `hint-edge`; título 15/700 (`ink`, «Cerrar sesión» en `action`), valor 14 `body`.
- Esqueleto: saludo (140×26 y 180×16, círculo 44); «Tu día» 236 alto; título 100×18; tarjetas 264 y 220 alto, radio 22, borde
  1.5 `hint-edge`, padding 18.

## Web (1280 px)

- Barra: 280, `ink`, `padding 28px 24px`, gap 28. «Inicio» 48 alto radio 16 fondo `action` 16/800 blanco. Grupo (hijos o
  familia, «Personal») 12/800, tracking 0.08em, mayúsculas, `bright-soft`, `padding 14px 16px 4px`. Hijo 48 alto: nombre
  16/700 `hint-border`, edad corta 13/600 `bright-soft`. «+ Agregar hijo» 48 alto, borde 1.5 punteado `ink-edge`, 14/700
  `bright-soft`. Mis suplementos / actividades 44 alto 15/700 `hint-border`. Cuenta al fondo: borde superior 1 `ink-soft`,
  avatar 38 `action`, nombre 14/700 blanco, plan 12 `bright-soft`, es el «Menú de cuenta».
- Página: `padding 44px 48px 56px`, columna máx. 904 centrada, gap 28.
- Aviso: `20px 24px`, en fila con «Entendido» a la derecha. Solo lectura: `14px 18px`, 15.
- Saludo: h2 34/900, fecha 16 `body`, gap 4 (sin botón de iniciales: la cuenta está en la barra).
- «Tu día»: padding `22px 24px`, gap 16; encabezado h3 19/800 + chip + «Ver todo» a la derecha; dos columnas `1fr 1px 1fr`
  gap 24; icono 40 radio 12; título 14/700; valor 16/800; próxima 15; «✓ Realizado» en la línea de la próxima.
- Hijos: título h3 19/800 + subtítulo 15 en la misma línea; rejilla de 2 columnas, gap 20, `align-items start`. Tarjeta: enlace
  `padding 20px 20px 8px`; avatar 48, 19/900; nombre 18/800; vacío `4px 0 12px 62px`; título de fila 14/700; pie `12px 20px
  16px`. «+ Agregar hijo» 120 alto. Sin hijos: ocupa las dos columnas, en fila, padding 28.
- «Lo demás»: franja de 4 columnas, bordes superior e inferior 1 `hint-edge`; cada acceso 64 alto, `10px 16px`, título
  15/700, valor 13 `body`.
- Esqueleto: saludo 220×34 y 200×18; «Tu día» 196; título 120×20; dos tarjetas de 280.

## Pantalla «Hoy» del hijo (teléfono)

- Encabezado: avatar 48 `action` 19/900 + «Hola, Mateo» 28/900 + fecha 15 `body`, gap 14.
- Chip del día `5px 12px` 14/800 (por marcar / todo marcado). Vacío: `28px 20px`, radio 22, borde 2 punteado `hint-border`,
  16/1.5 `muted`, centrado.
- «Tus tomas» y «Tus actividades»: tarjeta `surface` radio 22 sombra, padding 16; encabezado h3 18/800 + conteo 15/700.
  Grupo (Mañana / Tarde / Noche) 12/800 tracking 0.08em mayúsculas `action`, `padding-top 8`. Fila 56 alto, borde inferior 1
  `hint-edge`, icono 36; nombre 16/800, detalle 14 `body`. «Marcar» como el pie; mía «✓ HH:MM» (botón, desmarca); de otra
  persona: texto «✓ por Ana, 08:05» 14/800 en `confirmed-soft`, sin acción.
- «Avisos»: `16px`, radio 16, borde 1.5 `hint-border`, fondo `hint`; título 16/800, texto 14/1.45; botón a la derecha.
