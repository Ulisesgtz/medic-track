import type { Account } from '../home/types'
import { FAMILY_NOTICE, longDate, namesList } from './accountText'
import { downloadFamilyChildren } from './api'
import { DownloadCard } from './DownloadCard'

/**
 * For a person of a family whose owner asked to delete her account (specs/070, FR-014): who, which children stop showing and
 * when, and «Descargar sus datos». The children's names are fine here (the person already sees them); they never go in an e-mail.
 */
export function FamilyDeletionNotice({
  account,
  variant,
}: {
  account: Account
  variant: 'phone' | 'desktop'
}) {
  const family = account.family
  if (!family?.deletionScheduledFor) return null
  const names = account.children
    .filter((c) => c.accountId === family.ownerAccountId)
    .map((c) => c.firstName)
  return (
    <DownloadCard
      variant={variant}
      fetchFile={downloadFamilyChildren}
      title={`${family.ownerName} · ${longDate(family.deletionScheduledFor)}`}
      body={FAMILY_NOTICE.body(
        family.ownerName,
        namesList(names),
        longDate(family.deletionScheduledFor),
      )}
      button={FAMILY_NOTICE.download}
    />
  )
}
