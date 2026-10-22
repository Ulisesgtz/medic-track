import { useRef, useState, type ChangeEvent } from 'react'
import { useVaccines } from '../../shared/catalog/useCatalog'
import { Notice } from '../../shared/ui/Notice'
import { PhotoViewer } from '../consultations/PhotoViewer'
import { sniffImageMimeType } from '../consultations/imageMime'
import { blobToBase64, shrinkPhoto } from '../consultations/shrinkPhoto'
import { useOcrSuggestion } from '../consultations/useOcrSuggestion'
import { ConfirmDialog } from '../family/ConfirmDialog'
import { VaccinationApiError } from './api'
import { useDeletePhoto, usePhoto, usePhotos, useUploadPhoto } from './hooks'
import { ProposedRows } from './ProposedRows'
import { TEXT, deletePhotoRows, photoLimitText, photoLine } from './vaccineText'
import type { VaccinePhotoMeta } from './types'

const outline =
  'inline-flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border-2 border-action px-5 text-base font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'
const ghost =
  'min-h-11 cursor-pointer rounded-xl px-3 text-[15px] font-extrabold text-action underline hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action'

/** The image of one saved photo, asked for only when it is opened, in the app's own viewer. */
function OpenedPhoto({ childId, id, onClose }: { childId: string; id: string; onClose: () => void }) {
  const photo = usePhoto(childId, id)
  if (photo.isError) {
    return (
      <Notice tone="error">
        <span>{TEXT.photos.openError}</span>{' '}
        <button type="button" className={ghost} onClick={onClose}>
          {TEXT.dialog.close}
        </button>
      </Notice>
    )
  }
  if (!photo.data) return null
  const b64 = photo.data.photoBase64
  return <PhotoViewer src={`data:${sniffImageMimeType(b64)};base64,${b64}`} onClose={onClose} label={TEXT.photos.viewerLabel} />
}

interface CardPhotosProps {
  childId: string
  birthDate: string
  /** Who may save and delete photos (`useChildAccess(...).canAdd`); the server enforces it. */
  canEdit: boolean
}

/**
 * The photos of the paper card (specs/046): save one (the phone offers «Fototeca / Tomar foto / Elegir archivo»: the input has **no**
 * `capture`), see them, open one in full size and delete it. The photo is scaled down in the phone before it is sent, the text is read
 * in the phone (never by a service) and only proposes rows the parent confirms. The cap is 10 photos per child: past it nothing is
 * lost, the parent is told to delete one first.
 */
