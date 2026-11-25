# Especificación de Funcionalidad: Sitio público de PediTrack (pedi-track.com)

**Rama de la Funcionalidad**: `feature/080-sitio-publico`

**Creado**: 2026-11-24

**Estado**: Borrador

**Entrada**: Descripción del usuario: "080 Sitio público de PediTrack (pedi-track.com). Construir el sitio público de marketing, separado de la app, exactamente como los mocks de Claude Design en el canvas (Inicio, Páginas, Legal, Decisiones y SEO). Objetivo: que Google lo indexe bien (HTML servido ya armado), rápido en teléfono, accesible, en español de México. Los botones «Crear cuenta»/«Iniciar sesión» llevan a la app. Nunca consejos médicos ni promesas de salud, sin anuncios ni rastreo de terceros. Precios iguales a la app. Contenido pendiente del dueño. Decidir dónde vive la app cuando el sitio ocupe pedi-track.com."

## Referencia de diseño

Los mocks entregados por Claude Design en el canvas `https://claude.ai/artifact/AYfFuySuqyh2nKupfk6Z3M` son la fuente de verdad (regla del proyecto: **se construyen tal cual** y se comparan sección por sección al ancho del mock):

| Página del canvas | Qué contiene |
|---|---|
| «Sitio publico - Inicio» | La portada en teléfono (390), tableta (768) y web (1440), y el menú desplegable del teléfono. Secciones de la web, en orden: hero (H1 «App para registrar los medicamentos y el historial médico de tus hijos»), «Cómo funciona» (Foto de la receta · Horario de tomas · Recordatorios), «Todo lo que PediTrack guarda…» (4 tarjetas), Familia («Un expediente médico familiar…»), Planes (Gratis · Plan completo), Privacidad (Sin anuncios · Sin venta de datos · La receta se lee en tu teléfono · Tú decides), Preguntas frecuentes y el cierre «Empieza a tener las tomas y las recetas en un solo lugar». |
| «Sitio publico - Paginas» | Funciones, Planes, Preguntas frecuentes, Blog (listado y artículo), Instalar la app, 404 y la plantilla legal; cada una en teléfono (390) y web (1440). (La página «Privacidad» de 6 tarjetas se retiró el 2026-11-22: `/privacidad` es la de «Legal».) |
| «Sitio publico - Legal» | «Privacidad y seguridad» (`/privacidad`), «Aviso de privacidad» (`/aviso-de-privacidad`) y «Términos y condiciones» (`/terminos`) sobre la plantilla legal, con los textos de `legal/*.md`. |
| «Sitio publico - Decisiones y SEO» | Tabla por página (URL, title ≤ 60, meta description ≤ 155, H1, datos estructurados, robots), las seis palabras clave y dónde van, los datos estructurados propuestos, el encabezado del inicio, `robots.txt` y `sitemap.xml`, y la lista numerada de decisiones de diseño. |

Antes de implementar, la carpeta `specs/080-sitio-publico/referencia/` guardará una copia de esos cuatro archivos del canvas (como las specs 062, 065 y 071), y `referencia/desviaciones.md` listará cada diferencia que quede con su motivo.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Una mamá o un papá llega desde Google y entiende qué es PediTrack (Prioridad: P1)

Alguien busca «app para registrar medicamentos de mis hijos» en el teléfono, llega a la portada de pedi-track.com y en pocos segundos entiende qué hace la app (guardar consultas y recetas, armar el horario de tomas, recordar), que es gratis para un hijo, que sus datos no se venden, y puede crear su cuenta con un toque.

**Por qué esta prioridad**: hoy no hay nada en pedi-track.com que explique el producto ni que Google pueda indexar; sin la portada no hay cómo llegar a la app más que con un enlace directo. Por sí sola ya aporta valor (es el MVP del sitio).

**Prueba Independiente**: abrir la portada a 390, 768 y 1440 px y compararla con el mock; tocar «Crear cuenta» y llegar al registro de la app; ver el HTML servido sin ejecutar scripts y encontrar el título, el H1 y todos los textos.

**Escenarios de Aceptación**:

