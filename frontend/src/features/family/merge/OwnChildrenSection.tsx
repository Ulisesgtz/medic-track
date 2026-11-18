import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Account } from '../../home/types'
import { cardClass, smallOutline } from './MergeFrame'
import { FAMILY_SECTION } from './mergeText'
import { useSetHiddenChildren } from './hooks'
import { ownChildrenOf } from './ownChildren'

/**
 * «Tus hijos y los de la familia» (specs/074, mock H2 and H3) in «Familia», for a person invited who had children of their own:
 * join one with a child of the family (who can do everything) and hide or show their own. Two outlined buttons, no solid one:
 * none of them is the page's main action.
 */
export function OwnChildrenSection({ account, canMerge, variant }: { account: Account; canMerge: boolean; variant: 'phone' | 'desktop' }) {
  const hide = useSetHiddenChildren(account.id)
  const [failed, setFailed] = useState(false)
  const { visible, hidden } = ownChildrenOf(account)
  if (visible.length + hidden.length === 0) return null

  const allHidden = visible.length === 0
  const set = (ids: string[]) => {
    setFailed(false)
    hide.mutate(ids, { onError: () => setFailed(true) })
  }
  return (
    <section className={`${cardClass} flex flex-col gap-3 p-4 ${variant === 'desktop' ? 'px-6 py-5' : ''}`} aria-labelledby="own-children-title">
      <h2 id="own-children-title" className="text-[18px] font-extrabold text-ink">
        {FAMILY_SECTION.title}
      </h2>
      <p className="text-[15px] leading-[1.55] text-body">{allHidden ? FAMILY_SECTION.hiddenBody : FAMILY_SECTION.visibleBody}</p>
      <div className="flex flex-col items-start gap-2.5">
        {canMerge && (
          <Link to="/familia/unir" className={smallOutline}>
            {FAMILY_SECTION.merge}
          </Link>
        )}
        {allHidden ? (
          <button type="button" disabled={hide.isPending} onClick={() => set([])} className={smallOutline}>
            {FAMILY_SECTION.showAll}
          </button>
        ) : (
          <button type="button" disabled={hide.isPending} onClick={() => set([...visible, ...hidden].map((c) => c.id))} className={smallOutline}>
            {FAMILY_SECTION.hide}
          </button>
        )}
      </div>
      {failed && (
        <p role="alert" className="text-[14px] font-semibold text-ink">
          {FAMILY_SECTION.failed}
        </p>
      )}
    </section>
  )
}
