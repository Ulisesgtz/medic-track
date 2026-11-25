# Investigación: Sitio público de PediTrack (spec 080)

Fecha: 2026-11-24. Cada decisión: qué se eligió, por qué y qué más se evaluó.

## R1. Cómo se construye el sitio: React + Vite, HTML generado al compilar, sin JavaScript de React en el navegador

**Decisión**: proyecto nuevo `site/` con el mismo stack del frontend (React 19, Vite 8, TypeScript, Tailwind v4 con `@tailwindcss/vite`). Al compilar, un script de **prerender** recorre la lista de rutas y escribe cada página como HTML completo (`renderToStaticMarkup`) en `site/dist/<ruta>/index.html`. **No se hidrata React en el navegador**: las páginas no cargan el paquete de React. El único JavaScript es un archivo pequeño, escrito sin bibliotecas (≈ 2 KB), para el menú del teléfono (abrir, cerrar con Escape, mantener el foco dentro).

**Por qué**:
- FR-013: Google y cualquier robot reciben la página entera sin ejecutar scripts.
- SC-002: sin la hidratación de React, la portada pesa poco y responde al primer toque al instante.
- Principio III: sigue siendo React + Vite + TypeScript, el stack fijo del proyecto. El equipo ya conoce las herramientas, y el sistema visual (tokens de Tailwind, Figtree, logo) se reutiliza tal cual.
- Principio V: sin framework nuevo. El prerender son ~80 líneas con pruebas.

**Alternativas evaluadas**:
- **Astro**: hace exactamente esto, pero es un framework nuevo para el proyecto, con su sintaxis `.astro`, su configuración y sus actualizaciones. No hace falta para 10–12 páginas.
- **Next.js con exportación estática**: demasiado para un sitio sin datos dinámicos, y arrastra el runtime de React al navegador.
- **`vite-react-ssg` u otro plugin de SSG**: dependencia poco mantenida que hidrata por omisión.
- **Páginas dentro de la app (React Router)**: el servidor entregaría una página en blanco y el sitio quedaría atado al service worker y a Clerk. Lo descarta FR-013.
- **HTML escrito a mano**: duplicaría encabezado, pie y tarjetas en 12 archivos y no permitiría las pruebas unitarias del Principio VI.

## R2. El menú del teléfono funciona sin JavaScript y mejora con él

**Decisión**: el botón del menú es un enlace `<a href="#menu">` a una lista de páginas que existe en el HTML (la misma del menú abierto del mock). Cuando el script carga, el enlace se vuelve un botón con `aria-expanded`, abre el panel como diálogo, retiene el foco y se cierra con Escape, con su botón o al tocar un enlace. Las preguntas frecuentes usan `<details>/<summary>` sin JavaScript (decisión 14 del mock).

**Por qué**: cumple el caso límite «sin JavaScript» y la accesibilidad de FR-020.

**Alternativa evaluada**: `<details>` para el menú. Es más simple, pero no permite retener el foco ni cerrarse con Escape.

## R3. Textos: los del mock en componentes y los largos en Markdown

**Decisión**:
- Los textos de cada página van en sus componentes, copiados del mock.
- Las **15 preguntas frecuentes** (5 temas, con respuesta en el mock) viven en un solo módulo `content/faq.ts`, que alimenta tres cosas: `/preguntas-frecuentes`, las 6 preguntas del inicio y el JSON-LD `FAQPage`.
- Los **textos legales** se leen al compilar de `legal/*.md` (se mueven al repositorio en esta spec) y se convierten con `marked`, una dependencia solo de compilación.
- Los **artículos del blog** viven en `site/content/blog/<slug>.md`, con encabezado YAML (`title`, `description`, `datePublished`, `dateModified`, `ready`).

**Por qué**:
- El dueño y su abogado editan Markdown, no TSX.
- Las preguntas tienen un solo origen, así que las dos páginas y los datos estructurados no se separan.
- `ready: false` deja fuera un artículo (FR-012).

**Alternativa evaluada**: un CMS. Es innecesario y rompe el Principio V.

## R4. Las capturas de la app: dibujadas como en el mock

**Decisión**: el mock dibuja las pantallas de la app con el sistema visual (decisión 5): receta, tomas, aviso, crecimiento, familia, cartilla y la de computadora. Se construyen igual, como componentes HTML/CSS con `role="img"` y un `aria-label` descriptivo (decisión 4: todo lo que dicen también está en texto).

- La imagen principal (LCP) es esa captura dibujada con ancho y alto fijos (296×576), así que no hay imagen que precargar. Lo que se precarga es la fuente.
- Cambiarlas por capturas reales queda como mejora sin tocar el diseño (lo dice el mock).

