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
 * optional `action` goes next to the logo. With the desktop sidebar on screen
 * (which carries the logo) the header turns light — ink title on the canvas,
 * action beside the title — as in the desktop mock.
 */
export function AppHeader({ eyebrow, title, action, children }: AppHeaderProps) {
  // With the sidebar on screen the logo already lives there: drop the brand row.
  const hasSidebar = useContext(SidebarContext)

  return (
    <header
      className={
        hasSidebar
          ? 'px-5 pt-[35px] pb-0 text-ink md:px-10'
          : 'bg-ink px-5 pt-6 pb-7 text-white md:px-10 md:pt-8 md:pb-9'
      }
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {!hasSidebar && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="flex items-center gap-2.5">
              <Logo size={32} />
              <span className="text-lg font-black tracking-tight text-white">
                Pedi<span className="text-bright">Track</span>
              </span>
            </div>
            {action ? <div className="ml-auto">{action}</div> : null}
          </div>
        )}
        <div className="flex items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            {eyebrow ? (
              <div className={`text-sm font-semibold ${hasSidebar ? 'text-action' : 'text-bright'}`}>{eyebrow}</div>
            ) : null}
            <h1 className="text-3xl font-black tracking-[-0.03em] md:text-[38px] md:leading-[1.1]">{title}</h1>
          </div>
          {/* With the sidebar the brand row is gone, so the action sits beside the title. */}
          {hasSidebar ? action : null}
        </div>
        {children}
      </div>
    </header>
  )
}
