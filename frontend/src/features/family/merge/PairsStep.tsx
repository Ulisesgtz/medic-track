import { cardClass, type MergeVariant } from './MergeFrame'
import { OWN_TAG, PAIRS, SAME_NAME, SAME_NAME_HINT, NOT_NONE, holdingsLine } from './mergeText'
import type { MergeChild, MergeOptions } from './types'

export type Selection = Record<string, string>

const chip = 'whitespace-nowrap rounded-full border border-hint-border bg-hint px-2.5 py-[3px] text-[13px] font-extrabold text-action'

/** B and B2: for each own child, «Es el mismo que…» with the family's children (one of them can be chosen only once). */
export function PairsStep({
  options,
  selection,
  onChange,
  variant,
}: {
  options: MergeOptions
  selection: Selection
  onChange: (ownChildId: string, familyChildId: string) => void
  variant: MergeVariant
}) {
  const ownById = new Map(options.ownChildren.map((c) => [c.id, c]))
  const takenBy = (familyId: string, exceptOwnId: string): MergeChild | undefined => {
    const holder = Object.entries(selection).find(([own, fam]) => fam === familyId && own !== exceptOwnId)
    return holder ? ownById.get(holder[0]) : undefined
  }

  return (
    <>
      <p className="max-w-[760px] text-[15px] leading-[1.55] text-body">{PAIRS.intro}</p>
      <div className={variant === 'desktop' ? 'grid grid-cols-2 items-start gap-5' : 'flex flex-col gap-4'}>
        {options.ownChildren.map((child) => {
          const selectId = `pair-${child.id}`
          const suggested = options.suggestedPairs.some((s) => s.ownChildId === child.id && s.familyChildId === selection[child.id])
          return (
            <section key={child.id} className={`${cardClass} flex flex-col gap-3 p-4`} aria-label={`${child.firstName} ${child.lastName}`}>
              <div className="flex flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[18px] font-extrabold text-ink">
                    {child.firstName} {child.lastName}
                  </h2>
                  <span className={chip}>{OWN_TAG}</span>
                </div>
                <span className="text-[14px] text-body">{holdingsLine(child.counts, child.record.exists)}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={selectId} className="text-[13px] font-bold text-ink">
                  {PAIRS.label}
                </label>
                <div className="relative">
                  <select
                    id={selectId}
                    value={selection[child.id] ?? ''}
                    onChange={(e) => onChange(child.id, e.target.value)}
                    className="min-h-12 w-full appearance-none rounded-[14px] border-[1.5px] border-slate-400 bg-surface pr-[42px] pl-3.5 text-[16px] font-medium text-ink focus:border-2 focus:border-ink focus:outline-none"
                  >
                    {options.familyChildren.map((f) => {
                      const holder = takenBy(f.id, child.id)
                      return (
                        <option key={f.id} value={f.id} disabled={holder !== undefined}>
                          {`${f.firstName} ${f.lastName} · ${PAIRS.familySuffix}`}
                          {holder ? ` — ${PAIRS.taken(holder.firstName)}` : ''}
                        </option>
                      )
                    })}
                    <option value="">{NOT_NONE}</option>
                  </select>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="pointer-events-none absolute top-[15px] right-3.5 text-action"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </div>
              {suggested && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className={chip}>{SAME_NAME}</span>
                  <span className="text-[13px] text-body">{SAME_NAME_HINT}</span>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
