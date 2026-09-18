import { useContext, type ReactNode } from 'react'
import { Logo } from './Logo'
import { SidebarContext } from './SidebarContext'

interface AppHeaderProps {
  /** Small line above the title (e.g. a greeting or a back link). */
  eyebrow?: ReactNode
  title: ReactNode
  /** Right-aligned slot for one action. */
  action?: ReactNode
  children?: ReactNode
}

/**
 * The dark screen header of the visual system (design-tokens.md,
 * "Componentes base"): ink background, logo, eyebrow + large title. The
 * optional `action` goes next to the logo, or next to the title when the
 * sidebar (which carries the logo) is on screen.
 */
export function AppHeader({ eyebrow, title, action, children }: AppHeaderProps) {
  // With the sidebar on screen the logo already lives there: drop the brand row.
  const hasSidebar = useContext(SidebarContext)

  return (
    <header className="bg-ink px-5 pt-6 pb-7 md:px-10 md:pt-8 md:pb-9">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {!hasSidebar && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Logo size={32} />
              <span className="text-lg font-black tracking-tight text-white">
                Pedi<span className="text-bright">Track</span>
              </span>
            </div>
            {action}
          </div>
        )}
        <div className="flex items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            {eyebrow ? <div className="text-sm font-semibold text-bright">{eyebrow}</div> : null}
            <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">{title}</h1>
          </div>
          {/* With the sidebar the brand row is gone, so the action sits beside the title. */}
          {hasSidebar ? action : null}
        </div>
        {children}
      </div>
    </header>
  )
}
