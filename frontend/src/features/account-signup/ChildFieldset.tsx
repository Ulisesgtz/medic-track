import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import type { AccountSignupFormValues } from './types'
import { NAME_MAX_LENGTH, NAME_PATTERN } from './types'

const nameValidation = { required: true, maxLength: NAME_MAX_LENGTH, pattern: NAME_PATTERN }

interface ChildFieldsetProps {
  index: number
  register: UseFormRegister<AccountSignupFormValues>
  errors: FieldErrors<AccountSignupFormValues>
  onRemove: () => void
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30'
const labelClass = 'mb-1 block text-sm font-medium text-slate-700'
const errorClass = 'mt-1 text-sm text-red-600'

/**
 * A single child's fields (firstName, lastName required; birthDate required
 * per FR-004; height/weight optional). Can be removed before the account is
 * saved (FR-006) — once persisted, removal is no longer offered anywhere in
 * the UI (FR-006a is enforced by simply never building that control).
 */
export function ChildFieldset({ index, register, errors, onRemove }: ChildFieldsetProps) {
  const childErrors = errors.children?.[index]

  return (
    <fieldset
      className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-4"
      data-testid={`child-fieldset-${index}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <legend className="inline-flex items-center rounded-full bg-cyan-600 px-2.5 py-1 text-xs font-semibold text-white">
          Hijo {index + 1}
        </legend>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-red-600 transition-colors duration-200 hover:text-red-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a2 2 0 0 1-2 1.9H9.8a2 2 0 0 1-2-1.9L7 7" />
          </svg>
          Quitar hijo
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`children.${index}.firstName`}>
            Nombre
          </label>
          <input
            id={`children.${index}.firstName`}
            className={inputClass}
            {...register(`children.${index}.firstName`, nameValidation)}
          />
          {childErrors?.firstName?.type === 'required' && (
            <span role="alert" className={errorClass}>
              El nombre del hijo es obligatorio
            </span>
          )}
          {childErrors?.firstName?.type === 'maxLength' && (
            <span role="alert" className={errorClass}>
              El nombre del hijo debe tener máximo 100 caracteres
            </span>
          )}
          {childErrors?.firstName?.type === 'pattern' && (
            <span role="alert" className={errorClass}>
              El nombre del hijo solo puede contener letras, espacios, guiones y apóstrofes
            </span>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor={`children.${index}.lastName`}>
            Apellido
          </label>
          <input
            id={`children.${index}.lastName`}
            className={inputClass}
            {...register(`children.${index}.lastName`, nameValidation)}
          />
          {childErrors?.lastName?.type === 'required' && (
            <span role="alert" className={errorClass}>
              El apellido del hijo es obligatorio
            </span>
          )}
          {childErrors?.lastName?.type === 'maxLength' && (
            <span role="alert" className={errorClass}>
              El apellido del hijo debe tener máximo 100 caracteres
            </span>
          )}
          {childErrors?.lastName?.type === 'pattern' && (
            <span role="alert" className={errorClass}>
              El apellido del hijo solo puede contener letras, espacios, guiones y apóstrofes
            </span>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor={`children.${index}.birthDate`}>
            Fecha de nacimiento
          </label>
          <input
            id={`children.${index}.birthDate`}
            type="date"
            className={inputClass}
            {...register(`children.${index}.birthDate`, { required: true })}
          />
          {childErrors?.birthDate && (
            <span role="alert" className={errorClass}>
              La fecha de nacimiento es obligatoria
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor={`children.${index}.height`}>
              Talla (cm)
            </label>
            <input
              id={`children.${index}.height`}
              type="number"
              step="0.1"
              placeholder="Opcional"
              className={inputClass}
              {...register(`children.${index}.height`)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor={`children.${index}.weight`}>
              Peso (kg)
            </label>
            <input
              id={`children.${index}.weight`}
              type="number"
              step="0.1"
              placeholder="Opcional"
              className={inputClass}
              {...register(`children.${index}.weight`)}
            />
          </div>
        </div>
      </div>
    </fieldset>
  )
}
