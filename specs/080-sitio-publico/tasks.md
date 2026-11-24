---
description: "Tareas de la spec 080: el sitio público de PediTrack"
---

# Tareas: Sitio público de PediTrack (pedi-track.com)

**Entrada**: `specs/080-sitio-publico/` (spec, plan, research R1–R11, data-model, contracts/rutas.md y contenido.md, quickstart, referencia/ con los 4 mocks).

**Pruebas**: obligatorias (Principio VI):
- **Vitest**: más de 90 % de cobertura en `site/`.
- **Playwright**: cada página a 390 y 1440 px, y el inicio también a 768; en Chromium y WebKit.

**Mocks**: cada página se construye **tal cual su artboard** de `referencia/`. Antes de marcar una historia como hecha:
- se mide el mock;
- se pone la página al ancho del mock y se compara sección por sección;
- lo que difiera se anota en `referencia/desviaciones.md`.

Teléfono y web son diseños separados: se dibuja uno u otro según el ancho, nunca se mezclan.

## Formato: `[ID] [P?] [Historia] Descripción`

## Fase 1: Configuración

- [X] T001 Crear `site/` con `package.json`, igual que `frontend/`:
  - **versiones**: React 19, Vite 8, TypeScript ~6.0, Tailwind v4 con `@tailwindcss/vite`, Vitest 5, Playwright 1.63, oxlint y eslint;
  - **dependencias nuevas**: `marked`, `@fontsource-variable/figtree` y `@axe-core/playwright`;
  - **scripts**: `dev` (puerto 5174), `build` (`tsc -b && vite build && tsx scripts/prerender.ts && tsx scripts/seo-files.ts`, más `production-check` si `SITE_ENV=production`), `preview`, `test` y `og`;
  - **configuración**: `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts` (cobertura v8, umbral 90 %) y `playwright.config.ts` (contra `vite preview --port 4173`; proyectos chromium y webkit; `timezoneId` `America/Mexico_City`).
- [X] T002 [P] `site/src/theme.css`:
  - copiar el bloque `@theme` de `frontend/src/index.css` (los tokens de color, radios y fuente);
  - `@font-face` de Figtree variable desde `/fonts/figtree-var.woff2` con `font-display: swap`;
  - copiar `figtree-var.woff2` (latin y latin-ext) a `site/public/fonts/`;
  - `favicon.svg`, `icon-192.png` e `icon-512.png` desde `frontend/public/`.
- [X] T003 [P] Contenido base:
  - `site/content/site.json`, con el formato de `contracts/contenido.md`: `contactEmail` y `privacyEmail` vacíos, `social` vacío y `appOrigin` `https://app.pedi-track.com`;
  - en la vista previa, `appOrigin` se toma de `SITE_APP_ORIGIN`, p. ej. `https://dev.pedi-track.com`;
  - mover al repositorio `legal/privacidad-y-seguridad.md`, `legal/aviso-de-privacidad.md` y `legal/terminos-y-condiciones.md` (hoy sin seguimiento);
  - crear `legal/estado.json` `{ "reviewedByLawyer": false, "date": null }`.
- [X] T004 [P] Trabajo `site` en `.github/workflows/ci.yml`, sin backend ni base:
  - `npm ci`, `tsc --noEmit`, lint y `vitest run --coverage`, que bloquea bajo 90 %;
  - `npm run build`;
  - instalar Chromium y WebKit;
  - `npx playwright test`.

## Fase 2: Fundamental (bloquea todas las historias)

- [X] T005 `site/src/pages.ts`: el tipo `Página` de data-model.md y la lista de rutas de `contracts/rutas.md`, con title, description, H1, schema, index, ogImage y migas **copiados textualmente de la tabla de SEO** de `referencia/Sitio publico - Decisiones y SEO PediTrack.dc.html`. Prueba `pages.test.ts`:
  - title ≤ 60;
  - description ≤ 155;
  - rutas únicas, en minúsculas y sin barra final;
  - solo la 404 con `index: false`.
