# PediTrack — sitio público (`site/`)

El sitio de `pedi-track.com` (spec 080, `specs/080-sitio-publico/`): inicio, funciones, planes, privacidad y seguridad, preguntas frecuentes, instalar, blog, aviso de privacidad, términos y la 404. **Es independiente de la app**: no importa código de `frontend/` ni de `backend/` (solo las pruebas de sincronía los leen). La app vive en `app.pedi-track.com` y el sitio solo enlaza a ella.

**Regla de oro: los mocks de `specs/080-sitio-publico/referencia/` mandan.** Se construye tal cual el mock (estructura, textos, orden, tamaños); lo que se desvía va a `referencia/desviaciones.md` con su motivo, para que el dueño decida. Web (≥ 1200 px, `web:`), tableta (`md:`) y teléfono se miden contra su artboard.

## Cómo funciona

- **HTML estático, sin hidratar.** `npm run build` = `tsc --noEmit` → `vite build` (solo CSS de Tailwind y el script del menú, `src/menu.ts`) → `scripts/prerender.ts` (dibuja cada página con `renderToStaticMarkup` y escribe `dist/<ruta>.html`: así Pages sirve `/<ruta>` sin mandarlo a `/<ruta>/`) → `scripts/seo-files.ts` (`robots.txt`, `sitemap.xml`, `_redirects`, `_headers`) → `scripts/production-check.ts`.
- **Vista previa vs producción**: `SITE_ENV=production` indexa; sin ella todas las páginas llevan `noindex` y la nota «Borrador para revisión legal». Con `SITE_ENV=production` el build **falla a propósito** mientras queden pendientes (correos vacíos en `content/site.json`, corchetes `[ ]` en las páginas, `legal/estado.json` sin `reviewedByLawyer: true`). `SITE_AUDIT=1` omite esa revisión (solo para medir con Lighthouse; nunca se publica).
- Variables: `SITE_ENV`, `SITE_ORIGIN` (por omisión `https://pedi-track.com`), `SITE_APP_ORIGIN` (por omisión `appOrigin` de `site.json`), `SITE_DIST`, `SITE_BLOG_DIR` (solo las E2E del blog).
- **Direcciones**: cada página es `<ruta>.html` y `_redirects` no lleva reglas de barra final (haría un ciclo en Pages) ni de `www` (Pages no admite otro dominio como origen): `www` es una **regla de la zona de Cloudflare, paso obligatorio** de `DEPLOY.md`. Sí lleva `/Planes` → `/planes` (primera letra en mayúscula). `SITE_BLOG_DIR` es relativa a `site/`.
- **Sin terceros**: CSP estricta en `_headers`, Figtree propia, analítica solo de servidor (Cloudflare, ver `DEPLOY.md`).

## Mapa

| Qué | Dónde |
|---|---|
| Tabla de páginas (ruta, title ≤ 60, descripción ≤ 155, H1, schema, imagen OG, migas) | `src/pages.ts` (copiada del mock «Decisiones y SEO») |
| Qué páginas se escriben (blog solo con artículos `ready`) | `src/build.ts` |
| `<head>`: meta, Open Graph, JSON-LD | `src/seo.tsx` |
| Documento HTML completo | `src/render.tsx` |
| Páginas (un componente por ruta) | `src/pages/` (`Home`, `Funciones`, `Planes`, `Faq`, `Instalar`, `Legal`, `Blog`, `NotFound`, `Og`) |
| Encabezado, menú, pie, migas | `src/layout/` |
| Piezas: botón, tarjeta, logo, marcos de teléfono, tabla de planes | `src/ui/` (pantallas dibujadas en `src/ui/screens/`) |
| Tokens y fuentes | `src/theme.css` (copia del `@theme` de la app), `public/fonts/` |
| Contenido editable | `content/site.json`, `content/faq.ts`, `content/features.ts`, `content/plans.ts`, `content/blog/*.md`, `../legal/*.md` + `../legal/estado.json` |
| Imágenes para compartir (1200×630) | `src/pages/Og.tsx` + `src/ogCards.ts`; `scripts/og.ts` las fotografía a `public/og/` |
| Scripts de compilación | `scripts/` (`prerender.ts`, `seo-files.ts`, `production-check.ts`, `og.ts`) |

## Cómo agregar una página

1. Una fila en `PAGES` de `src/pages.ts` con el title, la descripción, el H1, el schema, la `ogImage` (`/og/<nombre>.png`) y las migas **tal cual la tabla de SEO del mock** (o agregando su fila ahí primero), y su `component`.
2. El componente en `src/pages/` (`PageShell`, `PageIntro`, tokens de `@theme`; ningún color literal: `noColorLiterals.test.ts` lo vigila; sin lenguaje médico: `wording.test.ts`).
3. Enlázala en `src/layout/nav.ts` si va en el menú o el pie.
4. Su imagen: `npm run build && npm run og` (agrega el título en `TEMPLATE_TEXT` de `src/ogCards.ts`); `src/og.test.ts` falla si falta el PNG.
5. Pruebas: unitaria de la página, E2E en `e2e/` (teléfono 390 y web 1440, axe sin violaciones, sin desbordes) y, si cambia el sitemap, `scripts/build-scripts.test.tsx`. `src/links.test.ts` revisa que sus enlaces existan.

## Cómo agregar un artículo del blog

1. `content/blog/<slug>.md` con el front matter de `specs/080-sitio-publico/contracts/contenido.md` (`title`, `description`, `datePublished`, `dateModified`, `ready`) y `## secciones`. La plantilla agrega el aviso «no es un consejo médico».
2. `ready: false` no se publica; **`ready: true` lo publica** (y, si es el primero, enciende `/blog` y el enlace «Blog»). Sin consejos ni afirmaciones médicas (Principio I).
3. Si el slug no está en la tabla de SEO, el build usa lo que dice el archivo; su imagen es `/og/blog-<slug>.png` (`npm run og`).
4. Un error de formato detiene el build con el archivo y la línea.

## Pruebas y comandos

```bash
cd site
npx tsc --noEmit && npx eslint .          # tipos y lint
npx vitest run --coverage                 # unitarias (umbral 90 %)
npm run build                             # genera dist/
npx playwright test                       # E2E en Chromium y WebKit (levanta vite preview solo)
npm run og                                # rehace public/og/*.png (después de npm run build)
SITE_ENV=production npm run build         # falla a propósito mientras haya pendientes
npx vite preview --port 4180              # lo que se publica (config «site» de .claude/launch.json)
```

Las pruebas que guardan las reglas del sitio: `seo.test.tsx` (largos, un H1, JSON-LD), `sync.test.ts` (tokens y precios contra la app), `wording.test.ts` (Principio I), `noColorLiterals.test.ts`, `links.test.ts` (enlaces internos), `og.test.ts` (cada `og:image` existe), `scripts/production-check.test.ts`.
