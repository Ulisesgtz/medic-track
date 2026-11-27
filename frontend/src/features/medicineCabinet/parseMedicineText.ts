import type { OcrWord } from '../consultations/useOcrSuggestion'
import { fold } from './cabinetForm'
import type { Expires } from './types'

// specs/062 research R4: what the text read from a box's photo (tesseract.js, in the phone) PROPOSES — the name, the strength and
// the expiry date. Pure; the parent reviews every field, nothing is saved by itself, and the quantity is never proposed.

export interface MedicineProposal {
  name?: string
  strength?: string
  expires?: Expires
}

export interface ParseOptions {
  /** Per-word data of the reading (tesseract blocks); without it the name is decided from the text alone. */
  words?: OcrWord[] | null
  /** Names the family already wrote (cabinet, cached consultations): a reading that looks like one proposes it as it was saved. */
  known?: string[]
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

// Name rules (bugfix/081). A wrong name is worse than an empty field, so the name is proposed only with clear evidence:
//  1. a known name wins: a line's words (1-4 together) equal a known name without case/accents, or differ by at most
//     tolerance(length) edits (length < 5: 0, 5-8: 1, 9+: 2), or every word of a multi-word known name is present;
//  2. with per-word data: the biggest letters. Words need confidence >= 70, >= 3 letters, >= 80 % letters, and no packaging,
//     strength, expiry or filler word; the name must be >= 1.2 times the median height of the words read (when there are
//     at least 4 of them), and it joins the words of that line whose height is >= 75 % of the biggest (max 4 words);
//  3. text only: one clean line of the first 8 (<= 4 words of >= 3 letters, >= 90 % letters, no packaging); if several are
//     clean, only the single fully-UPPERCASE one; otherwise nothing.
const MIN_CONFIDENCE = 70
const KNOWN_MIN_CONFIDENCE = 40
const BIG_FACTOR = 1.2
const SAME_SIZE = 0.75
const MAX_NAME_WORDS = 4
const FILLER = new Set(['con', 'por', 'para', 'los', 'las', 'del', 'una', 'uno', 'que', 'sin', 'cada', 'mas', 'son'])

const squash = (t: string) => fold(t).replace(/[^a-z0-9]/g, '')
const letterCount = (t: string) => t.match(/\p{L}/gu)?.length ?? 0
/** Trims the symbols at both ends of a token («TEMPRA®», «(Zinc)»). */
const trimToken = (t: string) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

const tolerance = (len: number) => (len < 5 ? 0 : len < 9 ? 1 : 2)

function titleCase(t: string): string {
  return t
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => space + letter.toUpperCase())
    .slice(0, 120)
}

