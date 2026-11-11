import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { PhotoViewer } from '../consultations/PhotoViewer'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useSidebarSession } from '../home/useSidebarSession'
import { RoutinePageFrame } from '../supplements/RoutineFormPage'
import { pageHeaderButton } from '../../shared/ui/pageHeaderButton'
import { CabinetApiError } from './api'
import { cabinetAccess } from './cabinetAccess'
import { CABINET, addedBy, editedBy, expiresDate, quantityText } from './cabinetText'
import { CaregiverNote, card } from './CabinetParts'
import { useCabinetItem, useCabinetPhoto, useDeleteCabinetItem } from './hooks'
import { needsConnection } from '../../shared/offline/queryView'
import { PHOTO_NEEDS_CONNECTION } from '../../shared/offline/offlineText'

/**
 * `/botiquin/:itemId` (specs/062, mock pantalla 4): the box's photo (it opens in the viewer), the data and who added it. No solid
 * button: «Editar» with an outline and «Quitar del botiquín» as text, with a neutral confirmation. A Caregiver only reads.
 */
export function CabinetItemPage() {
  const { itemId } = useParams<{ itemId: string }>()
  const navigate = useNavigate()
  const { isDesktop } = useSidebarSession()
  const desktop = isDesktop
  const variant = desktop ? 'desktop' : 'phone'
  const accountQuery = useCurrentAccount()
  const access = cabinetAccess(accountQuery.data)
  const query = useCabinetItem(access.ownerId, itemId)
  const item = query.data
  const photo = useCabinetPhoto(access.ownerId, itemId, !!item?.hasPhoto)
  const remove = useDeleteCabinetItem(access.ownerId ?? '', itemId ?? '')
  const [viewer, setViewer] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const removeRef = useRef<HTMLButtonElement>(null)

  const missing = query.error instanceof CabinetApiError && (query.error.kind === 'not_found' || query.error.kind === 'forbidden')
  const src = photo.data ? `data:image/jpeg;base64,${photo.data.photoBase64}` : null
  const canEdit = item?.canEdit ?? false

  const actions =
    item && canEdit ? (
      <>
        <Link to={`/botiquin/${item.id}/editar`} className={pageHeaderButton('edit', variant)}>
          {CABINET.edit}
        </Link>
        <button
          ref={removeRef}
          type="button"
          onClick={() => {
            setRemoveError(null)
            setConfirm(true)
          }}
          className="min-h-11 cursor-pointer px-3 text-[15px] font-extrabold text-action hover:underline"
        >
          {CABINET.remove}
        </button>
      </>
    ) : undefined

  const rows = item
    ? [
        { l: CABINET.labels.strength, v: item.strength || '—' },
        { l: CABINET.labels.quantity, v: quantityText(item.quantity, item.unit) },
        { l: CABINET.labels.expires, v: expiresDate(item.expires) },
        ...(item.note ? [{ l: CABINET.labels.note, v: item.note }] : []),
      ]
    : []

  const photoBlock =
    item?.hasPhoto && (
      <button
        type="button"
        onClick={() => src && setViewer(true)}
        aria-label={CABINET.viewPhoto}
        className={`flex-none cursor-pointer overflow-hidden rounded-[22px] border border-hint-border bg-hint ${desktop ? 'h-[440px] w-[360px]' : 'h-60 w-full'}`}
      >
        {src && <img src={src} alt={CABINET.photoViewer} className="h-full w-full object-cover" />}
        {/* specs/067: the photo is never kept on the phone; without a connection its place says so. */}
        {!src && needsConnection(photo) && <span className="flex h-full items-center justify-center px-4 text-[15px] text-muted">{PHOTO_NEEDS_CONNECTION}</span>}
      </button>
    )

  const data = item && (
    <div className={`${card} flex min-w-0 flex-1 flex-col self-start overflow-hidden`}>
      <dl>
        {rows.map((r, i) => (
          <div
            key={r.l}
            className={`${desktop ? 'grid min-h-16 grid-cols-[160px_1fr] items-center gap-4 px-6 py-3' : 'flex flex-col gap-0.5 px-5 py-3.5'} ${i ? 'border-t border-hint-edge' : ''}`}
          >
            <dt className="text-[13px] font-bold text-muted">{r.l}</dt>
            <dd className="text-[17px] font-bold text-ink [overflow-wrap:anywhere]">{r.v}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-hint-edge px-5 py-3.5 text-[14px] text-muted">
        {addedBy(item.createdBy, item.createdAt)}
        {item.updatedBy && item.updatedAt && <span className="block">{editedBy(item.updatedBy, item.updatedAt)}</span>}
      </p>
    </div>
  )

  return (
    <RoutinePageFrame
      isDesktop={desktop}
      childId={undefined}
      backLabel={CABINET.backCabinet}
      backTo="/botiquin"
      title={item?.name ?? CABINET.title}
      subtitle={item?.strength || undefined}
      actions={actions}
      state={needsConnection(query) ? undefined : query.isPending && access.ownerId ? 'loading' : query.isError && !missing && query.data === undefined ? 'error' : undefined}
      errorWhat={CABINET.loadFailed}
      onRetry={() => void query.refetch()}
    >
      {missing && (
        <p className={`${card} p-6 text-base leading-relaxed text-body`}>
          {CABINET.notFound}{' '}
          <Link to="/botiquin" className="font-bold text-action hover:underline">
            {CABINET.backToList}
          </Link>
        </p>
      )}
      {item && !canEdit && <CaregiverNote desktop={desktop} />}
      {item && (desktop ? <div className="flex items-start gap-7">{photoBlock}{data}</div> : <>{photoBlock}{data}</>)}
      {viewer && src && <PhotoViewer src={src} label={CABINET.photoViewer} onClose={() => setViewer(false)} />}
      {confirm && item && (
        <ConfirmDialog
          title={CABINET.removeTitle(item.name)}
          rows={[{ k: '', v: CABINET.removeBody }]}
          confirmLabel={CABINET.remove}
          busyLabel={CABINET.removing}
          tone="ink"
          busy={remove.isPending}
          error={removeError}
          onConfirm={() =>
            remove.mutate(undefined, {
              onSuccess: () => navigate('/botiquin', { replace: true }),
              onError: () => setRemoveError(CABINET.removeFailed),
            })
          }
          onCancel={() => setConfirm(false)}
          opener={removeRef}
        />
      )}
    </RoutinePageFrame>
  )
}
