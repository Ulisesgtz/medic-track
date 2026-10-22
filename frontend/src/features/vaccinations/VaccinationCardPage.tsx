import { useCallback, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { ConfirmDialog } from '../family/ConfirmDialog'
import { useChildAccess } from '../family/useChildAccess'
import { useSidebarSession } from '../home/useSidebarSession'
import { RoutinePageFrame } from '../supplements/RoutineFormPage'
import { useDeleteVaccination, useVaccinations } from './hooks'
import { CardPhotos } from './CardPhotos'
import { VaccineDialog } from './VaccineDialog'
import { VaccineList } from './VaccineList'
import { TEXT, deleteRows } from './vaccineText'
import type { Vaccination } from './types'

const solid =
  'inline-flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-2xl bg-confirmed px-5 text-[17px] font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 sm:w-auto'
const outline =
  'inline-flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border-2 border-action px-5 text-base font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2'
const card = 'flex flex-col gap-3 rounded-[22px] bg-surface px-[22px] py-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]'

type Open = { kind: 'add' } | { kind: 'edit'; dose: Vaccination } | null

/**
 * `/children/:childId/cartilla` (specs/046): the child's vaccination card, in two designs (phone: a dark header and one column; web:
 * inside `AppShell`, a text header). It records what the parent captured and never interprets it: no «due», no «late», no «complete»,
 * no percentages and no colors of alert (Principio I) — and says so, always (`TEXT.note`). Who may add, correct and delete comes from
 * `useChildAccess(...).canAdd` (the server enforces it); a Caregiver only sees.
 */
export function VaccinationCardPage() {
  const { childId } = useParams<{ childId: string }>()
  const { isDesktop } = useSidebarSession()
  const account = useCurrentAccount().data
  const access = useChildAccess(account, childId)
  const child = account?.children.find((c) => c.id === childId)
  const query = useVaccinations(childId)
  const remove = useDeleteVaccination(childId ?? '')
  const [open, setOpen] = useState<Open>(null)
  const [deleting, setDeleting] = useState<Vaccination | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const closeDialog = useCallback(() => setOpen(null), [])
  const closeDelete = useCallback(() => {
    if (!remove.isPending) setDeleting(null)
  }, [remove.isPending])

  const canEdit = !!account && access.canAdd
  const doses = query.data

  let content
  if (!account || query.isPending) {
    content = <p className="text-base font-semibold text-action">{TEXT.loading}</p>
  } else if (query.isError) {
    content = (
      <div className={card} role="status">
        <h2 className="text-xl font-black text-ink">{TEXT.loadError}</h2>
        <button type="button" className={outline} onClick={() => void query.refetch()}>
          {TEXT.retry}
        </button>
      </div>
    )
  } else if (doses && doses.length === 0) {
    content = (
      <div className="flex flex-col gap-2 rounded-[22px] border-2 border-dashed border-hint-border px-[22px] py-5">
        <h2 className="text-lg font-black tracking-[-0.02em] text-ink">{TEXT.empty.title}</h2>
        <p className="text-[15px] leading-relaxed text-body">{TEXT.empty.body}</p>
      </div>
    )
  } else if (doses) {
    content = (
      <VaccineList
        doses={doses}
        canEdit={canEdit}
        onEdit={(dose, opener) => {
          openerRef.current = opener
          setOpen({ kind: 'edit', dose })
        }}
        onDelete={(dose, opener) => {
          openerRef.current = opener
          setDeleting(dose)
        }}
      />
    )
  }

  return (
    <RoutinePageFrame
      isDesktop={isDesktop}
      childId={childId}
      backLabel={child ? `← ${child.firstName}` : TEXT.back}
      backTo={`/children/${childId}`}
      eyebrow={child ? child.firstName : 'PediTrack'}
      title={TEXT.title}
    >
      <p className="text-[15px] leading-normal text-body">{TEXT.note}</p>
      {canEdit && (
        <div>
          <button
            ref={addRef}
            type="button"
            className={solid}
            onClick={() => {
              openerRef.current = addRef.current
              setOpen({ kind: 'add' })
            }}
          >
            {TEXT.add}
          </button>
        </div>
      )}
      <div className={isDesktop ? 'grid grid-cols-[minmax(0,1fr)_340px] items-start gap-8' : 'flex flex-col gap-7'}>
        <div className="min-w-0">{content}</div>
        {childId && child && !!account && <CardPhotos childId={childId} birthDate={child.birthDate} canEdit={canEdit} />}
      </div>
      {open && child && (
        <VaccineDialog
          childId={childId!}
          birthDate={child.birthDate}
          vaccination={open.kind === 'edit' ? open.dose : undefined}
          onClose={closeDialog}
          opener={openerRef}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={TEXT.confirmDelete.title}
          rows={deleteRows(deleting)}
          confirmLabel={TEXT.confirmDelete.confirm}
          cancelLabel={TEXT.confirmDelete.cancel}
          busyLabel={TEXT.confirmDelete.busy}
          tone="ink"
          busy={remove.isPending}
          error={remove.isError ? TEXT.confirmDelete.error : null}
          onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
          onCancel={closeDelete}
          opener={openerRef}
        />
      )}
    </RoutinePageFrame>
  )
}
