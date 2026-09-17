import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import type { ConsultationFormValues } from './ConsultationForm'

interface MedicationFieldsetProps {
  index: number
  register: UseFormRegister<ConsultationFormValues>
  errors: FieldErrors<ConsultationFormValues>
  onRemove: () => void
  durationPlaceholder?: string
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30'
const labelClass = 'mb-1 block text-sm font-medium text-slate-700'
const errorClass = 'mt-1 text-sm text-red-600'

const positiveIntegerValidation = {
  required: true,
  min: { value: 1, message: 'must be a positive integer' },
}

/**
 * One repeatable medication block: name, frequency (every N hours),
 * treatment duration in days (FR-008), and an optional start time — a
 * medication without a start time never generates individual doses
 * (FR-010).
 */
export function MedicationFieldset({
  index,
  register,
  errors,
  onRemove,
  durationPlaceholder,
}: MedicationFieldsetProps) {
  const medErrors = errors.medications?.[index]

  return (
    <fieldset
      className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-4"
      data-testid={`medication-fieldset-${index}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <legend className="inline-flex items-center rounded-full bg-cyan-600 px-2.5 py-1 text-xs font-semibold text-white">
          Medicamento {index + 1}
        </legend>
        <button
          type="button"
          onClick={onRemove}
          className="cursor-pointer text-sm font-medium text-red-600 transition-colors duration-200 hover:text-red-700"
        >
          Quitar medicamento
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`medications.${index}.name`}>
            Nombre
          </label>
          <input
            id={`medications.${index}.name`}
            className={inputClass}
            {...register(`medications.${index}.name`, { required: true })}
          />
          {medErrors?.name && <span className={errorClass}>El nombre del medicamento es obligatorio</span>}
        </div>

        <div>
          <label className={labelClass} htmlFor={`medications.${index}.frequencyHours`}>
            Cada cuántas horas
          </label>
          <input
            id={`medications.${index}.frequencyHours`}
            type="number"
            className={inputClass}
            {...register(`medications.${index}.frequencyHours`, positiveIntegerValidation)}
          />
          {medErrors?.frequencyHours && <span className={errorClass}>Debe ser un número positivo</span>}
        </div>

        <div>
          <label className={labelClass} htmlFor={`medications.${index}.durationDays`}>
            Duración (días)
          </label>
          <input
            id={`medications.${index}.durationDays`}
            type="number"
            placeholder={durationPlaceholder}
            className={inputClass}
            {...register(`medications.${index}.durationDays`, positiveIntegerValidation)}
          />
          {medErrors?.durationDays && <span className={errorClass}>Debe ser un número positivo</span>}
        </div>

        <div>
          <label className={labelClass} htmlFor={`medications.${index}.startTime`}>
            Horario de inicio <span className="font-normal text-slate-400">(opcional)</span>
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
