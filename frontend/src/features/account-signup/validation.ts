import type { FieldError } from 'react-hook-form'
import { NAME_MAX_LENGTH, NAME_PATTERN } from './types'

// Letters (incl. accented characters and ñ), spaces, hyphens and
// apostrophes only — mirrors backend/internal/account/service.go's
// validateNameFormat, kept as the single source of truth for the rule.
export const nameValidation = { required: true, maxLength: NAME_MAX_LENGTH, pattern: NAME_PATTERN }

// Height/weight are optional, but if provided must be positive — mirrors the
// backend's `> 0` check so the common case never reaches the server.
export const positiveNumberValidation = { min: { value: 0.01, message: 'must be positive' } }

// The mocks' own validation messages (mocks 01/11).
export const EMAIL_MESSAGE = 'Escribe un correo válido.'
export const PASSWORD_MESSAGE = 'La contraseña necesita al menos 8 caracteres.'
export const CHILD_NAME_MESSAGE = 'Escribe el nombre de tu hijo.'
export const BIRTH_DATE_MESSAGE = 'Elige la fecha de nacimiento.'

export const emailValidation = { required: true, pattern: /^\S+@\S+\.\S+$/ }
export const passwordValidation = { required: true, minLength: 8 }

/**
 * The Spanish message for a failed name rule; `subject` is e.g. "El nombre del
 * hijo". `requiredMessage` replaces the default "<subject> es obligatorio".
 */
export function nameError(error: FieldError | undefined, subject: string, requiredMessage?: string): string | undefined {
  if (!error) return undefined
  if (error.type === 'required') return requiredMessage ?? `${subject} es obligatorio`
  if (error.type === 'maxLength') return `${subject} debe tener máximo ${NAME_MAX_LENGTH} caracteres`
  return `${subject} solo puede contener letras, espacios, guiones y apóstrofes`
}
