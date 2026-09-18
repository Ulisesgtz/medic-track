import { useEffect, useState } from 'react'
import { useWatch, type Control, type UseFormRegister, type FieldErrors } from 'react-hook-form'
import type { ConsultationFormValues } from './ConsultationForm'
import { errorClass, inputClass, labelClass, optionalClass, suggestedInputClass } from '../../shared/ui/formStyles'

interface MedicationFieldsetProps {
  index: number
  control: Control<ConsultationFormValues>
  register: UseFormRegister<ConsultationFormValues>
  errors: FieldErrors<ConsultationFormValues>
  onRemove: () => void
  removeDisabled?: boolean
  /** Field paths the OCR filled in — rendered with the bright "to review" border. */
  suggested?: ReadonlySet<string>
}


const positiveIntegerValidation = {
  required: true,
  min: { value: 1, message: 'must be a positive integer' },
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
      aria-hidden="true"
    >
      <path d="M5 7.5 10 12.5 15 7.5" />
    </svg>
  )
}

/**
 * One repeatable medication block: name, frequency (every N hours),
 * treatment duration in days (FR-008), and an optional start time — a
 * medication without a start time never generates individual doses
 * (FR-010). Fades/slides in on mount (respects prefers-reduced-motion) so a
 * prescription with many medications reveals itself progressively instead
 * of appearing as a single wall of inputs. Collapsible to a one-line
 * summary for scanning a long list — never collapsed by default, since the
 * parent must be able to see and correct every OCR-derived value (Principio I).
 */
export function MedicationFieldset({
  index,
  control,
  register,
  errors,
  onRemove,
  removeDisabled = false,
  suggested,
}: MedicationFieldsetProps) {
  const medErrors = errors.medications?.[index]
  const [mounted, setMounted] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const watched = useWatch({ control, name: `medications.${index}` })
  const fieldClass = (name: string) =>
    suggested?.has(`medications.${index}.${name}`) ? suggestedInputClass : inputClass

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const summary = [
    watched?.name || 'Sin nombre',
    watched?.frequencyHours ? `cada ${watched.frequencyHours}h` : null,
    watched?.durationDays ? `${watched.durationDays} días` : null,
  ]
    .filter(Boolean)
    .join(' — ')

  return (
    <fieldset
      className={`rounded-2xl border border-hint-border bg-hint p-5 transition-all duration-300 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
        mounted ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
      data-testid={`medication-fieldset-${index}`}
    >
      {/* A real <legend> (not the visual badge below, which is nested inside
          a button and can't serve as the fieldset's accessible name) so
          screen readers announce which medication group is focused. */}
      <legend className="sr-only">Medicamento {index + 1}</legend>
      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="grid min-h-11 min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md py-1 text-left text-action outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-hint"
        >
          <span className="inline-flex items-center justify-self-start rounded-full bg-action px-3 py-1 text-xs font-extrabold tracking-[0.1em] whitespace-nowrap text-white uppercase">
            Medicamento {index + 1}
          </span>
          {collapsed && <span className="min-w-0 truncate text-sm font-semibold text-slate-600">{summary}</span>}
          <ChevronIcon collapsed={collapsed} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={removeDisabled}
          className="inline-flex min-h-11 cursor-pointer items-center justify-self-end text-sm font-bold text-red-700 transition-colors duration-200 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Quitar{' '}
          <span className="sr-only sm:not-sr-only">medicamento</span>
        </button>
      </div>

      <div className={`grid grid-cols-2 gap-4 ${collapsed ? 'hidden' : ''}`}>
        <div className="col-span-2">
          <label className={labelClass} htmlFor={`medications.${index}.name`}>
            Nombre
          </label>
          <input
            id={`medications.${index}.name`}
            className={fieldClass('name')}
            {...register(`medications.${index}.name`, { required: true })}
          />
          {medErrors?.name && <span className={errorClass}>El nombre del medicamento es obligatorio</span>}
        </div>

        <div>
          <label className={`${labelClass} flex min-h-10 items-end`} htmlFor={`medications.${index}.frequencyHours`}>
            Cada cuántas horas
          </label>
          <input
            id={`medications.${index}.frequencyHours`}
            type="number"
            className={fieldClass('frequencyHours')}
            {...register(`medications.${index}.frequencyHours`, positiveIntegerValidation)}
          />
          {medErrors?.frequencyHours && <span className={errorClass}>Debe ser un número positivo</span>}
        </div>

        <div>
          <label className={`${labelClass} flex min-h-10 items-end`} htmlFor={`medications.${index}.durationDays`}>
            Duración (días)
          </label>
          <input
            id={`medications.${index}.durationDays`}
            type="number"
            className={fieldClass('durationDays')}
            {...register(`medications.${index}.durationDays`, positiveIntegerValidation)}
          />
          {medErrors?.durationDays && <span className={errorClass}>Debe ser un número positivo</span>}
        </div>

        <div className="col-span-2">
          <label className={labelClass} htmlFor={`medications.${index}.startTime`}>
            Horario de inicio <span className={optionalClass}>(opcional)</span>
          </label>
          <input
            id={`medications.${index}.startTime`}
            type="time"
            className={inputClass}
            {...register(`medications.${index}.startTime`)}
          />
        </div>
      </div>
    </fieldset>
  )
}
