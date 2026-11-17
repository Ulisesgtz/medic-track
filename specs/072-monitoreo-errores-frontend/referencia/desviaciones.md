# Desviaciones del mock — Pantalla de error (spec 072)

Mock: `Pantalla de error PediTrack.dc.html` (Claude Design, 2026-11-17). Comparado el 2026-11-17 con capturas del build
de E2E a 390×844 y 1280×844 (estados A–F; C solo teléfono), sección por sección: tarjeta, ícono, título, texto, nota,
botones, marco (barra lateral, encabezado, logo).

Coincide: tarjeta blanca de radio 24 con su sombra, ícono en círculo menta (flecha; ondas en F), títulos 28/30/34 px,
textos, nota gris, un solo botón sólido verde y el de contorno, botones apilados a ancho completo en el teléfono y en fila
en la web, E con los botones invertidos, B con el logo grande, C con el logo pequeño y «Ir a Hoy», D con la franja oscura
y «Ir a iniciar sesión», A web con la barra lateral real.

| # | Desviación | Motivo | Estado |
|---|---|---|---|
| 1 | Web: el mock escribe `font-size:34` y `17` sin `px` | CSS inválido en el mock; se usan 34 px y 17 px, lo que el diseño quería | Resuelta |
| 2 | Frase «El aviso del problema ya se envió solo.» → **«El aviso del problema se envía solo.»** | El reporte sale después y puede no llegar | Decidida por el dueño (2026-11-17) |
| 3 | A en el teléfono: **sin** el encabezado oscuro con logo e iniciales; solo la tarjeta | `AppShell` no tiene encabezado propio en el teléfono (cada pantalla trae el suyo y es lo que tronó) | Aceptada |
| 4 | A web: la barra lateral muestra los nombres de los hijos | Es la barra real de la app, no la pantalla que falló (Claude Design lo señaló) | Aceptada |
| 5 | A web: la barra lateral va **antes** del contenido en el DOM (el mock pide el contenido primero) | Reordenar con `order` cambiaría el orden de tabulación de todas las pantallas; el `h1` recibe el foco al aparecer, así el lector empieza por el título. En B, C y D sí va el contenido primero | Aceptada |
| 6 | E y F en el teléfono del hijo y sin sesión usan la frase de su contexto («Lo que ya marcaste sigue guardado.», «Si ya tenías una cuenta, tus registros siguen ahí.») | El mock solo dibujó E y F para el papá con sesión | Aceptada |
| 7 | Sin la barra de estado «9:41» del mock | Es parte del marco del teléfono, no de la app | N/A |
| 8 | C en la web: el diseño del teléfono centrado en 430 px | El mock dice que C no tiene diseño web (la vista del hijo solo existe en el teléfono) | Aceptada |
