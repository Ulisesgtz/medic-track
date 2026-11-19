import { describe, expect, it } from 'vitest'
import type { ActivityType } from '../../shared/catalog/api'
import { groupByActivityType, offeredTypes } from './groupByActivityType'
import type { Routine } from './types'

const catalog: ActivityType[] = [
  { code: 'school', name: 'Escolar', active: true },
  { code: 'sports', name: 'Deportiva', active: true },
  { code: 'old', name: 'Antigua', active: false },
  { code: 'habits', name: 'Hábitos y cuidado diario', active: true },
]

const routine = (id: string, activityType: string | null): Routine => ({ id, activityType }) as Routine

describe('groupByActivityType', () => {
  it('puts the segments in the catalog order, with no empty one and keeping the received order inside', () => {
    const got = groupByActivityType([routine('a', 'habits'), routine('b', 'sports'), routine('c', 'habits'), routine('d', 'sports')], catalog)
    expect(got?.map((s) => [s.code, s.name, s.routines.map((r) => r.id)])).toEqual([
      ['sports', 'Deportiva', ['b', 'd']],
      ['habits', 'Hábitos y cuidado diario', ['a', 'c']],
    ])
  })

  it('keeps a retired type at its place and names it', () => {
    const got = groupByActivityType([routine('a', 'habits'), routine('b', 'old')], catalog)
    expect(got?.map((s) => s.name)).toEqual(['Antigua', 'Hábitos y cuidado diario'])
  })

  it('sends a code the catalog does not know to the end under its own code', () => {
    const got = groupByActivityType([routine('a', 'mystery'), routine('b', 'school'), routine('c', null)], catalog)
    expect(got?.map((s) => s.code)).toEqual(['school', 'mystery', ''])
  })

  it('has no segments without a catalog, and none for no activities', () => {
    expect(groupByActivityType([routine('a', 'school')], undefined)).toBeNull()
    expect(groupByActivityType([], catalog)).toEqual([])
  })
})

describe('offeredTypes', () => {
  it('offers the active ones in order and a retired one only while it is the current', () => {
    expect(offeredTypes(catalog, '').map((t) => t.code)).toEqual(['school', 'sports', 'habits'])
    expect(offeredTypes(catalog, 'old').map((t) => t.code)).toEqual(['school', 'sports', 'old', 'habits'])
  })
})
