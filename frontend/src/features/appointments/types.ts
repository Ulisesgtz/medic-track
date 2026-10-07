// Mirrors specs/033-recordatorios-suplementos-citas/parte2/plan.md (the contract).

/** `unmarked` («Pasó sin marcar») is derived by the server: a scheduled appointment whose local day already ended. */
export type AppointmentStatus = 'scheduled' | 'done' | 'canceled' | 'unmarked'

export type NoticeKind = 'before' | 'at_time'

/** A notice as the form holds and sends it. */
export interface NoticeInput {
  kind: NoticeKind
  /** «tiempo antes»: minutes (1 to 43 200). */
  leadMinutes: number | null
  /** «a una hora fija»: how many days before (0 to 30)… */
  daysBefore: number | null
  /** …at this local hour, "HH:MM". */
  atTime: string | null
}

export interface AppointmentNotice extends NoticeInput {
  id: string
  /** «2 horas antes», «Un día antes a las 20:00», said by the server. */
  label: string
  fireAt: string
  /** It was due before the appointment was saved or has already gone off: it never fires. */
  past: boolean
}

export interface Appointment {
  id: string
  consultationId: string
  childId: string
  doctorName: string
  /** The consultation's date, "YYYY-MM-DD". */
  consultDate: string
  startsAt: string
  utcOffsetMinutes: number
  note: string
  status: AppointmentStatus
  /** First name of who marked or canceled it. */
  statusBy: string | null
  statusAt: string | null
  createdBy: string
  notices: AppointmentNotice[]
  /** The session has not turned this appointment's reminders off. */
  myReminders: boolean
  /** The session can do everything AND the plan is paid. */
  canEdit: boolean
  /** The session can do everything (marking never needs the plan). */
  canMark: boolean
}

export interface AppointmentsOfChild {
  next: Appointment | null
  history: Appointment[]
  paidPlan: boolean
}

export interface AppointmentOfConsultation {
  appointment: Appointment | null
  paidPlan: boolean
}

export interface AppointmentInput {
  /** RFC 3339. */
  startsAt: string
  utcOffsetMinutes: number
  note: string
  notices: NoticeInput[]
}