- [X] T006 `site/src/seo.tsx`: el `<head>` de cada página:
  - `lang="es-MX"`, title, description, canonical (menos en la 404);
  - `hreflang` es-MX;
  - Open Graph (`og:type`, `og:locale` `es_MX`, title, description, url, image 1200×630 con alt) y `twitter:card` `summary_large_image`;
  - `robots` `noindex` en la 404 y en todas las páginas cuando `SITE_ENV` ≠ `production`;
  - precarga de la fuente;
  - JSON-LD: `Organization` y `WebSite` en `/`, `SoftwareApplication` con ofertas MX$0 y MX$499 `P1Y` en `/` y `/planes`, `BreadcrumbList` en las interiores, `WebPage`, `CollectionPage`, `FAQPage` y `Article`, como en el mock;
  - `sameAs` solo con redes configuradas.

  Prueba `seo.test.tsx`: JSON-LD parseable, canonical correcta y `noindex` en la vista previa.
- [X] T007 Layout en `site/src/layout/`, tal cual el mock:
  - `Header`:
    - en la web: logo, menú completo con `aria-current` y subrayado en la página actual, «Iniciar sesión» con borde y «Crear cuenta gratis» sólido;
    - en tableta: «Iniciar sesión» y el botón de menú de 48 px;
    - en el teléfono: el botón de menú.
  - `MobileMenu`, con el diseño de «Menú teléfono»: el panel está en el HTML con `id="menu"` y el botón es un `<a href="#menu">`.
  - `Footer`: enlaces, el aviso fijo «PediTrack es una herramienta de registro y recordatorio; no sustituye la consulta ni el criterio de tu médico», los enlaces legales y las redes solo si están configuradas.
  - `Breadcrumbs`, con `aria-current`.
  - `Layout`, que elige el diseño de teléfono, tableta o web por ancho con clases de un solo corte por diseño (sin mezclar los dos).
  - Botones hacia la app con `appOrigin`: `/signup`, `/login` y `/planes` (contracts/rutas.md).

  Pruebas de cada componente.
- [X] T008 `site/src/menu.ts`, el único JS del navegador, de 3 KB o menos (R2):
  - convierte el enlace en botón con `aria-expanded` y `aria-controls`;
  - abre el panel como diálogo y retiene el foco;
  - lo cierra con Escape, con su botón o al tocar un enlace, y devuelve el foco al botón;
  - respeta `prefers-reduced-motion`.

  Prueba con jsdom.
- [X] T009 `site/scripts/prerender.ts`:
  - por cada página de `pages.ts`, `renderToStaticMarkup` del `Layout` y el componente;
  - escribe `dist/<ruta>.html` (y `dist/404.html`), con el CSS de Vite enlazado y `menu.js` con `defer`;
  - el blog solo con artículos `ready: true`.

  Prueba con un `pages` de muestra.