1. **Dado** un teléfono de 390 px, **Cuando** se abre `pedi-track.com/`, **Entonces** se ve el diseño «Inicio teléfono» del mock con sus secciones en el mismo orden y los mismos textos.
2. **Dado** una computadora a 1440 px (y una tableta a 768 px), **Cuando** se abre la portada, **Entonces** se ve el diseño web (o el de tableta) del mock, nunca una mezcla de los dos.
3. **Dado** la portada, **Cuando** se toca «Crear cuenta» o «Iniciar sesión», **Entonces** se abre la pantalla de registro o de inicio de sesión de la app.
4. **Dado** un robot que no ejecuta scripts, **Cuando** pide `pedi-track.com/`, **Entonces** recibe una página con el title, la meta description, el H1, los textos de todas las secciones y los datos estructurados de la tabla de SEO.
5. **Dado** el teléfono, **Cuando** se toca el botón del menú, **Entonces** se abre el menú del mock («Menú teléfono») con sus enlaces, se cierra con su botón o con Escape, y el foco no sale del menú mientras está abierto.

---

### Historia de Usuario 2 - Quien compara revisa funciones, planes y preguntas frecuentes (Prioridad: P2)

Antes de registrarse, la persona quiere saber qué hace cada función, cuánto cuesta y resolver dudas (si es gratis, cómo se instala, cómo comparte con la familia, cómo descarga sus datos).

**Por qué esta prioridad**: son las páginas que convierten a quien ya llegó y las que más palabras clave cubren (funciones, planes, FAQ).

**Prueba Independiente**: navegar desde el menú a `/funciones`, `/planes` y `/preguntas-frecuentes`, comparar cada una con su mock y comprobar que los precios coinciden con los de la app.

**Escenarios de Aceptación**:

1. **Dado** el menú, **Cuando** se elige Funciones, Planes o Preguntas frecuentes, **Entonces** se abre su página con el diseño del mock correspondiente y sus migas de pan.
2. **Dado** `/planes`, **Cuando** se lee, **Entonces** dice Gratis MX$0 y Plan completo MX$499 al año para toda la familia, igual que la pantalla «Planes» de la app.
3. **Dado** `/funciones`, **Cuando** se usa un enlace con ancla (`#recordatorios`, `#vacunacion`, `#familia`), **Entonces** la página baja a esa sección.
4. **Dado** `/preguntas-frecuentes`, **Cuando** se abre una pregunta, **Entonces** se despliega su respuesta; el HTML servido ya trae todas las preguntas y respuestas y sus datos estructurados de FAQ.

---

### Historia de Usuario 3 - Quien se preocupa por sus datos lee la privacidad y lo legal (Prioridad: P2)

Una madre quiere saber qué pasa con la información de salud de sus hijos antes de escribirla: lee «Privacidad y seguridad» en simple y, si quiere, el aviso de privacidad y los términos completos.

**Por qué esta prioridad**: la confianza es la razón de compra del producto (Principio II), y el aviso de privacidad debe estar publicado desde el primer día.

**Prueba Independiente**: abrir `/privacidad`, `/aviso-de-privacidad` y `/terminos`, comparar con la página «Legal» del canvas y comprobar que el texto es el de `legal/*.md`.

**Escenarios de Aceptación**:

1. **Dado** cualquier página, **Cuando** se toca «Privacidad», «Privacidad y seguridad», «Aviso de privacidad» o «Términos» en el menú o el pie, **Entonces** se abre la página legal correspondiente.
2. **Dado** una página legal en la web, **Cuando** se toca una entrada del índice «Contenido», **Entonces** la página baja a esa sección.
3. **Dado** que los textos legales aún tienen datos entre corchetes o no los revisó un abogado, **Cuando** se construye el sitio para producción, **Entonces** la construcción se detiene y dice qué falta (en desarrollo se muestran con la nota «Borrador para revisión legal»).

---

### Historia de Usuario 4 - Quien quiere usarla en el teléfono aprende a instalarla (Prioridad: P3)

La persona ya tiene cuenta (o la va a crear) y quiere PediTrack en la pantalla de inicio de su iPhone o Android.

**Por qué esta prioridad**: es la duda más común de una PWA, pero la app ya enseña a instalar en «Primeros pasos» (spec 071); esta página sirve sobre todo para Google y para compartir la liga.

**Prueba Independiente**: abrir `/instalar` a 390 y 1440 px y compararla con su mock.

**Escenarios de Aceptación**:

1. **Dado** `/instalar`, **Cuando** se lee, **Entonces** muestra los pasos de iPhone (Safari) y de Android (Chrome) del mock, con las mismas palabras que usa la guía de la app («Compartir», «Agregar a inicio»).

---

