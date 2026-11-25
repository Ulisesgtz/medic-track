import { builtPages, hasBlog, siteContext } from './build.ts'
import { renderPage } from './render.tsx'

/** La página de una ruta para el servidor de desarrollo (con los archivos sin compilar), o `undefined` si no existe. */
export function renderForDev(path: string): string | undefined {
  const clean = path.replace(/\/+$/, '') || '/'
  const page = builtPages().find((candidate) => candidate.path === clean)
  if (!page) return undefined
  return renderPage(page, { site: siteContext(process.env, hasBlog()), assets: { styles: ['/src/styles.css'], scripts: ['/src/menu.ts'] }, article: page.article })
}
