import { SAFARI_ART_LABEL, SAFARI_STEPS } from './firstUseText'

// specs/071 (state C): the three steps of «Agregar a pantalla de inicio» in Safari, with the drawing of Safari's bottom bar from the
// design. Colors are tokens of @theme (the SVG strokes and fills are classes, not literals).

const tile = 'flex h-10 w-10 flex-none items-center justify-center rounded-xl border-[1.5px] border-hint-border bg-surface'
// «Agregar» is a chip: at least 40 px wide, as wide as its word.
const chip = 'flex h-10 min-w-10 flex-none items-center justify-center rounded-xl border-[1.5px] border-hint-border bg-surface px-3 text-sm font-extrabold text-action'

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="stroke-action"
    >
      {children}
    </svg>
  )
}

const ICONS = [
  <span key="share" className={tile}>
    <Icon>
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M7 10H5.5v10h13V10H17" />
    </Icon>
  </span>,
  <span key="plus" className={tile}>
    <Icon>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </Icon>
  </span>,
  <span key="add" className={chip}>
    Agregar
  </span>,
]

/** Safari's bottom bar with the «Compartir» button highlighted, then the three steps. */
export function SafariInstallSteps() {
  return (
    <div className="mt-1 flex flex-col gap-2.5 rounded-2xl border-[1.5px] border-hint-border bg-hint p-3.5">
      <svg viewBox="0 0 300 56" width="100%" role="img" aria-label={SAFARI_ART_LABEL} className="block max-w-[360px]">
        <rect x="1" y="4" width="298" height="48" rx="18" strokeWidth="1.5" className="fill-surface stroke-line" />
        <g fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-muted">
          <path d="M44 20l-8 8 8 8" />
          <path d="M96 20l8 8-8 8" />
          <path d="M198 19h-14a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V21a2 2 0 0 0-2-2z" />
          <path d="M246 21h16v14h-16z" />
          <path d="M250 17h16v14" />
        </g>
        <circle cx="150" cy="28" r="21" strokeWidth="2.5" className="fill-hint stroke-action" />
        <g fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="stroke-action">
          <path d="M150 32V19" />
          <path d="M145 23.5l5-5 5 5" />
          <path d="M144 26h-2v11h16V26h-2" />
        </g>
      </svg>
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        {SAFARI_STEPS.map((text, i) => (
          <li key={text} className="flex min-h-11 items-center gap-3">
            {ICONS[i]}
            <span className="min-w-0 flex-1 text-[15px] leading-[1.45] font-semibold text-ink">{text}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** The numbered tiles of a list of instructions (the permission settings, the browser menu). */
export function NumberedSteps({ steps }: { steps: readonly string[] }) {
  return (
    <ol className="mt-1 m-0 flex list-none flex-col gap-1 rounded-2xl border-[1.5px] border-hint-border bg-hint p-3.5">
      {steps.map((text, i) => (
        <li key={text} className="flex min-h-11 items-center gap-3">
          <span aria-hidden="true" className={`${tile} text-base font-black text-action`}>
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 text-[15px] leading-[1.45] font-semibold text-ink">{text}</span>
        </li>
      ))}
    </ol>
  )
}
