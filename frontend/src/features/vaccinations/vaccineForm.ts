import { TEXT } from './vaccineText'
import type { Vaccination, VaccinationInput } from './types'

/** The value of the vaccine selector for «Otra…»: the parent writes the name. */
export const OTHER = '__other__'

export interface DoseFormValues {
  /** '' (nothing chosen), a catalog code, or OTHER. */
  vaccine: string
  customName: string
  appliedOn: string
  doseNumber: string
  lot: string
  place: string
  notes: string
}

export type DoseField = 'vaccine' | 'customName' | 'appliedOn' | 'doseNumber' | 'lot' | 'place' | 'notes'
export type DoseErrors = Partial<Record<DoseField, string>>

export const emptyValues = (): DoseFormValues => ({ vaccine: '', customName: '', appliedOn: '', doseNumber: '', lot: '', place: '', notes: '' })

/** The values of a recorded dose, to correct it. */
export function valuesOf(v: Vaccination): DoseFormValues {
  return {
    vaccine: v.vaccineCode ?? OTHER,
    customName: v.customName ?? '',
    appliedOn: v.appliedOn,
    doseNumber: v.doseNumber ? String(v.doseNumber) : '',
    lot: v.lot ?? '',
    place: v.place ?? '',
    notes: v.notes ?? '',
  }
}

/** The device's own calendar day as YYYY-MM-DD: a dose can't be dated after it. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Mirrors the server's rules (backend `vaccination.Validate`); the server decides, this only avoids a request that would be refused. */
export function validateDose(values: DoseFormValues, birthDate: string, today: string): DoseErrors {
  const errors: DoseErrors = {}
  if (values.vaccine === '') errors.vaccine = TEXT.errors.vaccine
  else if (values.vaccine === OTHER) {
    const name = values.customName.trim()
    if (name === '') errors.vaccine = TEXT.errors.vaccine
    else if ([...name].length > 100) errors.customName = TEXT.errors.customName
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.appliedOn)) errors.appliedOn = TEXT.errors.appliedOn
  else if (values.appliedOn > today) errors.appliedOn = TEXT.errors.future
  else if (values.appliedOn < birthDate.slice(0, 10)) errors.appliedOn = TEXT.errors.beforeBirth
  const dose = values.doseNumber.trim()
  if (dose !== '' && !(/^\d+$/.test(dose) && Number(dose) >= 1 && Number(dose) <= 20)) errors.doseNumber = TEXT.errors.dose
  if ([...values.lot.trim()].length > 60) errors.lot = TEXT.errors.lot
  if ([...values.place.trim()].length > 120) errors.place = TEXT.errors.place
  if ([...values.notes.trim()].length > 500) errors.notes = TEXT.errors.notes
  return errors
}

export function toInput(values: DoseFormValues, allowDuplicate = false): VaccinationInput {
  const other = values.vaccine === OTHER
  const dose = values.doseNumber.trim()
  return {
    vaccineCode: other ? '' : values.vaccine,
    customName: other ? values.customName.trim() : '',
    appliedOn: values.appliedOn,
    doseNumber: dose === '' ? null : Number(dose),
    lot: values.lot.trim(),
    place: values.place.trim(),
    notes: values.notes.trim(),
    ...(allowDuplicate ? { allowDuplicate: true } : {}),
  }
}

export const isDirty = (values: DoseFormValues, initial: DoseFormValues): boolean => (Object.keys(values) as DoseField[]).some((k) => values[k] !== initial[k])

/** Maps the field names of the server's 400 to the form's: `vaccine`, `customName`, `appliedOn`, `doseNumber`, `lot`, `place`, `notes`. */
export function serverErrors(details: { field: string; message: string }[] | undefined): DoseErrors {
  const known: DoseField[] = ['vaccine', 'customName', 'appliedOn', 'doseNumber', 'lot', 'place', 'notes']
  const out: DoseErrors = {}
  for (const d of details ?? []) if ((known as string[]).includes(d.field)) out[d.field as DoseField] = d.message
  return out
}
