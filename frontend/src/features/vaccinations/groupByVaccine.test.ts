import { describe, expect, it } from 'vitest'
import { foldText, groupByVaccine, vaccineKey } from './groupByVaccine'
import type { Vaccination } from './types'

let n = 0
const dose = (over: Partial<Vaccination>): Vaccination => ({
  id: `d${++n}`, vaccineCode: null, name: 'Otra', customName: null, appliedOn: '2024-01-01', doseNumber: null, lot: null, place: null, notes: null,
  createdByName: 'Ana', createdAt: `2026-10-0${(n % 9) + 1}T10:00:00Z`, correctedByName: null, correctedAt: null, ...over,
})

describe('foldText', () => {
  it('ignores case, accents and the spaces around', () => {
    expect(foldText(' Neumocócica CONJUGADA ')).toBe('neumococica conjugada')
    expect(foldText('Niño')).toBe('nino')
  })
})

describe('vaccineKey', () => {
  it('is the catalog code, or the parent\'s own words without case or accents', () => {
    expect(vaccineKey(dose({ vaccineCode: 'bcg', name: 'BCG' }))).toBe('code:bcg')
    expect(vaccineKey(dose({ name: 'Vacuna Niño', customName: 'Vacuna Niño' }))).toBe('own:vacuna nino')
    expect(vaccineKey(dose({ name: 'x', customName: null }))).toBe('own:x')
  })
})

describe('groupByVaccine', () => {
  it('is empty with no doses', () => {
    expect(groupByVaccine([])).toEqual([])
  })

  it('groups the doses of one vaccine, oldest first', () => {
    const groups = groupByVaccine([
      dose({ vaccineCode: 'hepatitis_b', name: 'Hepatitis B', appliedOn: '2024-03-01', doseNumber: 2 }),
      dose({ vaccineCode: 'hepatitis_b', name: 'Hepatitis B', appliedOn: '2023-03-01', doseNumber: 1 }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Hepatitis B')
    expect(groups[0].doses.map((d) => d.doseNumber)).toEqual([1, 2])
  })

  it('puts the vaccine with the most recent dose first, and breaks a tie by name', () => {
    const groups = groupByVaccine([
      dose({ vaccineCode: 'bcg', name: 'BCG', appliedOn: '2021-01-01' }),
      dose({ vaccineCode: 'rotavirus', name: 'Rotavirus', appliedOn: '2024-06-01' }),
      dose({ vaccineCode: 'dpt', name: 'DPT', appliedOn: '2024-06-01' }),
    ])

    expect(groups.map((g) => g.name)).toEqual(['DPT', 'Rotavirus', 'BCG'])
  })

  it('joins the parent\'s own names written with different case or accents, and keeps catalog and own apart', () => {
    const groups = groupByVaccine([
      dose({ name: 'Vacuna Niño', customName: 'Vacuna Niño', appliedOn: '2024-01-01' }),
      dose({ name: 'vacuna nino', customName: 'vacuna nino', appliedOn: '2024-02-01' }),
      dose({ vaccineCode: 'bcg', name: 'BCG', appliedOn: '2024-01-15' }),
      dose({ name: 'BCG', customName: 'BCG', appliedOn: '2024-01-20' }),
    ])

    expect(groups).toHaveLength(3)
    expect(groups.find((g) => g.key === 'own:vacuna nino')?.doses).toHaveLength(2)
  })

  it('breaks a tie of two doses on the same day by when they were recorded', () => {
    const first = dose({ vaccineCode: 'bcg', name: 'BCG', appliedOn: '2024-01-01', createdAt: '2026-10-01T10:00:00Z' })
    const second = dose({ vaccineCode: 'bcg', name: 'BCG', appliedOn: '2024-01-01', createdAt: '2026-10-02T10:00:00Z' })

    expect(groupByVaccine([second, first])[0].doses.map((d) => d.id)).toEqual([first.id, second.id])
  })

  it('only arranges what was recorded: a group has no count of what is missing, no schedule and no status', () => {
    const [group] = groupByVaccine([dose({ vaccineCode: 'bcg', name: 'BCG' })])

    expect(Object.keys(group).sort()).toEqual(['doses', 'key', 'name'])
  })
})
