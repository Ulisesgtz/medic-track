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
