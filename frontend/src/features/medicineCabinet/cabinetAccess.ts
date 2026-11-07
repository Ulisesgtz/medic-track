import type { Account } from '../home/types'

export interface CabinetAccess {
  /** The family's owner account: the cabinet is theirs (specs/062 research R1). */
  ownerId: string | undefined
  canView: boolean
  /** Edit and remove: the owner (any plan) or a Tutor of a paid family. */
  canEdit: boolean
  /** Add: the same people, with the family on the paid plan. */
  canAdd: boolean
  /** The family's plan is not paid (the home's entry carries «Plan completo»). */
  isFree: boolean
}

/**
 * What the session can do with the family's medicine cabinet. Only avoids offering what the server would refuse: the server decides
 * with the same family rule (`access.OnAccount`). A Child-role member sees nothing; a Caregiver and a Tutor of a lapsed family only see.
 */
export function cabinetAccess(account: Account | undefined): CabinetAccess {
  if (!account) return { ownerId: undefined, canView: false, canEdit: false, canAdd: false, isFree: false }
  const family = account.family
  if (!family) {
    const paid = account.plan === 'paid'
    return { ownerId: account.id, canView: true, canEdit: true, canAdd: paid, isFree: !paid }
  }
  const paid = family.plan === 'paid'
  if (family.role === 'child') return { ownerId: family.ownerAccountId, canView: false, canEdit: false, canAdd: false, isFree: !paid }
  const full = family.role === 'tutor' && paid
  return { ownerId: family.ownerAccountId, canView: true, canEdit: full, canAdd: full, isFree: !paid }
}
