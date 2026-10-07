import { dayKey } from '../consultations/treatmentDays'
import { dayMonthYear } from './scheduleText'
import type { Routine, RoutineInput, RoutinePeriod } from './types'

// The routine form's values and what can be told about them before asking the server (which checks everything again).

export interface FormValues {
  name: string
  note: string
  period: RoutinePeriod
  times: string[]
  weekdays: number[]
  everyN: string
  firstDate: string
  firstTime: string
  endMode: 'none' | 'date'
  endDate: string
}

export type FieldErrors = Partial<Record<'name' | 'times' | 'weekdays' | 'everyN' | 'firstDate' | 'firstTime' | 'endDate', string>>

/** The values a new routine starts with: daily at 08:00 from today, without an end (the mock's R1). */
export function newRoutineValues(now: Date = new Date()): FormValues {
  return { name: '', note: '', period: 'daily', times: ['08:00'], weekdays: [], everyN: '8', firstDate: dayKey(now), firstTime: '08:00', endMode: 'none', endDate: '' }
}

export function valuesOf(routine: Routine): FormValues {
  return {
    name: routine.name,
    note: routine.note,
    period: routine.period,
    times: routine.times.length > 0 ? routine.times : ['08:00'],
    weekdays: routine.weekdays,
    everyN: routine.intervalHours ? String(routine.intervalHours) : '8',
    firstDate: routine.firstDate,
    firstTime: routine.firstTime ?? '08:00',
    endMode: routine.endDate ? 'date' : 'none',
    endDate: routine.endDate ?? '',
  }
}

/** The message of each field the server can reject (its `details[].field`). */
export const SERVER_MESSAGES: Record<string, string> = {
  name: 'Escribe el nombre de la rutina.',
  times: 'Revisa las horas: de 1 a 6, sin repetir.',
  weekdays: 'Elige al menos un día.',
  intervalHours: 'Escribe un número de 1 a 24.',
  firstTime: 'Escribe la hora de la primera toma.',
  firstDate: 'La primera toma no puede ser de antes de ayer.',
  endDate: 'La fecha de fin no puede ser antes de la primera toma.',
}

/** The form field each server field is drawn under. */
export const FIELD_OF_SERVER: Record<string, keyof FieldErrors> = {
  name: 'name',
  times: 'times',
  weekdays: 'weekdays',
  intervalHours: 'everyN',
  firstTime: 'firstTime',
  firstDate: 'firstDate',
  endDate: 'endDate',
}

export function validateValues(v: FormValues): FieldErrors {
  const errors: FieldErrors = {}
  if (v.name.trim() === '') errors.name = SERVER_MESSAGES.name
  if (v.period === 'weekdays' && v.weekdays.length === 0) errors.weekdays = SERVER_MESSAGES.weekdays
  if (v.period === 'interval') {
    const n = Number(v.everyN)
    if (!/^\d{1,2}$/.test(v.everyN.trim()) || n < 1 || n > 24) errors.everyN = SERVER_MESSAGES.intervalHours
    if (v.firstTime === '') errors.firstTime = SERVER_MESSAGES.firstTime
  } else {
    if (v.times.some((t) => t === '')) errors.times = 'Escribe la hora.'
    else if (new Set(v.times).size !== v.times.length) errors.times = 'Esta hora ya está en la lista.'
  }
  if (v.firstDate === '') errors.firstDate = 'Elige la fecha de la primera toma.'
  if (v.endMode === 'date') {
    if (v.endDate === '') errors.endDate = 'Elige la fecha de la última toma.'
    else if (v.firstDate !== '' && v.endDate < v.firstDate) {
      errors.endDate = `La fecha de fin va después de la primera toma (${dayMonthYear(v.firstDate)}).`
    }
  }
  return errors
}

/** What is sent: only the fields of the chosen period, the name and the note trimmed, the device's UTC offset. */
export function toInput(v: FormValues): RoutineInput {
  const interval = v.period === 'interval'
  return {
    name: v.name.trim(),
    note: v.note.trim(),
    period: v.period,
    times: interval ? [] : v.times,
    weekdays: v.period === 'weekdays' ? [...v.weekdays].sort((a, b) => a - b) : [],
    intervalHours: interval ? Number(v.everyN) : null,
    firstDate: v.firstDate,
    firstTime: interval ? v.firstTime : null,
    endDate: v.endMode === 'date' ? v.endDate : null,
    utcOffsetMinutes: -new Date().getTimezoneOffset(),
  }
}
