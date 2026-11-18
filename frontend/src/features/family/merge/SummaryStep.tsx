import { Link } from 'react-router-dom'
import { cardClass, noteClass } from './MergeFrame'
import { DownloadReadyActions, DownloadStatus } from '../../account/DownloadCard'
import type { useDownload } from '../../account/useDownload'
import {
  SUMMARY,
  holdingsLine,
  limitNotice,
  mergeWarning,
  pairHeading,
  phoneLine,
  quedaraCon,
  tooLongLine,
} from './mergeText'
import type { MergeChild, MergePairPreview } from './types'

export interface SummaryPair {
  preview: MergePairPreview
  own: MergeChild
  family: MergeChild
}

/** D and D2: what goes where, the cap notice (a light-blue block, never amber), the ink box of what can't be undone. */
export function SummaryStep({
  pairs,
  unpaired,
  ownerFirstName,
  download,
}: {
  pairs: SummaryPair[]
  unpaired: MergeChild[]
  ownerFirstName: string
  download: ReturnType<typeof useDownload>
}) {
  const notices = pairs.flatMap((p) =>
    p.preview.overLimits.map((o) => limitNotice(p.own.firstName, o)).filter((t): t is string => t !== null),
  )
  const devices = pairs.filter((p) => p.preview.moves.devicesRemoved > 0)
  const tooLong = pairs.filter((p) => p.preview.recordTooLong !== null)
  return (
    <>
      <p className="text-[16px] text-body">{SUMMARY.intro}</p>
      <section className={`${cardClass} flex max-w-[760px] flex-col p-4`}>
        <span className="pb-3 text-[12px] font-extrabold tracking-[0.08em] text-action uppercase">{SUMMARY.joinHeading}</span>
        {pairs.map((p) => (
          <div key={p.preview.ownChildId} className="flex flex-col gap-1 border-b border-hint-edge py-3.5 last:border-b-0">
            <span className="text-[17px] font-extrabold text-ink">{pairHeading(p.own.firstName, p.family.firstName)}</span>
            <span className="text-[14px] text-body">{holdingsLine(p.preview.moves, p.preview.moves.record)}</span>
            {p.preview.overLimits.map((o) => {
              const t = quedaraCon(o)
              return t ? (
                <span key={o.kind} className="text-[14px] font-bold text-ink">
                  {t}
                </span>
              ) : null
            })}
          </div>
        ))}
        {unpaired.map((c) => (
          <div key={c.id} className="flex flex-col gap-1 border-t border-hint-edge pt-3.5 pb-0.5">
            <span className="text-[17px] font-extrabold text-ink">
              {c.firstName} {c.lastName}
            </span>
            <span className="text-[14px] text-body">{SUMMARY.unchanged}</span>
          </div>
        ))}
      </section>
      {notices.length > 0 && (
        <div role="note" className={`${noteClass} max-w-[760px]`}>
          <strong className="font-extrabold">{SUMMARY.noticeLead}</strong> {notices.join(' ')}
        </div>
      )}
      {tooLong.map((p) => {
        const t = p.preview.recordTooLong!
        return (
          <div key={p.preview.ownChildId} role="alert" className={`${noteClass} max-w-[760px]`}>
            <strong className="font-extrabold">{SUMMARY.tooLongLead}</strong> {tooLongLine(p.own.firstName, t.list, t.resulting, t.limit)}{' '}
            <Link to={`/children/${p.own.id}/ficha/editar`} className="font-extrabold text-action underline">
              {SUMMARY.openRecord}
            </Link>
          </div>
        )
      })}
      <div role="note" className="flex max-w-[760px] flex-col gap-2.5 rounded-2xl border-[1.5px] border-ink bg-surface p-4 text-[15px] leading-[1.55] text-ink">
        <span className="font-extrabold">{mergeWarning(ownerFirstName)}</span>
        {devices.map((p) => (
          <span key={p.preview.ownChildId} className="text-[14px] text-body">
            {phoneLine(p.own.firstName, p.preview.moves.devicesRemoved)}
          </span>
        ))}
      </div>
      <div className="flex max-w-[760px] flex-col gap-3">
        <DownloadStatus download={download} />
        <div className="flex gap-3 empty:hidden">
          <DownloadReadyActions download={download} variant="phone" />
        </div>
      </div>
    </>
  )
}
