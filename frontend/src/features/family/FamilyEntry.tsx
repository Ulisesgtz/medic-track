import { Link } from 'react-router-dom'

/**
 * The way into «Familia» (specs/032-compartir-con-familia) from the home: a card under the children, in both designs.
 * Everyone gets it — who can invite uses it to share, anyone else to see who has access to the children.
 */
export function FamilyEntry() {
  return (
    <Link
      to="/familia"
      className="flex min-h-11 items-center justify-between gap-4 rounded-3xl bg-surface p-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)] transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
    >
      <span className="min-w-0">
        <span className="block text-base font-extrabold text-ink">Familia</span>
        <span className="block text-sm text-body">Quién ve y marca las tomas de tus hijos</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-xl font-black text-action">
        →
      </span>
    </Link>
  )
}
