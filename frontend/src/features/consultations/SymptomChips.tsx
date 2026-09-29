import type { Symptom } from './types'

/**
 * The symptoms marked on a consultation, as read-only pills in catalog order (specs/012 FR-014).
 * Nothing when there are none, so the detail never shows an empty section.
 */
export function SymptomChips({ symptoms }: { symptoms: Symptom[] }) {
  if (symptoms.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2">
      {symptoms.map((symptom) => (
        <li
          key={symptom.code}
          className="rounded-full border-[1.5px] border-hint-border bg-hint px-3.5 py-1.5 text-sm font-bold text-ink"
        >
          {symptom.name}
        </li>
      ))}
    </ul>
  )
}
