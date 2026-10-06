import { useId } from 'react'
import { errorClass, fieldAuth, fieldBorder, fieldCompact, labelClass } from '../../shared/ui/formStyles'
import { SymptomPicker } from './SymptomPicker'
import { rangeInverted, type HistoryCriteria, type HistoryKind } from './historyCriteria'
import type { HistoryOptions } from './types'

type Variant = 'phone' | 'desktop'

interface FieldsProps {
  variant: Variant
  criteria: HistoryCriteria
  onChange: (patch: Partial<HistoryCriteria>) => void
}

// The phone screens use the 16 px sign-in field and the web ones the compact 12 px field (spec 007), as everywhere else.
const field = (variant: Variant) => (variant === 'desktop' ? fieldCompact : fieldAuth)

const KIND_OPTIONS: { value: HistoryKind; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'treatment', label: 'Con tratamiento' },
  { value: 'record', label: 'Solo registro' },
]

/** The text search: the doctor, the notes or a medication, ignoring case and accents. It only finds, it never suggests. */
export function HistorySearchField({ variant, criteria, onChange }: FieldsProps) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className={labelClass}>
        Buscar
      </label>
      <input
        id={id}
        type="search"
        value={criteria.q}
        onChange={(event) => onChange({ q: event.target.value })}
        placeholder="Doctor, medicamento o notas"
        maxLength={100}
        autoComplete="off"
        className={`${field(variant)} ${fieldBorder(false)}`}
      />
    </div>
  )
}

interface FilterFieldsProps extends FieldsProps {
  /** The doctors and medications already registered (undefined while they load or if they could not). */
  options: HistoryOptions | undefined
  optionsFailed: boolean
}

/** The filters besides the text: dates, doctor, medication, kind and symptoms. They all narrow the list together. */
export function HistoryFilterFields({ variant, criteria, onChange, options, optionsFailed }: FilterFieldsProps) {
  const base = useId()
  const inverted = rangeInverted(criteria)
  const desktop = variant === 'desktop'
  const cls = `${field(variant)} ${fieldBorder(false)}`

  return (
    <div className={`flex min-w-0 flex-col ${desktop ? 'gap-5' : 'gap-4'}`}>
      <div className={`grid gap-3 ${desktop ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={`${base}-from`} className={labelClass}>
            Desde
          </label>
          <input
            id={`${base}-from`}
            type="date"
            value={criteria.from}
            onChange={(event) => onChange({ from: event.target.value })}
            className={`${field(variant)} ${fieldBorder(false)} appearance-none`}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={`${base}-to`} className={labelClass}>
            Hasta
          </label>
          <input
            id={`${base}-to`}
            type="date"
            value={criteria.to}
            onChange={(event) => onChange({ to: event.target.value })}
            aria-invalid={inverted}
            aria-describedby={inverted ? `${base}-range-error` : undefined}
            className={`${field(variant)} ${fieldBorder(inverted)} appearance-none`}
          />
        </div>
        {inverted && (
          <p id={`${base}-range-error`} className={`${desktop ? '' : 'col-span-2 '}${errorClass}`}>
            La fecha final no puede ser anterior a la inicial.
          </p>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <label htmlFor={`${base}-doctor`} className={labelClass}>
          Doctor
        </label>
        <select id={`${base}-doctor`} value={criteria.doctor} onChange={(event) => onChange({ doctor: event.target.value })} className={cls}>
          <option value="">Todos</option>
          {(options?.doctors ?? []).map((doctor) => (
            <option key={doctor} value={doctor}>
              {doctor}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <label htmlFor={`${base}-medication`} className={labelClass}>
          Medicamento
        </label>
        <select
          id={`${base}-medication`}
          value={criteria.medication}
          onChange={(event) => onChange({ medication: event.target.value })}
          className={cls}
        >
          <option value="">Todos</option>
          {(options?.medications ?? []).map((medication) => (
            <option key={medication} value={medication}>
              {medication}
            </option>
          ))}
        </select>
        {optionsFailed && <p className="text-[13px] font-semibold text-slate-600">No pudimos cargar las listas de doctores y medicamentos.</p>}
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className={`mb-2 ${labelClass}`}>Tipo de consulta</legend>
        <div className="flex flex-wrap gap-2">
          {KIND_OPTIONS.map((option) => {
            const on = criteria.kind === option.value
            return (
              <label
                key={option.value}
                className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border-[1.5px] px-4 text-[15px] font-bold transition-colors duration-200 focus-within:ring-2 focus-within:ring-action focus-within:ring-offset-2 ${
                  on ? 'border-action bg-action text-white' : 'border-slate-300 bg-surface text-ink hover:border-action hover:bg-hint'
                }`}
              >
                <input
                  type="radio"
                  name={`${base}-kind`}
                  value={option.value}
                  checked={on}
                  onChange={() => onChange({ kind: option.value })}
                  className="sr-only"
                />
                {option.label}
              </label>
            )
          })}
        </div>
      </fieldset>

      <SymptomPicker
        legend="Síntomas (con todos los que marques)"
        value={criteria.symptomCodes}
        onChange={(symptomCodes) => onChange({ symptomCodes })}
        variant={variant}
      />
    </div>
  )
}
