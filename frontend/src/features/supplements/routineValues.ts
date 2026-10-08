import { dayKey } from '../consultations/treatmentDays'
import { dayMonthYear } from './scheduleText'
import type { Routine, RoutineInput, RoutineKind } from './types'

// The supplement and activity forms' values and what can be told about them before asking the server (which checks everything
// again). «cada N» of an activity is from 5 minutes to 23 hours (specs/035 D4).

/** A supplement has from one to six fixed hours a day. */
export const MAX_TIMES = 6
export const MIN_EVERY_MINUTES = 5
export const MAX_EVERY_MINUTES = 23 * 60

export type EveryUnit = 'min' | 'h'

export interface FormValues {
  kind: RoutineKind
  name: string
  note: string
  /** Supplements: every day or some weekdays (the hours are `times`). */
  period: 'daily' | 'weekdays'
  times: string[]
  /** Supplements on some weekdays, or an activity with «Ciertos días». 0 = Monday. */
  weekdays: number[]
  /** Activities: «Desde las», «Hasta las» and «Cada [n] minutos/horas». */
  windowStart: string
  windowEnd: string
  every: string
  unit: EveryUnit
  daysMode: 'all' | 'some'
  firstDate: string
  endMode: 'none' | 'date'
  endDate: string
}

export type FieldErrors = Partial<Record<'name' | 'times' | 'weekdays' | 'windowStart' | 'windowEnd' | 'every' | 'firstDate' | 'endDate', string>>

/** The values a new one starts with: no hours at all (nothing suggests a schedule — specs/035 D8), from today, without an end. */
export function newRoutineValues(kind: RoutineKind, now: Date = new Date()): FormValues {
  return {
    kind,
    name: '',
    note: '',
    period: 'daily',
    times: [''],
    weekdays: [],
    windowStart: '',
    windowEnd: '',
    every: '',
    unit: 'h',
    daysMode: 'all',
    firstDate: dayKey(now),
    endMode: 'none',
    endDate: '',
  }
}

export function valuesOf(routine: Routine): FormValues {
  const minutes = routine.intervalMinutes ?? 0
  const hours = minutes > 0 && minutes % 60 === 0
  return {
    kind: routine.kind,
    name: routine.name,
    note: routine.note,
    period: routine.period === 'weekdays' ? 'weekdays' : 'daily',
    times: routine.times.length > 0 ? routine.times : [''],
    weekdays: routine.weekdays,
    windowStart: routine.windowStart ?? '',
    windowEnd: routine.windowEnd ?? '',
    every: minutes === 0 ? '' : String(hours ? minutes / 60 : minutes),
    unit: hours || minutes === 0 ? 'h' : 'min',
    daysMode: routine.kind === 'activity' && routine.weekdays.length > 0 && routine.weekdays.length < 7 ? 'some' : 'all',
    firstDate: routine.firstDate,
    endMode: routine.endDate ? 'date' : 'none',
    endDate: routine.endDate ?? '',
  }
}

const NAME_MESSAGE: Record<RoutineKind, string> = {
  supplement: 'Escribe el nombre del suplemento.',
  activity: 'Escribe el nombre de la actividad.',
}

/** The message of each field the server can reject (its `details[].field`). */
export function serverMessage(kind: RoutineKind, field: string): string | undefined {
  const messages: Record<string, string> = {
    name: NAME_MESSAGE[kind],
    times: 'Revisa las horas: de 1 a 6, sin repetir.',
    weekdays: 'Elige al menos un día.',
    windowStart: 'Escribe la hora en que empieza.',
    windowEnd: 'La hora de fin va después de la de inicio.',
    intervalMinutes: 'Elige cuánto tiempo pasa entre avisos.',
    firstDate: kind === 'activity' ? 'La fecha de inicio no puede ser de antes de ayer.' : 'La primera toma no puede ser de antes de ayer.',
    endDate: kind === 'activity' ? 'La fecha de fin va después de la fecha de inicio.' : 'La fecha de fin no puede ser antes de la primera toma.',
  }
  return messages[field]
}

/** The form field each server field is drawn under. */
export const FIELD_OF_SERVER: Record<string, keyof FieldErrors> = {
  name: 'name',
  times: 'times',
  weekdays: 'weekdays',
  windowStart: 'windowStart',
  windowEnd: 'windowEnd',
  intervalMinutes: 'every',
  firstDate: 'firstDate',
  endDate: 'endDate',
}

/** «Cada [n]» in minutes; null when it isn't a whole number of at least 1. */
export function everyMinutes(v: Pick<FormValues, 'every' | 'unit'>): number | null {
  if (!/^\d{1,4}$/.test(v.every.trim())) return null
  const n = Number(v.every)
  if (n < 1) return null
  return v.unit === 'h' ? n * 60 : n
}

export function validateValues(v: FormValues): FieldErrors {
  const errors: FieldErrors = {}
  const activity = v.kind === 'activity'
  if (v.name.trim() === '') errors.name = NAME_MESSAGE[v.kind]
  if (activity) {
    if (v.windowStart === '') errors.windowStart = 'Escribe la hora en que empieza.'
    if (v.windowEnd === '') errors.windowEnd = 'Escribe la hora en que termina.'
    else if (v.windowStart !== '' && v.windowEnd <= v.windowStart) errors.windowEnd = 'La hora de fin va después de la de inicio.'
    const minutes = everyMinutes(v)
    if (minutes === null || minutes < MIN_EVERY_MINUTES || minutes > MAX_EVERY_MINUTES) errors.every = 'Elige cuánto tiempo pasa entre avisos.'
    if (v.daysMode === 'some' && v.weekdays.length === 0) errors.weekdays = 'Elige al menos un día.'
  } else {
    if (v.period === 'weekdays' && v.weekdays.length === 0) errors.weekdays = 'Elige al menos un día.'
    if (v.times.some((t) => t === '')) errors.times = 'Escribe la hora.'
    else if (new Set(v.times).size !== v.times.length) errors.times = 'Esta hora ya está en la lista.'
  }
  if (v.firstDate === '') errors.firstDate = activity ? 'Elige la fecha de inicio.' : 'Elige la fecha de la primera toma.'
  if (v.endMode === 'date') {
    if (v.endDate === '') errors.endDate = activity ? 'Elige el último día.' : 'Elige la fecha de la última toma.'
    else if (v.firstDate !== '' && v.endDate < v.firstDate) {
      errors.endDate = activity
        ? 'La fecha de fin va después de la fecha de inicio.'
        : `La fecha de fin va después de la primera toma (${dayMonthYear(v.firstDate)}).`
    }
  }
  return errors
}

/** What is sent: only the fields of the kind, the name and the note trimmed, the device's UTC offset. */
export function toInput(v: FormValues): RoutineInput {
  const base = {
    kind: v.kind,
    name: v.name.trim(),
    note: v.note.trim(),
    firstDate: v.firstDate,
    endDate: v.endMode === 'date' ? v.endDate : null,
    utcOffsetMinutes: -new Date().getTimezoneOffset(),
  }
  if (v.kind === 'activity') {
    return {
      ...base,
      period: 'window',
      times: [],
      weekdays: v.daysMode === 'some' ? [...v.weekdays].sort((a, b) => a - b) : [],
      windowStart: v.windowStart,
      windowEnd: v.windowEnd,
      intervalMinutes: everyMinutes(v),
    }
  }
  return {
    ...base,
    period: v.period,
    times: v.times,
    weekdays: v.period === 'weekdays' ? [...v.weekdays].sort((a, b) => a - b) : [],
    windowStart: null,
    windowEnd: null,
    intervalMinutes: null,
  }
}
