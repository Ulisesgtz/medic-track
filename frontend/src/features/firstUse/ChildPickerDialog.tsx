import { useEffect, useId, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { Child } from '../home/types'
import { useBodyScrollLock } from '../../shared/ui/useBodyScrollLock'
import { useIsDesktop } from '../../shared/ui/useIsDesktop'
import { FIRST_USE } from './firstUseText'

interface ChildPickerDialogProps {
  options: Child[]
  onChoose: (child: Child) => void
  onCancel: () => void
  /** The button that opened this: focus goes back to it (Safari doesn't focus a clicked button). */
  opener: RefObject<HTMLElement | null>
}

/**
 * «¿De quién es la consulta?» (specs/071, step 1 with more than one child): one button per child of the account. A sheet on the
 * phone, centered on the web; Escape and the backdrop cancel, the focus starts on the first child and comes back to the button that
 * opened it, and Tab stays inside — the pattern of `ConfirmDialog`.
 */
export function ChildPickerDialog({ options, onChoose, onCancel, opener }: ChildPickerDialogProps) {
  const id = useId()
  const desktop = useIsDesktop()
  const dialogRef = useRef<HTMLDivElement>(null)
  useBodyScrollLock()

  useEffect(() => {
    const restoreTo = opener.current
    const focusables = () => Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])
    focusables()[0]?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      restoreTo?.focus()
    }
  }, [onCancel, opener])

  return createPortal(
    <div className={`fixed inset-0 z-50 flex bg-ink/70 ${desktop ? 'items-center justify-center p-6' : 'items-end p-4'}`} onClick={onCancel}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[90vh] w-full flex-col gap-4 overflow-y-auto rounded-3xl bg-surface shadow-2xl ${desktop ? 'max-w-[480px] p-7' : 'p-6 pb-7'}`}
      >
        <h2 id={`${id}-title`} className="m-0 text-2xl leading-[1.2] font-black tracking-[-0.02em] text-ink">
          {FIRST_USE.chooseChild}
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {options.map((child) => (
            <li key={child.id} className="flex flex-col">
              <button
                type="button"
                onClick={() => onChoose(child)}
                className="min-h-12 cursor-pointer rounded-2xl border-2 border-action bg-transparent px-5 text-base font-extrabold text-action transition-colors hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
              >
                {child.firstName}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onCancel}
          className={`min-h-12 cursor-pointer rounded-2xl text-base font-extrabold text-action transition-colors hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action ${desktop ? 'self-end px-6' : ''}`}
        >
          {FIRST_USE.chooseChildCancel}
        </button>
      </div>
    </div>,
    document.body,
  )
}
