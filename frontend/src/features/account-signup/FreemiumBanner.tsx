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
    <div role="alert" className="rounded-md border border-amber-400 bg-amber-50 p-4 text-amber-900">
      <p className="font-medium">
        El plan gratuito incluye solo un hijo por cuenta.
      </p>
      <p className="mt-1 text-sm">
        Si deseas dar de alta a 2 o más niños, contrata el plan completo.
      </p>
      <button
        type="button"
        onClick={onViewPlans}
        className="mt-3 rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
      >
        Ver planes
      </button>
    </div>
  )
}
