import { builtPages, siteContext } from './build.ts'
import { PAGES, type Page } from './pages.ts'
import { renderPage } from './render.tsx'
import type { SiteContextValue } from './site.ts'

export const ASSETS = { styles: ['/assets/style-test.css'], scripts: ['/assets/index-test.js'] }

export function site(overrides: Partial<SiteContextValue> = {}, env: Record<string, string | undefined> = {}): SiteContextValue {
  return { ...siteContext(env), ...overrides }
}

/** Una página renderizada y leída como documento, para revisarla como la ve el navegador. */
export function renderDoc(page: Page, overrides: Partial<SiteContextValue> = {}, env: Record<string, string | undefined> = {}) {
  const html = renderPage(page, { site: site(overrides, env), assets: ASSETS })
  return { html, doc: new DOMParser().parseFromString(html, 'text/html') }
}

export function page(path: string): Page {
  const found = PAGES.find((candidate) => candidate.path === path)
  if (!found) throw new Error(`no hay página ${path}`)
  return found
}

/** Todas las páginas construidas, ya dibujadas. */
export function renderAll(env: Record<string, string | undefined> = {}): Array<{ page: Page; html: string }> {
  return builtPages().map((built) => ({ page: built, html: renderPage(built, { site: site({}, env), assets: ASSETS }) }))
}

/** El texto visible de un HTML (sin etiquetas, scripts ni estilos). */
export function visibleText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style').forEach((node) => node.remove())
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ')
}
