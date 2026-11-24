# Plan de Implementación: Sitio público de PediTrack

**Rama**: `feature/080-sitio-publico` | **Fecha**: 2026-11-24 | **Especificación**: [spec.md](spec.md)

**Entrada**: Especificación de la funcionalidad desde `/specs/080-sitio-publico/spec.md`

## Resumen

Construir pedi-track.com como un sitio estático aparte de la app. Cada página se arma como HTML completo al compilar, desde componentes React, y sin React en el navegador (R1). Se hace exactamente como los mocks del canvas copiados en `referencia/` (Inicio, Páginas, Legal, Decisiones y SEO), con su SEO, `robots.txt`, `sitemap.xml`, imágenes Open Graph y un menú del teléfono que funciona sin JavaScript (R2).

Se publica como un proyecto propio de Cloudflare Pages. La app de producción nacerá en `app.pedi-track.com`. Eso es solo configuración: la app no tiene su dirección en el código (R8). El sitio redirige las rutas de la app por seguridad.

Contenido:
- Las capturas de la app van **dibujadas** con el sistema visual, como en el mock (R4).
- Las 15 preguntas frecuentes vienen del mock.
- Los textos legales salen de `legal/*.md`.
- El blog se publica solo con artículos marcados como listos.
- La compilación de producción se detiene mientras falte contenido del dueño (R10).

## Contexto Técnico

**Lenguaje/Versión**: TypeScript ~6.0, Node 22 (como `frontend/`).

**Dependencias Principales**:
- React 19 y react-dom/server, solo al compilar;
- Vite 8 y `@vitejs/plugin-react`;
- Tailwind v4 con `@tailwindcss/vite`;
- `marked`, para Markdown al compilar;
- `@fontsource-variable/figtree`, la WOFF2 que se copia a `public/fonts/`;
- pruebas: Vitest 5 con coverage-v8, Testing Library, Playwright 1.63 y `@axe-core/playwright`.

**Almacenamiento**: N/A. El contenido son archivos del repositorio (data-model.md).

**Pruebas**:
- Vitest, cobertura > 90 % del código del sitio;
- Playwright contra `vite preview` de `site/dist`, en Chromium y WebKit, a 390, 768 y 1440 px.

**Plataforma Objetivo**: navegadores de teléfono y computadora. Hospedaje estático en Cloudflare Pages (`_redirects`, `_headers`, 404).

**Tipo de Proyecto**: sitio web estático, un proyecto nuevo `site/` junto a `frontend/` y `backend/`.

**Objetivos de Rendimiento**:
- en 4G de gama media: LCP < 2.5 s, CLS < 0.1, INP < 200 ms;
- Lighthouse ≥ 95 en Accesibilidad, Buenas prácticas y SEO;
- JS del navegador ≤ 3 KB comprimido;
- CSS de cada página ≤ 30 KB comprimido.

**Restricciones**:
- ninguna petición a terceros al cargar;
- sin cookies;
- contraste 4.5:1;
- `es-MX`;
- sin consejos médicos (Principio I);
- la compilación de producción falla con contenido pendiente.

**Escala/Alcance**: unas 11 páginas más los artículos del blog (3 de inicio), con 2 diseños por página (3 en el inicio).

## Verificación de la Constitución

| Principio | Cumple | Cómo |
|---|---|---|
| I. Registra, nunca interpreta | ✅ | Los textos son los del mock, que evita «detecta/previene/controla» (decisión 7). Hay prueba de redacción con frases prohibidas (FR-010). El blog son guías de organización con aviso fijo, y el pie de todas las páginas dice que no sustituye al médico. |
| II. Privacidad | ✅ | Sin anuncios, rastreadores ni cookies. La analítica es la del servidor de Cloudflare, sin script (R6). Fuentes e imágenes son propias. El aviso de privacidad se publica, y la producción exige la revisión del abogado (R10). |
| III. Stack fijo | ✅ | React + Vite + TypeScript, el stack del frontend. El sitio no es la PWA ni la sustituye; usa React para armar HTML al compilar. No se agrega framework (R1). |
| IV. Freemium disciplinado | ✅ | Los precios y lo que incluye cada plan se comprueban contra la app (R9); no se promete nada distinto. |
| V. Simplicidad | ✅ | Sin CMS, sin SSG de terceros y sin paquete compartido: un prerender propio pequeño. El cambio de la app es solo configuración. |
| VI. Pruebas | ✅ | Vitest > 90 % y Playwright de cada página a 390/1440 (más 768 en el inicio) en Chromium y WebKit, en un trabajo nuevo de CI que bloquea. |

