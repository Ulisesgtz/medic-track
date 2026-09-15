import type { UseFormRegister, FieldErrors } from 'react-hook-form'
import type { AccountSignupFormValues } from './types'

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
    <fieldset className="rounded-md border border-gray-300 p-4" data-testid={`child-fieldset-${index}`}>
      <legend className="px-1 text-sm font-medium">Hijo {index + 1}</legend>

      <label htmlFor={`children.${index}.firstName`}>Nombre</label>
      <input id={`children.${index}.firstName`} {...register(`children.${index}.firstName`, { required: true })} />
      {childErrors?.firstName && <span role="alert">El nombre del hijo es obligatorio</span>}

      <label htmlFor={`children.${index}.lastName`}>Apellido</label>
      <input id={`children.${index}.lastName`} {...register(`children.${index}.lastName`, { required: true })} />
      {childErrors?.lastName && <span role="alert">El apellido del hijo es obligatorio</span>}

      <label htmlFor={`children.${index}.birthDate`}>Fecha de nacimiento</label>
      <input
        id={`children.${index}.birthDate`}
        type="date"
        {...register(`children.${index}.birthDate`, { required: true })}
      />
      {childErrors?.birthDate && <span role="alert">La fecha de nacimiento es obligatoria</span>}

      <label htmlFor={`children.${index}.height`}>Talla (cm, opcional)</label>
      <input id={`children.${index}.height`} type="number" step="0.1" {...register(`children.${index}.height`)} />

      <label htmlFor={`children.${index}.weight`}>Peso (kg, opcional)</label>
      <input id={`children.${index}.weight`} type="number" step="0.1" {...register(`children.${index}.weight`)} />

      <button type="button" onClick={onRemove}>
        Quitar hijo
      </button>
    </fieldset>
  )
}
