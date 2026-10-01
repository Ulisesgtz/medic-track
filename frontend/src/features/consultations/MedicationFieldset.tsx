import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import type { ConsultationFormValues } from './ConsultationForm'
import { parsePositiveInt } from './parsePositiveInt'

const validPositive = (value: string) => parsePositiveInt(value) !== null

const field =
  'min-h-11 w-full min-w-0 rounded-xl px-4 py-3 text-base text-ink placeholder:text-slate-400 focus:border-2 focus:border-ink focus:outline-none'
const plain = `${field} border-[1.5px] border-slate-300`
const suggestedBorder = `${field} border-2 border-bright`
const label = 'text-[13px] font-bold text-ink-soft'
const error = 'text-[13px] font-semibold text-red-700'
const START_TIME_MESSAGE = 'Elige la hora de la primera toma.'

// Required, except on a record-only consultation (specs/024). A function, not `required`, because the field is not
// drawn while it is marked but stays registered (its typed value is kept): the rule must read the mark when it runs.
const startTimeRule = (value: string, form: ConsultationFormValues) => form.recordOnly || value.trim() !== ''

interface MedicationFieldsetProps {
  index: number
  register: UseFormRegister<ConsultationFormValues>
  errors: FieldErrors<ConsultationFormValues>
  onRemove: () => void
  /** "Quitar" only shows when there is more than one medication (mocks 04/14). */
  canRemove: boolean
  removeDisabled?: boolean
  /** Field paths the OCR filled in — rendered with the bright "to review" border. */
  suggested?: ReadonlySet<string>
  variant: 'phone' | 'desktop'
  /** A record-only consultation (specs/024) has no schedule: "Primera toma" is not drawn. */
  recordOnly?: boolean
}

/**
 * One repeatable medication, built from mockups 04 (phone) and 14 (desktop):
 * a white card with the "Medicamento N" badge, "Quitar", and the fields
 * "Nombre y dosis", frequency ("c/8 h"), duration ("7 días") and — an addition
 * to the mock, because doses can't be scheduled without it — the start time
 * "Primera toma", which is required: a consultation is immutable once saved, so a
 * missing start time could never be filled in later (and without it no doses
 * or active treatment exist). Frequency and duration accept free text; the
 * first number in them is what's sent. On the web they hold a couple of digits
 * ("c/12 h", "14 días"), so they have a fixed narrow width and the name takes
 * the rest; on the phone frequency and duration take half the row each, as the
 * mock 04, and "Primera toma" (label above) is as wide as the frequency, right
 * under it.
 */
export function MedicationFieldset({
  index,
  register,
  errors,
  onRemove,
  canRemove,
  removeDisabled = false,
  suggested,
  variant,
  recordOnly = false,
}: MedicationFieldsetProps) {
  const medErrors = errors.medications?.[index]
  const cls = (name: string) => (suggested?.has(`medications.${index}.${name}`) ? suggestedBorder : plain)
  const id = (name: string) => `medications.${index}.${name}`
  const desktop = variant === 'desktop'

  return (
    <fieldset
      data-testid={`medication-fieldset-${index}`}
      aria-labelledby={`medication-title-${index}`}
      className={`flex min-w-0 flex-col rounded-3xl bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)] ${
        desktop ? '@container gap-4 p-6' : 'gap-3.5 p-5'
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          id={`medication-title-${index}`}
          className="rounded-full bg-action px-3 py-1.5 text-xs font-extrabold tracking-wider text-white uppercase"
        >
          Medicamento {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Quitar medicamento"
            disabled={removeDisabled}
            className="min-h-11 cursor-pointer px-1 text-[13px] font-bold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Quitar
          </button>
        )}
      </div>

      <div
        className={
          desktop
            ? 'grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_7rem_7rem] @min-[720px]:grid-cols-[minmax(0,1fr)_7rem_7rem_10rem]'
            : 'flex min-w-0 flex-col gap-3.5'
        }
      >
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={id('name')} className={desktop ? label : 'sr-only'}>
            Nombre y dosis
          </label>
          <input
            id={id('name')}
            placeholder={desktop ? 'Amoxicilina 250 mg' : 'Nombre y dosis'}
            size={1}
            className={`${cls('name')} font-semibold`}
            {...register(`medications.${index}.name`, { required: true })}
          />
          {medErrors?.name && <p className={error}>Escribe el nombre del medicamento.</p>}
        </div>

        <div className={desktop ? 'contents' : 'flex gap-2.5'}>
          <div className={`flex min-w-0 flex-col gap-2 ${desktop ? '' : 'flex-1'}`}>
            <label htmlFor={id('frequencyHours')} className={desktop ? label : 'sr-only'}>
              Frecuencia
            </label>
            <input
              id={id('frequencyHours')}
              placeholder="c/8 h"
              size={1}
              inputMode="numeric"
              className={`${cls('frequencyHours')} text-[15px]`}
              {...register(`medications.${index}.frequencyHours`, { validate: validPositive })}
            />
            {medErrors?.frequencyHours && <p className={error}>Escribe cada cuántas horas (ej. 8).</p>}
          </div>
          <div className={`flex min-w-0 flex-col gap-2 ${desktop ? '' : 'flex-1'}`}>
            <label htmlFor={id('durationDays')} className={desktop ? label : 'sr-only'}>
              Duración
            </label>
            <input
              id={id('durationDays')}
              placeholder="7 días"
              size={1}
              inputMode="numeric"
              className={`${cls('durationDays')} text-[15px]`}
              {...register(`medications.${index}.durationDays`, { validate: validPositive })}
            />
            {medErrors?.durationDays && <p className={error}>Escribe cuántos días (ej. 7).</p>}
          </div>
          {desktop && !recordOnly && (
            // Not in the mock's row of three. With room (the card is 720px wide or more) it is a fourth
            // column of the same row; otherwise it goes to a second row, under "Frecuencia" and "Duración".
            <div className="flex min-w-0 flex-col gap-2 sm:col-span-2 sm:col-start-2 @min-[720px]:col-span-1 @min-[720px]:col-start-auto">
              <label htmlFor={id('startTime')} className={label}>
                Primera toma
              </label>
              <input
                id={id('startTime')}
                type="time"
                size={1}
                className={`${plain} text-[15px]`}
                {...register(`medications.${index}.startTime`, { validate: startTimeRule })}
              />
              {medErrors?.startTime && <p className={error}>{START_TIME_MESSAGE}</p>}
            </div>
          )}
        </div>
      </div>

      {!desktop && !recordOnly && (
        // Half the row minus half the 10px gap: exactly the width of the frequency field above.
        <div className="flex w-[calc(50%-5px)] min-w-0 flex-col gap-2">
          <label htmlFor={id('startTime')} className={label}>
            Primera toma
          </label>
          <input
            id={id('startTime')}
            type="time"
            size={1}
            // iOS Safari draws time inputs with their own minimum width and ignores the box's: without
            // appearance-none the field ran past the card's edge on the iPhone.
            className={`${plain} appearance-none text-[15px] [&::-webkit-date-and-time-value]:text-left`}
            {...register(`medications.${index}.startTime`, { validate: startTimeRule })}
          />
          {medErrors?.startTime && <p className={error}>{START_TIME_MESSAGE}</p>}
        </div>
      )}
    </fieldset>
  )
}
