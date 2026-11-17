import type { ChildRecord } from './types'

export const hasText = (value: string | null | undefined) => !!value && value.trim() !== ''

/** Whether the record has anything to show (a record the family emptied again counts as none). */
export function hasContent(record: ChildRecord): boolean {
  const p = record.pediatrician
  return (
    record.allergies.length > 0 ||
    record.conditions.length > 0 ||
    record.bloodType !== null ||
    hasText(record.generalNote) ||
    (p !== null && (hasText(p.name) || hasText(p.phone) || hasText(p.office)))
  )
}

export const recordCard = 'flex flex-col gap-3.5 rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
