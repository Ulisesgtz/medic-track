# Desviaciones del diseño «Primer uso guiado» (spec 071, T029)

Diseño: `Primer uso guiado PediTrack.dc.html` (estados A0 y A–G, 11 decisiones). Comparación hecha el 2026-11-16.

**Cómo se comparó.** El `.dc.html` necesita el `support.js` del canvas de Claude Design, que no viene en `referencia/`, así que no se puede abrir
localmente. Se comparó contra los **valores medidos del markup** (paddings, radios, tipografías, círculos, anchos). La app se renderizó con
Playwright contra el build local (cuentas sembradas, Chromium, 390 y 1280 px) y se midió con `getBoundingClientRect` / `getComputedStyle` en cada
estado (A0, A, B, C, D, E y F; G es B con plan gratuito y la guía no lee el plan). Un spec temporal de medición hizo las capturas y se borró.

## Medidas que coinciden con el diseño

| Pieza | Diseño | App (medido) |
|---|---|---|
| Tarjeta, teléfono | padding 18/18/4, radio 22, sombra `0 8 20 rgba(4,37,43,.07)` | 18/18/4, 22, igual; 350 px de ancho en 390 |
| Tarjeta, web | padding 22/24/4 | 22/24/4; 904 px de ancho, x = 328 (barra de 280 + 48) |
| Título / subtítulo | 18 px 800 / 14 px — web 20 px 900 / 15 px | iguales |
| «Ahora no» | mín. 44 × 44, 14 px 800 (web 15) | 83 × 44 / 87 × 44, iguales |
| Círculo del paso | 36 px (web 40), número 16 px (web 17) 900 | 36 / 40 px, igual; check de 18 / 20 px |
| Título y descripción del paso | 16 px 800 y 14 px (web 17 y 15, máx. 600 px) | iguales (web: la descripción mide 556 px por la columna de botones) |
| Botones | alto 48, radio 16, 16 px 800; teléfono `px 22`, web `px 20` | iguales; la columna web mide 224 px |
| Línea de despedida | teléfono 14/16, círculo 32, 15 px 700; web 16/22, 16 px | iguales |
| Aviso «Cerraste la guía» | fondo `ink`, 14 px 600, radio 16, padding 14/18, máx. 560 px en web | iguales |
| Ventana A0, teléfono | hoja, radio 28 arriba, máx. 88 % del alto, rayita 40 × 5, título 22 px 900, «Entendido» 52 px | 742.7 px de 844 (88 %), 28 px, 22 px, 52 px |
| Ventana A0, web | 600 px, máx. 720, radio 24, título 26 px, «Entendido» a la derecha con `px 32` | 600 × 720, 24, 26 px, 144.8 × 52 a la derecha |
| Fila «Primeros pasos · Ver guía» | teléfono 52 px; web 64 px, primera de la lista | 52 y 64 px; la franja web pasa a seis columnas solo con la fila |
| Candado, rayita y tiles de Safari | círculo punteado, tiles de 40 px, barra de Safari de 300 × 56 | iguales (los trazos y rellenos del SVG son clases de tokens) |

## Diferencias, con su motivo

1. **Colores como tokens.** El diseño escribe literales (`#64748b`, `#475569`, `#cbd5e1`, `#ffffff`…). La app usa el token más cercano de `@theme` (regla de
   `noColorLiterals.test.ts`): borde del candado `calendar-muted` (`#64748b`, igual), trazo del candado y de los íconos de Safari `muted` (`#475569`, igual),
   marco de la barra de Safari `line` (`#cfe8ec` en lugar de `#cbd5e1`, apenas más claro). No hay colores nuevos.
2. **Textos que siguen al dispositivo, no al diseño.** El diseño pone «Tomar foto de la receta» y «tu pantalla de inicio» en el marco del teléfono, y
   «Nueva consulta» y «tu computadora» en el web. La app decide esos textos con `platform()` (Android/iPhone o computadora) y el diseño solo decide
   medidas y disposición: una ventana de computadora angosta (< 900 px) usa el diseño del teléfono con los textos de computadora, y una pantalla
   de tableta ancha con iPhone usa los del teléfono. Motivo: lo que dice «instala en tu pantalla de inicio» debe ser verdad en ese aparato.
