// Letters (incl. accented characters and ñ), spaces, hyphens and
// apostrophes only — mirrors backend/internal/account/service.go's
// validateNameFormat, kept as the single source of truth for the rule.
export const NAME_PATTERN = /^[\p{L} '-]+$/u
export const NAME_MAX_LENGTH = 100

export interface ChildFormValues {
  firstName: string
  lastName: string
  birthDate: string
  height: string
  weight: string
}

export interface AccountSignupFormValues {
  firstName: string
  lastName: string
  email: string
  countryCode: string
  stateCode: string
  children: ChildFormValues[]
}

export const emptyChild: ChildFormValues = {
  firstName: '',
  lastName: '',
  birthDate: '',
  height: '',
  weight: '',
}