export function CardPhotos({ childId, birthDate, canEdit }: CardPhotosProps) {
  const photos = usePhotos(childId)
  const upload = useUploadPhoto(childId)
  const remove = useDeletePhoto(childId)
  const vaccines = useVaccines()
  const ocr = useOcrSuggestion()
  const inputRef = useRef<HTMLInputElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const [opened, setOpened] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<VaccinePhotoMeta | null>(null)
  const [failure, setFailure] = useState<'limit' | 'save' | 'shrink' | null>(null)
  const [reading, setReading] = useState(false)
  const [readDone, setReadDone] = useState(false)
  const [proposalOf, setProposalOf] = useState<string | null>(null)

  const list = photos.data?.photos ?? []
  const limit = photos.data?.limit ?? 10
  const full = list.length >= limit

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setFailure(null)
    setProposalOf(null)
    setReadDone(false)
    setReading(true)
    // The text is read from the original, in the phone; the photo that is saved is the scaled-down one.
    const read = ocr.runOcr(file)
    try {
      const small = await shrinkPhoto(file)
      await upload.mutateAsync(await blobToBase64(small))
      if (small === file) setFailure('shrink')
    } catch (error) {
      setFailure(error instanceof VaccinationApiError && error.kind === 'photo_limit' ? 'limit' : 'save')
    }
    await read
    setReading(false)
    setReadDone(true)
  }

  // The reading of the latest photo, once it ends: its text becomes the proposed rows (an empty or failed reading says so and blocks nothing).
  const text = readDone && !reading && !ocr.isRunning ? (ocr.suggestion ?? '') : null
  const proposing = text !== null && proposalOf !== text
  const readingPercent = Math.round(ocr.progress * 100)

  return (
    <section aria-label={TEXT.photos.title} className="flex flex-col gap-4">
      <h2 className="text-xl font-black tracking-[-0.02em] text-ink">{TEXT.photos.title}</h2>
      <p className="text-[13px] leading-relaxed text-body">{TEXT.photos.privacy}</p>

      {photos.isError && <Notice tone="error">{TEXT.photos.loadError}</Notice>}
      {failure === 'limit' && <Notice tone="info">{photoLimitText(limit)}</Notice>}
      {failure === 'save' && <Notice tone="error">{TEXT.photos.saveError}</Notice>}
      {failure === 'shrink' && <Notice tone="info">{TEXT.photos.notShrunk}</Notice>}

      {canEdit && (
        <div className="flex flex-col gap-2">
          <input ref={inputRef} type="file" accept="image/*" className="hidden" aria-label={TEXT.photos.add} onChange={(e) => void onPick(e)} />
          <button
            ref={addRef}
            type="button"
            className={`${outline} self-start`}
            disabled={upload.isPending || reading || full}
            onClick={() => inputRef.current?.click()}
          >
            {upload.isPending ? TEXT.photos.saving : TEXT.photos.add}
          </button>
          {full && failure !== 'limit' && <p className="text-[13px] font-semibold text-body">{photoLimitText(limit)}</p>}
        </div>
      )}

      {reading && (
        <div className="flex flex-col gap-1" aria-live="polite">
          <p className="text-[13px] font-bold text-body">{TEXT.proposed.reading}</p>
          <div role="progressbar" aria-label={TEXT.proposed.reading} aria-valuemin={0} aria-valuemax={100} aria-valuenow={readingPercent} className="h-2 overflow-hidden rounded-full bg-hint-edge">
            <div className="h-full bg-action transition-[width] duration-300" style={{ width: `${readingPercent}%` }} />
          </div>
        </div>
      )}

      {proposing && canEdit && (
        <ProposedRows childId={childId} birthDate={birthDate} text={text} catalog={vaccines.data ?? []} onDone={() => setProposalOf(text)} />
      )}

      {photos.isPending ? null : list.length === 0 ? (
        <p className="text-[15px] text-body">{TEXT.photos.empty}</p>
      ) : (
        <ul aria-label={TEXT.photos.title} className="flex flex-col gap-2">
          {list.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl bg-surface px-4 py-2 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
              <span className="min-w-0 text-[15px] font-semibold text-ink [overflow-wrap:anywhere]">{photoLine(p)}</span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className={ghost}
                  aria-label={`${TEXT.photos.open} · ${photoLine(p)}`}
                  onClick={(e) => {
                    openerRef.current = e.currentTarget
                    setOpened(p.id)
                  }}
                >
                  {TEXT.photos.open}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    className={ghost}
                    aria-label={`${TEXT.photos.remove} · ${photoLine(p)}`}
                    onClick={(e) => {
                      openerRef.current = e.currentTarget
                      setDeleting(p)
                    }}
                  >
                    {TEXT.photos.remove}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {opened && <OpenedPhoto childId={childId} id={opened} onClose={() => setOpened(null)} />}
      {deleting && (
        <ConfirmDialog
          title={TEXT.photos.deleteTitle}
          rows={deletePhotoRows(deleting)}
          confirmLabel={TEXT.confirmDelete.confirm}
          cancelLabel={TEXT.confirmDelete.cancel}
          busyLabel={TEXT.confirmDelete.busy}
          tone="ink"
          busy={remove.isPending}
          error={remove.isError ? TEXT.photos.deleteError : null}
          onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
          onCancel={() => {
            if (!remove.isPending) setDeleting(null)
          }}
          opener={openerRef}
        />
      )}
    </section>
  )
}
