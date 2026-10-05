import type { Account } from './types'

// The free plan allows one child (FR-007 of specs/001). Kept in step with the
// backend's `freePlanChildLimit` (see backend/CLAUDE.md).
export const FREE_PLAN_CHILD_LIMIT = 1

/** True when the account is on the free plan and already has as many children as it allows. */
export function atFreePlanLimit(account: Pick<Account, 'plan' | 'children'>): boolean {
  return account.plan === 'free' && account.children.length >= FREE_PLAN_CHILD_LIMIT
}
