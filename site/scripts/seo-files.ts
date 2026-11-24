import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { builtPages } from '../src/build.ts'
import { PAGES, type Page } from '../src/pages.ts'
import { absolute } from '../src/seo.tsx'
import { loadSettings, siteOrigin } from '../src/site.ts'

// robots.txt, sitemap.xml, _redirects y _headers de Cloudflare Pages (spec 080, contracts/rutas.md y R7).

export function robotsTxt(origin: string): string {
  // Sin «Disallow: /app/» (el mock lo traía): la app vive en otro dominio (app.pedi-track.com), no en una carpeta de este.
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`
}

/** Solo las páginas que se indexan: sin la 404 ni las que aún no existen (blog sin artículos listos). */
export function sitemapXml(origin: string, pages: Page[]): string {
  const urls = pages
    .filter((page) => page.index)
    .map((page) => `  <url><loc>${absolute(origin, page.path)}</loc></url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

/**
 * Las rutas que eran de la app y que el sitio manda a su dominio (contracts/rutas.md, tomadas de frontend/src/App.tsx).
 * Una entrada que termina en `/*` cubre todas sus subrutas. Ni `/` (la portada del sitio) ni `/planes` (la página del sitio).
 */
export const APP_ROUTES = [
  '/home',
  '/login',
  '/signup',
  '/registro/*',
  '/recuperar-contrasena',
  '/sso-callback',
  '/children/*',
  '/consultations/*',
  '/citas/*',
  '/suplementos/*',
  '/actividades/*',
  '/mis-suplementos',
  '/mis-suplementos/*',
  '/mis-actividades',
  '/mis-actividades/*',
  '/mi-dia',
  '/yo',
  '/yo/*',
  '/personas/*',
  '/familia',
  '/familia/*',
  '/hijo',
  '/hijo/*',
  '/botiquin',
  '/botiquin/*',
  '/cuenta',
  '/cuenta/*',
  '/planes/regreso',
  '/planes/pago-de-prueba',
]

/** La regla de una ruta de la app: misma ruta (y el resto de la dirección) en el dominio de la app, con 301. */
function appRule(route: string, appOrigin: string): string {
  const target = route.endsWith('/*') ? `${route.slice(0, -2)}/:splat` : route
  return `${route} ${appOrigin}${target} 301`
}

/** `/planes` es `/Planes`: solo la primera letra en mayúscula (Pages distingue mayúsculas y `_redirects` no puede pasar a minúsculas). */
export const capitalized = (path: string): string => path.replace(/^\/([a-z])/, (_, letter: string) => `/${letter.toUpperCase()}`)

/**
 * Las reglas de `_redirects`. Sin reglas de barra final ni de `www`: Pages sirve `<ruta>.html` en `/<ruta>` y manda `/<ruta>/` y
 * `/<ruta>.html` a `/<ruta>` por sí mismo (una regla `/ruta/ → /ruta` haría un ciclo), y `www` se redirige con una regla de la
 * zona (DEPLOY.md), porque `_redirects` solo acepta rutas.
 */
export function redirects(appOrigin: string, pages: Page[] = PAGES): string {
  const lines = [
    '# Con la primera letra en mayúscula (/Planes) a la dirección canónica; otras combinaciones: regla de la zona (DEPLOY.md).',
    ...pages.filter((page) => page.path !== '/' && page.path !== '/404').map((page) => `${capitalized(page.path)} ${page.path} 301`),
    '',
    '# Las rutas de la app viven en su propio dominio.',
    ...APP_ROUTES.map((route) => appRule(route, appOrigin)),
  ]
  return `${lines.join('\n')}\n`
}

export function headers(): string {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
  return `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Strict-Transport-Security: max-age=31536000

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable
`
}

export function main(root: string = resolve(dirname(fileURLToPath(import.meta.url)), '..'), env: Record<string, string | undefined> = process.env) {
  const dist = join(root, env.SITE_DIST?.trim() || 'dist')
  const origin = siteOrigin(env)
  const appOrigin = loadSettings(env).appOrigin
  writeFileSync(join(dist, 'robots.txt'), robotsTxt(origin))
  writeFileSync(join(dist, 'sitemap.xml'), sitemapXml(origin, builtPages()))
  writeFileSync(join(dist, '_redirects'), redirects(appOrigin, builtPages()))
  writeFileSync(join(dist, '_headers'), headers())
  console.log('seo-files: robots.txt, sitemap.xml, _redirects y _headers escritos en dist/')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
