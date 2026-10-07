import type { DoseStatus, TakenBy } from '../consultations/types'

// Mirrors specs/033-recordatorios-suplementos-citas/contracts/routines.md.

export type RoutinePeriod = 'daily' | 'weekdays' | 'interval'
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
  name: string
  note: string
  period: RoutinePeriod
  /** "HH:MM" local to the routine; empty for "cada N horas". */
  times: string[]
  /** 0 = Monday … 6 = Sunday. */
  weekdays: number[]
  intervalHours: number | null
  /** "YYYY-MM-DD". */
  firstDate: string
  firstTime: string | null
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
  name: string
  note: string
  period: RoutinePeriod
  times: string[]
  weekdays: number[]
  intervalHours: number | null
  firstDate: string
  firstTime: string | null
  endDate: string | null
  utcOffsetMinutes: number
}
