import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Home } from '../src/pages/Home.tsx'
import type { Page } from '../src/pages.ts'
import { PAGES } from '../src/pages.ts'
import { ASSETS, site } from '../src/test-utils.tsx'
import { main as prerenderMain, outputPath, prerender, readAssets } from './prerender.ts'
import { APP_ROUTES, capitalized, headers, main as seoMain, redirects, robotsTxt, sitemapXml } from './seo-files.ts'

const TEMPLATE = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index-AbC123.js"></script>
<link rel="stylesheet" crossorigin href="/assets/style-XyZ789.css">
</head><body></body></html>`

const sample = (overrides: Partial<Page>): Page => ({
  path: '/muestra',
  title: 'Muestra | PediTrack',
  description: 'Una página de muestra.',
  h1: 'Muestra',
  schema: [],
  index: true,
  ogImage: '/og/muestra.png',
  breadcrumbs: [],
  ...overrides,
})

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'site-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('prerender', () => {
  it('lee de dist/index.html el CSS y el script con su huella', () => {
    expect(readAssets(TEMPLATE)).toEqual({ styles: ['/assets/style-XyZ789.css'], scripts: ['/assets/index-AbC123.js'] })
    expect(readAssets('<html></html>')).toEqual({ styles: [], scripts: [] })
    expect(readAssets('<link rel="stylesheet"><script type="module"></script>')).toEqual({ styles: [], scripts: [] })
  })

  it('la ruta de cada página: / es index.html, /404 es 404.html, las demás <ruta>.html (Pages sirve /<ruta> desde ahí)', () => {
    expect(outputPath(dir, '/')).toBe(join(dir, 'index.html'))
    expect(outputPath(dir, '/404')).toBe(join(dir, '404.html'))
    expect(outputPath(dir, '/blog/una-guia')).toBe(join(dir, 'blog', 'una-guia.html'))
  })

  it('escribe cada página como HTML completo con el CSS enlazado y el script del menú', () => {
    const pages = [sample({ path: '/', component: Home, h1: 'Inicio' }), sample({ path: '/muestra', component: () => <h1>Hola muestra</h1> }), sample({ path: '/404', index: false, component: () => <h1>Nada</h1> })]
    const files = prerender({ distDir: dir, pages, site: site({ production: true }), assets: ASSETS })
    expect(files).toEqual([join(dir, 'index.html'), join(dir, 'muestra.html'), join(dir, '404.html')])
    const muestra = readFileSync(join(dir, 'muestra.html'), 'utf8')
    expect(muestra.startsWith('<!doctype html>')).toBe(true)
    expect(muestra).toContain('<h1>Hola muestra</h1>')
    expect(muestra).toContain('<link rel="stylesheet" href="/assets/style-test.css"/>')
    expect(muestra).toContain('<script type="module" src="/assets/index-test.js"></script>')
    expect(muestra).toContain('<title>Muestra | PediTrack</title>')
    expect(readFileSync(join(dir, '404.html'), 'utf8')).toContain('noindex')
    expect(readFileSync(join(dir, 'index.html'), 'utf8')).toContain('<h1')
  })

  it('una página sin componente se dibuja vacía en vez de romper', () => {
    prerender({ distDir: dir, pages: [sample({})], site: site(), assets: ASSETS })
    expect(readFileSync(join(dir, 'muestra.html'), 'utf8')).toContain('<main id="contenido"></main>')
  })

  it('main escribe las páginas construidas a partir del dist compilado', () => {
    mkdirSync(join(dir, 'dist'))
    writeFileSync(join(dir, 'dist', 'index.html'), TEMPLATE)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const files = prerenderMain(dir, { SITE_ENV: 'production' })
    expect(files[0]).toBe(join(dir, 'dist', 'index.html'))
    expect(files).toContain(join(dir, 'dist', '404.html'))
    expect(files).toContain(join(dir, 'dist', 'preguntas-frecuentes.html'))
    expect(files.some((file) => file.includes('blog'))).toBe(false)
    const html = readFileSync(join(dir, 'dist', 'index.html'), 'utf8')
    expect(html).toContain('/assets/style-XyZ789.css')
    expect(html).toContain('index, follow')
  })

  it('main se detiene si falta el CSS compilado', () => {
    mkdirSync(join(dir, 'dist'))
    writeFileSync(join(dir, 'dist', 'index.html'), '<html></html>')
    expect(() => prerenderMain(dir, {})).toThrow(/vite build/)
  })
})

describe('seo-files', () => {
  it('robots.txt permite todo, no bloquea /app/ y apunta al sitemap', () => {
    const robots = robotsTxt('https://pedi-track.com')
    expect(robots).toContain('User-agent: *')
    expect(robots).toContain('Allow: /')
    expect(robots).not.toContain('Disallow')
    expect(robots).toContain('Sitemap: https://pedi-track.com/sitemap.xml')
  })

  it('sitemap.xml lista solo las páginas indexables', () => {
    const xml = sitemapXml('https://pedi-track.com', PAGES)
    expect(xml).toContain('<loc>https://pedi-track.com/</loc>')
    expect(xml).toContain('<loc>https://pedi-track.com/funciones</loc>')
    expect(xml).not.toContain('/404')
    expect(xml.match(/<loc>/g)).toHaveLength(PAGES.filter((page) => page.index).length)
    expect(sitemapXml('https://pedi-track.com', [])).not.toContain('<loc>')
  })

  it('_redirects: las mayúsculas a la canónica y las rutas de la app a su dominio con 301', () => {
    const rules = redirects('https://app.pedi-track.com').split('\n').filter((line) => line && !line.startsWith('#'))
    expect(rules).toContain('/Planes /planes 301')
    expect(rules).toContain('/Preguntas-frecuentes /preguntas-frecuentes 301')
    expect(rules).toContain('/Aviso-de-privacidad /aviso-de-privacidad 301')
    expect(rules).toContain('/familia/* https://app.pedi-track.com/familia/:splat 301')
    expect(rules).toContain('/children/* https://app.pedi-track.com/children/:splat 301')
    expect(rules).toContain('/signup https://app.pedi-track.com/signup 301')
    expect(rules).toContain('/planes/regreso https://app.pedi-track.com/planes/regreso 301')
    for (const rule of rules) expect(rule).toMatch(/ 301$/)
    expect(rules.find((rule) => rule.startsWith('/planes '))).toBeUndefined()
    expect(rules.find((rule) => rule.startsWith('/yo '))).toBe('/yo https://app.pedi-track.com/yo 301')
  })

  it('_redirects: nunca manda una ruta con barra final a la misma sin barra (Pages haría un ciclo) ni usa www', () => {
    const text = redirects('https://app.pedi-track.com')
    const rules = text.split('\n').filter((line) => line && !line.startsWith('#'))
    for (const rule of rules) {
      const [from, to] = rule.split(' ')
      if (from.endsWith('/')) expect(to).not.toBe(from.slice(0, -1))
      expect(from.startsWith('http')).toBe(false)
    }
    expect(text).not.toContain('www.')
    expect(rules.some((rule) => /^\S+\/ /.test(rule))).toBe(false)
  })

  it('_redirects: la forma en mayúscula de cada página del sitio, menos la portada y la 404', () => {
    const rules = redirects('https://app.pedi-track.com', [sample({ path: '/' }), sample({ path: '/blog/una-guia' }), sample({ path: '/404' })]).split('\n')
    expect(rules).toContain('/Blog/una-guia /blog/una-guia 301')
    expect(rules.filter((rule) => rule.endsWith(' /404 301') || rule.startsWith('/ '))).toEqual([])
    expect(capitalized('/planes')).toBe('/Planes')
    expect(capitalized('/')).toBe('/')
  })

  it('las rutas de la app terminadas en /* llevan su resto', () => {
    expect(APP_ROUTES.filter((route) => route.endsWith('/*')).length).toBeGreaterThan(5)
    expect(redirects('https://app.x.test', [])).toContain('/botiquin/* https://app.x.test/botiquin/:splat 301')
  })

  it('_headers: CSP estricta y las cabeceras de seguridad', () => {
    const text = headers()
    for (const piece of [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "frame-ancestors 'none'",
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy:',
      'Permissions-Policy:',
      'Cross-Origin-Opener-Policy: same-origin',
      'Strict-Transport-Security: max-age=31536000\n',
      '/assets/*',
      '/fonts/*',
      'immutable',
    ])
      expect(text).toContain(piece)
  })

  it('main escribe los cuatro archivos en dist/', () => {
    mkdirSync(join(dir, 'dist'))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    seoMain(dir, { SITE_APP_ORIGIN: 'https://dev.pedi-track.com' })
    for (const file of ['robots.txt', 'sitemap.xml', '_redirects', '_headers']) expect(existsSync(join(dir, 'dist', file))).toBe(true)
    expect(readFileSync(join(dir, 'dist', '_redirects'), 'utf8')).toContain('https://dev.pedi-track.com/login')
    expect(readFileSync(join(dir, 'dist', 'sitemap.xml'), 'utf8')).toContain('<loc>https://pedi-track.com/</loc>')
  })
})