3. **«Registraste la consulta con {doctor}.»** El diseño dice «con la Dra. López». El doctor es un texto libre que la persona escribió («Dr. Paz», «Clínica
   del Valle»), así que un «la» fijo sería un error en la mitad de los casos; la app lo repite tal cual lo guardó.
4. **Aviso «Cerraste la guía…» pegado al borde de abajo de la pantalla.** En el diseño está en el flujo, al pie del marco. En la app va con `sticky bottom-5`
   (teléfono con `-mx-1`, para el margen de 16 px del diseño): al tocar «Ahora no» la persona está arriba de un inicio largo y, si el aviso estuviera
   al final de la página, no lo vería. Dura 8 s como en el diseño.
5. **Android sin la oferta de instalar.** El diseño solo dibuja «Instalar» para Android. Cuando el navegador no ofrece `beforeinstallprompt` (Firefox, un
   Chrome que ya la gastó) la app muestra dos pasos del menú del navegador («Abre el menú… / Elige «Instalar app»…») con las mismas fichas numeradas del
   estado D, sin botón. Texto nuevo, neutral y corto, en `firstUseText.ts`.
6. **iPhone con otro navegador (Chrome, Firefox, Edge).** No está en el diseño. Solo Safari instala en iOS, así que el paso 2 dice «Abre PediTrack en Safari
   para instalarla.» más una nota, sin botón.
7. **Computadora que no ofrece instalar.** El diseño lo cubre (estado C, web) con la guía de dos pasos y «Dos pasos, en el orden que quieras.»; la app
   hace lo mismo y además dice «Un paso…» / «Los dos pasos están hechos…» según los pasos mostrados (el diseño solo trae «Tres» y «Dos»).
8. **«Instalada» se aprende al abrir y por el evento.** El diseño marca el paso 2 cuando PediTrack se abre desde el ícono. La app lo lee al montar
   (`display-mode: standalone` o `navigator.standalone`) y, además, lo da por hecho al aceptar el diálogo del navegador o con `appinstalled`;
   en iOS no existe ese evento, así que ahí el paso se marca la próxima vez que se abra desde el ícono (como dice la nota del paso).
9. **«Ya los activé».** El diseño solo dibuja el botón. La app lee `Notification.permission`: si es `granted` vuelve a leer el navegador
   (`useReminders().recheck()`) y activa; si no, no cambia nada y **nunca vuelve a pedir el permiso** (el navegador no deja repetirlo).
10. **Primera activación de los recordatorios.** Si la cuenta nunca eligió qué dicen los avisos, el botón del paso 3 abre antes el diálogo de «Mostrar detalle /
    Texto genérico» de la spec 011, igual que la tarjeta de «Lo demás». El diseño no lo dibuja.
11. **«¿De quién es la consulta?» (varios hijos).** No está dibujado. Es la hoja/diálogo del patrón de `ConfirmDialog` con un botón por hijo propio.
12. **La tarjeta de Mateo del diseño (estado B y D, «su día con la toma por marcar»)** es el inicio tal como está hoy; la guía no la toca.
13. **Diseño del teléfono de 390 px, sin marco de teléfono.** El diseño dibuja un marco con barra de estado de 44 px, `padding 8px 20px 28px`; la app no
    dibuja marco: la columna es la del inicio (máx. 430 px, `px-5`), igual que el resto de pantallas.
14. **Estado G.** El diseño pide que la guía «no lea el plan en ningún estado»: no lo lee. La prueba de componente verifica que, con plan gratuito y una consulta
    guardada, ningún texto de la tarjeta dice plan, gratis, precio, límite ni premium.

## Sin diferencias por decidir

No quedó ninguna diferencia sin motivo. Lo que el dueño puede revisar: la 2 (textos por dispositivo), la 4 (aviso pegado abajo) y las 5 y 6 (textos nuevos).
