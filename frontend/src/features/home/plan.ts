import type { Account, Child } from './types'

// The free plan allows one child (FR-007 of specs/001). Kept in step with the
// backend's `freePlanChildLimit` (see backend/CLAUDE.md).
export const FREE_PLAN_CHILD_LIMIT = 1

/**
 * Where "Agregar hijo" adds (specs/032-compartir-con-familia): a child is always added to a family. The session's own
 * account, unless it is a Tutor of somebody else's family — then to that family's owner account, whose plan and limit
 * are the ones that count. A Caregiver, a Child-role member and a Tutor whose family stopped paying can't add.
 */
export interface AddChildTarget {
  /** The account the child is added to (the backend's `POST /accounts/{accountId}/children`). */
  accountId: string
  plan: string
  /** The children already in that account: what the plan's limit counts. */
  children: Child[]
  allowed: boolean
}

export function addChildTarget(account: Pick<Account, 'id' | 'plan' | 'children' | 'family'>): AddChildTarget {
  const family = account.family
  if (!family) {
    return { accountId: account.id, plan: account.plan, children: account.children, allowed: true }
  }
  return {
    accountId: family.ownerAccountId,
    plan: family.plan,
    children: account.children.filter((c) => c.accountId === family.ownerAccountId),
    allowed: family.role === 'tutor' && !family.readOnly,
  }
}

/** True when "Agregar hijo" adds to a free plan that already has as many children as it allows. */
export function atFreePlanLimit(account: Pick<Account, 'id' | 'plan' | 'children' | 'family'>): boolean {
  const target = addChildTarget(account)
  return target.allowed && target.plan === 'free' && target.children.length >= FREE_PLAN_CHILD_LIMIT
}