**Por qué**:
- No bloquea en contenido del dueño.
- El HTML pesa menos que una imagen AVIF de 296×576.
- No aparecen datos reales de ningún niño.

**Consecuencia**: el «Contenido pendiente» de la spec ya no incluye las capturas. Va como desviación 1 en `referencia/desviaciones.md`: el mock propone precargar `hero-390.avif`.

## R5. Imágenes para compartir (Open Graph 1200×630)

**Decisión**: el mock trae dos diseños: el inicio y una plantilla con título editable.
- Se construyen como dos páginas internas del sitio (`/__og/inicio` y `/__og/[slug]`), que no se publican.
- Un script con Playwright (ya es dependencia del proyecto) las fotografía a 1200×630 y escribe `site/public/og/*.png`.
- El script se corre a mano cuando cambia un título y los PNG se guardan en el repositorio.

**Por qué**: las imágenes salen idénticas al mock y nadie tiene que exportarlas a mano. Además no hace falta ningún servicio de imágenes al vuelo.

## R6. Analítica sin cookies

**Decisión**: se usan las **estadísticas de tráfico de Cloudflare a nivel de dominio**, que se calculan en el servidor con las peticiones que ya pasan por Cloudflare (DNS proxied).
- No hay script ni cookies.
- No sale ninguna petición del navegador a terceros (SC-006).
- Es el «mismo proveedor que publica el sitio» de FR-021.
- Se declara en el aviso de privacidad («estadísticas de visitas agregadas, sin cookies ni identificar a nadie»).

**Alternativas evaluadas**:
- **Cloudflare Web Analytics**: inserta un script de `static.cloudflareinsights.com`, una petición a un tercero que rompería SC-006 y obligaría a abrir el CSP.
- **Plausible o Umami alojados**: un servicio más que mantener.

## R7. Dónde se publica y cómo conviven sitio y app

**Decisión**:
- **Publicación del sitio**: un **proyecto nuevo de Cloudflare Pages** (`peditrack-site`) que compila `site/` (`npm ci && npm run build`, salida `site/dist`). Su vista previa de `develop` tiene `noindex` y es donde se revisa. `pedi-track.com` y `www.pedi-track.com` se le asignan **el día del lanzamiento**, que es un paso del dueño en `DEPLOY.md`.
- **La app**: pasa a `app.pedi-track.com`, como dominio extra del proyecto de Pages que ya existe.
- **Redirecciones**: el `_redirects` del sitio manda las rutas que eran de la app (la lista sale de `frontend/src/App.tsx`, p. ej. `/familia/invitacion`, `/hijo`, `/planes/regreso`, `/children/*`) a `https://app.pedi-track.com/:splat` con **301**. El navegador conserva el `#` en una redirección sin fragmento, así que las ligas con ficha en el fragmento (invitación, teléfono del hijo) siguen funcionando.
- **Choque de `/planes`**: el sitio tiene `/planes` y la app también. La página de la app se queda en `app.pedi-track.com/planes` y el sitio no la redirige. Mercado Pago regresa a `/planes/regreso`, que sí se redirige.

La lista de lo que en la app conoce su dirección está en R8.

## R8. Lo que cambia en la app al mudarse

**Hallazgo** (inventario de `Explore`, 2026-11-24): **la app no tiene su dirección escrita en el código.** Todo sale de variables de entorno o de `window.location.origin`.

En el backend:
- `FRONTEND_ORIGIN` (`backend/cmd/api/main.go:263`) define el CORS (`internal/server/router.go:125`, un solo origen), el `back_url` de Mercado Pago (`internal/payments/config.go:94`, origen + `/planes/regreso`), la página de pago de prueba (`fake.go:53`), la liga de los correos de invitación (`internal/family/emailcontent.go:65`, origen + `/familia/invitacion#<ficha>`) y el logo de ese correo (`:27`).
- `CLERK_AUTHORIZED_PARTIES` (`main.go:324`) rechaza sesiones de otro origen.

En el frontend:
- Las ligas del teléfono del hijo y de invitación usan `window.location.origin` (`childDevice/parent/parentApi.ts:99`, `family/InviteLink.tsx:28`).
- El service worker abre `self.location.origin` (`sw.ts:82,94`) y los avisos llevan rutas relativas (`reminders/notification.ts:142`).
- El manifiesto usa rutas relativas (`/home`, `scope: "/"`).
- El CSP (`public/_headers:6`) ya permite `https://*.pedi-track.com`.

**Decisión**: **no se cambia código de la app.** La app **nunca ha estado publicada en producción** (solo DEV en `dev.pedi-track.com`), así que no hay que mudar a usuarios. El día del lanzamiento la app de producción **nace** en `app.pedi-track.com`. Las sesiones, las PWA instaladas, las suscripciones push y las credenciales del teléfono del hijo son por origen y se perderían en una mudanza real, pero no aplica.

