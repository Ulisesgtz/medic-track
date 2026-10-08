import type { DoseStatus, TakenBy } from '../consultations/types'

// Mirrors specs/033-recordatorios-suplementos-citas/contracts/routines.md and specs/035-actividades-y-suplementos.

/** A supplement is taken at fixed hours; an activity is done every so often between two hours of the day (specs/035). */
export type RoutineKind = 'supplement' | 'activity'
export type RoutinePeriod = 'daily' | 'weekdays' | 'window'
export type RoutineStatus = 'active' | 'paused' | 'ended'

/** One scheduled intake of a routine: the same states and the same "who marked it" as a medication's dose. */
export interface RoutineDose {
  id: string
  scheduledAt: string
  taken: boolean
  /** Never `canceled`: finishing a routine deletes its future doses instead. */
  status: Exclude<DoseStatus, 'canceled'>
  takenBy?: TakenBy | null
}

export interface RoutineProgress {
  taken: number
  elapsed: number
  total: number
}

export interface Routine {
  id: string
  childId: string | null
  kind: RoutineKind
  name: string
  note: string
  period: RoutinePeriod
  /** "HH:MM" local to the routine; supplements only (an activity has a window instead). */
  times: string[]
  /** 0 = Monday … 6 = Sunday; an activity with none happens every day. */
  weekdays: number[]
  /** Activities: "HH:MM" from which and until which they happen every `intervalMinutes`. */
  windowStart: string | null
  windowEnd: string | null
  intervalMinutes: number | null
  /** "YYYY-MM-DD". */
  firstDate: string
  endDate: string | null
  status: RoutineStatus
  pausedAt: string | null
  endedAt: string | null
  /** The first name of who created it. */
  createdBy: string
  createdAt: string
  /** The session has not turned this routine's reminders off ("Tus avisos"). */
  myReminders: boolean
  /** The session can do everything AND the plan is paid: the buttons that would answer 422/403 are not offered. */
  canEdit: boolean
  progress: RoutineProgress
  /** Only the doses of the asked window. */
  doses: RoutineDose[]
  /** The next dose ahead of the window, only for an active routine with none in it. */
  nextDose: RoutineDose | null
}

export interface RoutineList {
  routines: Routine[]
  activeCount: number
  limit: number
  /** The owner account's plan. */
  paidPlan: boolean
}

/** What the form sends, for creating and for editing (the whole routine). */
export interface RoutineInput {
  kind: RoutineKind
  name: string
  note: string
  period: RoutinePeriod
  times: string[]
  weekdays: number[]
  windowStart: string | null
  windowEnd: string | null
  intervalMinutes: number | null
  firstDate: string
  endDate: string | null
  utcOffsetMinutes: number
}

/** The person's own routines (specs/033, part 3): the same list plus whether they pressed «Entendido» on the section's first-time notice. */
export interface PersonalRoutineList extends RoutineList {
  noticeSeen: boolean
}
