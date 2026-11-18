import type { Account, Child } from '../../home/types'

/** A child of the account itself (not one shared by a family): `accountId` absent means own, as everywhere else. */
export const isOwnChild = (child: Child, account: Account): boolean => (child.accountId ?? account.id) === account.id

/** The person's own children shown (`children`) and hidden (`hiddenChildren`, specs/074). */
export function ownChildrenOf(account: Account): { visible: Child[]; hidden: { id: string; firstName: string }[] } {
  return { visible: account.children.filter((c) => isOwnChild(c, account)), hidden: account.hiddenChildren ?? [] }
}

/** The own children are only labeled «Tuyo» / «Familia» while both kinds are on screen. */
export function showsOwnership(account: Account | undefined): boolean {
  if (!account) return false
  const own = account.children.some((c) => isOwnChild(c, account))
  return own && account.children.some((c) => !isOwnChild(c, account))
}
