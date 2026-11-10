import type { Measurement, MeasurementInput } from './types'

// specs/063: the pure part of the measurement form — what is typed, the same checks as the server and the body sent.

export interface GrowthValues {
  measuredOn: string
  weight: string
  height: string
  note: string
}

export type GrowthErrors = Partial<Record<'measuredOn' | 'weightKg' | 'heightCm' | 'note', string>>

export const EMPTY_VALUES: GrowthValues = { measuredOn: '', weight: '', height: '', note: '' }

const MESSAGES = {
  date: 'Escribe la fecha de la medida.',
  future: 'Esa fecha aún no llega. Elige hoy o un día anterior.',
  beforeBirth: 'Esa fecha es antes del nacimiento. Elige otra.',
  none: 'Escribe el peso, la talla o los dos.',
  weight: 'Escribe el peso en kilos, con punto decimal. Por ejemplo: 11.6',
  height: 'Escribe la talla en centímetros. Por ejemplo: 83',
  weightRange: 'El peso se anota entre 0.3 y 200 kg, con hasta 2 decimales.',
  heightRange: 'La talla se anota entre 30 y 220 cm, con hasta 1 decimal.',
  note: 'La nota puede tener hasta 300 caracteres.',
}

/** A number typed with a point or a comma; null if empty, NaN if not a number. */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(',', '.')
  if (t === '') return null
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN
}

function decimals(text: string): number {
  const t = text.trim().replace(',', '.')
  const dot = t.indexOf('.')
  return dot < 0 ? 0 : t.length - dot - 1
}

/** `today` is the device's local day (YYYY-MM-DD). */
export function validate(v: GrowthValues, birthDate: string, today: string): GrowthErrors {
  const errors: GrowthErrors = {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.measuredOn)) errors.measuredOn = MESSAGES.date
  else if (v.measuredOn > today) errors.measuredOn = MESSAGES.future
  else if (birthDate && v.measuredOn < birthDate) errors.measuredOn = MESSAGES.beforeBirth

  const w = parseDecimal(v.weight)
  const h = parseDecimal(v.height)
  if (w === null && h === null) errors.weightKg = MESSAGES.none
  if (w !== null && Number.isNaN(w)) errors.weightKg = MESSAGES.weight
  else if (w !== null && (w < 0.3 || w > 200 || decimals(v.weight) > 2)) errors.weightKg = MESSAGES.weightRange
  if (h !== null && Number.isNaN(h)) errors.heightCm = MESSAGES.height
  else if (h !== null && (h < 30 || h > 220 || decimals(v.height) > 1)) errors.heightCm = MESSAGES.heightRange
  if (v.note.trim().length > 300) errors.note = MESSAGES.note
  return errors
}

export function toInput(v: GrowthValues): MeasurementInput {
  return { measuredOn: v.measuredOn, weightKg: parseDecimal(v.weight), heightCm: parseDecimal(v.height), note: v.note.trim() }
}

export function valuesOf(m: Pick<Measurement, 'measuredOn' | 'weightKg' | 'heightCm' | 'note'>): GrowthValues {
  return {
    measuredOn: m.measuredOn,
    weight: m.weightKg != null ? String(m.weightKg) : '',
    height: m.heightCm != null ? String(m.heightCm) : '',
    note: m.note ?? '',
  }
}

export function isDirty(a: GrowthValues, b: GrowthValues): boolean {
  return a.measuredOn !== b.measuredOn || a.weight !== b.weight || a.height !== b.height || a.note !== b.note
}
