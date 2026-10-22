import type { Vaccine } from '../../shared/catalog/api'
import { OTHER, localToday } from './vaccineForm'

/**
 * One line of the card that the photo reading proposes to record (specs/046, FR-010). It is only a suggestion: nothing is saved until the
 * parent confirms it, and every field can be corrected. `appliedOn` is '' when no usable date was found, so the row is marked and the
 * parent writes it.
 */
export interface ProposedRow {
  key: string
  /** A catalog code, OTHER (then `customName`), or '' when the reading found a date but no vaccine. */
  vaccine: string
  customName: string
  /** YYYY-MM-DD or ''. */
  appliedOn: string
  /** '' or a number as text, like the form's field. */
  doseNumber: string
}

const MONTHS: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
}

/** Lower case without accents, keeping every character in its place so an index in the folded text is an index in the original. */
function fold(text: string): string {
  return Array.from(text, (c) => c.normalize('NFD')[0].toLowerCase()).join('')
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The calendar date as YYYY-MM-DD, or '' when it doesn't exist, is before birth or is in the future. */
function isoOrEmpty(year: number, month: number, day: number, birthDate: string, today: string): string {
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return ''
  const iso = `${year}-${pad(month)}-${pad(day)}`
  return iso < birthDate.slice(0, 10) || iso > today ? '' : iso
}

function fullYear(y: number, raw: string): number {
  return raw.length <= 2 ? 2000 + y : y
}

// 14/03/2021, 14-03-21, 14.03.2021
const NUMERIC_DATE = /(?<![\d/.-])(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?![\d/.-])/g
// 14 mar 2021, 14-mar-21, 14 de marzo de 2021 (folded text: no accents, lower case)
const WORD_DATE = /(?<!\d)(\d{1,2})[\s./-]*(?:de\s+)?([a-z]{3,10})\.?[\s./-]*(?:de\s+|del\s+)?(\d{4}|\d{2})(?!\d)/g
const DOSE_AFTER = /dosis\s*(?:n[o.°º]*\s*)?(\d{1,2})(?!\d)/
const DOSE_BEFORE = /(?<!\d)(\d{1,2})\s*[ªa°º.]?\s*dosis/

interface Found {
  start: number
  end: number
  iso: string
}

function datesIn(folded: string, birthDate: string, today: string): Found[] {
  const found: Found[] = []
  for (const m of folded.matchAll(NUMERIC_DATE)) {
    found.push({ start: m.index, end: m.index + m[0].length, iso: isoOrEmpty(fullYear(Number(m[3]), m[3]), Number(m[2]), Number(m[1]), birthDate, today) })
  }
  for (const m of folded.matchAll(WORD_DATE)) {
    const month = MONTHS[m[2].slice(0, 3)]
    if (!month) continue
    const start = m.index
    const end = start + m[0].length
    if (found.some((f) => start < f.end && end > f.start)) continue
    found.push({ start, end, iso: isoOrEmpty(fullYear(Number(m[3]), m[3]), month, Number(m[1]), birthDate, today) })
  }
  return found.sort((a, b) => a.start - b.start)
}

/** The catalog vaccine named in the line: the longest name found as whole words, or null. «Triple viral (SRP)» also matches as «Triple viral». */
function catalogMatch(folded: string, catalog: Vaccine[]): Vaccine | null {
  let best: { vaccine: Vaccine; length: number } | null = null
  for (const vaccine of catalog) {
    const full = fold(vaccine.name).trim()
    const short = full.replace(/\s*\(.*?\)\s*/g, ' ').trim()
    for (const name of new Set([full, short])) {
      if (name.length < 3) continue
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(folded) && (!best || name.length > best.length)) best = { vaccine, length: name.length }
    }
  }
  return best ? best.vaccine : null
}

/** The words left in the line once the dates and the dose are taken out: what the card calls the vaccine when it isn't in the catalog. */
function leftover(original: string, folded: string, found: Found[]): string {
  let out = original
  for (const f of [...found].sort((a, b) => b.start - a.start)) out = out.slice(0, f.start) + ' ' + out.slice(f.end)
  const cleaned = out
    .replace(/(?:\d{1,2}\s*[ªa°º.]?\s*dosis|dosis\s*(?:n[o.°º]*\s*)?\d{1,2})/gi, ' ')
    .replace(/[|_•·*]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s().,/+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s.,/+-]+|[\s.,/+-]+$/g, '')
  return /\p{L}{3}/u.test(cleaned) && folded.length > 0 ? cleaned.slice(0, 100) : ''
}

/**
 * Proposes rows from the text the phone read from a photo of the paper card (specs/046, FR-010). Pure: it saves nothing and has no
 * network. A line becomes a row when it holds a date (a vaccine name from the catalog, or the words around the date as «otra») or
 * names a catalog vaccine without a date. Dates before the child's birth, in the future or impossible are left empty so the row is
 * marked. Text with nothing recognisable gives [].
 */
export function parseVaccineText(text: string, catalog: Vaccine[], birthDate: string, today: string = localToday()): ProposedRow[] {
  const rows: ProposedRow[] = []
  let n = 0
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    const folded = fold(line)
    if (folded.includes('nacimiento')) continue
    const found = datesIn(folded, birthDate, today)
    const known = catalogMatch(folded, catalog)
    if (found.length === 0 && !known) continue
    const withoutDates = found.reduce((text, f) => text.slice(0, f.start) + ' '.repeat(f.end - f.start) + text.slice(f.end), folded)
    const dose = DOSE_AFTER.exec(withoutDates)?.[1] ?? DOSE_BEFORE.exec(withoutDates)?.[1] ?? ''
    const doseNumber = dose !== '' && Number(dose) >= 1 && Number(dose) <= 20 ? String(Number(dose)) : ''
    const own = known ? '' : leftover(line, folded, found)
    const base = { vaccine: known ? known.code : own ? OTHER : '', customName: own, doseNumber }
    if (found.length === 0) rows.push({ key: `row-${n++}`, ...base, appliedOn: '' })
    for (const f of found) rows.push({ key: `row-${n++}`, ...base, appliedOn: f.iso })
  }
  return rows
}
