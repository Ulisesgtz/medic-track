import { useState } from 'react'
import type { Account } from '../../home/types'
import { cardClass, noteClass, smallOutline } from './MergeFrame'
import { HIDDEN, OWN_TAG, holdingsLine } from './mergeText'
import { useMergeOptions, useSetHiddenChildren } from './hooks'

const chip = 'whitespace-nowrap rounded-full border border-hint-border bg-hint px-2.5 py-[3px] text-[13px] font-extrabold text-action'

/**
 * «Hijos ocultos» of «Mi cuenta» (specs/074, mock H1): each hidden child with what it holds and «Volver a mostrar», and the note
 * that they are in «Descargar todos mis datos». The counts come from the merge options (the account only lists names).
 */
export function HiddenChildren({ account, variant }: { account: Account; variant: 'phone' | 'desktop' }) {
  const hidden = account.hiddenChildren ?? []
  const options = useMergeOptions(hidden.length > 0)
  const set = useSetHiddenChildren(account.id)
  const [failed, setFailed] = useState(false)
  if (hidden.length === 0) return null

  const byId = new Map((options.data?.ownChildren ?? []).map((c) => [c.id, c]))
  const show = (id: string) => {
    setFailed(false)
    set.mutate(hidden.filter((h) => h.id !== id).map((h) => h.id), { onError: () => setFailed(true) })
  }
  const owner = account.family?.ownerName.split(' ')[0] ?? null
  return (
    <>
      <section className={`${cardClass} flex flex-col p-4 ${variant === 'desktop' ? 'px-[22px] py-5' : ''}`} aria-labelledby="hidden-title">
        <div className="flex flex-col gap-1 pb-3">
          <h2 id="hidden-title" className="text-[18px] font-extrabold text-ink">
            {HIDDEN.title}
          </h2>
          <span className="text-[14px] leading-normal text-body">{HIDDEN.intro(owner)}</span>
        </div>
        {hidden.map((h) => {
          const full = byId.get(h.id)
          return (
            <div key={h.id} className="flex items-center justify-between gap-3 border-t border-hint-edge py-3.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[17px] font-extrabold text-ink">{full ? `${full.firstName} ${full.lastName}` : h.firstName}</span>
                  <span className={chip}>{OWN_TAG}</span>
                </div>
                {full && <span className="text-[14px] text-body">{holdingsLine(full.counts, full.record.exists)}</span>}
              </div>
              <button type="button" aria-label={`${HIDDEN.show} a ${h.firstName}`} disabled={set.isPending} onClick={() => show(h.id)} className={`${smallOutline} px-3.5`}>
                {HIDDEN.show}
              </button>
            </div>
          )
        })}
      </section>
      {failed && (
        <p role="alert" className="text-[14px] font-semibold text-ink">
          {HIDDEN.failed}
        </p>
      )}
      <div role="note" className={noteClass}>
        {HIDDEN.note}
      </div>
    </>
  )
}
