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
  /** The appointment's own doctor (asked only when it has no consultation). */
  doctor: string
  location: string
  /** An optional https link to the place (a Google Maps link). */
  locationUrl: string
  notices: NoticeInput[]
}

export type AppointmentErrors = Partial<Record<'date' | 'time' | 'doctor' | 'locationUrl', string>>

/** Nothing typed yet, with the two notices every appointment gets by default (shown from the start, as chips). */
export const emptyAppointmentValues = (): AppointmentValues => ({ date: '', time: '', note: '', doctor: '', location: '', locationUrl: '', notices: defaultNotices() })

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
    // The consultation's doctor is not the appointment's own: it is only kept when there is no consultation.
    doctor: a.consultationId === null ? a.doctorName : '',
    location: a.location,
    locationUrl: a.locationUrl,
    notices: a.notices.map(toNoticeInput),
  }
}

/** The only links kept: https ones (the app puts them behind a link, so no javascript: or http:). */
export const isHttpsLink = (raw: string) => /^https:\/\/[^\s/]+/i.test(raw.trim())

/** `consultDate` is the consultation's "YYYY-MM-DD" (the appointment can't be before it); `needsDoctor`: no consultation to take it from. */
export function validateAppointment(v: AppointmentValues, consultDate: string | undefined, needsDoctor = false): AppointmentErrors {
  const errors: AppointmentErrors = {}
  if (v.date === '' && v.time !== '') errors.date = 'Elige la fecha de la cita.'
  if (v.time === '' && v.date !== '') errors.time = 'Escribe la hora de la cita.'
  if (v.date !== '' && consultDate && v.date < consultDate) {
    errors.date = `La próxima cita va después de la consulta (${dayMonthYear(consultDate)}).`
  }
  if (needsDoctor && v.doctor.trim() === '') errors.doctor = 'Escribe con quién es la cita.'
  if (v.locationUrl.trim() !== '' && !isHttpsLink(v.locationUrl)) errors.locationUrl = 'La liga debe empezar con https://'
  return errors
}

/** What is sent: the instant (RFC 3339), the device's UTC offset at that date, the note trimmed and the notices as they are. */
export function toAppointmentInput(v: AppointmentValues): AppointmentInput {
  const start = startsAtOf(v.date, v.time) as Date
  return {
    startsAt: start.toISOString(),
    utcOffsetMinutes: -start.getTimezoneOffset(),
    note: v.note.trim(),
    doctor: v.doctor.trim(),
    location: v.location.trim(),
    locationUrl: v.locationUrl.trim(),
    notices: v.notices.map(toNoticeInput),
  }
}
