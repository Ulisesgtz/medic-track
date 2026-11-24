import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { builtPages, hasBlog, siteContext } from '../src/build.ts'
import type { Page } from '../src/pages.ts'
import { renderPage, type Assets } from '../src/render.tsx'
import type { SiteContextValue } from '../src/site.ts'

// Escribe cada página del sitio como HTML completo en dist/ (spec 080, R1). Corre después de `vite build`, que deja en
// dist/index.html el CSS y el script del menú ya con su huella: de ahí se toman los enlaces para todas las páginas.

/** Los enlaces a los archivos de Vite, leídos del HTML que compiló (la plantilla `index.html`). */
export function readAssets(templateHtml: string): Assets {
  const styles = [...templateHtml.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)].map((tag) => attr(tag[0], 'href'))
  const scripts = [...templateHtml.matchAll(/<script\b[^>]*\btype="module"[^>]*>/g)].map((tag) => attr(tag[0], 'src'))
  return { styles: styles.filter(isString), scripts: scripts.filter(isString) }
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]+)"`).exec(tag)?.[1]
}

const isString = (value: string | undefined): value is string => typeof value === 'string'

/** Dónde se escribe una ruta: `/` es `index.html`, `/404` es `404.html` y las demás `<ruta>.html` (Pages sirve `/<ruta>` desde `<ruta>.html`; con `<ruta>/index.html` mandaría `/<ruta>` a `/<ruta>/`). */
export function outputPath(distDir: string, path: string): string {
  if (path === '/') return join(distDir, 'index.html')
  if (path === '/404') return join(distDir, '404.html')
  const parts = path.split('/').filter(Boolean)
  return join(distDir, ...parts.slice(0, -1), `${parts.at(-1)}.html`)
}

export interface PrerenderOptions {
  distDir: string
  pages: Page[]
  site: SiteContextValue
  assets: Assets
}

/** Escribe las páginas y devuelve los archivos creados. */
export function prerender({ distDir, pages, site, assets }: PrerenderOptions): string[] {
  return pages.map((page) => {
    const file = outputPath(distDir, page.path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, renderPage(page, { site, assets, article: page.article }))
    return file
  })
}

export function main(root: string = resolve(dirname(fileURLToPath(import.meta.url)), '..'), env: Record<string, string | undefined> = process.env) {
  const distDir = join(root, env.SITE_DIST?.trim() || 'dist')
  const assets = readAssets(readFileSync(join(distDir, 'index.html'), 'utf8'))
  if (assets.styles.length === 0) throw new Error('dist/index.html no enlaza ninguna hoja de estilo: corre `vite build` primero')
  const files = prerender({ distDir, pages: builtPages(), site: siteContext(env, hasBlog()), assets })
  console.log(`prerender: ${files.length} página(s) escritas en dist/`)
  return files
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
