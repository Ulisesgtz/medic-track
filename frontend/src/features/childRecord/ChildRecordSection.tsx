import { Link } from 'react-router-dom'
import { needsConnection, showsLoadError } from '../../shared/offline/queryView'
import { pageHeaderButton } from '../../shared/ui/pageHeaderButton'
import { useChildRecord } from './hooks'
import { hasContent, recordCard } from './recordModel'
import { RecordBody, RecordFooter } from './RecordView'
import { RECORD } from './recordText'

type Variant = 'phone' | 'desktop'

const viewOnlyNote = 'rounded-[14px] border-[1.5px] border-hint-border bg-hint px-3.5 py-3 text-[14px] leading-normal text-body'

/**
 * «Ficha» at the end of the child's detail, next to the Cartilla (specs/073, mock «Ficha del hijo PediTrack» A, B and C). It only
 * reads: «Editar ficha» (outlined) opens the form on its own page, and only for who can edit; a Caregiver sees the same record with
 * «Llamar» and a line saying that only the family edits. Two designs by `variant`, never mixed.
 */
export function ChildRecordSection({ childId, variant }: { childId: string; variant: Variant }) {
  const query = useChildRecord(childId)
  const record = query.data
  const desktop = variant === 'desktop'
  const editHref = `/children/${childId}/ficha/editar`
  const pad = desktop ? 'px-7 pb-5 pt-6' : 'px-4 pb-3.5 pt-4'

  const heading = (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <h2 className={`tracking-[-0.02em] text-ink ${desktop ? 'text-[20px] font-black' : 'text-[18px] font-extrabold'}`}>{RECORD.title}</h2>
      {record?.canEdit && hasContent(record) && (
        <Link to={editHref} className={`${pageHeaderButton('edit', variant)} no-underline`}>
          {RECORD.edit}
        </Link>
      )}
    </div>
  )

  let body = null
  if (record === undefined) {
    if (showsLoadError(query)) {
      body = (
        <div role="alert" className={`${recordCard} ${pad}`}>
          <p className="text-[15px] leading-normal text-body">{RECORD.loadFailed}</p>
          <button type="button" onClick={() => void query.refetch()} className={`${pageHeaderButton('edit', variant)} self-start`}>
            {RECORD.retry}
          </button>
        </div>
      )
    } else if (!needsConnection(query)) {
      body = <div role="status" aria-label={RECORD.loading} className="h-28 animate-pulse rounded-[22px] bg-skel" />
    }
  } else if (!hasContent(record)) {
    body = (
      <div className={`flex flex-col gap-2 rounded-[22px] border-2 border-dashed border-hint-border ${desktop ? 'p-6' : 'px-[18px] py-5'}`}>
        <span className={`font-extrabold text-ink ${desktop ? 'text-[17px]' : 'text-[16px]'}`}>{RECORD.emptyTitle}</span>
        {record.canEdit ? (
          <>
            <p className="text-[15px] leading-[1.55] text-body">{RECORD.emptyBody}</p>
            <div className="mt-1 self-start">
              <Link to={editHref} className={`${pageHeaderButton('edit', variant)} min-h-12 no-underline`}>
                {RECORD.start}
              </Link>
            </div>
          </>
        ) : (
          <p className="text-[15px] leading-[1.55] text-body">{RECORD.viewOnly}</p>
        )}
      </div>
    )
  } else {
    body = (
      <div className={`${recordCard} ${pad}`}>
        {!record.canEdit && (
          <p role="note" className={viewOnlyNote}>
            {RECORD.viewOnly}
          </p>
        )}
        <RecordBody record={record} variant={variant} />
        <RecordFooter record={record} />
      </div>
    )
  }

  return (
    <section id="ficha" aria-label={RECORD.title} className="flex scroll-mt-16 flex-col gap-2.5">
      {heading}
      {body}
    </section>
  )
}
