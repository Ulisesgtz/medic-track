import { useSymptoms } from '../../shared/catalog/useCatalog'
import { formatDateShort } from '../../shared/date'
import { activeCount, type HistoryCriteria } from './historyCriteria'

interface ActiveCriteriaProps {
  criteria: HistoryCriteria
  onChange: (patch: Partial<HistoryCriteria>) => void
  onClear: () => void
}

const KIND_LABEL = { treatment: 'Con tratamiento', record: 'Solo registro' } as const

/**
 * What is narrowing the list right now, one pill per criterion that can be taken off by itself, and "Limpiar todo"
 * (specs/031, FR-013). Quiet colors: these are filters, never alerts.
 */
export function ActiveCriteria({ criteria, onChange, onClear }: ActiveCriteriaProps) {
  const { data: symptoms } = useSymptoms()
  if (activeCount(criteria) === 0) return null

  const pills: { key: string; label: string; remove: () => void }[] = []
  const q = criteria.q.trim()
  if (q) pills.push({ key: 'q', label: `Texto: ${q}`, remove: () => onChange({ q: '' }) })
  if (criteria.from) pills.push({ key: 'from', label: `Desde ${formatDateShort(criteria.from)}`, remove: () => onChange({ from: '' }) })
  if (criteria.to) pills.push({ key: 'to', label: `Hasta ${formatDateShort(criteria.to)}`, remove: () => onChange({ to: '' }) })
  if (criteria.doctor) pills.push({ key: 'doctor', label: criteria.doctor, remove: () => onChange({ doctor: '' }) })
  if (criteria.medication) pills.push({ key: 'medication', label: criteria.medication, remove: () => onChange({ medication: '' }) })
  for (const code of criteria.symptomCodes) {
    const name = symptoms?.find((symptom) => symptom.code === code)?.name ?? code
    pills.push({ key: `symptom-${code}`, label: name, remove: () => onChange({ symptomCodes: criteria.symptomCodes.filter((c) => c !== code) }) })
  }
  if (criteria.kind !== 'all') pills.push({ key: 'kind', label: KIND_LABEL[criteria.kind], remove: () => onChange({ kind: 'all' }) })

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Criterios activos" role="group">
      {pills.map((pill) => (
        <span
          key={pill.key}
          className="inline-flex min-h-9 max-w-full items-center gap-1 rounded-full border-[1.5px] border-hint-border bg-hint pr-1 pl-3 text-[13px] font-bold text-ink"
        >
          <span className="truncate">{pill.label}</span>
          <button
            type="button"
            onClick={pill.remove}
            aria-label={`Quitar ${pill.label}`}
            className="-my-1 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-action hover:bg-hint-border focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            <span aria-hidden="true" className="text-base leading-none">
              ×
            </span>
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="min-h-11 cursor-pointer rounded-full px-3 text-[13px] font-extrabold text-action underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
      >
        Limpiar todo
      </button>
    </div>
  )
}