### Historia de Usuario 5 - Blog y guías de organización (Prioridad: P3)

Quien busca cómo organizar recetas o no olvidar las tomas encuentra una guía de organización (nunca un consejo médico) y conoce PediTrack.

**Por qué esta prioridad**: atrae búsquedas a largo plazo, pero depende de artículos que todavía no existen.

**Prueba Independiente**: con al menos un artículo listo, abrir `/blog` y el artículo y compararlos con sus mocks; con ninguno, comprobar que el blog no aparece.

**Escenarios de Aceptación**:

1. **Dado** artículos marcados como listos, **Cuando** se abre `/blog`, **Entonces** se ve el listado del mock con esos artículos y cada uno abre su página con migas de pan, fecha real y datos estructurados de artículo.
2. **Dado** que ningún artículo está listo, **Cuando** se construye el sitio, **Entonces** no hay `/blog`, el enlace «Blog» no aparece en el menú ni en el pie y el mapa del sitio no lo lista.

---

### Historia de Usuario 6 - Una dirección que no existe (Prioridad: P3)

Alguien sigue una liga vieja o mal escrita.

**Prueba Independiente**: pedir `pedi-track.com/no-existe`.

**Escenarios de Aceptación**:

1. **Dado** una dirección que no existe, **Cuando** se pide, **Entonces** responde con estado 404 y la página «No encontramos esta página» del mock, con enlaces al inicio, funciones y planes, y no se indexa.

### Casos Límite

- **Sin JavaScript** (o mientras carga): todo el contenido, los enlaces y el menú del teléfono siguen siendo usables; el menú abre aunque el script no haya cargado (o el enlace del menú lleva a una lista de páginas).
- **Ancho intermedio** (p. ej. 1000 px o 600 px): se ve uno de los diseños del mock (teléfono, tableta o web) sin desbordes horizontales; ninguna mezcla de dos diseños.
- **Texto agrandado** (zoom del navegador al 200 %): el contenido se reacomoda sin cortarse.
- **Contenido pendiente**: si una sección depende de algo que el dueño no ha entregado (capturas, imágenes para compartir, redes sociales, respuestas de FAQ), la construcción de producción falla y nombra qué falta; nunca se publica texto de relleno ni corchetes.
- **Precio cambiado en la app**: el precio del sitio y el de la app vienen de un solo lugar, o una prueba falla si difieren.
- **Alguien ya con sesión** abre el sitio y toca «Iniciar sesión»: llega a la app, que lo lleva a su inicio.
- **Dirección con barra final o mayúsculas** (`/Planes/`): redirige de forma permanente a la dirección canónica (`/planes`).
- **Dirección vieja de la app** (si la app cambia de lugar): las ligas ya compartidas a la app (invitaciones a la familia, liga del teléfono del hijo, regreso de Mercado Pago, avisos push) siguen funcionando.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

**Páginas y diseño**

- **FR-001**: El sitio DEBE tener estas páginas, con el diseño de su mock: `/` (inicio), `/funciones`, `/planes`, `/preguntas-frecuentes`, `/instalar`, `/privacidad`, `/aviso-de-privacidad`, `/terminos`, `/blog` y un artículo por guía (`/blog/<slug>`), y la página 404.
- **FR-002**: Cada página DEBE verse como su mock en teléfono (390 px) y web (1440 px), y el inicio también en tableta (768 px); cada ancho muestra un solo diseño, sin mezclar el de teléfono con el de web.
- **FR-003**: El encabezado (logo, menú, «Iniciar sesión» y «Crear cuenta») y el pie (enlaces, aviso de que PediTrack no sustituye al médico, enlaces legales) DEBEN ser los mismos en todas las páginas, como en el mock.
- **FR-004**: Todos los enlaces internos DEBEN llevar a su página o sección; ningún enlace puede quedar sin destino.
- **FR-005**: Las páginas interiores DEBEN mostrar migas de pan (Inicio › Página) como en el mock.

**Llegar a la app**

- **FR-006**: «Crear cuenta» DEBE abrir el registro de la app e «Iniciar sesión» su pantalla de inicio de sesión.
- **FR-007**: El sitio y la app DEBEN poder vivir juntos en el dominio `pedi-track.com`: el sitio en `pedi-track.com` (y `www.pedi-track.com` redirige a él) y **la app en `app.pedi-track.com`** (decisión del dueño, 2026-11-24). Al moverse la app, todo lo que conoce su dirección (inicio de sesión, orígenes permitidos del API, regreso y avisos del cobro, ligas de los correos de invitación y del teléfono del hijo, avisos push) DEBE apuntar a la nueva; las ligas que la app ya mandó con `pedi-track.com/<ruta de la app>` (invitaciones, teléfono del hijo, regreso del pago, avisos) DEBEN redirigir a la misma ruta en `app.pedi-track.com`, conservando lo que va tras el `#`.

