import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '../../shared/ui/useBodyScrollLock'
import { pageHeaderButton } from '../../shared/ui/pageHeaderButton'
import { RecordBody, RecordFooter } from './RecordView'
import { FORM, RECORD } from './recordText'
import type { ChildRecord } from './types'

/**
 * «Ver la versión nueva» (state E): the record somebody else saved, read-only, in a window of its own, so the form behind keeps
 * everything that was typed. Escape and «Cerrar» close it; the focus goes back to the button that opened it.
 */
export function NewVersionDialog({
  record,
  variant,
  opener,
  onClose,
}: {
  record: ChildRecord
  variant: 'phone' | 'desktop'
  opener: RefObject<HTMLElement | null>
  onClose: () => void
}) {
  useBodyScrollLock()
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const latest = useRef(onClose)
  useEffect(() => {
    latest.current = onClose
  })

  useEffect(() => {
    const restoreTo = opener.current
    closeRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') latest.current()
      if (event.key === 'Tab') {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button, a[href]') ?? [])
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
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      restoreTo?.focus()
    }
  }, [opener])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 sm:items-center" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={FORM.seeNewVersion}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-[640px] flex-col gap-4 overflow-y-auto overscroll-contain rounded-t-[22px] bg-canvas p-5 sm:rounded-[22px]"
      >
        <h2 className="text-[18px] font-extrabold text-ink">{RECORD.title}</h2>
        <div className="flex flex-col gap-3.5 rounded-[22px] bg-surface p-4">
          <RecordBody record={record} variant={variant} />
          <RecordFooter record={record} />
        </div>
        <button ref={closeRef} type="button" onClick={onClose} className={`${pageHeaderButton('secondary', variant)} self-end`}>
          {FORM.close}
        </button>
      </div>
    </div>,
    document.body,
  )
}
