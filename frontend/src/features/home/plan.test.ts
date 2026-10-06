import { describe, expect, it } from 'vitest'
import { addChildTarget, atFreePlanLimit } from './plan'
import type { Account, Child } from './types'

const child = (id: string, extra: Partial<Child> = {}): Child => ({
  id, firstName: id, lastName: 'G', birthDate: '2020-01-01', height: null, weight: null, ...extra,
})
const account = (extra: Partial<Account> = {}): Pick<Account, 'id' | 'plan' | 'children' | 'family'> => ({
  id: 'mine', plan: 'free', children: [], ...extra,
})

describe('addChildTarget (specs/032)', () => {
  it('adds to the own account when the person is in no family', () => {
    expect(addChildTarget(account({ children: [child('a')] }))).toMatchObject({ accountId: 'mine', plan: 'free', allowed: true })
  })

  it('adds to the owner account when the person is a Tutor of a family that pays, counting only its children', () => {
    const target = addChildTarget(
      account({
        children: [child('own'), child('shared', { accountId: 'owner', role: 'tutor' })],
        family: { role: 'tutor', ownerAccountId: 'owner', ownerName: 'Ana', plan: 'paid', readOnly: false },
      }),
    )
    expect(target).toMatchObject({ accountId: 'owner', plan: 'paid', allowed: true })
    expect(target.children.map((c) => c.id)).toEqual(['shared'])
  })

  it.each([
    ['a Caregiver', { role: 'caregiver', readOnly: false }],
    ['a child-role member', { role: 'child', readOnly: false }],
    ['a Tutor of a family that stopped paying', { role: 'tutor', readOnly: true }],
  ] as const)('does not let %s add', (_name, family) => {
    const target = addChildTarget(account({ family: { ownerAccountId: 'owner', ownerName: 'Ana', plan: 'paid', ...family } }))
    expect(target.allowed).toBe(false)
  })
})

describe('atFreePlanLimit', () => {
  it('is the free plan with one child already', () => {
    expect(atFreePlanLimit(account({ children: [child('a')] }))).toBe(true)
    expect(atFreePlanLimit(account({ children: [] }))).toBe(false)
    expect(atFreePlanLimit(account({ plan: 'paid', children: [child('a')] }))).toBe(false)
  })

  it('looks at the family plan of a Tutor, not at their own account', () => {
    const tutor = (plan: string, children: Child[]) =>
      account({ plan: 'free', children, family: { role: 'tutor', ownerAccountId: 'owner', ownerName: 'Ana', plan, readOnly: false } })
    const shared = child('s', { accountId: 'owner', role: 'tutor' })
    expect(atFreePlanLimit(tutor('paid', [shared]))).toBe(false)
    expect(atFreePlanLimit(tutor('free', [shared]))).toBe(true)
    expect(atFreePlanLimit(tutor('free', [child('own')]))).toBe(false)
  })

  it('never shows the limit to somebody who cannot add at all', () => {
    expect(
      atFreePlanLimit(account({ children: [child('s', { accountId: 'owner' })], family: { role: 'caregiver', ownerAccountId: 'owner', ownerName: 'Ana', plan: 'free', readOnly: false } })),
    ).toBe(false)
  })
})
