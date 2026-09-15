interface FreemiumBannerProps {
  onViewPlans: () => void
}

/**
 * Shown immediately when a second child block is added (client-side count),
 * per FR-007 — not only when the server rejects the save. The plans page
 * itself is not implemented in this scope (see Supuestos in spec.md); the
 * button target is a placeholder route.
 */
export function FreemiumBanner({ onViewPlans }: FreemiumBannerProps) {
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4"
    >
      <svg
        className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600"
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
      <div className="flex-1">
        <p className="font-semibold text-amber-900">
          El plan gratuito incluye solo un hijo por cuenta.
        </p>
        <p className="mt-1 text-sm text-amber-800">
          Si deseas dar de alta a 2 o más niños, contrata el plan completo.
        </p>
        <button
          type="button"
          onClick={onViewPlans}
          className="mt-3 cursor-pointer rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
        >
          Ver planes
        </button>
      </div>
    </div>
  )
}
