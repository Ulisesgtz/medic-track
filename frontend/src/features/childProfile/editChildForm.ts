import { NAME_MAX_LENGTH, NAME_PATTERN } from '../account-signup/types'
import { parseDecimal } from '../growth/growthForm'
import type { Child } from '../home/types'
import type { ChildCorrection } from './api'
import { CHILD_PROFILE } from './childProfileText'

// specs/064: the pure part of «Editar datos» — what is typed, the same checks as the server and the body sent.

export interface ChildValues {
  firstName: string
  lastName: string
  birthDate: string
  height: string
  weight: string
}

export type ChildErrors = Partial<Record<keyof ChildValues | 'measurement', string>>

const text = (n: number | null | undefined) => (n == null ? '' : String(n))

export function valuesOf(child: Pick<Child, 'firstName' | 'lastName' | 'birthDate' | 'height' | 'weight'>): ChildValues {
  return { firstName: child.firstName, lastName: child.lastName, birthDate: child.birthDate, height: text(child.height), weight: text(child.weight) }
}

/** The names or the birth date are not those saved: the changes that need the paid plan. */
export function identityChanged(initial: ChildValues, v: ChildValues): boolean {
  return initial.firstName.trim() !== v.firstName.trim() || initial.lastName.trim() !== v.lastName.trim() || initial.birthDate !== v.birthDate
}

/** The height or the weight changed (only then the form offers to write them down as a measurement). */
export function measuresChanged(initial: ChildValues, v: ChildValues): boolean {
  return parseDecimal(initial.height) !== parseDecimal(v.height) || parseDecimal(initial.weight) !== parseDecimal(v.weight)
}

export function isDirty(initial: ChildValues, v: ChildValues): boolean {
  return identityChanged(initial, v) || measuresChanged(initial, v)
}

function decimals(t: string): number {
  const s = t.trim().replace(',', '.')
  const dot = s.indexOf('.')
  return dot < 0 ? 0 : s.length - dot - 1
}

function badName(name: string): boolean {
  const t = name.trim()
  return t === '' || t.length > NAME_MAX_LENGTH || !NAME_PATTERN.test(t)
}

/** `today` is the device's local day (YYYY-MM-DD); `measure` is the box «Anotarlo también como medida de hoy». */
export function validate(v: ChildValues, today: string, measure: boolean): ChildErrors {
  const e: ChildErrors = {}
  const E = CHILD_PROFILE.errors
  if (badName(v.firstName)) e.firstName = E.firstName
  if (badName(v.lastName)) e.lastName = E.lastName
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.birthDate)) e.birthDate = E.birthDate
  else if (v.birthDate > today) e.birthDate = E.birthFuture
  const h = parseDecimal(v.height)
  const w = parseDecimal(v.weight)
  if (h !== null && (Number.isNaN(h) || h <= 0)) e.height = E.height
  if (w !== null && (Number.isNaN(w) || w <= 0)) e.weight = E.weight
  if (measure && !e.height && !e.weight) {
    if (h === null && w === null) e.measurement = E.measurementNone
    else if (w !== null && (w < 0.3 || w > 200 || decimals(v.weight) > 2)) e.measurement = E.measurementWeight
    else if (h !== null && (h < 30 || h > 220 || decimals(v.height) > 1)) e.measurement = E.measurementHeight
  }
  return e
}

export function toBody(v: ChildValues, measure: boolean, today: string): ChildCorrection {
  return {
    firstName: v.firstName.trim(),
    lastName: v.lastName.trim(),
    birthDate: v.birthDate,
    height: parseDecimal(v.height),
    weight: parseDecimal(v.weight),
    measurement: measure ? { measuredOn: today } : null,
  }
}

/** The server's field errors, on the form's fields (the measurement's go under the box). */
export function errorsFromServer(details: { field: string; message: string }[]): ChildErrors {
  const e: ChildErrors = {}
  for (const d of details) {
    const field = d.field.startsWith('measurement') ? 'measurement' : (d.field as keyof ChildErrors)
    e[field] = d.message
  }
  return e
}
