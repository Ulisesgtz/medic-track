# Contrato de UI — Pantalla de error (FR-007a)

Fuente: mock de Claude Design «Pantalla de error PediTrack» (canvas del proyecto, 2026-11-17), copiado en
`referencia/Pantalla de error PediTrack.dc.html`. **Se construye tal cual** (regla del repo): medir el mock y comparar
sección por sección a 390 y 1280 px; toda desviación va a `referencia/desviaciones.md` con su motivo.

## Estructura común (tarjeta)

- Tarjeta `surface` blanca, radio 24 px, sombra `0 8px 20px rgba(4,37,43,0.07)`.
  - Teléfono: ancho completo con `padding 28px 24px 24px`, `gap 16px`; contenedor `padding 28px 20px 32px` (C y D: `36px 20px 32px`).
  - Web: `max-width 600px`, `padding 40px 44px`, `gap 18px`; área `padding 96px 48px 56px` (B: `44px 48px 80px` bajo el logo).
- Ícono decorativo (`aria-hidden`): círculo 64 px (web 72) `bg hint` + borde 1.5 px `hint-border`; trazo 2.2 px `action`.
  Flecha circular (recargar) en A–E; ondas de señal (la primera punteada) en F.
- `h1` con `tabindex="-1"`, **recibe el foco al aparecer**; 28 px (C: 30) teléfono, 34 px web; peso 900,
  `letter-spacing -0.03em`, `line-height 1.15`, color `ink`.
- Texto 16 px (C: 18) teléfono, 17 px web; `line-height 1.55`; color `body`.
- Nota gris opcional 14 px, color `muted`.
- Botones: **un solo sólido** (`confirmed` #047857, hover `confirmed-strong`), texto blanco 800; el otro de contorno 2 px
  `action`, texto `action`, hover `bg hint`. Teléfono: apilados a ancho completo, 12 px entre sí, sólido 52 px de alto
  (C: 56), contorno 48 px; radio 16 px; 17/16 px. Web: en fila, 52 px de alto, sólido `min-width 200px`.
- **Orden en el DOM**: el contenido va **antes** que el encabezado/barra lateral (se reordena con CSS `order`), para que
  el lector de pantalla empiece por el título.

## Estados

| Estado | Cuándo | Marco | Título | Texto | Nota gris | Sólido | Contorno |
|---|---|---|---|---|---|---|---|
| **A** | Truena una pantalla con sesión de papá | Teléfono: encabezado de la app (oscuro, logo, iniciales). Web: **barra lateral visible**, error en el contenido | Algo no cargó bien | Lo que ya guardaste sigue en tu cuenta. Vuelve a cargar la pantalla para seguir. | El aviso del problema se envía solo. | Volver a cargar | Ir al inicio |
| **B** | Truena el armazón (no se dibujó ni la barra) | Página completa con el logo grande sobre fondo claro (cuadro `#0e7490`), sin barra | igual que A | igual que A | igual que A | Volver a cargar | Ir al inicio |
| **C** | Teléfono del hijo (`/hijo…`) | Solo teléfono: logo claro pequeño arriba, sin avatar ni nombre | Algo no cargó bien | Lo que ya marcaste sigue guardado. Vuelve a cargar la pantalla para seguir. | — | Volver a cargar | Ir a Hoy |
| **D** | Sin sesión (login, registro, invitación) | Encabezado oscuro solo con el logo (web: franja de 72 px) | Algo no cargó bien | Si ya tenías una cuenta, tus registros siguen ahí. Vuelve a cargar la pantalla para seguir. | El aviso del problema se envía solo. | Volver a cargar | Ir a iniciar sesión |
| **E** | Volvió a tronar ≤ 30 s después de «Volver a cargar» | como A | Algo no cargó bien | Sigue sin cargar. Intenta más tarde o regresa al inicio. | Lo que ya guardaste sigue en tu cuenta. | **Ir al inicio** | **Volver a cargar** |
| **F** | Sin conexión (`isOffline()`) | como A | Parece que no hay conexión | Lo que ya guardaste sigue en tu cuenta. Cuando vuelva la señal, vuelve a cargar la pantalla. | — | Volver a cargar | Ir al inicio |

Destinos: «Ir al inicio» → `/home`; «Ir a Hoy» → `/hijo/hoy`; «Ir a iniciar sesión» → `/login`; «Volver a cargar» →
`location.reload()`. C, D y E/F combinan: en el teléfono del hijo sin conexión gana F con «Ir a Hoy»; sin sesión, la
salida de D.

## Desviaciones ya vistas (a confirmar con el dueño)

1. El mock escribe `font-size:34` y `font-size:17` sin `px` en la web (CSS inválido: el navegador usaría su tamaño por
   omisión). Se toma la intención: **34 px y 17 px**.
2. «El aviso del problema ya se envió solo.» del mock prometía algo que no siempre pasa (el reporte sale ~3 s después y
   puede no llegar). **Decidido por el dueño el 2026-11-17**: la frase es **«El aviso del problema se envía solo.»**
   (ya aplicada en la tabla de arriba).
3. A teléfono muestra un encabezado oscuro con logo e iniciales; se usa **el encabezado real que monta `AppShell` en el
   teléfono**, sea cual sea hoy (la frontera de A vive dentro de `AppShell`).
4. A web: la barra lateral muestra los nombres de los hijos porque es la barra real de la app (Claude Design lo señaló);
   se deja así.
