import type { Vaccination, VaccineGroup } from './types'

/** A name without case or accents, so «Neumocócica» and «neumococica» are the same word. */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

/** The key two doses share when they are the same vaccine: its catalog code, or the parent's own words without case or accents. */
export function vaccineKey(v: Pick<Vaccination, 'vaccineCode' | 'name' | 'customName'>): string {
  return v.vaccineCode ? `code:${v.vaccineCode}` : `own:${foldText(v.customName ?? v.name)}`
}

/**
 * Groups the recorded doses by vaccine for the card: each group lists its doses oldest first, and the groups go by their most recent
 * dose, newest first. It only arranges what was recorded: there is no count of doses «missing», no schedule and no status (Principio I).
 */
export function groupByVaccine(doses: Vaccination[]): VaccineGroup[] {
  const groups = new Map<string, VaccineGroup>()
  for (const dose of doses) {
    const key = vaccineKey(dose)
    const group = groups.get(key)
    if (group) group.doses.push(dose)
    else groups.set(key, { key, name: dose.name, doses: [dose] })
  }
  const byDate = (a: Vaccination, b: Vaccination) => a.appliedOn.localeCompare(b.appliedOn) || a.createdAt.localeCompare(b.createdAt)
  const list = [...groups.values()]
  for (const g of list) g.doses.sort(byDate)
  const latest = (g: VaccineGroup) => g.doses[g.doses.length - 1].appliedOn
  return list.sort((a, b) => latest(b).localeCompare(latest(a)) || a.name.localeCompare(b.name, 'es'))
}
