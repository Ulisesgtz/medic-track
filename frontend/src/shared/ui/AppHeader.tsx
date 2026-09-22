import type { ReactNode } from 'react'
import { Logo } from './Logo'

interface AppHeaderProps {
  /** Small line above the title (e.g. a greeting or a back link). */
  eyebrow?: ReactNode
  title: ReactNode
  /** Right-aligned slot for one action, next to the logo. */
  action?: ReactNode
  children?: ReactNode
}

/**
 * The dark screen header of the phone home (design-tokens.md, "Componentes
 * base"): ink background, logo, eyebrow + large title. The web designs have
 * no header band (they have the sidebar), so this is phone-only.
 */
export function AppHeader({ eyebrow, title, action, children }: AppHeaderProps) {
  return (
    <header className="bg-ink px-6 pt-6 pb-7">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex items-center gap-2.5">
            <Logo size={32} />
            <span className="text-lg font-black tracking-tight text-white">
              Pedi<span className="text-[#67e8f9]">Track</span>
            </span>
          </div>
          {action ? <div className="ml-auto">{action}</div> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          {eyebrow ? <div className="text-sm font-semibold text-[#67e8f9]">{eyebrow}</div> : null}
          <h1 className="text-3xl font-black tracking-tight text-white">{title}</h1>
        </div>
        {children}
      </div>
    </header>
  )
}
