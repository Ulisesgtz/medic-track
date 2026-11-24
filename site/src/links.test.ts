import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderAll } from './test-utils.tsx'

// Los enlaces internos de todas las páginas (T037): cada `href="/…"` lleva a una página o a un archivo que existe y cada `#ancla`
// existe en la página a la que apunta. Se revisa el `dist/` ya compilado; sin él (una corrida de pruebas antes de compilar) se
// dibujan las mismas páginas en memoria. Los enlaces a la app (dirección completa) no se revisan: son de otro sitio.

const dist = resolve(process.cwd(), 'dist')
const publicDir = resolve(process.cwd(), 'public')

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return htmlFiles(path)
    return name.endsWith('.html') ? [path] : []
  })
}

/** Ruta de la página → su HTML. */
function loadPages(): Map<string, string> {
  const pages = new Map<string, string>()
  if (existsSync(join(dist, 'index.html')) && existsSync(join(dist, 'funciones.html'))) {
    for (const file of htmlFiles(dist)) {
      const path = '/' + relative(dist, file).replace(/\\/g, '/').replace(/(^|\/)index\.html$/, '').replace(/\.html$/, '')
      pages.set(path === '/' ? '/' : path.replace(/\/$/, ''), readFileSync(file, 'utf8'))
    }
  } else {
    for (const { page, html } of renderAll({ SITE_ENV: 'production' })) pages.set(page.path, html)
  }
  return pages
}

const pages = loadPages()

const hrefs = (html: string) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((match) => match[1].replace(/&amp;/g, '&'))
const ids = (html: string) => new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]))

function fileExists(path: string): boolean {
  return existsSync(join(publicDir, path)) || existsSync(join(dist, path))
}

/** Los problemas de los enlaces internos de un conjunto de páginas. */
function brokenLinks(all: Map<string, string>, exists: (path: string) => boolean = fileExists): string[] {
  const problems: string[] = []
  for (const [from, html] of all) {
    for (const href of hrefs(html)) {
      if (!href.startsWith('/') && !href.startsWith('#')) continue // otro sitio, correo, teléfono
      const [rawPath, anchor] = href.split('#')
      const path = rawPath === '' ? from : rawPath.replace(/\/+$/, '') || '/'
      const target = all.get(path)
      if (!target && !exists(path)) {
        problems.push(`${from}: ${href} no lleva a ninguna página ni archivo`)
        continue
      }
      if (anchor && (!target || !ids(target).has(anchor))) problems.push(`${from}: ${href}, la ancla no existe`)
    }
  }
  return problems
}

describe('enlaces internos', () => {
  it('hay páginas que revisar', () => {
    expect(pages.size).toBeGreaterThan(8)
    expect(pages.has('/')).toBe(true)
    expect(pages.has('/404')).toBe(true)
  })

  it('cada href="/…" y cada #ancla existe', () => {
    expect(brokenLinks(pages)).toEqual([])
  })

  it('detecta una página que no existe y una ancla que no existe', () => {
    const sample = new Map([
      ['/', '<a href="/ahi">x</a><a href="/otra#nada">y</a><a href="#arriba">z</a><a href="/otra#hay">w</a><a href="https://app.pedi-track.com/login">app</a>'],
      ['/otra', '<h2 id="hay">t</h2>'],
    ])
    expect(brokenLinks(sample, () => false)).toEqual([
      '/: /ahi no lleva a ninguna página ni archivo',
      '/: /otra#nada, la ancla no existe',
      '/: #arriba, la ancla no existe',
    ])
  })

  it('acepta archivos de public/ (favicon, tipografías)', () => {
    expect(fileExists('/favicon.svg')).toBe(true)
    expect(brokenLinks(new Map([['/', '<a href="/favicon.svg">i</a>']]))).toEqual([])
  })
})
