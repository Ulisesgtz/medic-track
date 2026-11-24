import type { Crumb } from '../pages.ts'

/** Las migas de pan de las páginas interiores: la última es la página y lleva `aria-current`. */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length === 0) return null
  const last = crumbs.length - 1
  return (
    <nav aria-label="Migas de pan" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-muted">
      {crumbs.map((crumb, at) =>
        at === last ? (
          <span key={crumb.path} aria-current="page" className="font-bold text-ink">
            {crumb.name}
          </span>
        ) : (
          <span key={crumb.path} className="contents">
            <a href={crumb.path} className="inline-flex min-h-11 items-center font-semibold text-action">
              {crumb.name}
            </a>
            <span aria-hidden="true">›</span>
          </span>
        ),
      )}
    </nav>
  )
}
