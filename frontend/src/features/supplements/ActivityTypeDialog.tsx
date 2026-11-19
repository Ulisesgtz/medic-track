import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useActivityTypes } from '../../shared/catalog/useCatalog'
import { useBodyScrollLock } from '../../shared/ui/useBodyScrollLock'
import { useIsDesktop } from '../../shared/ui/useIsDesktop'
import { ActivityTypePicker } from './ActivityTypePicker'
import { ACTIVITY_TYPE_TEXT, chooseLegend } from './activityTypeText'

interface ActivityTypeDialogProps {
  /** The activity's name: the dialog's subtitle. */
  activityName: string
  /** The activity's current type; it starts chosen. */
  current: string
  busy: boolean
  /** A sentence when the server refused or the network failed. */
  error: string | null
  onSave: (code: string) => void
  onCancel: () => void
  /** The «Cambiar» button that opened this: focus goes back to it. */
  opener: RefObject<HTMLElement | null>
}

const outlineButton =
  'min-h-[52px] cursor-pointer rounded-2xl border-2 border-action bg-transparent text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'

/**
 * specs/075 (mock D1): «Cambiar» the type of an activity — a bottom sheet on the phone (grabber, canvas background, the buttons side by
 * side with «Guardar» filling the row), a centered 520 px dialog on the web (the buttons at the right). The active types with the current
 * one marked; «Guardar» sends the new one and does nothing when it is the same. It only moves the activity to another group: no
 * schedule, mark or reminder changes, and the plan is not asked. Escape and the backdrop cancel (not while saving), the focus starts on
 * the chosen type's group and Tab stays inside.
 */
export function ActivityTypeDialog({ activityName, current, busy, error, onSave, onCancel, opener }: ActivityTypeDialogProps) {
  const id = useId()
  const desktop = useIsDesktop()
  const catalog = useActivityTypes()
  const [chosen, setChosen] = useState(current)
  const dialogRef = useRef<HTMLDivElement>(null)
  // The latest values, read by the key handler: the effect below runs only when the dialog opens, so a parent that re-renders (the
  // detail's 60 s refetch, `isPending` changing) never moves the focus nor restores it early.
  const busyRef = useRef(busy)
  const onCancelRef = useRef(onCancel)
  useEffect(() => {
    busyRef.current = busy
    onCancelRef.current = onCancel
  })
  const currentName = (Array.isArray(catalog.data) ? catalog.data.find((t) => t.code === current)?.name : undefined) ?? ''

  useEffect(() => {
    const restoreTo = opener.current
    dialogRef.current?.querySelector<HTMLElement>('input[type="radio"]:checked, input[type="radio"], button:not([disabled])')?.focus()
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (!busyRef.current) onCancelRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input[type="radio"]:checked, button:not([disabled])') ?? [])
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      restoreTo?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens: the opener is the button that opened it
  }, [])
  useBodyScrollLock()

  const body = (
    <>
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="m-0 text-[22px] leading-[normal] font-black tracking-[-0.02em] text-ink">
          {ACTIVITY_TYPE_TEXT.dialogTitle}
        </h2>
        <span className="text-[15px] leading-[normal] font-bold text-ink">{activityName}</span>
        <span id={`${id}-body`} className="text-sm leading-[1.5] text-body">
          {ACTIVITY_TYPE_TEXT.dialogText}
        </span>
      </div>
      <ActivityTypePicker value={chosen} onChange={setChosen} legend={chooseLegend(currentName)} />
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-red-700">
          {error}
        </p>
      )}
    </>
  )
  const cancel = (
    <button type="button" onClick={onCancel} disabled={busy} className={`${outlineButton} ${desktop ? 'px-6' : 'px-5'} text-[16px]`}>
      {ACTIVITY_TYPE_TEXT.cancel}
    </button>
  )
  const save = (
    <button
      type="button"
      onClick={() => (chosen === current ? onCancel() : onSave(chosen))}
      disabled={busy || chosen === ''}
      className={`min-h-[52px] cursor-pointer rounded-2xl bg-confirmed px-6 text-[17px] font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${desktop ? 'min-w-40' : 'flex-1'}`}
    >
      {busy ? ACTIVITY_TYPE_TEXT.saving : ACTIVITY_TYPE_TEXT.save}
    </button>
  )

  return createPortal(
    <div className="fixed inset-0 z-50 bg-ink/55" onClick={() => !busy && onCancel()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        onClick={(e) => e.stopPropagation()}
        className={
          desktop
            ? 'absolute top-1/2 left-1/2 flex max-h-[90vh] w-[520px] max-w-[calc(100%-48px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-[22px] bg-canvas p-7 shadow-[0_24px_60px_rgba(4,37,43,0.35)]'
            : 'absolute inset-x-0 bottom-0 flex max-h-[90vh] flex-col gap-4 overflow-y-auto rounded-t-[28px] bg-canvas px-5 pt-2.5 pb-[26px]'
        }
      >
        {!desktop && <span aria-hidden="true" className="h-1 w-10 flex-none self-center rounded-full bg-slate-400" />}
        <div className="flex flex-col gap-3.5">{body}</div>
        <div className={`flex gap-2.5 ${desktop ? 'justify-end gap-3' : ''}`}>
          {cancel}
          {save}
        </div>
      </div>
    </div>,
    document.body,
  )
}
