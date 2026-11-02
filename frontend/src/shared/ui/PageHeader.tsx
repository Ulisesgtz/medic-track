import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { pageHeaderButton } from './pageHeaderButton'
import { PAGE_HEADER, loadFailedTitle } from './pageHeaderText'

// specs/056 (research R2): the one header of every secondary screen, from the design «Encabezado PediTrack.dc.html»
// (`specs/056-rediseno-detalles/referencia/encabezado-medidas.md`). It sits on the page — no dark band since the home's redesign
// (spec 055) — with «← …» always at the top left, an optional eyebrow, the title, a subtitle and a neutral status chip, and the
// actions under the title on the phone and at the right on the web. Normal line height and exact sizes, as the design.

export type HeaderVariant = 'phone' | 'desktop'

export interface PageHeaderProps {
  variant: HeaderVariant
  /** `onClick` may stop the way back (a form with something typed asks first). */
  back: { label: string; to: string; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void }
  eyebrow?: string
  /** Drawn at the left of the title (the child's initial, design A). */
  avatar?: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  /** «Activo» (`hint`) or «Pausado» / «Terminado» / «Solo registro» (`line`): never green nor amber. */
  chip?: { label: string; tone: 'hint' | 'line' }
  /** Built with `pageHeaderButton` (at most one solid: the screen's main action). */
  actions?: ReactNode
  /** The note of a Tutor whose family stopped paying. */
  readOnly?: boolean
  /** The History's search field: on the phone it sticks to the top while scrolling. */
  search?: ReactNode
  state?: 'ready' | 'loading' | 'error'
  /** «la cartilla», for «No pudimos cargar la cartilla». */
  errorWhat?: string
  onRetry?: () => void
}

/** «Solo lectura.» under the header (also the home's note). */
export function ReadOnlyNote({ variant }: { variant: HeaderVariant }) {
  return (
    <div
      role="note"
      className={`rounded-2xl border-[1.5px] border-hint-border bg-surface text-body ${variant === 'desktop' ? 'mt-2.5 px-[18px] py-3.5 text-[15px]' : 'mt-3 px-4 py-3.5 text-[14px] leading-normal'}`}
    >
      <strong className="text-ink">{PAGE_HEADER.readOnlyLead}</strong> {PAGE_HEADER.readOnlyRest}
    </div>
  )
}

function Chip({ label, tone }: { label: string; tone: 'hint' | 'line' }) {
  return tone === 'hint' ? (
    <span className="rounded-full border border-hint-border bg-hint px-2.5 py-[3px] text-[13px] font-extrabold text-action">{label}</span>
  ) : (
    <span className="rounded-full border border-hint-border px-[9px] py-0.5 text-[13px] font-extrabold text-body">{label}</span>
  )
}

export function PageHeader({
  variant,
  back,
  eyebrow,
  avatar,
  title,
  subtitle,
  chip,
  actions,
  readOnly = false,
  search,
  state = 'ready',
  errorWhat = 'esta pantalla',
  onRetry,
}: PageHeaderProps) {
  const desktop = variant === 'desktop'
  const backLink = (
    <Link to={back.to} onClick={back.onClick} className="inline-flex min-h-11 items-center self-start text-[15px] font-bold text-action hover:underline">
      {back.label}
    </Link>
  )

  const titleBlock =
    state === 'loading' ? (
      <div role="status" aria-label={PAGE_HEADER.loading} className={`flex flex-col ${desktop ? 'gap-2' : 'gap-1.5 pt-0.5'}`}>
        <span className={`rounded-[5px] bg-skel ${desktop ? 'h-3.5 w-[130px]' : 'h-3.5 w-[110px]'}`} />
        <span className={`rounded-lg bg-skel ${desktop ? 'h-[39px] w-[340px] max-w-full' : 'h-8 w-[220px]'}`} />
        <span className={`rounded-md bg-skel ${desktop ? 'h-5 w-[240px]' : 'h-[18px] w-[180px]'}`} />
      </div>
    ) : state === 'error' ? null : (
      <div className={desktop ? 'flex items-center gap-6' : 'flex flex-col'}>
        <div className={`flex min-w-0 flex-1 items-center ${desktop ? 'gap-4' : 'gap-3.5'}`}>
          {avatar}
          <div className={`flex min-w-0 flex-1 flex-col ${desktop ? 'gap-[3px]' : 'gap-0.5'}`}>
            {eyebrow && <span className="text-[13px] font-extrabold tracking-[0.06em] text-action uppercase">{eyebrow}</span>}
            <h1
              className={`leading-[1.15] font-black tracking-[-0.03em] text-ink [overflow-wrap:break-word] [text-wrap:balance] ${desktop ? 'text-[34px]' : 'text-[28px]'}`}
            >
              {title}
            </h1>
            {(subtitle || chip) && (
              <div className={`mt-1 flex flex-wrap items-center ${desktop ? 'gap-x-3 gap-y-1.5' : 'gap-x-2.5 gap-y-1.5'}`}>
                {subtitle && <span className={`text-body ${desktop ? 'text-[16px]' : 'text-[15px] leading-[1.45]'}`}>{subtitle}</span>}
                {chip && <Chip {...chip} />}
              </div>
            )}
          </div>
        </div>
        {actions && <div className={desktop ? 'flex shrink-0 items-center gap-2.5' : 'mt-2.5 flex flex-wrap gap-2'}>{actions}</div>}
      </div>
    )

  const error = state === 'error' && (
    <div
      role="alert"
      className={`rounded-[22px] border-2 border-dashed border-hint-border ${desktop ? 'flex items-center gap-5 p-6' : 'mt-1 flex flex-col gap-2.5 p-5'}`}
    >
      <span className="flex flex-1 flex-col gap-1">
        <span className={`font-extrabold text-ink ${desktop ? 'text-[18px]' : 'text-[17px]'}`}>{loadFailedTitle(errorWhat)}</span>
        <span className="text-[15px] leading-normal text-body">{PAGE_HEADER.errorBody}</span>
      </span>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${pageHeaderButton('edit', variant)} ${desktop ? '' : 'self-start'} px-5`}>
          {PAGE_HEADER.retry}
        </button>
      )}
    </div>
  )

  if (desktop)
    return (
      <>
        <header className="flex flex-col gap-1.5 leading-[normal]">
          {backLink}
          {titleBlock}
          {readOnly && <ReadOnlyNote variant="desktop" />}
          {search && <div className="mt-3 max-w-[560px]">{search}</div>}
        </header>
        {error}
      </>
    )

  return (
    <>
      <header className="flex flex-col gap-1 px-5 pb-4 leading-[normal]" style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}>
        {backLink}
        {titleBlock}
        {readOnly && <ReadOnlyNote variant="phone" />}
      </header>
      {search && <div className="sticky top-0 z-10 border-b border-hint-edge bg-canvas px-5 pb-3 leading-[normal]">{search}</div>}
      {error && <div className="px-5">{error}</div>}
    </>
  )
}
