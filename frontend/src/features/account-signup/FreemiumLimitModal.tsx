import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useIsDesktop } from '../../shared/ui/useIsDesktop'

/**
 * What the free plan stopped (specs/030 adds the last two): a second child, a second consultation while one treatment is
 * still active, a consultation saved only as a record, or (specs/031) searching and filtering the history, or (specs/032) sharing with the family.
 */
export type PlanLimitReason = 'children' | 'active_treatment' | 'record_only' | 'history_search' | 'family' | 'supplements' | 'appointments'

// The words are neutral: they say what the plan includes, never what to do about the child's health (Principio I), and
// always that what was already saved stays.
const COPY: Record<Exclude<PlanLimitReason, 'children'>, { title: string; body: string }> = {
  active_treatment: {
    title: 'Ya tienes un tratamiento activo',
    body: 'El plan gratuito incluye un tratamiento activo a la vez. Cuando termine —o si lo finalizas— podrás registrar la siguiente consulta. Todo lo que ya registraste se mantiene y lo sigues viendo.',
  },
  record_only: {
    title: 'Consultas anteriores en el plan completo',
    body: 'Guardar una consulta anterior solo como registro es parte del plan completo. Todo lo que ya registraste se mantiene intacto.',
  },
  history_search: {
    title: 'Historial con búsqueda y filtros',
    body: 'Buscar y filtrar el historial es parte del plan completo. Todo lo que ya registraste se mantiene y lo sigues viendo en tu lista.',
  },
  family: {
    title: 'Compartir con tu familia',
    body: 'Compartir con tu pareja o con quien cuida es parte del plan completo. Todo lo que ya registraste se mantiene.',
  },
  supplements: {
    title: 'Suplementos con recordatorio',
    body: 'Crear rutinas de suplementos es parte del plan completo. Todo lo que ya registraste se mantiene y sigue avisando.',
  },
  appointments: {
    title: 'Próxima cita con recordatorio',
    body: 'Anotar y editar la próxima cita, con sus avisos, es parte del plan completo. Todo lo que ya registraste se mantiene y sigue avisando.',
  },
}

interface FreemiumLimitModalProps {
  /** Why the plan stopped the parent; the child limit (the mocks' text) when omitted. */
  reason?: PlanLimitReason
  onViewPlans: () => void
  onStayFree: () => void
  /** Wide layouts add "<name> sigue disponible sin cambios" to the message (mock 15). */
  childName?: string
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
 * The free-plan limit pop-up, shown as soon as the user tries to add a child
 * beyond the limit (not after filling a form). Built from the delivered
 * mockups 05 (phone) and 15 (desktop): amber header with the "Plan gratuito"
 * overline and "Llegaste a un hijo registrado", the message, and "Entendido"
 * (outline) + "Ver planes" (ink). Focus starts on "Ver planes", Tab cycles
 * between the two buttons, Escape or a click on the backdrop closes it, and
 * "Ver planes" turns into "Abriendo planes…" while it navigates.
 *
 * Rendered into <body> so it can be opened from the sticky sidebar without
 * being painted under the page.
 */
export function FreemiumLimitModal({ reason = 'children', onViewPlans, onStayFree, childName, opener }: FreemiumLimitModalProps) {
  const stayButtonRef = useRef<HTMLButtonElement>(null)
  const viewPlansButtonRef = useRef<HTMLButtonElement>(null)
  const [opening, setOpening] = useState(false)
  const desktop = useIsDesktop()

  useEffect(() => {
    // Only capture document.activeElement as a fallback opener — a caller-supplied `opener`
    // ref is always more reliable (see the prop doc: Safari never focuses a button on click).
    // Read opener.current now (not in the cleanup) since a ref's mutable value could differ later.
    const capturedOpener = opener ? opener.current : (document.activeElement as HTMLElement | null)
    viewPlansButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onStayFree()
        return
      }
      if (event.key !== 'Tab') return

      // Two focusable elements: Tab/Shift+Tab cycle between them instead of
      // letting focus reach the page behind the overlay.
      const active = document.activeElement
      if (event.shiftKey) {
        if (active === stayButtonRef.current) {
          event.preventDefault()
          viewPlansButtonRef.current?.focus()
        }
      } else if (active === viewPlansButtonRef.current) {
        event.preventDefault()
        stayButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      capturedOpener?.focus()
    }
  }, [onStayFree, opener])

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-ink/70 ${desktop ? 'p-6' : 'p-4'}`}
      onClick={onStayFree}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="freemium-limit-title"
        aria-describedby="freemium-limit-body"
        className={`max-h-[90vh] w-full overflow-y-auto rounded-3xl bg-surface shadow-2xl ${desktop ? 'max-w-xl' : 'max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`bg-pending ${desktop ? 'px-8 py-7' : 'px-7 py-6'}`}>
          <p className="text-xs font-extrabold tracking-[0.1em] text-on-pending uppercase">Plan gratuito</p>
          <h2
            id="freemium-limit-title"
            className={`font-black tracking-tight text-on-pending ${desktop ? 'mt-2 text-3xl' : 'mt-1.5 text-2xl'}`}
          >
            {reason === 'children' ? 'Llegaste a un hijo registrado' : COPY[reason].title}
          </h2>
        </div>

        <div className={desktop ? 'px-8 pt-7 pb-8' : 'px-7 pt-6 pb-7'}>
          <p id="freemium-limit-body" className={`leading-relaxed text-body ${desktop ? 'text-[17px]' : 'text-base'}`}>
            {reason === 'children' ? (
              <>
                Para dar de alta a otro hijo necesitas ampliar tu plan. Tus datos actuales se mantienen intactos
                {childName ? ` y ${childName} sigue disponible sin cambios` : ''}.
              </>
            ) : (
              COPY[reason].body
            )}
          </p>

          <div className={`flex flex-wrap justify-end gap-3 ${desktop ? 'mt-7' : 'mt-6'}`}>
            <button
              ref={stayButtonRef}
              type="button"
              onClick={onStayFree}
              className={`min-h-11 cursor-pointer rounded-2xl border-2 border-action py-3 text-[15px] ${desktop ? 'px-6' : 'px-5'} font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2`}
            >
              Entendido
            </button>
            <button
              ref={viewPlansButtonRef}
              type="button"
              onClick={() => {
                setOpening(true)
                onViewPlans()
              }}
              className={`min-h-11 cursor-pointer rounded-2xl bg-ink py-3 text-[15px] ${desktop ? 'px-7' : 'px-6'} font-extrabold text-white transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2`}
            >
              {opening ? 'Abriendo planes…' : 'Ver planes'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
