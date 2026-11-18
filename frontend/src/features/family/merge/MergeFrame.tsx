import type { MouseEvent, ReactNode } from 'react'
import { AppShell } from '../../home/AppShell'
import { PageHeader } from '../../../shared/ui/PageHeader'
import { StickyActionBar } from '../../../shared/ui/StickyActionBar'
import { useSidebarSession } from '../../home/useSidebarSession'

export type MergeVariant = 'phone' | 'desktop'

export const cardClass = 'rounded-[22px] border border-hint-edge bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
export const noteClass = 'rounded-2xl border-[1.5px] border-hint-border bg-hint px-4 py-3.5 text-[15px] leading-[1.55] text-ink'
export const outlineButton =
  'inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl border-2 border-action px-[18px] text-[15px] font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60'
export const smallOutline =
  'inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center rounded-[14px] border-2 border-action px-[18px] text-[15px] font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60'
export const solidButton =
  'inline-flex min-h-[52px] shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-confirmed px-6 text-[17px] font-extrabold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-muted disabled:hover:bg-slate-200'
export const eyebrowClass = 'text-[12px] font-extrabold tracking-[0.08em] text-action uppercase'

interface MergeFrameProps {
  /** «← Parejas»: a link; without it the header has only the eyebrow and the title (A, F). */
  back?: { label: string; to: string; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void }
  eyebrow?: string
  title: string
  /** The phone's pinned bar and the web's row under the content. */
  actions?: ReactNode | ((variant: MergeVariant) => ReactNode)
  /** The web's row: at the right (forms) or at the left under a result card (E, F). */
  actionsAlign?: 'start' | 'end'
  /** The pairs use the page's whole column; the other steps' cards are 760 px and the row ends where they end. */
  wide?: boolean
  /** A line that sits at the left of the web's actions (a count or why the button is off). */
  status?: ReactNode
  /** Without the header (E1, E2, E3 and F draw a card directly). */
  bare?: boolean
  children: (variant: MergeVariant) => ReactNode
}

/** The frame of every screen of the flow: `AppShell`, the common header and the design's bar of actions (phone) or row (web). */
export function MergeFrame({ back, eyebrow, title, actions: actionsProp, actionsAlign = 'end', wide = false, status, bare = false, children }: MergeFrameProps) {
  const { isDesktop } = useSidebarSession()
  const variant: MergeVariant = isDesktop ? 'desktop' : 'phone'
  const actions = typeof actionsProp === 'function' ? actionsProp(variant) : actionsProp

  const header = bare ? null : back ? (
    <PageHeader variant={variant} back={back} eyebrow={eyebrow} title={title} />
  ) : (
    <header
      className={variant === 'desktop' ? 'flex flex-col gap-0.5' : 'flex flex-col gap-0.5 px-5 pb-4'}
      style={variant === 'phone' ? { paddingTop: 'calc(1rem + env(safe-area-inset-top))' } : undefined}
    >
      {eyebrow && <span className="text-[13px] font-extrabold tracking-[0.06em] text-action uppercase">{eyebrow}</span>}
      <h1
        tabIndex={-1}
        className={`leading-[1.15] font-black tracking-[-0.03em] text-ink ${variant === 'desktop' ? 'text-[34px]' : 'text-[28px]'}`}
      >
        {title}
      </h1>
    </header>
  )

  if (variant === 'desktop') {
    return (
      <AppShell>
        <main className="min-w-0 bg-canvas px-12 pt-7 pb-12 leading-[normal]">
          <div className="mx-auto flex max-w-[904px] flex-col gap-6">
            {header}
            {children(variant)}
            {actions && (
              <div className={`flex items-center gap-3 pt-1 ${wide ? '' : 'max-w-[760px]'} ${actionsAlign === 'end' ? 'justify-end' : 'justify-start'}`}>
                {status && <span className="mr-1 text-[14px] text-body">{status}</span>}
                {actions}
              </div>
            )}
          </div>
        </main>
      </AppShell>
    )
  }
  return (
    <AppShell>
      <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-canvas leading-[normal]">
        {header}
        <div className={`flex flex-1 flex-col gap-4 px-5 ${bare ? 'pt-6' : ''}`}>
          {children(variant)}
          <div className="flex-1" />
          {actions ? (
            <StickyActionBar variant="phone">
              {status && <span className="text-[13px] text-body">{status}</span>}
              <div className="flex gap-2.5 [&>*]:flex-1">{actions}</div>
            </StickyActionBar>
          ) : (
            <div className="h-6" />
          )}
        </div>
      </main>
    </AppShell>
  )
}