**Contenido**

- **FR-008**: Los textos DEBEN ser los del mock y, en las páginas legales, los de `legal/privacidad-y-seguridad.md`, `legal/aviso-de-privacidad.md` y `legal/terminos-y-condiciones.md`.
- **FR-009**: Los precios y lo que incluye cada plan DEBEN coincidir con la app (Gratis MX$0 para 1 hijo; Plan completo MX$499 al año para toda la familia).
- **FR-010**: Ningún texto del sitio puede dar consejos médicos, prometer resultados de salud, decir que la app diagnostica, sugiere dosis o «previene olvidos» como garantía (Principio I); el blog son guías de organización y cada artículo lo dice. Una prueba de redacción DEBE vigilar una lista de frases prohibidas, como la de la spec 071.
- **FR-011**: El contenido que entrega el dueño (artículos del blog, correos de contacto, redes sociales, datos entre corchetes de los textos legales y su revisión por un abogado) DEBE poder agregarse sin cambiar el diseño; mientras falte, la construcción de producción DEBE fallar nombrando qué falta, y nunca publicar relleno ni corchetes.
- **FR-012**: El blog DEBE publicarse solo con los artículos marcados como listos; sin ninguno, no hay blog ni enlaces a él.

**Buscadores y compartir**

- **FR-013**: Cada página DEBE servirse ya armada (el contenido, el title, la meta description y el H1 están en la respuesta, sin depender de ejecutar scripts).
- **FR-014**: Cada página DEBE llevar el title, la meta description, el H1, los datos estructurados y la indicación de indexar o no de la tabla «Tabla de SEO por página» del mock; idioma `es-MX`; dirección canónica a sí misma (salvo la 404), y Open Graph y tarjeta de Twitter con su imagen de 1200×630.
- **FR-015**: Las seis palabras clave DEBEN estar en los encabezados indicados en «Palabras clave y dónde van».
- **FR-016**: El sitio DEBE publicar `robots.txt` y `sitemap.xml` con todas las páginas indexables (sin la 404 ni el blog si no está publicado), y el `robots.txt` apunta al mapa del sitio.
- **FR-017**: Una dirección que no existe DEBE responder 404 con la página del mock y la indicación de no indexar; las variantes con barra final o mayúsculas DEBEN redirigir de forma permanente a la canónica.
- **FR-018**: Una prueba DEBE comprobar que cada title mide ≤ 60 caracteres, cada meta description ≤ 155, que hay un solo H1 por página y que los datos estructurados son JSON válido.

**Velocidad y accesibilidad**

- **FR-019**: El sitio DEBE ser rápido en un teléfono con red móvil: la imagen principal y la fuente se precargan, las imágenes llevan ancho y alto (sin saltos al cargar) y las de abajo de la pantalla cargan solo cuando hacen falta.
- **FR-020**: El sitio DEBE cumplir el contraste mínimo 4.5:1 del sistema visual (o 3:1 en texto grande), ser usable solo con teclado con el foco visible, tener textos alternativos en las imágenes con contenido y respetar «reducir movimiento».

**Privacidad**

- **FR-021**: El sitio NO DEBE cargar anuncios, píxeles de redes sociales, rastreadores de terceros ni cookies que no sean estrictamente necesarias, y por eso no necesita aviso de cookies. Las visitas se cuentan con una analítica **sin cookies ni datos personales**, ofrecida por el mismo proveedor que publica el sitio (decisión del dueño, 2026-11-24), y declarada en el aviso de privacidad y en «Privacidad y seguridad»; la app no la lleva.
- **FR-022**: El sitio NO DEBE pedir ni guardar datos de las personas: no tiene formularios (salvo enlaces de correo) ni sesiones; las cuentas se crean en la app.
- **FR-023**: Las fuentes y las imágenes DEBEN servirse desde el propio sitio (sin pedirlas a terceros al cargar), con las mismas cabeceras de seguridad que la app.

**Calidad**

