import { dayMonthYear } from '../supplements/scheduleText'
import { defaultNotices, startsAtOf } from './appointmentText'
import type { Appointment, AppointmentInput, NoticeInput } from './types'

// The values of the «Próxima cita» fields and what can be told about them before asking the server (which checks again).

export interface AppointmentValues {
  /** "YYYY-MM-DD", the device's local date. */
  date: string
  /** "HH:MM". */
  time: string
  note: string
  notices: NoticeInput[]
}

export type AppointmentErrors = Partial<Record<'date' | 'time', string>>

/** Nothing typed yet, with the two notices every appointment gets by default (shown from the start, as chips). */
export const emptyAppointmentValues = (): AppointmentValues => ({ date: '', time: '', note: '', notices: defaultNotices() })

/** Whether the parent typed an appointment at all: the field is optional, so an untouched one saves no appointment. */
export const hasAppointment = (v: AppointmentValues) => v.date !== '' || v.time !== ''

const toNoticeInput = (n: NoticeInput): NoticeInput => ({ kind: n.kind, leadMinutes: n.leadMinutes, daysBefore: n.daysBefore, atTime: n.atTime })

export function valuesOfAppointment(a: Appointment): AppointmentValues {
  const d = new Date(a.startsAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    note: a.note,
    notices: a.notices.map(toNoticeInput),
  }
}

/** `consultDate` is the consultation's "YYYY-MM-DD" (the appointment can't be before it). */
export function validateAppointment(v: AppointmentValues, consultDate: string | undefined): AppointmentErrors {
  const errors: AppointmentErrors = {}
  if (v.date === '' && v.time !== '') errors.date = 'Elige la fecha de la cita.'
  if (v.time === '' && v.date !== '') errors.time = 'Escribe la hora de la cita.'
  if (v.date !== '' && consultDate && v.date < consultDate) {
    errors.date = `La próxima cita va después de la consulta (${dayMonthYear(consultDate)}).`
  }
  return errors
}

/** What is sent: the instant (RFC 3339), the device's UTC offset at that date, the note trimmed and the notices as they are. */
export function toAppointmentInput(v: AppointmentValues): AppointmentInput {
  const start = startsAtOf(v.date, v.time) as Date
  return { startsAt: start.toISOString(), utcOffsetMinutes: -start.getTimezoneOffset(), note: v.note.trim(), notices: v.notices.map(toNoticeInput) }
}
