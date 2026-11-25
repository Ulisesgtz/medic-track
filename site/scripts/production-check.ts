import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Revisión de publicación (spec 080, R10). Con `SITE_ENV=production` el build falla y nombra cada pendiente: texto de relleno entre
// corchetes en las páginas (los documentos legales traen los del dueño), correos sin llenar y el documento legal sin revisión de un
// abogado. En la vista previa no corre: ahí todo se publica como borrador y con `noindex`.
// `SITE_AUDIT=1` la omite a propósito, solo para medir con Lighthouse un build que se ve como producción (nunca se publica).

type Env = Record<string, string | undefined>

export interface SiteFiles {
  /** Los HTML de `dist/`: su ruta relativa y su contenido. */
  pages: Array<{ file: string; html: string }>
  site: { contactEmail?: string; privacyEmail?: string }
  legal: { reviewedByLawyer?: boolean }
}

/** El texto que se lee en una página: sin scripts (los datos estructurados llevan corchetes de JSON), estilos ni etiquetas. */
export function visibleText(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
}

/** Cada `[...]` de relleno que quedó en el texto visible de una página. */
export function placeholders(html: string): string[] {
  return [...new Set(visibleText(html).match(/\[[^\]]+\]/g) ?? [])]
}

/** Los pendientes de publicación, uno por línea de aviso. Vacía = se puede publicar. */
export function pendingItems({ pages, site, legal }: SiteFiles): string[] {
  const pending: string[] = []
  if (!site.contactEmail?.trim()) pending.push('site/content/site.json: falta `contactEmail` (correo de contacto del sitio).')
  if (!site.privacyEmail?.trim()) pending.push('site/content/site.json: falta `privacyEmail` (correo de privacidad).')
  if (legal.reviewedByLawyer !== true) pending.push('legal/estado.json: `reviewedByLawyer` no es true (un abogado debe revisar los documentos legales).')
  for (const { file, html } of pages) {
    const found = placeholders(html)
    if (found.length > 0) pending.push(`${file}: texto de relleno sin completar: ${found.map((text) => `«${text}»`).join(', ')}`)
  }
  return pending
}

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return htmlFiles(path)
    return name.endsWith('.html') ? [path] : []
  })
}

const readJson = <T>(path: string, fallback: T): T => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback)

/** Lee el sitio compilado y los dos archivos del dueño. */
export function readSiteFiles(root: string, distName: string): SiteFiles {
  const dist = join(root, distName)
  if (!existsSync(dist)) throw new Error(`No hay ${distName}/: la revisión corre después de compilar`)
  return {
    pages: htmlFiles(dist).map((path) => ({ file: relative(root, path).replace(/\\/g, '/'), html: readFileSync(path, 'utf8') })),
    site: readJson(join(root, 'content', 'site.json'), {}),
    legal: readJson(join(root, '..', 'legal', 'estado.json'), {}),
  }
}

/** Devuelve los pendientes (vacía fuera de producción o con `SITE_AUDIT=1`); el llamador decide cómo fallar. */
export function check(root: string, env: Env = process.env): string[] {
  if (env.SITE_ENV !== 'production') return []
  if (env.SITE_AUDIT === '1') return []
  return pendingItems(readSiteFiles(root, env.SITE_DIST?.trim() || 'dist'))
}

export function main(root: string = resolve(dirname(fileURLToPath(import.meta.url)), '..'), env: Env = process.env): number {
  const pending = check(root, env)
  if (env.SITE_ENV !== 'production') {
    console.log('production-check: vista previa, no se revisa (solo con SITE_ENV=production)')
    return 0
  }
  if (env.SITE_AUDIT === '1') {
    console.log('production-check: omitida por SITE_AUDIT=1 (solo para auditar; este build no se publica)')
    return 0
  }
  if (pending.length === 0) {
    console.log('production-check: nada pendiente, el sitio se puede publicar')
    return 0
  }
  console.error(`production-check: el sitio NO se puede publicar en producción. Pendientes (${pending.length}):`)
  for (const item of pending) console.error(`  - ${item}`)
  return 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main())
