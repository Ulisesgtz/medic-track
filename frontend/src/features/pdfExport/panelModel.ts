import type { HistorySearchRequest } from '../consultations/historyCriteria'
import { day } from './document/model'
import { PANEL } from './exportText'
import type { ExportPeriod, ExportSections } from './types'

// specs/050: what the panel says about the file and the period, as pure functions. Only what was chosen and what came out.

/** «48 KB», «1.2 MB». */
export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** «del 1 ene al 24 oct 2026»: the year is said once when both days share it. */
function rangeWords(from: string, to: string): string {
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  const first = sameYear ? day(from).replace(/ \d{4}$/, '') : day(from)
  return `del ${first} al ${day(to)}`
}

/** The period in the «listo» line: «del 1 ene al 24 oct 2026», «todo el historial», «con los filtros del historial». */
export function readyPeriod(period: ExportPeriod): string {
  if (period.kind === 'range') return rangeWords(period.from, period.to)
  if (period.kind === 'filters') return PANEL.readyFilters
  return PANEL.readyAll
}

/** The period that opens the «sin datos» sentence: «Del 1 sep al 30 sep 2026», «En el historial», «Con los filtros del historial». */
export function emptyPeriod(period: ExportPeriod): string {
  if (period.kind === 'range') {
    const words = rangeWords(period.from, period.to)
    return words.charAt(0).toUpperCase() + words.slice(1)
  }
  return period.kind === 'filters' ? PANEL.emptyFilters : PANEL.emptyAll
}

const KIND: Record<NonNullable<HistorySearchRequest['kind']>, string | null> = {
  all: null,
  treatment: 'Con tratamiento',
  record: 'Solo registro',
}

/** Under «Usar los filtros del historial»: «Dra. Laura Cázares · Fiebre». Null when the history has no filter on. */
export function filtersSummary(filters: HistorySearchRequest | null | undefined, symptomNames: Record<string, string> = {}): string | null {
  if (!filters) return null
  const parts: string[] = []
  if (filters.q?.trim()) parts.push(`«${filters.q.trim()}»`)
  if (filters.from && filters.to) parts.push(rangeWords(filters.from, filters.to))
  else if (filters.from) parts.push(`desde el ${day(filters.from)}`)
  else if (filters.to) parts.push(`hasta el ${day(filters.to)}`)
  if (filters.doctor) parts.push(filters.doctor)
  if (filters.medication) parts.push(filters.medication)
  for (const code of filters.symptomCodes ?? []) parts.push(symptomNames[code] ?? code)
  const kind = filters.kind ? KIND[filters.kind] : null
  if (kind) parts.push(kind)
  if (parts.length === 0) return null
  const text = parts.join(' · ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Whether «Generar PDF» can go: a section on and, for a range, both days with «Desde» not after «Hasta». */
export function canGenerate(period: ExportPeriod, sections: ExportSections): boolean {
  if (!sections.consultations && !sections.vaccinations) return false
  if (period.kind === 'range') return period.from !== '' && period.to !== '' && period.from <= period.to
  return true
}
