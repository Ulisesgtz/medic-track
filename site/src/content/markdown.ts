import { Marked, type Tokens } from 'marked'

// El Markdown del dueño (legal/*.md y content/blog/*.md) se convierte a HTML al compilar. Las clases son las del diseño y salen del
// renderizador (Tailwind las lee de este archivo): no hay CSS aparte. Los colores son tokens de @theme, nunca literales.

export type MarkdownStyle = 'legal' | 'article' | 'lead'

const STYLES: Record<MarkdownStyle, { p: string; li: string; h3: string; ul: string }> = {
  legal: {
    p: 'm-0 text-base leading-[1.6] text-pretty text-body',
    li: 'text-base leading-[1.6] text-body',
    h3: 'mt-1 mb-0 text-lg font-extrabold text-ink',
    ul: 'm-0 flex flex-col gap-1.5 pl-[22px]',
  },
  article: {
    p: 'm-0 text-[17px] leading-[1.6] text-pretty text-body web:text-[19px]',
    li: 'text-[17px] leading-[1.6] text-body web:text-[19px]',
    h3: 'mt-1 mb-0 text-xl font-extrabold text-ink',
    ul: 'm-0 flex flex-col gap-1.5 pl-[22px]',
  },
  // El párrafo de entrada de un artículo: un punto más grande que el cuerpo.
  lead: {
    p: 'm-0 text-lg leading-[1.6] text-pretty text-body web:text-xl',
    li: 'text-lg leading-[1.6] text-body web:text-xl',
    h3: 'mt-1 mb-0 text-xl font-extrabold text-ink',
    ul: 'm-0 flex flex-col gap-1.5 pl-[22px]',
  },
}

const LINK = 'font-bold text-action underline'

/** El texto de un título sin formato (para su ancla y para el índice). */
export function plainText(tokens: Tokens.Generic[] | undefined, fallback = ''): string {
  if (!tokens) return fallback
  return tokens
    .map((token) => ('tokens' in token && Array.isArray(token.tokens) ? plainText(token.tokens as Tokens.Generic[]) : (token as { text?: string }).text ?? ''))
    .join('')
}

/** `Cómo protegemos tu información` es `como-protegemos-tu-informacion`; `1. Responsable`, `1-responsable`. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** El id de una sección: como `slugify`, pero nunca empieza con un número (`1. Responsable` es `seccion-1-responsable`), para que sea un selector CSS válido. */
export function anchorId(title: string): string {
  const slug = slugify(title) || 'seccion'
  return /^[0-9]/.test(slug) ? `seccion-${slug}` : slug
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Un `Marked` con el diseño. Las tablas pasan a lista («Clerk — Autenticación — [EE. UU.]»), como en el diseño. */
export function createMarked(style: MarkdownStyle): Marked {
  const css = STYLES[style]
  const marked = new Marked()
  marked.use({
    renderer: {
      paragraph(token) {
        return `<p class="${css.p}">${this.parser.parseInline(token.tokens)}</p>\n`
      },
      strong(token) {
        return `<strong class="font-bold text-ink">${this.parser.parseInline(token.tokens)}</strong>`
      },
      link(token) {
        return `<a href="${escapeHtml(token.href)}" class="${LINK}">${this.parser.parseInline(token.tokens)}</a>`
      },
      codespan(token) {
        return `<code>${escapeHtml(token.text)}</code>`
      },
      list(token) {
        const tag = token.ordered ? 'ol' : 'ul'
        const marker = token.ordered ? 'list-decimal' : 'list-disc'
        const items = token.items.map((item) => this.listitem(item)).join('')
        return `<${tag} class="${css.ul} ${marker}">${items}</${tag}>\n`
      },
      listitem(item) {
        return `<li class="${css.li}">${this.parser.parse(item.tokens, !!item.loose).replace(/^<p[^>]*>([\s\S]*)<\/p>\n?$/, '$1')}</li>`
      },
      heading(token) {
        // Los títulos de sección (##) los pone la plantilla, con su ancla; aquí solo van los de nivel 3 en adelante.
        return `<h3 class="${css.h3}">${this.parser.parseInline(token.tokens)}</h3>\n`
      },
      table(token) {
        const rows = token.rows.map((row) => `<li class="${css.li}">${row.map((cell) => this.parser.parseInline(cell.tokens)).join(' — ')}</li>`).join('')
        return `<ul class="${css.ul} list-disc">${rows}</ul>\n`
      },
    },
  })
  return marked
}