- [X] T010 `site/scripts/seo-files.ts`, con su prueba:
  - `robots.txt`: `Allow: /`, sin el `Disallow: /app/` del mock (desviación: la app vive en otro dominio) y `Sitemap:`;
  - `sitemap.xml`: solo las páginas indexables, sin la 404 ni `/blog` vacío;
  - `_redirects`:
    - las variantes con la primera letra en mayúscula a la canónica, con 301 (`www` es regla de la zona y la barra final la resuelve Pages);
    - cada ruta de la app de `contracts/rutas.md` a `https://app.pedi-track.com/:splat`, con 301;
  - `_headers`:
    - CSP estricta: `default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `img-src 'self' data:`, `font-src 'self'`, `frame-ancestors 'none'`;
    - nosniff, Referrer-Policy, Permissions-Policy, COOP, HSTS y caché larga para `/assets/*` y `/fonts/*`.
- [X] T011 [P] `site/src/redirects.test.ts`:
  - lee las rutas de `frontend/src/App.tsx`;
  - falla si una ruta de la app, salvo `/` y `/planes`, no se redirige o si choca con una página del sitio.
- [X] T012 [P] `site/src/sync.test.ts`, que compara el sitio con el frontend (R9):
  - los tokens del `@theme` que usa el sitio son iguales a los de `frontend/src/index.css`;
  - `content/plans.ts` coincide con `frontend/src/features/plans/planCopy.ts` (`PLAN_PRICE` MX$499, `PLAN_PERIOD` «al año», lo incluido).
- [X] T013 [P] `site/src/wording.test.ts`, prueba de redacción sobre todo el HTML generado y `content/` (FR-010):
  - frases prohibidas: «diagnostica», «diagnóstico», «previene», «detecta», «controla tu salud», «garantiza», «dosis recomendada», «cura», «tratamiento ideal»…;
  - prohíbe también cualquier `[` … `]` cuando `SITE_ENV=production`.
- [X] T014 [P] Componentes de UI compartidos en `site/src/ui/`, con las medidas del mock y sus pruebas:
  - `Logo`;
  - `Button`, sólido y con borde, de 44 px o más;
  - `Card`;
  - `SectionHeading`;
  - `PhoneFrame` (marco de teléfono de 296×576);
  - `PlanTable`: tabla real con `role="table"` y encabezados; «Incluido» y «No incluido» con icono y texto (decisión 13).

**Punto de control**: `npm run build` produce un sitio vacío pero válido (encabezado, pie, SEO, archivos), y CI pasa.

## Fase 3: Historia 1, el inicio (P1) 🎯 MVP

**Objetivo**: `pedi-track.com/` igual al mock en teléfono, tableta y web.
**Prueba independiente**: compararlo con «Sitio publico - Inicio» a 390, 768 y 1440; tocar «Crear cuenta gratis»; usar `curl` sin JavaScript.

- [X] T015 [P] [US1] Capturas dibujadas de la app en `site/src/ui/screens/`, con `role="img"` y un `aria-label` descriptivo (R4):
  - receta, tomas, aviso, crecimiento, familia y cartilla, y la de computadora;
  - las del mock, con sus textos de ejemplo («Amoxicilina · 08:00 · Mateo · marcada por Ana, 08:05»…).
- [X] T016 [US1] `site/src/pages/Home.tsx`: las 8 secciones del mock en su orden, con H1, H2 y H3 textuales:
  - el hero, con el botón sólido «Crear cuenta gratis»; en el teléfono la captura va debajo del texto;
  - «Cómo funciona PediTrack: de la receta al recordatorio»;
  - «Todo lo que PediTrack guarda…», 4 tarjetas con «Ver el detalle» hacia las anclas de `/funciones`;
  - Familia;
  - Planes;
  - Privacidad: 4 tarjetas y «Leer privacidad y seguridad →»;
  - las 6 preguntas con `home: true` como `<details>` y «Ver todas»;
  - el cierre.

  Las tres variantes (390, 768 y 1440) tal cual sus artboards.
- [X] T017 [US1] Pruebas unitarias de `Home`:
  - hay un solo H1;
  - las palabras clave están en sus encabezados (tabla «Palabras clave y dónde van»);
  - los enlaces van a la app y a las anclas.
- [X] T018 [US1] E2E `site/e2e/inicio.spec.ts`:
  - a 390, 768 y 1440, en Chromium y WebKit;
  - secciones y textos;
  - el menú del teléfono: abrir, Escape, retener el foco y funcionar sin JavaScript (`javaScriptEnabled: false`);
  - «Crear cuenta gratis» lleva a `<appOrigin>/signup`;
  - axe sin violaciones;
  - ninguna petición fuera de `localhost`.
- [X] T019 [US1] Comparar con el mock a 390, 768 y 1440 (capturas en el scratchpad, no en el repo) y anotar las diferencias en `specs/080-sitio-publico/referencia/desviaciones.md`. Ya se conocen dos:
  - **desviación 1**: la captura del hero va dibujada y no se precarga una AVIF;
  - **desviación 2**: las redes se ocultan si no hay URL.

**Punto de control**: la portada sola ya es publicable en la vista previa (MVP).

## Fase 4: Historia 2, funciones, planes y preguntas (P2)

- [X] T020 [P] [US2] `site/src/pages/Funciones.tsx`, mock «Fu»:
  - los cuatro grupos (Consultas y medicamentos, Cada hijo, Toda la familia, Siempre contigo), con anclas `#consultas`, `#recordatorios`, `#vacunacion`, `#crecimiento` y `#familia`;
  - la etiqueta «Plan gratis» o «Plan completo» en cada tarjeta;
  - la aclaración de crecimiento: las medidas son gratis y la gráfica no;
  - los H3 de las palabras clave.
- [X] T021 [P] [US2] `site/content/plans.ts` y `site/src/pages/Planes.tsx`, mock «Pl»:
  - Gratis MX$0 y Plan completo MX$499 al año;
  - `PlanTable`;
  - «Elegir Plan completo», con borde, hacia `<appOrigin>/planes`;
  - JSON-LD `SoftwareApplication` con ofertas.
- [X] T022 [P] [US2] `site/content/faq.ts` y `site/src/pages/Faq.tsx`, mock «Fq»:
  - las 15 preguntas en 5 temas, **con el texto del mock**, como `<details>` y la primera abierta;
  - `FAQPage` solo en esta página;
  - confirmar en la app las rutas de «Descargar mis datos» y «Eliminar mi cuenta» (Mi cuenta → `/cuenta`) y nombrarlas en las respuestas.
- [X] T023 [US2] Pruebas unitarias de las tres páginas y E2E `site/e2e/funciones-planes-faq.spec.ts`:
  - a 390 y 1440, en Chromium y WebKit;
  - anclas, acordeones y precio;
  - axe.
- [X] T024 [US2] Comparar las tres páginas con sus mocks y anotarlo en `desviaciones.md`.

## Fase 5: Historia 3, privacidad y legal (P2)

- [X] T025 [US3] `site/src/content/legal.ts`:
  - lee `legal/*.md` con `marked`;
  - quita el título y el bloque `>` de borrador;
  - una sección por `##`, con su ancla;
  - el índice «Contenido» sale de esas secciones.

  Prueba con un Markdown de muestra.
- [X] T026 [US3] `site/src/pages/Legal.tsx`, la plantilla «Lg» de «Sitio publico - Legal»:
  - migas, H1, «Última actualización»;
  - en la web el índice «Contenido» con enlaces a cada sección;
  - la nota «Borrador para revisión legal…» solo fuera de producción;
  - una página por documento: `/privacidad`, `/aviso-de-privacidad` y `/terminos`.
- [X] T027 [US3] Actualizar los textos de `legal/`:
  - la analítica: «estadísticas de visitas agregadas que calcula Cloudflare en su servidor, sin cookies ni identificarte»;
  - la app en `app.pedi-track.com` y el sitio en `pedi-track.com`;
  - quitar los enlaces Markdown a archivos `.md` y apuntarlos a `/aviso-de-privacidad`.
- [X] T028 [US3] E2E `site/e2e/legal.spec.ts`:
  - el menú y el pie llevan a cada documento;
  - el índice salta a la sección;
  - a 390 y 1440;
  - axe.

## Fase 6: Historia 4, instalar la app (P3)

- [X] T029 [US4] `site/src/pages/Instalar.tsx`, mock «In»:
  - iPhone (Safari) y Android (Chrome), cuatro pasos cada uno en `<ol>`;
  - el elemento a tocar resaltado con borde;
  - las mismas palabras que `frontend/src/features/firstUse/SafariInstallSteps.tsx`.

  Prueba unitaria y E2E a 390 y 1440.

## Fase 7: Historia 5, el blog (P3)

- [X] T030 [US5] `site/src/content/blog.ts`:
  - lee `site/content/blog/*.md` (encabezado YAML, `ready`, fechas `AAAA-MM-DD` con `dateModified ≥ datePublished`, title ≤ 60, description ≤ 155);
  - si el formato está mal, detiene la compilación con el archivo y la línea.

  Pruebas.
- [X] T031 [US5] `site/src/pages/Blog.tsx` (mock «Bl») y `site/src/pages/Article.tsx` (mock «Ar»):
  - migas;
  - fecha real;
  - el aviso fijo «Esta guía es de organización; no es un consejo médico»;
  - enlaces a funciones y planes;
  - JSON-LD `Article` y `CollectionPage`;
  - sin artículos listos, ni `/blog` ni enlaces «Blog» en el menú y el pie.
- [X] T032 [US5] Borradores de los 3 artículos con `ready: false`, guías de organización sin ningún consejo médico (Principio I), con los slugs y títulos de la tabla de SEO:
  - `site/content/blog/organizar-recetas-hijos.md`;
  - `no-olvidar-tomas-antibiotico.md`;
  - `que-llevar-consulta-pediatra.md`.

  Los revisa y publica el dueño.
- [X] T033 [US5] Pruebas:
  - E2E del blog con un artículo de muestra `ready: true`, solo en las pruebas;
  - unitaria «sin artículos listos no hay blog».

## Fase 8: Historia 6, la 404 (P3)

- [X] T034 [US6] `site/src/pages/NotFound.tsx`, mock «E4»:
  - «No encontramos esta página» con sus cinco destinos;
  - se escribe como `dist/404.html` con `noindex` y sin canonical.

  E2E: `/no-existe` responde 404 con esa página.

## Fase 9: Pulido

- [X] T035 [P] Imágenes para compartir (R5):
  - `site/src/pages/Og.tsx`, con el diseño de inicio (fondo tinta) y la plantilla (fondo celeste con título) del mock;
  - `site/scripts/og.ts` las fotografía a 1200×630 con Playwright en `site/public/og/`: `inicio.png` y una por página o artículo;
  - se guardan en el repositorio.
- [X] T036 `site/scripts/production-check.ts` (R10): con `SITE_ENV=production` falla, nombrando cada pendiente, si:
  - quedan corchetes en `dist`;
  - falta `contactEmail` o `privacyEmail`;
  - `legal/estado.json` no dice `reviewedByLawyer: true`.

  Prueba de cada caso.
- [X] T037 Enlaces internos: prueba `site/src/links.test.ts` sobre `dist` que exige que cada `href="/…"` y cada `#ancla` exista.
- [X] T038 Lighthouse en modo móvil sobre `vite preview` de las 8 páginas principales:
  - 95 o más en Accesibilidad, Buenas prácticas y SEO;
  - Rendimiento en verde.

  Anotar los resultados en `specs/080-sitio-publico/quickstart.md`.
- [X] T039 Documentación:
  - `DEPLOY.md`, sección nueva «Sitio público y producción» con los pasos de R8:
    - el proyecto de Pages `peditrack-site` (root `site`, `npm run build`, salida `dist`, `SITE_ENV`, `SITE_APP_ORIGIN`);
    - `app.pedi-track.com` en el proyecto de la app;
    - en Railway, `FRONTEND_ORIGIN` y `CLERK_AUTHORIZED_PARTIES`;
    - Clerk y Google OAuth;
    - Mercado Pago;
    - Better Stack;
    - DNS de la raíz, `www` y `app`;
    - la analítica de Cloudflare;
    - Search Console y el `sitemap.xml`.
  - `BACKLOG.md`: el pendiente de producción en `app.pedi-track.com` pasa a apuntar a la spec 080; agregar «capturas reales en el sitio» y «paquete compartido de tokens».
  - `CLAUDE.md`: la línea de la spec 080 y `site/` en «Where things live».
  - `site/CLAUDE.md` nuevo con el mapa del proyecto y cómo agregar una página o un artículo.
- [X] T040 Suites completas:
  - `cd site && npx vitest run --coverage` (más de 90 %), `npx tsc --noEmit`, lint;
  - `npm run build && npx playwright test` en Chromium y WebKit;
  - `SITE_ENV=production npm run build` falla con la lista de pendientes esperada.

## Dependencias

- La Fase 1 bloquea la 2, y la Fase 2 bloquea todas las historias.
- US1 (Fase 3) es el MVP.
- US2 a US6 son independientes entre sí y pueden ir en cualquier orden tras la Fase 2. Usan `PlanTable`, `Card` y el layout de la Fase 2.
- La Fase 9 va al final: T035 necesita todas las páginas y T037–T040 necesitan el sitio completo.

## Ejecución en paralelo

- **Fase 1**: T002, T003 y T004 juntas.
- **Fase 2**: T011, T012, T013 y T014 en paralelo, tras T005–T010.
- **US1**: T015 en paralelo con la estructura de T016.
- **US2**: T020, T021 y T022 son archivos distintos y van en paralelo.
- **Entre historias**: con la Fase 2 lista, US2, US3, US4, US5 y US6 en paralelo.

## Estrategia

1. **MVP**: Fases 1–3. La portada se publica en la vista previa de Pages y se revisa con el dueño.
2. **Incrementos**: US2 y US3 (P2), luego US4, US5 y US6 (P3).
3. **Pulido**: Fase 9. Lanzar en producción (mover `pedi-track.com` y crear `app.pedi-track.com`) es un paso del dueño con `DEPLOY.md`, después de que el abogado revise y estén los correos.
