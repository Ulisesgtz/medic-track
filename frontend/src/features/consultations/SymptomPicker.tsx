import { useId } from 'react'
import { useSymptoms } from '../../shared/catalog/useCatalog'
import type { Symptom } from '../../shared/catalog/api'
import { Notice } from '../../shared/ui/Notice'

interface SymptomPickerProps {
  /** The marked symptoms' codes. */
  value: string[]
  onChange: (codes: string[]) => void
  variant: 'phone' | 'desktop'
  /** The group's heading; "¿Qué síntomas tuvo?" in "Nueva consulta" (the default). */
  legend?: string
}

/**
 * One group per category, in the order each category first appears, its symptoms in catalog order. The server
 * already sends each category's symptoms together; grouping by name (not by consecutive runs) keeps a single
 * group even if it didn't.
 */
function groupByCategory(symptoms: Symptom[]): { category: string; symptoms: Symptom[] }[] {
  const groups = new Map<string, Symptom[]>()
  for (const symptom of symptoms) {
    const group = groups.get(symptom.category)
    if (group) group.push(symptom)
    else groups.set(symptom.category, [symptom])
  }
  return [...groups].map(([category, list]) => ({ category, symptoms: list }))
}

const chip =
  'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] px-4 text-[15px] font-bold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2'
const chipOff = 'border-slate-300 bg-surface text-ink hover:border-action hover:bg-hint'
const chipOn = 'border-action bg-action text-white'

/**
 * "¿Qué síntomas tuvo?" in "Nueva consulta" (specs/012): the catalog's symptoms as pills grouped by
 * category, tapped on and off — what the parent observed, never a diagnosis, and nothing is suggested
 * from them (Principio I). Each pill is a toggle button with a fixed name and its state in
 * `aria-pressed`; the marked one is filled and carries a check, so it doesn't rely on color alone.
 * If the catalog can't load, the consultation can still be saved (FR-016).
 */
export function SymptomPicker({ value, onChange, variant, legend = '¿Qué síntomas tuvo?' }: SymptomPickerProps) {
  const { data, isPending, isError } = useSymptoms()
  const baseId = useId()
  const selected = new Set(value)

  function toggle(code: string) {
    onChange(selected.has(code) ? value.filter((c) => c !== code) : [...value, code])
  }

  return (
    <fieldset className={`flex min-w-0 flex-col ${variant === 'desktop' ? 'gap-4' : 'gap-3.5'}`}>
      {/* A legend isn't a flex item, so the fieldset's gap doesn't reach it. */}
      <legend className="mb-3 text-xs font-extrabold tracking-[0.1em] text-action uppercase">{legend}</legend>
      {isPending && <p className="text-[13px] font-semibold text-slate-600">Cargando síntomas…</p>}
      {isError && (
        <Notice tone="info">
          No pudimos cargar la lista de síntomas. Puedes guardar la consulta y escribirlos en las notas.
        </Notice>
      )}
      {data &&
        groupByCategory(data).map((group, index) => {
          const titleId = `${baseId}-${index}`
          return (
            <div key={group.category} role="group" aria-labelledby={titleId} className="flex min-w-0 flex-col gap-2">
              <p id={titleId} className="text-[13px] font-bold text-ink-soft">
                {group.category}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.symptoms.map((symptom) => {
                  const on = selected.has(symptom.code)
                  return (
                    <button
                      key={symptom.code}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(symptom.code)}
                      className={`${chip} ${on ? chipOn : chipOff}`}
                    >
                      {on && (
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <path d="m5 12.5 4.5 4.5L19 7.5" />
                        </svg>
                      )}
                      {symptom.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
    </fieldset>
  )
}
