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
 */
export function FreemiumLimitModal({ onViewPlans, onStayFree }: FreemiumLimitModalProps) {
  const stayButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    stayButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onStayFree()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onStayFree])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onStayFree}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="freemium-limit-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-3">
          <svg
            className="mt-0.5 h-6 w-6 flex-shrink-0 text-amber-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m0 3.75h.008M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.28 2.25h17.8a1.5 1.5 0 0 0 1.28-2.25L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z"
            />
          </svg>
          <div>
            <h2 id="freemium-limit-title" className="text-lg font-semibold text-slate-900">
              El plan gratuito incluye solo un hijo por cuenta
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Si deseas dar de alta a 2 o más niños, contrata el plan completo. Puedes seguir
              usando PediTrack con un hijo sin costo.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={stayButtonRef}
            type="button"
            onClick={onStayFree}
            className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
          >
            Quedarme con el plan gratuito
          </button>
          <button
            type="button"
            onClick={onViewPlans}
            className="cursor-pointer rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          >
            Ver planes
          </button>
        </div>
      </div>
    </div>
  )
}
