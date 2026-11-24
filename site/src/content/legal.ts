import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { lexer, type Token, type Tokens } from 'marked'
import { anchorId, createMarked, plainText } from './markdown.ts'

// Los tres documentos legales (legal/*.md, escritos por el dueño y revisados por un abogado) como datos de la página: una sección por
// cada «##», con su ancla, y el índice «Contenido» sale de esas secciones (specs/080, T025). El título y el bloque «>» de borrador
// no se publican; «**Última actualización:**» tampoco: la fecha sale de `legal/estado.json`.

export type LegalDoc = 'privacidad-y-seguridad' | 'aviso-de-privacidad' | 'terminos-y-condiciones'

export interface LegalSection {
  id: string
  title: string
  html: string
}

export interface LegalContent {
  /** El texto antes del primer «##» (sin título), o vacío. */
  introHtml: string
  sections: LegalSection[]
}

export interface LegalStatus {
  reviewedByLawyer: boolean
  date: string | null
}

/** `legal/` en la raíz del repositorio, resuelta desde la ubicación de este módulo (no del directorio donde se corre el proceso). */
const LEGAL_DIR = `${resolve(import.meta.dirname, '..', '..', '..', 'legal')}/`

const isUpdatedLine = (token: Token): boolean => token.type === 'paragraph' && /^\*\*Última actualización:?\*\*/.test(token.raw.trim())

/** Convierte un documento Markdown a su contenido. Función pura: la prueba le pasa un texto de muestra. */
export function parseLegal(markdown: string): LegalContent {
  const marked = createMarked('legal')
  const tokens = lexer(markdown).filter((token) => token.type !== 'space')
  const body: Token[] = []
  let skippedTitle = false
  for (const token of tokens) {
    if (!skippedTitle && token.type === 'heading' && token.depth === 1) {
      skippedTitle = true
      continue
    }
    if (token.type === 'blockquote' && body.length === 0) continue // el bloque de borrador
    if (isUpdatedLine(token)) continue
    body.push(token)
  }
  const render = (group: Token[]): string => marked.parser(Object.assign(group, { links: {} }) as Token[] & { links: Record<string, never> })
  const intro: Token[] = []
  const groups: Array<{ title: string; tokens: Token[] }> = []
  for (const token of body) {
    if (token.type === 'heading' && token.depth === 2) groups.push({ title: plainText((token as Tokens.Heading).tokens as Tokens.Generic[], token.text), tokens: [] })
    else (groups.at(-1)?.tokens ?? intro).push(token)
  }
  const used = new Set<string>()
  const sections = groups.map((group) => {
    let id = anchorId(group.title)
    while (used.has(id)) id += '-bis'
    used.add(id)
    return { id, title: group.title, html: render(group.tokens) }
  })
  return { introHtml: render(intro), sections }
}

export function readLegalDoc(doc: LegalDoc, dir: string = LEGAL_DIR): LegalContent {
  return parseLegal(readFileSync(`${dir}${doc}.md`, 'utf8'))
}

export function readLegalStatus(dir: string = LEGAL_DIR): LegalStatus {
  const status = JSON.parse(readFileSync(`${dir}estado.json`, 'utf8')) as Partial<LegalStatus>
  return { reviewedByLawyer: status.reviewedByLawyer === true, date: typeof status.date === 'string' ? status.date : null }
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** `2026-12-01` es «1 de diciembre de 2026». Una fecha mal escrita se devuelve igual (la revisión de producción la detecta). */
export function formatLongDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return isoDate
  const month = MONTHS[Number(match[2]) - 1]
  return month ? `${Number(match[3])} de ${month} de ${match[1]}` : isoDate
}

/** La línea bajo el título: la fecha del estado legal, o el relleno entre corchetes mientras no la haya. */
export function updatedLine(status: LegalStatus): string {
  return `Última actualización: ${status.date ? formatLongDate(status.date) : '[fecha de publicación]'}`
}
