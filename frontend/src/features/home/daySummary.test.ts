import { describe, expect, it } from 'vitest'
import type { ChildOverview, OverviewDose } from '../consultations/types'
import type { Routine, RoutineDose } from '../supplements/types'
import { childDay, personalDay } from './daySummary'

let seq = 0
const dose = (status: OverviewDose['status'], at: string, extra: Partial<OverviewDose> = {}): OverviewDose => ({
  id: `d${++seq}`,
  consultationId: 'c1',
  medicationName: 'Amoxicilina',
  scheduledAt: `2026-11-01T${at}:00Z`,
  taken: status === 'taken',
  status,
  ...extra,
})
const sup = (status: OverviewDose['status'], at: string) =>
  dose(status, at, { kind: 'supplement', routineId: 'r1', consultationId: '', medicationName: 'Vitamina D' })
const overview = (...doses: OverviewDose[]): ChildOverview => ({ childId: 'k1', doses, activeTreatment: null })

const rdose = (status: RoutineDose['status'], at: string): RoutineDose => ({
  id: `rd${++seq}`,
  scheduledAt: `2026-11-01T${at}:00Z`,
  taken: status === 'taken',
  status,
})
const routine = (kind: Routine['kind'], name: string, doses: RoutineDose[], status: Routine['status'] = 'active'): Routine =>
  ({ id: `r-${name}`, kind, name, status, doses }) as Routine

describe('childDay', () => {
  it('counts each kind of the day and offers the earliest unmarked dose', () => {
    const day = childDay(
      overview(dose('taken', '08:00'), dose('due', '12:00'), dose('pending', '16:00'), sup('taken', '08:00'), sup('pending', '10:00')),
      [routine('activity', 'Leer', [rdose('taken', '09:00'), rdose('pending', '17:00')])],
    )
    expect(day.medications).toEqual({ total: 3, toMark: 1, unregistered: 0, marked: 1 })
    expect(day.supplements).toEqual({ marked: 1, total: 2 })
    expect(day.activities).toEqual({ done: 1, total: 2 })
    expect(day.next?.scheduledAt).toBe('2026-11-01T10:00:00Z')
    expect(day.state).toBe('pend')
    expect(day.toMark).toBe(1)
  })

  it('leaves out canceled doses and rows with nothing, and paused or ended activities', () => {
    const day = childDay(overview(dose('canceled', '08:00')), [
      routine('activity', 'Pausada', [rdose('pending', '09:00')], 'paused'),
      routine('activity', 'Terminada', [rdose('pending', '09:00')], 'ended'),
    ])
    expect(day).toMatchObject({ medications: null, supplements: null, activities: null, next: null, state: 'vacio' })
  })

  it('says «sin registrar» over «por marcar», with the first one', () => {
    const day = childDay(overview(dose('due', '12:00'), dose('unregistered', '09:00'), dose('unregistered', '08:00')), [])
    expect(day.state).toBe('sinreg')
    expect(day.unregistered?.scheduledAt).toBe('2026-11-01T08:00:00Z')
    expect(day.medications).toMatchObject({ unregistered: 2, toMark: 1 })
  })

  it('is «ok» when nothing whose time came is unmarked, even with doses still to come', () => {
    const day = childDay(overview(dose('taken', '08:00'), dose('pending', '20:00')), [])
    expect(day.state).toBe('ok')
    expect(day.next?.scheduledAt).toBe('2026-11-01T20:00:00Z')
  })

  it('an activity alone is something today', () => {
    expect(childDay(overview(), [routine('activity', 'Leer', [rdose('taken', '09:00')])]).state).toBe('ok')
  })
})

describe('personalDay', () => {
  const vitamin = routine('supplement', 'Vitamina D', [rdose('taken', '08:00'), rdose('pending', '14:00')])
  const walk = routine('activity', 'Caminar', [rdose('taken', '07:00'), rdose('due', '12:00'), rdose('pending', '18:00')])

  it('card: counts, the next of each and the activity «Realizado» marks', () => {
    const day = personalDay([vitamin], [walk], true)
    expect(day.mode).toBe('card')
    expect(day.doses).toMatchObject({ marked: 1, total: 2, next: { name: 'Vitamina D', at: '2026-11-01T14:00:00Z' } })
    expect(day.activities).toMatchObject({ done: 1, total: 3 })
    expect(day.activities?.next).toMatchObject({ name: 'Caminar', at: '2026-11-01T18:00:00Z', routineId: 'r-Caminar' })
    expect(day.activities?.markable?.at).toBe('2026-11-01T12:00:00Z')
  })

  it('todo: nothing whose time came is unmarked', () => {
    expect(personalDay([vitamin], [], true).mode).toBe('todo')
  })

  it('nada: routines, but none today', () => {
    expect(personalDay([routine('supplement', 'Hierro', [])], [], true).mode).toBe('nada')
  })

  it('vacio on the paid plan and plan on the free one when nothing was created; what was created is always shown', () => {
    expect(personalDay([], [], true).mode).toBe('vacio')
    expect(personalDay([], [], false).mode).toBe('plan')
    expect(personalDay([vitamin], [], false).mode).toBe('todo')
  })

  it('leaves paused routines out of the counts', () => {
    const day = personalDay([routine('supplement', 'Pausado', [rdose('due', '08:00')], 'paused')], [], true)
    expect(day.doses).toBeNull()
    expect(day.mode).toBe('nada')
  })
})
