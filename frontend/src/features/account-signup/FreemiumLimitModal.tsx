import { useEffect, useRef } from 'react'

interface FreemiumLimitModalProps {
  onViewPlans: () => void
  onStayFree: () => void
}

/**
 * Shown immediately when the user tries to add a child beyond the free-plan
 * limit (FR-007) — not only when the server rejects the save. The plans
 * page itself is not implemented in this scope (see Supuestos in spec.md);
 * "Ver planes" targets a placeholder route. "Quedarme con el plan gratuito"
 * closes the modal without creating the extra child fieldset.
 *
 * Visual pattern (specs/005, FR-010): amber header band with the "Plan
 * gratuito" overline as the plan-context cue, body, right-aligned actions.
 */
export function FreemiumLimitModal({ onViewPlans, onStayFree }: FreemiumLimitModalProps) {
  const stayButtonRef = useRef<HTMLButtonElement>(null)
  const viewPlansButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    stayButtonRef.current?.focus()

    // Minimal focus trap: with only two focusable elements in the dialog,
    // Tab/Shift+Tab just needs to cycle between them instead of letting
    // focus escape to the page behind the (still-visible) overlay.
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onStayFree()
        return
      }
      if (event.key !== 'Tab') return

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
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onStayFree])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
      onClick={onStayFree}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="freemium-limit-title"
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-pending px-7 py-3.5">
          <p className="text-xs font-extrabold tracking-[0.1em] text-on-pending uppercase">
            Plan gratuito
          </p>
        </div>

        <div className="p-7">
          <h2
            id="freemium-limit-title"
            className="text-2xl font-black tracking-tight text-ink"
          >
            El plan gratuito incluye solo un hijo por cuenta
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-600">
            Si deseas dar de alta a 2 o más niños, contrata el plan completo. Puedes seguir
            usando PediTrack con un hijo sin costo.
          </p>

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              ref={stayButtonRef}
              type="button"
              onClick={onStayFree}
              className="min-h-11 cursor-pointer rounded-2xl border-2 border-action px-5 py-2.5 text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
            >
              Quedarme con el plan gratuito
            </button>
            <button
              ref={viewPlansButtonRef}
              type="button"
              onClick={onViewPlans}
              className="min-h-11 cursor-pointer rounded-2xl bg-confirmed px-6 py-2.5 text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2"
            >
              Ver planes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
