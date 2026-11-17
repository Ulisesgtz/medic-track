import type { ValidationErrorDetail } from '../../shared/apiError'
import { FORM, tooLong } from './recordText'
import { LIMITS, type AllergyKind, type BloodType, type ChildRecord, type ChildRecordInput } from './types'

// specs/073: the form's values as strings, and the pure rules that turn them into what the API takes. The same limits as the server
// (it checks again). Nothing here judges what the family wrote.

export interface AllergyValues {
  name: string
  kind: AllergyKind | ''
  note: string
}
export interface ConditionValues {
  name: string
  note: string
}
export interface RecordFormValues {
  allergies: AllergyValues[]
  bloodType: BloodType | ''
  conditions: ConditionValues[]
  pedName: string
  pedPhone: string
  pedOffice: string
  generalNote: string
}

/** Errors by field path: `allergies.2.name`, `pedPhone`, `generalNote`. */
export type RecordErrors = Record<string, string>

export const EMPTY_VALUES: RecordFormValues = { allergies: [], bloodType: '', conditions: [], pedName: '', pedPhone: '', pedOffice: '', generalNote: '' }

export function valuesOf(record: ChildRecord): RecordFormValues {
  return {
    allergies: record.allergies.map((a) => ({ name: a.name, kind: a.kind ?? '', note: a.note ?? '' })),
    bloodType: record.bloodType ?? '',
    conditions: record.conditions.map((c) => ({ name: c.name, note: c.note ?? '' })),
    pedName: record.pediatrician?.name ?? '',
    pedPhone: record.pediatrician?.phone ?? '',
    pedOffice: record.pediatrician?.office ?? '',
    generalNote: record.generalNote ?? '',
  }
}

export const isDirty = (initial: RecordFormValues, current: RecordFormValues) => JSON.stringify(initial) !== JSON.stringify(current)

const blank = (value: string) => value.trim() === ''
const orNull = (value: string) => (blank(value) ? null : value.trim())

/** An entry with nothing written in it is dropped on save. */
const emptyAllergy = (a: AllergyValues) => blank(a.name) && blank(a.note) && a.kind === ''
const emptyCondition = (c: ConditionValues) => blank(c.name) && blank(c.note)

const PHONE_PATTERN = /^[\d\s+\-().]*$/

/** The field errors of the form, by path. An empty result means it can be sent. */
export function validate(values: RecordFormValues): RecordErrors {
  const errors: RecordErrors = {}
  const length = (path: string, value: string, max: number) => {
    if (value.trim().length > max) errors[path] = tooLong(max)
  }
  values.allergies.forEach((a, i) => {
    if (emptyAllergy(a)) return
    if (blank(a.name)) errors[`allergies.${i}.name`] = FORM.nameRequired
    length(`allergies.${i}.name`, a.name, LIMITS.name)
    length(`allergies.${i}.note`, a.note, LIMITS.note)
  })
  values.conditions.forEach((c, i) => {
    if (emptyCondition(c)) return
    if (blank(c.name)) errors[`conditions.${i}.name`] = FORM.nameRequired
    length(`conditions.${i}.name`, c.name, LIMITS.name)
    length(`conditions.${i}.note`, c.note, LIMITS.note)
  })
  length('pedName', values.pedName, LIMITS.pediatricianName)
  length('pedOffice', values.pedOffice, LIMITS.office)
  length('pedPhone', values.pedPhone, LIMITS.phone)
  if (!errors.pedPhone && !PHONE_PATTERN.test(values.pedPhone)) errors.pedPhone = FORM.phoneInvalid
  length('generalNote', values.generalNote, LIMITS.generalNote)
  return errors
}

/** What the API takes: trimmed, empty entries dropped, the order kept. */
export function toInput(values: RecordFormValues, expectedVersion: number): ChildRecordInput {
  const pediatrician = blank(values.pedName) && blank(values.pedPhone) && blank(values.pedOffice)
    ? null
    : { name: orNull(values.pedName), phone: orNull(values.pedPhone), office: orNull(values.pedOffice) }
  return {
    expectedVersion,
    bloodType: values.bloodType === '' ? null : values.bloodType,
    generalNote: orNull(values.generalNote),
    pediatrician,
    allergies: values.allergies.filter((a) => !emptyAllergy(a)).map((a) => ({ name: a.name.trim(), kind: a.kind === '' ? null : a.kind, note: orNull(a.note) })),
    conditions: values.conditions.filter((c) => !emptyCondition(c)).map((c) => ({ name: c.name.trim(), note: orNull(c.note) })),
  }
}

/** `allergies[2].name` → `allergies.2.name`; the server never sends the value, so the message is ours. */
export function errorsFromServer(details: ValidationErrorDetail[]): RecordErrors {
  const out: RecordErrors = {}
  for (const d of details) {
    const path = d.field.replace(/\[(\d+)\]/g, '.$1').replace('pediatrician.name', 'pedName').replace('pediatrician.phone', 'pedPhone').replace('pediatrician.office', 'pedOffice')
    out[path] = FORM.serverField
  }
  return out
}
