// Mirrors contracts/get-account.md's response shape — same body as
// POST /accounts' 201 (specs/001-registro-cuenta-usuario).
export interface Child {
  id: string
  firstName: string
  lastName: string
  birthDate: string
  height: number | null
  weight: number | null
}

export interface Account {
  id: string
  firstName: string
  lastName: string
  email: string
  countryCode: string | null
  stateCode: string | null
  plan: string
  children: Child[]
}
