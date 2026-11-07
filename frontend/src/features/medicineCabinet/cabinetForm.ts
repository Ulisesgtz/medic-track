import type { MedicineProposal } from './parseMedicineText'
import { CABINET } from './cabinetText'
import type { CabinetInput, CabinetItem, CabinetUnit } from './types'

// specs/062: the pure part of the cabinet's form — its values, the client's checks (the same the server makes) and what a box's
// reading fills. Tested apart.

export interface CabinetValues {
  name: string
  strength: string
  quantity: string
  unit: CabinetUnit | ''
  month: string
  year: string
  day: string
  note: string
}

export type ProposedField = 'name' | 'strength' | 'expires'

/** Lower case without Spanish accents: «paracet» finds «Paracetamol», «acido» finds «Ácido». */
export const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export const EMPTY_VALUES: CabinetValues = { name: '', strength: '', quantity: '', unit: '', month: '', year: '', day: '', note: '' }

export function valuesOf(item: CabinetItem): CabinetValues {
  return {
    name: item.name,
    strength: item.strength,
    quantity: String(item.quantity),
    unit: item.unit,
    month: String(item.expires.month),
    year: String(item.expires.year),
    day: item.expires.day ? String(item.expires.day) : '',
    note: item.note,
  }
}

/** The years offered: three back (a box bought long ago) to ten ahead, plus the saved one. */
export function yearOptions(now: Date, saved?: string): number[] {
  const first = now.getFullYear() - 3
  const years = Array.from({ length: 14 }, (_, i) => first + i)
  const keep = Number(saved)
  if (keep && !years.includes(keep)) years.push(keep)
  return years.sort((a, b) => a - b)
}

export type CabinetErrors = Partial<Record<'name' | 'quantity' | 'unit' | 'expires' | 'strength' | 'note' | 'photoBase64', string>>

export function validate(v: CabinetValues): CabinetErrors {
  const errors: CabinetErrors = {}
  if (!v.name.trim()) errors.name = CABINET.required.name
  const q = Number(v.quantity)
  if (v.quantity.trim() === '' || !Number.isInteger(q) || q < 0 || q > 999) errors.quantity = CABINET.required.quantity
  if (!v.unit) errors.unit = CABINET.required.unit
  if (!v.month || !v.year) errors.expires = CABINET.required.expires
  else if (v.day) {
    const d = new Date(Date.UTC(Number(v.year), Number(v.month) - 1, Number(v.day)))
    if (d.getUTCMonth() !== Number(v.month) - 1) errors.expires = CABINET.required.day
  }
  return errors
}

export function toInput(v: CabinetValues): CabinetInput {
  return {
    name: v.name.trim(),
    strength: v.strength.trim(),
    quantity: Number(v.quantity),
    unit: v.unit as CabinetUnit,
    expires: { year: Number(v.year), month: Number(v.month), day: v.day ? Number(v.day) : null },
    note: v.note.trim(),
  }
}

/** What a box's reading fills: only the fields still empty — never what the parent wrote, never the quantity. */
export function applyProposal(v: CabinetValues, p: MedicineProposal): { values: CabinetValues; proposed: ProposedField[] } {
  const values = { ...v }
  const proposed: ProposedField[] = []
  if (p.name && !v.name.trim()) {
    values.name = p.name
    proposed.push('name')
  }
  if (p.strength && !v.strength.trim()) {
    values.strength = p.strength
    proposed.push('strength')
  }
  if (p.expires && !v.month && !v.year && !v.day) {
    values.month = String(p.expires.month)
    values.year = String(p.expires.year)
    values.day = p.expires.day ? String(p.expires.day) : ''
    proposed.push('expires')
  }
  return { values, proposed }
}

export const isDirty = (v: CabinetValues, initial: CabinetValues) => (Object.keys(v) as (keyof CabinetValues)[]).some((k) => v[k] !== initial[k])
