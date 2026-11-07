import type { Expires } from './types'

// specs/062 research R4: what the text read from a box's photo (tesseract.js, in the phone) PROPOSES — the name, the strength and
// the expiry date. Pure; the parent reviews every field, nothing is saved by itself, and the quantity is never proposed.

export interface MedicineProposal {
  name?: string
  strength?: string
  expires?: Expires
}

const MONTH_WORDS: Record<string, number> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12,
}

/** 160 mg/5 ml, 500 mg, 0.5 g, 100 UI… (the first one on the box). */
const STRENGTH = /(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|g|ml|ui|%)(?:\s*\/\s*(\d+(?:[.,]\d+)?)\s*(ml|g|mg))?(?![a-z])/i

/** The words a box puts before its expiry date. A date with none of them is never guessed. */
const EXPIRY_WORD = /\b(?:cad(?:ucidad|uca)?|exp(?:ira|iry|iration)?|vence|venc(?:imiento)?|vto)\b\.?\s*[:.]?\s*/gi

/** Words of the packaging, not of the name. */
const PACKAGING = /\b(tabletas?|c[aá]psulas?|suspensi[oó]n|jarabe|soluci[oó]n|contiene|hecho en|lote|reg|v[ií]a oral|caja con|frasco con|uso pedi[aá]trico|cad|exp|venc)\b/i

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y))

function validDate(year: number, month: number, day: number | null): Expires | undefined {
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return undefined
  if (day !== null) {
    const d = new Date(Date.UTC(year, month - 1, day))
    if (d.getUTCMonth() !== month - 1) return undefined
  }
  return { year, month, day }
}

/** Every expiry word of the text, in order: the first one followed by a date wins (a word without one doesn't hide the next). */
function parseExpiry(text: string): Expires | undefined {
  for (const m of text.matchAll(EXPIRY_WORD)) {
    const found = dateAt(text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 24).toLowerCase())
    if (found) return found
  }
  return undefined
}

function dateAt(rest: string): Expires | undefined {
  let m = rest.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) return validDate(fullYear(m[3]), Number(m[2]), Number(m[1]))
  m = rest.match(/^(\d{1,2})[/.-](\d{4}|\d{2})\b/)
  if (m) return validDate(fullYear(m[2]), Number(m[1]), null)
  m = rest.match(/^(\d{4})[/.-](\d{1,2})\b/)
  if (m) return validDate(Number(m[1]), Number(m[2]), null)
  m = rest.match(/^(?:(\d{1,2})\s*)?([a-z]{3})[a-z]*\.?[\s/.-]*(\d{4}|\d{2})\b/)
  if (m && MONTH_WORDS[m[2]]) return validDate(fullYear(m[3]), MONTH_WORDS[m[2]], m[1] ? Number(m[1]) : null)
  return undefined
}

function tidyStrength(m: RegExpMatchArray): string {
  const unit = (u: string) => (u.toLowerCase() === 'ui' ? 'UI' : u.toLowerCase())
  const first = `${m[1]} ${unit(m[2])}`
  return m[3] ? `${first}/${m[3]} ${unit(m[4])}` : first
}

/** The likeliest name: the longest line with letters among the first ones, without the strength or packaging words. */
function parseName(text: string, strength?: RegExpMatchArray | null): string | undefined {
  const lines = text
    .split(/\r?\n/)
    .map((l) => (strength ? l.replace(strength[0], '') : l).replace(/[^\p{L}\s-]/gu, ' ').replace(/\s+/g, ' ').trim())
    .slice(0, 8)
    .filter((l) => (l.match(/\p{L}/gu)?.length ?? 0) >= 4 && !PACKAGING.test(l))
  if (lines.length === 0) return undefined
  const best = lines.reduce((a, b) => (b.length > a.length ? b : a))
  const name = best
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => space + letter.toUpperCase())
    .slice(0, 120)
  return name || undefined
}

export function parseMedicineText(text: string | null | undefined): MedicineProposal {
  if (!text || !text.trim()) return {}
  const strengthMatch = text.match(STRENGTH)
  const proposal: MedicineProposal = {}
  const name = parseName(text, strengthMatch)
  if (name) proposal.name = name
  if (strengthMatch) proposal.strength = tidyStrength(strengthMatch)
  const expires = parseExpiry(text)
  if (expires) proposal.expires = expires
  return proposal
}
