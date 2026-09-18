import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import type { AccountSignupFormValues } from './types'
import { NAME_MAX_LENGTH, NAME_PATTERN } from './types'
import { errorClass, inputClass, labelClass } from '../../shared/ui/formStyles'

const nameValidation = { required: true, maxLength: NAME_MAX_LENGTH, pattern: NAME_PATTERN }

// Height/weight are optional, but if provided must be positive — mirrors
// backend/internal/account/service.go's `c.Height <= 0`/`c.Weight <= 0`
// checks, catching the invalid case client-side instead of only server-side
// (where a rejection previously showed no error message at all).
const positiveNumberValidation = { min: { value: 0.01, message: 'must be positive' } }

interface ChildFieldsetProps {
  index: number
  register: UseFormRegister<AccountSignupFormValues>
  errors: FieldErrors<AccountSignupFormValues>
  onRemove: () => void
}


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
      className="rounded-2xl border border-hint-border bg-hint p-5"
      data-testid={`child-fieldset-${index}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <legend className="inline-flex items-center rounded-full bg-action px-3 py-1 text-xs font-extrabold uppercase tracking-[0.1em] text-white">
          Hijo {index + 1}
        </legend>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-sm font-bold text-red-700 transition-colors duration-200 hover:text-red-800"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a2 2 0 0 1-2 1.9H9.8a2 2 0 0 1-2-1.9L7 7" />
          </svg>
          Quitar hijo
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

        <div className="md:col-span-2">
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

        <div className="grid grid-cols-2 gap-3 md:col-span-2">
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
              {...register(`children.${index}.height`, positiveNumberValidation)}
            />
            {childErrors?.height?.type === 'min' && (
              <span role="alert" className={errorClass}>
                La talla debe ser un número positivo
              </span>
            )}
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
              {...register(`children.${index}.weight`, positiveNumberValidation)}
            />
            {childErrors?.weight?.type === 'min' && (
              <span role="alert" className={errorClass}>
                El peso debe ser un número positivo
              </span>
            )}
          </div>
        </div>
      </div>
    </fieldset>
  )
}
