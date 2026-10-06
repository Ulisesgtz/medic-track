import { describe, expect, it } from 'vitest'
import type { Child } from '../home/types'
import { childAccessOf } from './useChildAccess'

const child = (extra: Partial<Child> = {}): Child => ({
  id: 'c1', firstName: 'Luis', lastName: 'Gómez', birthDate: '2020-01-15', height: null, weight: null, ...extra,
})

describe('childAccessOf', () => {
  it('treats a child without family data as the account\'s own, with the account\'s plan', () => {
    const access = childAccessOf({ plan: 'free' }, child())
    expect(access).toMatchObject({ role: 'owner', plan: 'free', readOnly: false, canAdd: true, canMark: true, isFree: true })
  })

  it('uses the plan of the child\'s family, not the session\'s own', () => {
    const access = childAccessOf({ plan: 'free' }, child({ role: 'tutor', plan: 'paid', accountId: 'o1' }))
    expect(access).toMatchObject({ role: 'tutor', plan: 'paid', isFree: false, canAdd: true, canInvite: true })
  })

  it('lets a caregiver and a child-role member see and mark but not add or invite', () => {
    for (const role of ['caregiver', 'child'] as const) {
      const access = childAccessOf({ plan: 'free' }, child({ role, plan: 'paid' }))
      expect(access).toMatchObject({ canAdd: false, canInvite: false, canMark: true })
    }
  })

  it('a read-only tutor can still mark, but not add or invite', () => {
    const access = childAccessOf({ plan: 'free' }, child({ role: 'tutor', plan: 'free', readOnly: true }))
    expect(access).toMatchObject({ canAdd: false, canInvite: false, canMark: true, readOnly: true })
  })

  it('never reads as free while nothing has loaded (no pop-up before the plan is known)', () => {
    expect(childAccessOf(undefined, undefined)).toMatchObject({ role: 'owner', isFree: false })
  })
})
