import { useEffect, useId, useRef, useState } from 'react'
import { useLogout } from '../auth/useLogout'
import { HOME, planLabel } from './homeText'
import type { Account } from './types'

/**
 * The account menu (specs/055 FR-008): the initials open a small panel with the person's name, their plan and «Cerrar sesión»,
 * which is no longer in the header (a stray tap of the thumb signed people out). Escape and a tap outside close it and the focus
 * goes back to the button. `placement`: under the initials on the phone; above the account block at the bottom of the sidebar.
 */
export function AccountMenu({ account, variant }: { account: Account; variant: 'phone' | 'sidebar' }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const logout = useLogout()
  const initials = `${account.firstName.charAt(0)}${account.lastName.charAt(0)}`
  const plan = planLabel(account)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const sidebar = variant === 'sidebar'
  return (
    <div ref={wrapper} className={`relative ${sidebar ? 'mt-auto' : 'shrink-0'}`}>
      <button
        ref={button}
        type="button"
        aria-label={HOME.menu}
        aria-expanded={open}
        aria-controls={panelId}
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
              <span className="text-[12px] text-bright-soft">{plan}</span>
            </span>
          </>
        ) : (
          initials
        )}
      </button>
      {open && (
        <div
          id={panelId}
          className={`absolute z-30 flex w-64 flex-col gap-3 rounded-2xl border-[1.5px] border-hint-edge bg-surface p-4 shadow-[0_8px_20px_rgba(4,37,43,0.12)] ${sidebar ? 'bottom-full left-0 mb-2' : 'top-full right-0 mt-2'}`}
        >
          <span className="flex flex-col">
            <span className="text-[15px] font-extrabold text-ink">
              {account.firstName} {account.lastName}
            </span>
            <span className="text-[14px] text-body">{plan}</span>
          </span>
          <button
            type="button"
            onClick={logout}
            className="min-h-11 cursor-pointer self-start rounded-[14px] border-2 border-action px-4 text-[15px] font-extrabold text-action hover:bg-hint"
          >
            {HOME.logout}
          </button>
        </div>
      )}
    </div>
  )
}