function isNameToken(text: string, strength?: RegExpMatchArray | null): boolean {
  const t = trimToken(text)
  if (letterCount(t) < 3 || letterCount(t) / t.length < 0.8) return false
  if (/[^\p{L}\p{N}'-]/u.test(t)) return false
  if (FILLER.has(fold(t)) || PACKAGING.test(t) || new RegExp(EXPIRY_WORD.source, 'i').test(t)) return false
  if (strength && strength[0].toLowerCase().includes(t.toLowerCase())) return false
  return true
}

/** The lines of tokens the known names are compared against. */
function tokenLines(text: string, words?: OcrWord[] | null): string[][] {
  if (words && words.length > 0) {
    const byLine = new Map<number, string[]>()
    for (const w of words) {
      if (w.confidence < KNOWN_MIN_CONFIDENCE) continue
      const t = trimToken(w.text)
      if (t) byLine.set(w.line, [...(byLine.get(w.line) ?? []), t])
    }
    return [...byLine.values()]
  }
  return text.split(/\r?\n/).map((l) => l.split(/\s+/).map(trimToken).filter(Boolean))
}

/** The known name the reading looks like (the closest, then the longest), as it was saved. */
function matchKnown(lines: string[][], known: string[]): string | undefined {
  const squashed = lines.map((l) => l.map(squash))
  const allTokens = new Set(squashed.flat())
  let best: { name: string; dist: number; len: number } | undefined
  const offer = (name: string, dist: number, len: number) => {
    if (!best || dist < best.dist || (dist === best.dist && len > best.len)) best = { name, dist, len }
  }
  for (const name of known) {
    const target = squash(name)
    if (target.length < 4) continue
    const parts = fold(name).split(/\s+/).map(squash).filter(Boolean)
    if (parts.length > 1 && parts.every((p) => p.length >= 3 && allTokens.has(p))) offer(name, 0, target.length)
    const tol = tolerance(target.length)
    for (const line of squashed) {
      for (let start = 0; start < line.length; start++) {
        let joined = ''
        for (let end = start; end < Math.min(line.length, start + MAX_NAME_WORDS); end++) {
          joined += line[end]
          if (joined.length < 4 || Math.abs(joined.length - target.length) > tol) continue
          const d = distance(joined, target)
          if (d <= tol) offer(name, d, target.length)
        }
      }
    }
  }
  return best?.name
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** The name from the biggest legible letters; undefined when no word clearly stands out. */
function nameFromWords(words: OcrWord[], strength?: RegExpMatchArray | null): string | undefined {
  const candidates = words.filter((w) => w.confidence >= MIN_CONFIDENCE && w.height > 0 && isNameToken(w.text, strength))
  if (candidates.length === 0) return undefined
  const top = candidates.reduce((a, b) => (b.height > a.height ? b : a))
  const readable = words.filter((w) => letterCount(w.text) >= 3 && w.height > 0)
  if (readable.length >= 4 && top.height < BIG_FACTOR * median(readable.map((w) => w.height))) return undefined
  const picked = candidates.filter((w) => w.line === top.line && w.height >= SAME_SIZE * top.height).slice(0, MAX_NAME_WORDS)
  return titleCase(picked.map((w) => trimToken(w.text)).join(' ')) || undefined
}

/** The only clean line of the text's first lines (rule 3), or undefined. */
function nameFromText(text: string, strength?: RegExpMatchArray | null): string | undefined {
  const clean = text
    .split(/\r?\n/)
    .slice(0, 8)
    .map((l) => (strength ? l.replace(strength[0], '') : l).replace(/\s+/g, ' ').trim())
    .filter((l) => {
      const tokens = l.split(' ').filter(Boolean)
      return tokens.length >= 1 && tokens.length <= MAX_NAME_WORDS && letterCount(l) >= 4 && letterCount(l) / l.replace(/\s/g, '').length >= 0.9 && tokens.every((t) => isNameToken(t, strength))
    })
  if (clean.length === 0) return undefined
  const lines = clean.length === 1 ? clean : clean.filter((l) => l === l.toUpperCase())
  return lines.length === 1 ? titleCase(lines[0]) : undefined
}

function parseName(text: string, strength: RegExpMatchArray | null, options: ParseOptions): string | undefined {
  const known = options.known?.map((k) => k.trim()).filter(Boolean)
  if (known && known.length > 0) {
    const hit = matchKnown(tokenLines(text, options.words), known)
    if (hit) return hit.slice(0, 120)
  }
  return options.words && options.words.length > 0 ? nameFromWords(options.words, strength) : nameFromText(text, strength)
}

export function parseMedicineText(text: string | null | undefined, options: ParseOptions = {}): MedicineProposal {
  if (!text || !text.trim()) return {}
  const strengthMatch = text.match(STRENGTH)
  const proposal: MedicineProposal = {}
  const name = parseName(text, strengthMatch, options)
  if (name) proposal.name = name
  if (strengthMatch) proposal.strength = tidyStrength(strengthMatch)
  const expires = parseExpiry(text)
  if (expires) proposal.expires = expires
  return proposal
}
