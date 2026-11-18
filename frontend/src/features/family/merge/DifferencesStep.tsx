import { ChoiceCard } from './ChoiceCard'
import { cardClass, noteClass, type MergeVariant } from './MergeFrame'
import { DIFF, FIELD_LABELS, fieldValue, sideLabel } from './mergeText'
import type { Choices, DifferenceField, MergeChild, Side } from './types'

/** C and C2: only the data that differ, «El tuyo» first and «El de la familia» after; none is chosen at first. */
export function DifferencesStep({
  own,
  family,
  fields,
  choices,
  onChoose,
  showListsNote,
  variant,
}: {
  own: MergeChild
  family: MergeChild
  fields: DifferenceField[]
  choices: Choices
  onChoose: (field: DifferenceField, side: Side) => void
  showListsNote: boolean
  variant: MergeVariant
}) {
  const done = fields.filter((f) => choices[f]).length
  return (
    <>
      {variant === 'phone' && <span className="text-[14px] font-bold text-body">{DIFF.chosen(done, fields.length)}</span>}
      <p className="max-w-[760px] text-[15px] leading-[1.55] text-body">{DIFF.intro(own.firstName)}</p>
      <div className={`flex flex-col gap-4 ${variant === 'desktop' ? 'max-w-[760px]' : ''}`}>
        {fields.map((field) => (
          <fieldset key={field} className={`${cardClass} min-w-0 p-4`}>
            <legend className="float-left mb-2 w-full p-0 text-[17px] font-extrabold text-ink">{FIELD_LABELS[field]}</legend>
            <div className={`clear-both grid gap-2.5 ${variant === 'desktop' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {(['own', 'family'] as const).map((side) => (
                <ChoiceCard key={side} name={`diff-${field}`} compact checked={choices[field] === side} onChange={() => onChoose(field, side)}>
                  <span className="text-[13px] font-bold text-muted">{sideLabel(side)}</span>
                  <span className="text-[16px] leading-[1.3] font-extrabold text-ink [overflow-wrap:anywhere]">
                    {fieldValue(field, side === 'own' ? own : family)}
                  </span>
                </ChoiceCard>
              ))}
            </div>
          </fieldset>
        ))}
        {showListsNote && (
          <div role="note" className={noteClass}>
            {DIFF.listsJoin}
          </div>
        )}
      </div>
    </>
  )
}