**Volver a verificar tras el diseño**: sin violaciones; la tabla de Seguimiento de Complejidad queda vacía.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/080-sitio-publico/
├── spec.md
├── plan.md
├── research.md          # R1–R11
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── rutas.md         # páginas, redirecciones a la app, botones
│   └── contenido.md     # formato de blog, site.json, legal, faq
├── referencia/          # los 4 mocks del canvas + desviaciones.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Código Fuente (raíz del repositorio)

```text
site/
├── package.json, vite.config.ts, vitest.config.ts, playwright.config.ts, tsconfig*.json
├── index.html                   # plantilla de <head> (la llena el prerender)
├── public/
│   ├── fonts/figtree-var.woff2
│   ├── favicon.svg, icon-192.png, icon-512.png   # copiados de frontend/public
│   └── og/*.png                 # generados por scripts/og.ts (R5)
├── content/
│   ├── site.json                # correos, redes, appOrigin
│   ├── faq.ts                   # 15 preguntas (5 temas)
│   ├── plans.ts                 # Gratis y Plan completo
│   └── blog/*.md                # artículos con encabezado YAML
├── src/
│   ├── theme.css                # @theme copiado de frontend/src/index.css
│   ├── pages.ts                 # Página[]: ruta, SEO, migas, componente
│   ├── seo.tsx                  # <head>: title, description, canonical, OG, JSON-LD
│   ├── layout/                  # Header (menú web y teléfono), Footer, Breadcrumbs, Layout
│   ├── ui/                      # Logo, botones, tarjetas, PhoneFrame y capturas dibujadas
│   ├── pages/                   # Home, Funciones, Planes, Faq, Instalar, Blog, Article, Legal, NotFound, Og
│   ├── content/                 # lectura de legal/*.md y blog/*.md (marked)
│   └── menu.ts                  # único JS del navegador (R2)
├── scripts/
│   ├── prerender.ts             # escribe dist/<ruta>.html, 404.html
│   ├── seo-files.ts             # robots.txt, sitemap.xml, _redirects, _headers
│   ├── production-check.ts      # R10
│   └── og.ts                    # PNG 1200×630 con Playwright
└── e2e/*.spec.ts
legal/                           # los 3 .md ya escritos + estado.json (entran al repo)
.github/workflows/ci.yml         # trabajo nuevo «Site»
DEPLOY.md                        # sección de producción del sitio y la app (R8)
```

**Decisión de Estructura**: un proyecto `site/` hermano de `frontend/` y `backend/`, con su propio `package.json` y su trabajo de CI. No comparte código con `frontend/`: copia los tokens y el logo, y las pruebas de R9 vigilan que no se separen.

## Fases de implementación (para `/speckit-tasks`)

1. **Base**:
   - `site/` con Vite, Tailwind y los tokens;
   - el prerender, `pages.ts`, `seo.tsx` y el layout (encabezado, pie, migas, menú);
   - los archivos de SEO y redirecciones;
   - el trabajo de CI.
2. **US1, el inicio**: las 8 secciones en 390, 768 y 1440, más las capturas dibujadas.
3. **US2**: `/funciones`, `/planes` y `/preguntas-frecuentes`.
4. **US3**:
   - las páginas legales desde `legal/*.md`;
   - actualizar `legal/` para la analítica sin cookies y `app.pedi-track.com`;
   - `legal/estado.json`.
5. **US4**: `/instalar`.
6. **US5**: el blog con `ready`, el listado y el artículo; los borradores de los 3 artículos quedan con `ready: false`.
7. **US6**: la 404.
8. **Pulido**:
   - imágenes OG;
   - la revisión de producción;
   - `desviaciones.md`, comparado con el mock a 390/768/1440;
   - Lighthouse;
   - `DEPLOY.md`, `BACKLOG.md`, `CLAUDE.md` y un `site/CLAUDE.md` nuevo.

## Seguimiento de Complejidad

Sin violaciones de la constitución.
