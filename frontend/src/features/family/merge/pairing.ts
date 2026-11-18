import type { DifferenceField, MergeChild, PairIds } from './types'

/** Lowercase, no accents, single spaces. */
export function normalizeName(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function sameName(a: MergeChild, b: MergeChild): boolean {
  const fa = normalizeName(a.firstName)
  if (fa === '' || fa !== normalizeName(b.firstName)) return false
  const la = normalizeName(a.lastName)
  const lb = normalizeName(b.lastName)
  return la === '' || lb === '' || la === lb
}

/** Same suggestion as the server (contracts/api.md), only to show it: never uses the birth date; each child at most once. */
export function suggestPairs(own: MergeChild[], family: MergeChild[]): PairIds[] {
  const used = new Set<string>()
  const pairs: PairIds[] = []
  for (const o of own) {
    const match = family.find((f) => !used.has(f.id) && sameName(o, f))
    if (match) {
      used.add(match.id)
      pairs.push({ ownChildId: o.id, familyChildId: match.id })
    }
  }
  return pairs
}

const eq = (a: unknown, b: unknown) => (a ?? null) === (b ?? null)
const blank = (s: string | null | undefined) => (s ?? '').trim()

/** The fields in which two children's records differ (the pediatrician is one block). */
export function differences(own: MergeChild, family: MergeChild): DifferenceField[] {
  const out: DifferenceField[] = []
  if (blank(own.firstName) !== blank(family.firstName)) out.push('firstName')
  if (blank(own.lastName) !== blank(family.lastName)) out.push('lastName')
  if (own.birthDate !== family.birthDate) out.push('birthDate')
  if (!eq(own.height, family.height)) out.push('height')
  if (!eq(own.weight, family.weight)) out.push('weight')
  if (!eq(own.growthReferenceSex, family.growthReferenceSex)) out.push('growthReferenceSex')
  if (own.record.exists && family.record.exists) {
    if (blank(own.record.bloodType) !== blank(family.record.bloodType)) out.push('bloodType')
    const block = (c: MergeChild) => [c.record.pediatrician?.name, c.record.pediatrician?.phone, c.record.pediatrician?.office].map(blank).join('|')
    if (block(own) !== block(family)) out.push('pediatrician')
    if (blank(own.record.generalNote) !== blank(family.record.generalNote)) out.push('generalNote')
  }
  return out
}