- **FR-024**: El sitio DEBE tener pruebas automáticas: las de FR-010 y FR-018, enlaces internos sin destino roto, y pruebas de extremo a extremo de cada página a 390 y 1440 px (y el inicio a 768), en Chromium y WebKit, que corren en CI como las de la app.

### Entidades Clave

- **Página**: dirección, title, meta description, H1, datos estructurados, si se indexa, imagen para compartir, migas de pan.
- **Artículo del blog**: título, slug, fecha de publicación y de modificación, resumen, imagen para compartir, texto y si está listo para publicarse.
- **Pregunta frecuente**: pregunta y respuesta; las mismas alimentan la página, la sección del inicio y sus datos estructurados.
- **Plan**: nombre, precio, periodo y lo que incluye; un solo origen compartido con la app (o comprobado contra ella).
- **Contenido pendiente**: cada pieza que debe entregar el dueño, con lo que bloquea si falta.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Puesta lado a lado con su mock al mismo ancho, cada página coincide sección por sección (estructura, orden, textos, colores y tamaños); toda diferencia restante está en `referencia/desviaciones.md` con su motivo.
- **SC-002**: En un teléfono de gama media con red 4G, la portada muestra su contenido principal en menos de 2.5 s, no salta al cargar y responde al primer toque en menos de 200 ms (las métricas de Core Web Vitals de Google en «bueno»).
- **SC-003**: Las auditorías automáticas de accesibilidad, buenas prácticas y SEO de cada página dan 95 o más sobre 100, y ningún texto queda por debajo del contraste mínimo.
- **SC-004**: El 100 % de las páginas indexables aparece en el mapa del sitio, con title y description dentro de su largo y datos estructurados válidos para la herramienta de resultados enriquecidos de Google.
- **SC-005**: Desde cualquier página, crear una cuenta en la app toma un solo toque.
- **SC-006**: Cero enlaces rotos, cero textos de relleno o entre corchetes y cero peticiones a terceros al cargar cualquier página publicada.
- **SC-007**: Ninguna ruta que la app ya usaba deja de funcionar al publicar el sitio.

## Supuestos

- **Sitio separado de la app**: el sitio es un proyecto aparte en el mismo repositorio, se publica por su cuenta y no comparte sesión ni código de pantallas con la app (sí el sistema visual: colores, fuente y logo). La app no cambia, salvo lo necesario para su nueva dirección (FR-007).
- **Diseño de tableta**: solo el inicio tiene mock de tableta (768); las páginas interiores en tableta usan el diseño del mock que corresponda a su ancho (teléfono por debajo del corte, web por encima), sin inventar un tercer diseño.
- **Textos legales**: se publican los de `legal/*.md`; los datos entre corchetes y la revisión del abogado son del dueño y bloquean solo la publicación en producción, no el desarrollo ni la vista previa.
- **Ambientes**: mientras el dueño no decida lanzar, el sitio se ve en una dirección de vista previa (no indexable); `pedi-track.com` se apunta al sitio solo cuando el dueño lo decida, con los pasos en `DEPLOY.md`.
- **Mudanza de la app**: la app nunca se ha publicado en producción (solo DEV en `dev.pedi-track.com`), así que no hay usuarios que mudar: la app de producción nace en `app.pedi-track.com` el día del lanzamiento, solo con configuración (variables de entorno y paneles, pasos en `DEPLOY.md`; la app no tiene su dirección escrita en el código). En DEV la app sigue en `dev.pedi-track.com` y el sitio se prueba en su vista previa.
- **Capturas de la app**: van dibujadas con el sistema visual, como en el mock (que lo permite y deja cambiarlas por capturas reales sin tocar el diseño), así que no son contenido pendiente. Las 15 preguntas frecuentes ya traen respuesta en el mock.
- **Textos legales y analítica**: los borradores de `legal/` se actualizan para nombrar la analítica sin cookies y la nueva dirección de la app.
- **Idioma**: solo español de México; no hay otras versiones de idioma.
- **Blog**: los tres artículos del mock son los primeros; los escribe o aprueba el dueño (se pueden redactar borradores, pero solo se publican los que él marque como listos).
- **Correo de contacto**: los enlaces de correo usan las direcciones del dominio que el dueño confirme (las de los textos legales).
- **Sin formulario de contacto, boletín ni chat** en esta entrega.
- **Search Console**: dar de alta el sitio en Google Search Console y mandar el mapa del sitio es un paso del dueño tras publicar.
