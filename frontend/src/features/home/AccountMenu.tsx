import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '../../shared/ui/useBodyScrollLock'
import { useLogout } from '../auth/useLogout'
import { HOME, planLabel } from './homeText'
import type { Account } from './types'

type Variant = 'phone' | 'sidebar'

/**
 * The open panel. Like every overlay of the app it goes to `document.body` (the sidebar is `sticky` and scrolls on its own: a panel
 * inside it was clipped by it) and locks the page behind while open; it is placed next to the button that opened it — under the
 * initials on the phone, above the account block at the bottom of the sidebar.
 */
function MenuPanel({
  id,
  account,
  variant,
  anchor,
  onClose,
}: {
  id: string
  account: Account
  variant: Variant
  anchor: RefObject<HTMLButtonElement | null>
  onClose: (focusButton: boolean) => void
}) {
  useBodyScrollLock()
  const panel = useRef<HTMLDivElement>(null)
  const logout = useLogout()
  const rect = anchor.current?.getBoundingClientRect()
  const style =
    !rect
      ? undefined
      : variant === 'sidebar'
        ? { left: rect.left, bottom: window.innerHeight - rect.top + 8 }
        : { right: window.innerWidth - rect.right, top: rect.bottom + 8 }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(true)
    }
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!panel.current?.contains(target) && !anchor.current?.contains(target)) onClose(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [anchor, onClose])

  return createPortal(
    <div
      ref={panel}
      id={id}
      style={style}
      className="fixed z-50 flex w-64 flex-col gap-3 rounded-2xl border-[1.5px] border-hint-edge bg-surface p-4 leading-[normal] shadow-[0_8px_20px_rgba(4,37,43,0.12)]"
    >
      <span className="flex flex-col">
        <span className="text-[15px] font-extrabold text-ink">
          {account.firstName} {account.lastName}
        </span>
        <span className="text-[14px] text-body">{planLabel(account)}</span>
      </span>
      <button
        type="button"
        onClick={logout}
        className="min-h-11 cursor-pointer self-start rounded-[14px] border-2 border-action px-4 text-[15px] font-extrabold text-action hover:bg-hint"
      >
        {HOME.logout}
      </button>
    </div>,
    document.body,
  )
}

/**
 * The account menu (specs/055 FR-008): the initials open a small panel with the person's name, their plan and «Cerrar sesión»,
 * which is no longer in the header (a stray tap of the thumb signed people out). Escape and a tap outside close it, Escape gives
 * the focus back to the button.
 */
export function AccountMenu({ account, variant }: { account: Account; variant: Variant }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const initials = `${account.firstName.charAt(0)}${account.lastName.charAt(0)}`
  const sidebar = variant === 'sidebar'

  return (
    <div className={sidebar ? 'mt-auto' : 'shrink-0'}>
      <button
        ref={button}
        type="button"
        aria-label={HOME.menu}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={
          sidebar
            ? 'flex min-h-14 w-full cursor-pointer items-center gap-3 border-t border-ink-soft pt-4 text-left'
            : 'flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-ink text-[15px] font-extrabold text-white'
        }
      >
        {sidebar ? (
          <>
            <span aria-hidden="true" className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-action text-[14px] font-extrabold text-white">
              {initials}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[14px] font-bold text-white">
                {account.firstName} {account.lastName}
              </span>
              <span className="text-[12px] text-bright-soft">{planLabel(account)}</span>
            </span>
          </>
        ) : (
          initials
        )}
      </button>
      {open && (
        <MenuPanel
          id={panelId}
          account={account}
          variant={variant}
          anchor={button}
          onClose={(focusButton) => {
            setOpen(false)
            if (focusButton) button.current?.focus()
          }}
        />
      )}
    </div>
  )
}
