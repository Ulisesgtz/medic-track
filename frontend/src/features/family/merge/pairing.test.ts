import { describe, expect, it } from 'vitest'
import { differences, normalizeName, suggestPairs } from './pairing'
import type { MergeChild } from './types'

const child = (id: string, firstName: string, lastName = '', extra: Partial<MergeChild> = {}): MergeChild => ({
  id, firstName, lastName, birthDate: '2022-03-03', height: null, weight: null, growthReferenceSex: null,
  record: { exists: false, allergies: 0, conditions: 0 },
  counts: { consultations: 0, vaccines: 0, cardPhotos: 0, measurements: 0, supplements: 0, activities: 0, activeDevices: 0 },
  ...extra,
})

describe('pairing', () => {
  it('normalizes accents, case and spaces', () => {
    expect(normalizeName('  JOSÉ   Luis ')).toBe('jose luis')
    expect(normalizeName(null)).toBe('')
  })

  it('pairs by name, and by last name only when both have one; never by date', () => {
    const own = [child('o1', 'Mateo', 'López', { birthDate: '2020-01-01' }), child('o2', 'Sofía', ''), child('o3', 'Luz', 'Pérez')]
    const fam = [child('f1', 'mateo', 'LOPEZ'), child('f2', 'Sofia', 'Ruiz'), child('f3', 'Luz', 'Gómez')]
    expect(suggestPairs(own, fam)).toEqual([
      { ownChildId: 'o1', familyChildId: 'f1' },
      { ownChildId: 'o2', familyChildId: 'f2' },
    ])
  })

  it('uses each child once and ignores empty names', () => {
    expect(suggestPairs([child('o1', 'Ana'), child('o2', 'Ana'), child('o3', '')], [child('f1', 'Ana'), child('f2', '')])).toEqual([
      { ownChildId: 'o1', familyChildId: 'f1' },
    ])
  })

  it('lists the differing fields', () => {
    const a = child('a', 'Mateo', 'López', { height: 90, weight: 13, growthReferenceSex: 'boy', record: { exists: true, bloodType: 'O+', allergies: 0, conditions: 0, pediatrician: { name: 'A', phone: null, office: null }, generalNote: 'x' } })
    const b = child('b', 'Mateo ', 'Lopez', { birthDate: '2022-03-04', height: 90, weight: null, growthReferenceSex: 'boy', record: { exists: true, bloodType: 'A+', allergies: 0, conditions: 0, pediatrician: { name: 'B', phone: null, office: null }, generalNote: ' ' } })
    expect(differences(a, b)).toEqual(['lastName', 'birthDate', 'weight', 'bloodType', 'pediatrician', 'generalNote'])
    expect(differences(a, a)).toEqual([])
    const noRecord = child('d', 'Z', 'W')
    expect(differences(child('c', 'X', 'Y', { record: { exists: true, bloodType: 'O+', allergies: 0, conditions: 0 } }), noRecord)).toEqual(['firstName', 'lastName'])
  })

  it('compares the sex of the growth table', () => {
    expect(differences(child('a', 'A', '', { growthReferenceSex: 'girl' }), child('b', 'A', '', { growthReferenceSex: 'boy' }))).toEqual(['growthReferenceSex'])
  })
})