Los pasos de configuración van en `DEPLOY.md`, sección nueva «Producción: sitio en pedi-track.com y app en app.pedi-track.com»:
1. **Pages de la app**: dominio `app.pedi-track.com`.
2. **Railway (API de producción)**:
   - `FRONTEND_ORIGIN=https://app.pedi-track.com`;
   - `CLERK_AUTHORIZED_PARTIES=https://app.pedi-track.com`;
   - `PAYMENTS_WEBHOOK_URL` con el dominio del API de producción.
3. **Clerk de producción**: dominio y redirecciones permitidas en `app.pedi-track.com`, y Google OAuth con ese origen.
4. **Mercado Pago**: el webhook de producción.
5. **Better Stack**: vigilar `pedi-track.com/` (el sitio) y `app.pedi-track.com/`.
6. **DNS**: `app` y la raíz/`www` (sitio), los dos proxied.

DEV no cambia: la app sigue en `dev.pedi-track.com` y el sitio se revisa en su vista previa de Pages.

**Redirecciones de seguridad**: aunque no hay ligas viejas en producción, el `_redirects` del sitio manda las rutas de la app a `app.pedi-track.com` (contrato `rutas.md`). Esto cubre un `FRONTEND_ORIGIN` mal puesto o una liga escrita a mano. Son unas 30 líneas generadas a partir de `frontend/src/App.tsx`, con su prueba.

**Detalles**:
- La app carga Figtree de Google Fonts (`frontend/src/index.css:1`); el sitio no, porque la sirve él mismo (R9).
- `BACKLOG.md:296-320` ya tenía pendiente «producción en `app.pedi-track.com`»; se actualiza para apuntar a esta spec.

## R9. Sistema visual compartido sin compartir código de pantallas

**Decisión**: el sitio **copia** los tokens del `@theme` de `frontend/src/index.css` a `site/src/theme.css`. Una prueba del sitio compara los dos bloques y falla si difieren en un token que ambos usan. El sitio también copia el logo y la fuente Figtree (WOFF2 variable, servida desde el propio sitio, `font-display: swap`).

Los precios se comprueban contra `frontend/src/features/plans/planCopy.ts` con una prueba que importa ese archivo: si cambia el precio en la app y no en el sitio, la prueba falla. Esto cumple el caso límite «Precio cambiado».

**Alternativa evaluada**: un paquete compartido (workspace). Es más correcto a largo plazo, pero obliga a reestructurar `frontend/` y su CI. Queda en el BACKLOG si los tokens empiezan a cambiar seguido.

## R10. Bloqueo de publicación en producción

**Decisión**: `npm run build` con `SITE_ENV=production` corre una revisión que **falla y nombra lo que falta** si:
- queda algún `[` … `]` de relleno en el HTML generado;
- `legal/estado.json` no tiene `"reviewedByLawyer": true`;
- falta el correo de contacto en `site/content/site.json`.

Las redes sociales son **opcionales**: sin URL no se dibujan sus enlaces ni van en `sameAs`. Es la desviación 2, porque el mock las dibuja sin dirección. Los artículos con `ready: false` no se publican.

En la vista previa (`SITE_ENV` distinto) todo se publica con la nota «Borrador para revisión legal» y con `noindex` en todas las páginas.

## R11. Pruebas

- **Unitarias (Vitest, > 90 %)**:
  - componentes;
  - `seo.ts`: largo del title ≤ 60 y de la description ≤ 155, un solo H1, JSON-LD válido;
  - el prerender;
  - el generador de `sitemap.xml`, `robots.txt` y `_redirects`;
  - la revisión de producción;
  - la prueba de redacción (frases prohibidas por el Principio I: «diagnostica», «previene», «detecta», «controla tu salud», «garantiza», dosis…);
  - enlaces internos: cada `href="/…"` del HTML generado existe;
  - tokens y precios contra el frontend.
- **E2E (Playwright, contra `vite preview` de `site/dist`)**:
  - cada página a 390 y 1440 px, y el inicio también a 768 px, en Chromium y WebKit;
  - el menú del teléfono, con y sin JavaScript;
  - la 404;
  - las anclas;
  - accesibilidad con `@axe-core/playwright` (contraste incluido).
- **CI**: un trabajo nuevo `Site — unit + coverage + E2E` en `.github/workflows/ci.yml`, que no depende del backend.
- **Manual (quickstart)**: Lighthouse en el teléfono emulado para SC-002/SC-003 y la herramienta de resultados enriquecidos de Google para SC-004.
