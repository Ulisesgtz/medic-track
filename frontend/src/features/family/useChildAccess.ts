import type { Account, Child, FamilyRole } from '../home/types'

/**
 * What the session can do with one child (specs/032-compartir-con-familia). The backend decides and enforces it; this is
 * only what the screens show, so a button that would answer 403 is never offered.
 *
 * - The owner and a Tutor can do everything; a Caregiver and a Child-role member only see and mark.
 * - `plan` is the plan of the child's FAMILY (the owner account's), not the session's own: a Tutor on a free account
 *   inside a paid family works with the paid plan.
 * - `readOnly` (an invited person whose family stopped paying) can't add anything, but still marks doses.
 */
export interface ChildAccess {
  role: FamilyRole
  plan: string
  readOnly: boolean
  /** Add consultations, end and extend treatments. */
  canAdd: boolean
  /** Mark and unmark doses (never taken away: it is for safety). */
  canMark: boolean
  canInvite: boolean
  isFree: boolean
}

export function childAccessOf(account: Pick<Account, 'plan'> | undefined, child: Child | undefined): ChildAccess {
  const role: FamilyRole = child?.role ?? 'owner'
  const plan = child?.plan ?? account?.plan ?? 'free'
  const readOnly = child?.readOnly ?? false
  const full = role === 'owner' || role === 'tutor'
  return {
    role,
    plan,
    readOnly,
    canAdd: full && !readOnly,
    canMark: true,
    canInvite: full && !readOnly,
    isFree: account !== undefined && plan === 'free',
  }
}

export function useChildAccess(account: Account | undefined, childId: string | undefined): ChildAccess {
  return childAccessOf(account, account?.children.find((c) => c.id === childId))
}
