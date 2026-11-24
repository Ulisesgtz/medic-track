# Quickstart: validar el sitio público (spec 080)

## Requisitos

- Node 22 (el mismo del frontend). No hace falta backend, base ni Clerk.
- Los mocks en `specs/080-sitio-publico/referencia/`.

## Levantar y compilar

```powershell
cd site; npm ci; npm run dev
```

```powershell
cd site; npm run build; npx vite preview --port 4173
```

- `npm run dev` sirve el sitio en `http://localhost:5174` para trabajar.
- `npm run build` genera `site/dist` (una carpeta por página, `robots.txt`, `sitemap.xml`, `_redirects` y `_headers`).
- `vite preview` sirve justo lo que se publica.

## Escenarios

1. **HTML ya armado (FR-013)**: `curl http://localhost:4173/funciones` trae el title, la meta description, el único `<h1>` y los textos de la página. Mismo resultado con el JavaScript apagado en el navegador.
2. **Igual al mock (SC-001)**:
   - poner cada página a 390 y 1440 px junto a su artboard del canvas, y el inicio también a 768;
   - comparar sección por sección;
   - anotar lo que difiera en `referencia/desviaciones.md`.
3. **Menú del teléfono (Historia 1, escenario 5)**:
   - a 390 px el botón abre el menú;
   - Escape lo cierra y el foco vuelve al botón;
   - sin JavaScript, el enlace lleva a la lista de páginas.
4. **A la app (FR-006)**: «Crear cuenta gratis» abre `<appOrigin>/signup` e «Iniciar sesión» abre `<appOrigin>/login`.
5. **404 (FR-017)**: `curl -i http://localhost:4173/no-existe` → `404`, la página «No encontramos esta página» y `noindex`. En Cloudflare Pages también se revisan `/Planes/` → 301 a `/planes` y `/familia/invitacion` → 301 a `app.pedi-track.com/familia/invitacion`.
6. **SEO (FR-014–FR-018)**:
   - `npm test` corre `seo.test.ts`, que revisa largos, un solo H1, JSON-LD válido y que el `sitemap.xml` liste solo las páginas indexables;
   - a mano, pegar el HTML del inicio, de `/planes`, de `/preguntas-frecuentes` y de un artículo en la herramienta de resultados enriquecidos de Google.
7. **Velocidad y accesibilidad (SC-002/SC-003)**: Lighthouse en Chrome (modo móvil) sobre `vite preview` debe dar 95 o más en Accesibilidad, Buenas prácticas y SEO, y Rendimiento en verde. Las E2E corren axe en cada página.
8. **Sin terceros (SC-006)**: en la pestaña Red, al cargar cualquier página solo hay peticiones a `localhost`.
9. **Publicación en producción (R10)**: `SITE_ENV=production npm run build` falla mientras haya corchetes, falte el correo de contacto o `legal/estado.json` no diga `reviewedByLawyer: true`, y nombra cada pendiente.

## Pruebas

```powershell
cd site; npx vitest run --coverage
```

```powershell
cd site; npm run build; npx playwright test
```

## Después de publicar (pasos del dueño, `DEPLOY.md`)

1. Crear el proyecto de Pages del sitio y revisar su vista previa.
2. Agregar `app.pedi-track.com` a la app y cambiar las variables de entorno y los paneles de R8.
3. Mover `pedi-track.com` y `www` al sitio.
4. Dar de alta el sitio en Search Console y mandar el `sitemap.xml`.

## Resultados de Lighthouse (T038, 2026-11-24)

Lighthouse 13 en modo **móvil** (emulación de teléfono y red 4G lenta simulada) sobre `vite preview` de un build `SITE_ENV=production SITE_AUDIT=1 SITE_ORIGIN=http://localhost:4181` (la dirección canónica apunta al propio host; `SITE_AUDIT=1` omite `production-check`, ese build no se publica). Chromium de Playwright.

| Página | Rendimiento | Accesibilidad | Buenas prácticas | SEO | FCP / LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| `/` | 99 | 100 | 81 * | 100 | 1.5 s / 1.5 s | 0 | 0 ms |
| `/funciones` | 100 | 100 | 81 * | 100 | 1.4 s / 1.4 s | 0 | 0 ms |
| `/planes` | 100 | 100 | 81 * | 100 | 1.4 s / 1.4 s | 0 | 0 ms |
| `/preguntas-frecuentes` | 100 | 100 | 81 * | 100 | 1.4 s / 1.4 s | 0 | 0 ms |
| `/instalar` | 100 | 100 | 81 * | 100 | 1.4 s / 1.4 s | 0 | 0 ms |
| `/privacidad` | 100 | 100 | 81 * | 100 | 1.4 s / 1.4 s | 0 | 0 ms |
| `/aviso-de-privacidad` | 100 | 100 | 81 * | 100 | 1.4 s / 1.4 s | 0 | 0 ms |
| `/terminos` | 100 | 100 | 81 * | 100 | 1.4 s / 1.4 s | 0 | 0 ms |

\** **Buenas prácticas sale en 81 en este equipo y no es del sitio**: la única auditoría que falla es `is-on-https`, por peticiones `http://gc.kis.v2.scr.kaspersky-labs.com/…` que el antivirus de esta computadora inyecta en cada página (aparecen aunque se bloqueen). Sin esa auditoría las demás pasan; volver a medir en otro equipo o con la vista previa de Pages (HTTPS) para confirmar el 100. Por la misma razón el Rendimiento se midió con `--blocked-url-patterns="*kaspersky*"`: con el antivirus inyectando ~1 MB de scripts salía en 80-82 (LCP 3.6-3.8 s).

Hallazgo corregido: en `/planes` las dos tarjetas de plan eran `h3` justo después del `h1` (auditoría `heading-order`, Accesibilidad 98); ahora son `h2`.
