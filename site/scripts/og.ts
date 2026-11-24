import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ogCards } from '../src/ogCards.ts'
import { OgCard } from '../src/pages/Og.tsx'
import { readAssets } from './prerender.ts'

// Fotografía las imágenes para compartir (R5): dibuja cada una con el CSS ya compilado de `dist/` y la guarda en `public/og/` a
// 1200×630. Se corre a mano cuando cambia un título (`npm run build && npm run og`); los PNG se guardan en el repositorio.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const out = join(root, 'public', 'og')
const ORIGIN = 'http://og.local'
const TYPES: Record<string, string> = { '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.js': 'text/javascript' }

if (!existsSync(join(dist, 'index.html'))) throw new Error('No hay dist/: corre `npm run build` primero')
const assets = readAssets(readFileSync(join(dist, 'index.html'), 'utf8'))
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
// Sin servidor: cada imagen es una página en memoria y sus archivos (CSS, tipografía) se sirven desde dist/.
let html = ''
await page.route(`${ORIGIN}/**`, async (route) => {
  const path = new URL(route.request().url()).pathname
  if (path === '/') return route.fulfill({ contentType: 'text/html', body: html })
  const file = join(dist, path)
  if (!existsSync(file)) return route.fulfill({ status: 404, body: '' })
  return route.fulfill({ body: readFileSync(file), contentType: TYPES[extname(file)] ?? 'application/octet-stream' })
})

for (const card of ogCards()) {
  const links = assets.styles.map((href) => `<link rel="stylesheet" href="${ORIGIN}${href}">`).join('')
  html = `<!doctype html><html lang="es-MX"><head><meta charset="utf-8">${links}</head><body style="margin:0">${renderToStaticMarkup(createElement(OgCard, { card }))}</body></html>`
  await page.goto(`${ORIGIN}/`)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: join(out, `${card.name}.png`), clip: { x: 0, y: 0, width: 1200, height: 630 } })
  console.log(`og: ${card.name}.png`)
}
await browser.close()
