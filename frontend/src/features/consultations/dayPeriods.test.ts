import { describe, it, expect } from 'vitest'
import { groupByPeriod, periodOf } from './dayPeriods'

// Local times: the app groups by the clock the chips show.
const at = (h: number, m = 0) => new Date(2026, 0, 15, h, m).toISOString()
const dose = (h: number, m = 0) => ({ id: `${h}:${m}`, scheduledAt: at(h, m) })

describe('dayPeriods (specs/015)', () => {
  it('puts each time in its moment, at the exact borders', () => {
    expect(periodOf(at(4, 59))).toBe('night')
    expect(periodOf(at(5, 0))).toBe('morning')
    expect(periodOf(at(11, 59))).toBe('morning')
    expect(periodOf(at(12, 0))).toBe('afternoon')
    expect(periodOf(at(18, 59))).toBe('afternoon')
    expect(periodOf(at(19, 0))).toBe('night')
    expect(periodOf(at(0, 0))).toBe('night')
    expect(periodOf(at(23, 59))).toBe('night')
  })

  it('groups a medication every 8 hours as Noche, Mañana and Tarde, in the order Mañana, Tarde, Noche', () => {
    const groups = groupByPeriod([dose(0), dose(8), dose(16)])

    expect(groups.map((g) => g.label)).toEqual(['Mañana', 'Tarde', 'Noche'])
    expect(groups.map((g) => g.doses.map((d) => d.id))).toEqual([['8:0'], ['16:0'], ['0:0']])
  })

  it('leaves out the moments with no doses, and works with a single one', () => {
    expect(groupByPeriod([dose(9)]).map((g) => g.key)).toEqual(['morning'])
    expect(groupByPeriod([dose(8), dose(9)]).map((g) => g.key)).toEqual(['morning'])
    expect(groupByPeriod([])).toEqual([])
  })

  it('orders by time inside a group, the night chronologically (early hours first)', () => {
    const night = groupByPeriod([dose(21), dose(2), dose(23), dose(0)])[0]

    expect(night.key).toBe('night')
    expect(night.doses.map((d) => d.id)).toEqual(['0:0', '2:0', '21:0', '23:0'])
  })
})
