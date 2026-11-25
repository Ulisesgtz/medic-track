import { readdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { lexer, type Token, type Tokens } from 'marked'
import { anchorId, createMarked, plainText } from './markdown.ts'

// Los artículos del blog (site/content/blog/<slug>.md, formato en contracts/contenido.md). Se leen al compilar y un error de formato
// detiene la compilación con el archivo y la línea (specs/080, T030). Solo los `ready: true` se publican.

export interface ArticleSection {
  id: string
  title: string
  html: string
}

export interface BlogArticle {
  slug: string
  title: string
  description: string
  datePublished: string
  dateModified: string
  ready: boolean
  /** Lo que va entre el título y la primera sección (el párrafo de entrada). */
  introHtml: string
  sections: ArticleSection[]
  /** Minutos de lectura, a 200 palabras por minuto (al menos 1). */
  readMinutes: number
}

/** Un error del archivo del dueño: dice cuál y en qué línea para poder corregirlo. */
export class BlogFormatError extends Error {
  constructor(file: string, line: number, message: string) {
    super(`${file}:${line}: ${message}`)
    this.name = 'BlogFormatError'
  }
}

/** La raíz del sitio (`site/`), resuelta desde la ubicación de este módulo (`import.meta.dirname`). */
const SITE_ROOT = resolve(import.meta.dirname, '..', '..')
const BLOG_DIR = join(SITE_ROOT, 'content', 'blog')

/** La carpeta de artículos: `SITE_BLOG_DIR` (relativa a la raíz del sitio, no al directorio actual) o `content/blog`. */
export function blogDir(env: Record<string, string | undefined> = process.env): string {
  const custom = env.SITE_BLOG_DIR?.trim()
  return custom ? resolve(SITE_ROOT, custom) : BLOG_DIR
}
const KEYS = ['title', 'description', 'datePublished', 'dateModified', 'ready'] as const
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function isRealDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3])
}

/** El encabezado `---` … `---` (pares `clave: valor`) y el cuerpo, con la línea donde empieza cada clave. */
function splitFrontMatter(file: string, text: string) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  if (lines[0]?.trim() !== '---') throw new BlogFormatError(file, 1, 'el artículo debe empezar con «---» (el encabezado)')
  const end = lines.findIndex((line, at) => at > 0 && line.trim() === '---')
  if (end === -1) throw new BlogFormatError(file, 1, 'falta el «---» que cierra el encabezado')
  const fields = new Map<string, { value: string; line: number }>()
  for (let at = 1; at < end; at += 1) {
    const raw = lines[at]
    if (raw.trim() === '') continue
    const colon = raw.indexOf(':')
    if (colon === -1) throw new BlogFormatError(file, at + 1, `se esperaba «clave: valor» y dice «${raw.trim()}»`)
    const key = raw.slice(0, colon).trim()
    if (!(KEYS as readonly string[]).includes(key)) throw new BlogFormatError(file, at + 1, `clave desconocida «${key}» (las válidas son ${KEYS.join(', ')})`)
    if (fields.has(key)) throw new BlogFormatError(file, at + 1, `la clave «${key}» está repetida`)
    fields.set(key, { value: raw.slice(colon + 1).trim().replace(/^(['"])(.*)\1$/, '$2'), line: at + 1 })
  }
  return { fields, body: lines.slice(end + 1).join('\n'), bodyLine: end + 2 }
}

/** Convierte un archivo a su artículo, o lanza `BlogFormatError`. */
export function parseArticle(file: string, text: string): BlogArticle {
  const slug = basename(file).replace(/\.md$/, '')
  if (!SLUG.test(slug)) throw new BlogFormatError(file, 1, `el nombre «${slug}» debe ser minúsculas, números y guiones`)
  const { fields, body, bodyLine } = splitFrontMatter(file, text)
  const need = (key: (typeof KEYS)[number]) => {
    const field = fields.get(key)
    if (!field || field.value === '') throw new BlogFormatError(file, field?.line ?? 1, `falta «${key}» en el encabezado`)
    return field
  }
  const title = need('title')
  const description = need('description')
  const published = need('datePublished')
  const modified = need('dateModified')
  const ready = need('ready')
  if (title.value.length > 60) throw new BlogFormatError(file, title.line, `title de ${title.value.length} caracteres (máximo 60)`)
  if (description.value.length > 155) throw new BlogFormatError(file, description.line, `description de ${description.value.length} caracteres (máximo 155)`)
  for (const field of [published, modified]) {
    if (!isRealDate(field.value)) throw new BlogFormatError(file, field.line, `«${field.value}» no es una fecha real AAAA-MM-DD`)
  }
  if (modified.value < published.value) throw new BlogFormatError(file, modified.line, 'dateModified no puede ser anterior a datePublished')
  if (ready.value !== 'true' && ready.value !== 'false') throw new BlogFormatError(file, ready.line, 'ready debe ser true o false')

  const marked = createMarked('article')
  const tokens = lexer(body).filter((token) => token.type !== 'space')
  const lead = createMarked('lead')
  const renderWith = (renderer: typeof marked, group: Token[]) => renderer.parser(Object.assign(group, { links: {} }) as Token[] & { links: Record<string, never> })
  const render = (group: Token[]) => renderWith(marked, group)
  const intro: Token[] = []
  const groups: Array<{ title: string; tokens: Token[] }> = []
  for (const token of tokens) {
    if (token.type === 'heading' && token.depth === 1) throw new BlogFormatError(file, bodyLine, 'el título lo pone la plantilla: no uses «#» en el cuerpo (usa «##» para las secciones)')
    if (token.type === 'heading' && token.depth === 2) groups.push({ title: plainText((token as Tokens.Heading).tokens as Tokens.Generic[], token.text), tokens: [] })
    else (groups.at(-1)?.tokens ?? intro).push(token)
  }
  if (groups.length === 0) throw new BlogFormatError(file, bodyLine, 'el artículo necesita al menos una sección («## Título»)')
  const used = new Set<string>()
  const sections = groups.map((group) => {
    let id = anchorId(group.title)
    while (used.has(id)) id += '-bis'
    used.add(id)
    return { id, title: group.title, html: render(group.tokens) }
  })
  const words = body.split(/\s+/).filter(Boolean).length
  return {
    slug,
    title: title.value,
    description: description.value,
    datePublished: published.value,
    dateModified: modified.value,
    ready: ready.value === 'true',
    introHtml: renderWith(lead, intro),
    sections,
    readMinutes: Math.max(1, Math.ceil(words / 200)),
  }
}

/** Todos los artículos de la carpeta (listos o no), del más reciente al más antiguo. */
export function loadArticles(dir: string = blogDir()): BlogArticle[] {
  const files = readdirSync(dir).filter((name) => name.endsWith('.md')).sort()
  const articles = files.map((name) => parseArticle(join(dir, name), readFileSync(join(dir, name), 'utf8')))
  return articles.sort((a, b) => b.datePublished.localeCompare(a.datePublished) || a.slug.localeCompare(b.slug))
}

/** Los que se publican, del más reciente al más antiguo. Sin ninguno no hay `/blog` ni enlaces «Blog». */
export const readyArticles = (articles: BlogArticle[]): BlogArticle[] =>
  articles.filter((article) => article.ready).sort((a, b) => b.datePublished.localeCompare(a.datePublished) || a.slug.localeCompare(b.slug))
