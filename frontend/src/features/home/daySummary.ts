import type { ChildOverview, OverviewDose } from '../consultations/types'
import type { Routine, RoutineDose } from '../supplements/types'

// specs/055 (data-model.md): what the home shows of a day, derived only from the answers the app already has. The state of
// every dose is the server's `status` (specs/013, 016): nothing here reads the phone's clock to decide whether a dose «passed».

export type CardState = 'pend' | 'ok' | 'vacio' | 'sinreg'

export interface ChildDay {
  /** The consultations' doses of the day, canceled ones left out; null when there is none (the row isn't drawn). */
  medications: { total: number; toMark: number; unregistered: number; marked: number } | null
  supplements: { marked: number; total: number } | null
  activities: { done: number; total: number } | null
  /** The earliest dose of a medication or a supplement still unmarked (its time came or not): the card's «Próxima». */
  next: OverviewDose | null
  state: CardState
  /** Medication and supplement doses whose time came and that nobody marked: the chip «N por marcar». */
  toMark: number
  /** The first unregistered dose, for the dashed line. */
  unregistered: OverviewDose | null
}

const byTime = <T extends { scheduledAt: string }>(a: T, b: T) => a.scheduledAt.localeCompare(b.scheduledAt)
const isSupplement = (d: OverviewDose) => d.kind === 'supplement'
const open = (d: { status: string }) => d.status === 'pending' || d.status === 'due'

/** The doses of today of the active activities (a paused or ended one isn't on the card). */
function activityDoses(activities: Routine[]): RoutineDose[] {
  return activities.filter((r) => r.kind === 'activity' && r.status === 'active').flatMap((r) => r.doses)
}

export function childDay(overview: ChildOverview, activities: Routine[]): ChildDay {
  const doses = overview.doses.filter((d) => d.status !== 'canceled')
  const meds = doses.filter((d) => !isSupplement(d))
  const sups = doses.filter(isSupplement)
  const acts = activityDoses(activities)

  const unregisteredDoses = doses.filter((d) => d.status === 'unregistered').sort(byTime)
  const due = doses.filter((d) => d.status === 'due').length

  const medications = meds.length
    ? {
        total: meds.length,
        toMark: meds.filter((d) => d.status === 'due').length,
        unregistered: meds.filter((d) => d.status === 'unregistered').length,
        marked: meds.filter((d) => d.taken).length,
      }
    : null
  const supplements = sups.length ? { marked: sups.filter((d) => d.taken).length, total: sups.length } : null
  const activitiesRow = acts.length ? { done: acts.filter((d) => d.taken).length, total: acts.length } : null

  const anything = doses.length + acts.length > 0
  const state: CardState = unregisteredDoses.length ? 'sinreg' : due ? 'pend' : anything ? 'ok' : 'vacio'

  return {
    medications,
    supplements,
    activities: activitiesRow,
    next: doses.filter(open).sort(byTime)[0] ?? null,
    state,
    toMark: due,
    unregistered: unregisteredDoses[0] ?? null,
  }
}

export interface PersonalNext {
  name: string
  at: string
  routineId: string
}

export interface PersonalDay {
  doses: { marked: number; total: number; next: PersonalNext | null } | null
  activities: { done: number; total: number; next: PersonalNext | null; markable: PersonalNext | null } | null
  /** Nothing whose time came is unmarked (nothing `due` nor `unregistered`). */
  allMarked: boolean
  /** card = rows to mark; todo = rows, all marked so far; nada = routines but nothing today; vacio = none created (paid); plan = none created (free). */
  mode: 'card' | 'todo' | 'nada' | 'vacio' | 'plan'
}

function earliest(routines: Routine[], keep: (d: RoutineDose) => boolean): PersonalNext | null {
  const all = routines.flatMap((r) => r.doses.filter(keep).map((d) => ({ name: r.name, at: d.scheduledAt, routineId: r.id })))
  return all.sort((a, b) => a.at.localeCompare(b.at))[0] ?? null
}

/**
 * «Tu día» of the person's own routines (specs/033 part 3, specs/035). `paidPlan` is the server's: on the free plan with nothing
 * created the card is the plan line; whatever was created is always shown.
 */
export function personalDay(supplements: Routine[], activities: Routine[], paidPlan: boolean): PersonalDay {
  const sups = supplements.filter((r) => r.kind === 'supplement' && r.status === 'active')
  const acts = activities.filter((r) => r.kind === 'activity' && r.status === 'active')
  const supDoses = sups.flatMap((r) => r.doses)
  const actDoses = acts.flatMap((r) => r.doses)

  const doses = supDoses.length
    ? { marked: supDoses.filter((d) => d.taken).length, total: supDoses.length, next: earliest(sups, open) }
    : null
  const activitiesRow = actDoses.length
    ? {
        done: actDoses.filter((d) => d.taken).length,
        total: actDoses.length,
        // «Próxima» of an activity is the first one still to come; «✓ Realizado» marks the earliest unmarked of the day (specs/035).
        next: earliest(acts, (d) => d.status === 'pending'),
        markable: earliest(acts, (d) => !d.taken),
      }
    : null

  const allMarked = ![...supDoses, ...actDoses].some((d) => d.status === 'due' || d.status === 'unregistered')
  // A person with routines but nothing today still gets the card (it says so); «vacio» is only for who has created none.
  const anyRoutine = supplements.length + activities.length > 0
  const today = doses !== null || activitiesRow !== null
  const mode = !anyRoutine ? (paidPlan ? 'vacio' : 'plan') : !today ? 'nada' : allMarked ? 'todo' : 'card'
  return { doses, activities: activitiesRow, allMarked, mode }
}
