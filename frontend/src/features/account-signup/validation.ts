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
export const PASSWORD_MESSAGE = 'La contraseña no cumple con las reglas.'
export const CHILD_NAME_MESSAGE = 'Escribe el nombre de tu hijo.'
export const BIRTH_DATE_MESSAGE = 'Elige la fecha de nacimiento.'

export const emailValidation = { required: true, pattern: /^\S+@\S+\.\S+$/ }

// The password policy configured in Clerk's dashboard (min. 8 + one of each
// class). Clerk enforces it server-side; this is the same rule set so the tutor
// sees what is missing while typing instead of a rejection after submitting.
export const PASSWORD_RULES: { id: string; label: string; test: (value: string) => boolean }[] = [
  { id: 'length', label: 'Mínimo 8 caracteres', test: (value) => value.length >= 8 },
  { id: 'lowercase', label: 'Al menos 1 letra minúscula', test: (value) => /\p{Ll}/u.test(value) },
  { id: 'uppercase', label: 'Al menos 1 letra mayúscula', test: (value) => /\p{Lu}/u.test(value) },
  { id: 'number', label: 'Al menos 1 número', test: (value) => /\d/.test(value) },
  { id: 'special', label: 'Al menos 1 carácter especial (por ejemplo ! @ # $ %)', test: (value) => /[^\p{L}\p{N}\s]/u.test(value) },
]
export const passwordValidation = {
  required: true,
  validate: (value: string) => PASSWORD_RULES.every((rule) => rule.test(value)),
}

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
