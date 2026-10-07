import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useIsDesktop } from '../../shared/ui/useIsDesktop'
import { LIMIT_MOTIVES, PLAN_PERIOD, PLAN_PRICE } from '../plans/planCopy'

/**
 * What the free plan stopped (specs/030 adds the last two): a second child, a second consultation while one treatment is
 * still active, a consultation saved only as a record, or (specs/031) searching and filtering the history, or (specs/032) sharing with the family.
 */
export type PlanLimitReason = 'children' | 'active_treatment' | 'record_only' | 'history_search' | 'family' | 'supplements' | 'appointments'

interface FreemiumLimitModalProps {
  /** Why the plan stopped the parent; the child limit when omitted. */
  reason?: PlanLimitReason
  /** «Ver el plan completo»: the caller takes the parent to the plans. */
  onViewPlans: () => void
  /** «Ahora no», the X, Escape and the backdrop: the parent stays on the free plan. */
  onStayFree: () => void
  /**
   * The button that opened this, if the caller already tracks one reliably (e.g.
   * `AddChildDialogs`). When given, focus returns to it and this component skips its own
   * `document.activeElement` capture — on Safari a click never focuses a button, so that
   * capture is *not* the real opener and restoring to it would be wrong. Omit it only when
   * nothing else restores focus on close (e.g. opened from inside `AddChildModal`'s own
   * 422 fallback, where restoring to whatever had focus right before this modal replaced
   * the form is still a reasonable default).
   */
  opener?: RefObject<HTMLElement | null>
}

/**
 * The free-plan limit pop-up for every reason (specs/034, mock LimiteModal): an `ink` band with «Plan completo» and the title of
 * what was tried, that line, a comparison «Ahora tienes / Con el plan completo» of three rows with the one of the reason
 * highlighted, the price and the two ways out — «Ahora no» (the focus starts here: the exit without pressure) and «Ver el plan
 * completo» (the one solid button, a link to the plans). The words say what each plan includes, never what to do about the
 * child's health (Principio I), and always that what was already registered stays (Principio IV). On the phone it is a sheet from
 * the bottom; on the web it is centered. Escape, the X and the backdrop close it; Tab stays inside.
 *
 * Rendered into <body> so it can be opened from the sticky sidebar without being painted under the page.
 */
export function FreemiumLimitModal({ reason = 'children', onViewPlans, onStayFree, opener }: FreemiumLimitModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const stayButtonRef = useRef<HTMLButtonElement>(null)
  const desktop = useIsDesktop()
  const motive = LIMIT_MOTIVES[reason]

  useEffect(() => {
    // Only capture document.activeElement as a fallback opener — a caller-supplied `opener`
    // ref is always more reliable (see the prop doc: Safari never focuses a button on click).
    // Read opener.current now (not in the cleanup) since a ref's mutable value could differ later.
    const capturedOpener = opener ? opener.current : (document.activeElement as HTMLElement | null)
    stayButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onStayFree()
        return
      }
      if (event.key !== 'Tab') return
      // Three focusable elements (the X, «Ahora no» and the link): Tab/Shift+Tab cycle between them instead of letting focus
      // reach the page behind the overlay.
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button, a[href]') ?? [])
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      capturedOpener?.focus()
    }
  }, [onStayFree, opener])

  const [main, ...rest] = motive.rows

  const actions = (
    <div className={desktop ? 'flex justify-end gap-3' : 'flex flex-col-reverse gap-2.5'}>
      <button
        ref={stayButtonRef}
        type="button"
        onClick={onStayFree}
        className={`min-h-12 cursor-pointer rounded-2xl border-2 border-action text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 ${desktop ? 'px-6' : ''}`}
      >
        Ahora no
      </button>
      <a
        href="/planes"
        onClick={(event) => {
          event.preventDefault()
          onViewPlans()
        }}
        className={`flex min-h-12 cursor-pointer items-center justify-center rounded-2xl bg-confirmed text-base font-extrabold text-white no-underline transition-colors duration-200 hover:bg-emerald-800 hover:text-white hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 ${desktop ? 'px-[26px]' : ''}`}
      >
        Ver el plan completo
      </a>
    </div>
  )

  return createPortal(
    <div className={`fixed inset-0 z-50 flex bg-ink/70 ${desktop ? 'items-center justify-center p-6' : 'items-end p-3'}`} onClick={onStayFree}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="freemium-limit-title"
        aria-describedby="freemium-limit-body"
        className={`max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-surface shadow-2xl ${desktop ? 'max-w-[580px]' : 'max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 bg-ink py-5 pr-4 pl-6">
          <div className="flex flex-col gap-1.5 pt-1">
            <p className="text-xs font-extrabold tracking-[0.1em] text-bright uppercase">Plan completo</p>
            <h2 id="freemium-limit-title" className="text-2xl leading-[1.2] font-black tracking-[-0.02em] text-white">
              {motive.title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onStayFree}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-[26px] leading-none font-bold text-white transition-colors duration-200 hover:bg-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-bright"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-[18px] px-6 pt-[22px] pb-[26px]">
          <p id="freemium-limit-body" className="text-base leading-relaxed text-body">
            {motive.line}
          </p>

          <div role="table" aria-label="Comparación de planes" className="flex flex-col gap-2">
            <div role="row" className="grid grid-cols-2 gap-3 px-3">
              <span role="columnheader" className="text-xs font-extrabold tracking-[0.08em] text-slate-600 uppercase">
                Ahora tienes
              </span>
              <span role="columnheader" className="text-xs font-extrabold tracking-[0.08em] text-action uppercase">
                Con el plan completo
              </span>
            </div>
            <div role="row" className="flex flex-col gap-1.5 rounded-[14px] border-2 border-hint-border bg-hint p-3">
              <span role="rowheader" className="text-sm font-black text-ink">
                {main.label} <span className="font-bold text-action">· lo que intentaste</span>
              </span>
              <div className="grid grid-cols-2 gap-3">
                <span role="cell" className="text-[15px] leading-snug font-semibold text-slate-600">
                  {main.free}
                </span>
                <span role="cell" className="text-[15px] leading-snug font-extrabold text-ink">
                  {main.full}
                </span>
              </div>
            </div>
            {rest.map((r) => (
              <div key={r.label} role="row" className="flex flex-col gap-1 border-b border-hint-edge px-3 py-2.5">
                <span role="rowheader" className="text-sm font-extrabold text-ink">
                  {r.label}
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <span role="cell" className="text-[15px] leading-snug text-slate-600">
                    {r.free}
                  </span>
                  <span role="cell" className="text-[15px] leading-snug font-semibold text-body">
                    {r.full}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-0.5">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[26px] font-black tracking-[-0.02em] text-ink">{PLAN_PRICE}</span>
              <span className="text-[15px] font-bold text-slate-600">{PLAN_PERIOD} · una suscripción para toda la familia</span>
            </p>
            <p className="text-sm leading-normal text-slate-600">Lo que ya registraste se queda igual con cualquier plan.</p>
          </div>

          {actions}
        </div>
      </div>
    </div>,
    document.body,
  )
}
