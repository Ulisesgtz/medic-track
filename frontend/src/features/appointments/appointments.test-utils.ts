import type { Appointment, AppointmentNotice } from './types'

// Fixtures for the appointments' tests; the clock, the account and the fetch router come from the supplements' test utils.

/** Tue 6 Oct 2026, 15:10 local: «now» of the tests. */
export const NOW = new Date(2026, 9, 6, 15, 10)

/** Fri 9 Oct 2026, 10:30 local. */
export const FRIDAY = new Date(2026, 9, 9, 10, 30)

export function notice(id: string, leadMinutes: number, label: string, over: Partial<AppointmentNotice> = {}): AppointmentNotice {
  return {
    id,
    kind: 'before',
    leadMinutes,
    daysBefore: null,
    atTime: null,
    label,
    fireAt: new Date(FRIDAY.getTime() - leadMinutes * 60_000).toISOString(),
    past: false,
    ...over,
  }
}

export function appointment(over: Partial<Appointment> = {}): Appointment {
  return {
    id: 'ap1',
    consultationId: 'c1',
    childId: 'child-1',
    doctorName: 'Dra. Laura López',
    consultDate: '2026-09-28',
    startsAt: FRIDAY.toISOString(),
    utcOffsetMinutes: -360,
    note: 'Revisión de oído; pidió la cartilla de vacunas.',
    status: 'scheduled',
    statusBy: null,
    statusAt: null,
    createdBy: 'Ana',
    notices: [notice('n1', 1440, '1 día antes'), notice('n2', 120, '2 horas antes')],
    myReminders: true,
    canEdit: true,
    canMark: true,
    ...over,
  }
}
