import type { ReactNode } from 'react'
import { pageHeaderButton } from '../../shared/ui/pageHeaderButton'
import { telHref } from './callLink'
import { hasText } from './recordModel'
import { RECORD, bloodLabel, updatedLine } from './recordText'
import type { ChildRecord } from './types'

type Variant = 'phone' | 'desktop'

const label = 'text-[12px] font-extrabold uppercase tracking-[0.08em] text-action'
const itemName = 'text-[16px] font-extrabold text-ink'
const itemNote = 'text-[14px] leading-[1.45] text-body break-words'
const chip = 'whitespace-nowrap rounded-full border border-hint-border bg-hint px-2.5 py-[3px] text-[13px] font-extrabold text-action'


function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
    </svg>
  )
}

/**
 * The groups of the record as the mock draws them: the ones the family left empty are not shown at all, and the app never writes
 * «Sin alergias» (that would be claiming something). Phone: one column; web: two (allergies and conditions | blood type, pediatrician
 * and note). Medicamento, Alimento and Otra are the same neutral label.
 */
export function RecordBody({ record, variant }: { record: ChildRecord; variant: Variant }) {
  const p = record.pediatrician
  const tel = telHref(p?.phone)
  const showPediatrician = p !== null && (hasText(p.name) || hasText(p.phone) || hasText(p.office))

  const allergies = record.allergies.length > 0 && (
    <div className="flex flex-col gap-2">
      <h3 className={label}>{RECORD.allergies}</h3>
      {record.allergies.map((a, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className={`${itemName} break-words`}>{a.name}</span>
            {a.kind && <span className={chip}>{RECORD.kinds[a.kind]}</span>}
          </div>
          {hasText(a.note) && <span className={itemNote}>{a.note}</span>}
        </div>
      ))}
    </div>
  )
  const blood = record.bloodType !== null && (
    <div className="flex flex-col gap-2">
      <h3 className={label}>{RECORD.bloodType}</h3>
      <span className="text-[24px] font-black tracking-[-0.02em] text-ink">{bloodLabel(record.bloodType)}</span>
    </div>
  )
  const conditions = record.conditions.length > 0 && (
    <div className="flex flex-col gap-2">
      <h3 className={label}>{RECORD.conditions}</h3>
      {record.conditions.map((c, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          <span className={`${itemName} break-words`}>{c.name}</span>
          {hasText(c.note) && <span className={itemNote}>{c.note}</span>}
        </div>
      ))}
    </div>
  )
  const pediatrician = showPediatrician && (
    <div className="flex flex-col gap-2">
      <h3 className={label}>{RECORD.pediatrician}</h3>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {hasText(p.name) && <span className={`${itemName} break-words`}>{p.name}</span>}
          {hasText(p.phone) && <span className="text-[15px] text-ink">{p.phone}</span>}
          {hasText(p.office) && <span className={itemNote}>{p.office}</span>}
        </div>
        {tel && (
          <a href={tel} aria-label={RECORD.callTo(hasText(p.name) ? p.name : null)} className={`${pageHeaderButton('edit', variant)} gap-2 no-underline`}>
            <PhoneIcon />
            {RECORD.call}
          </a>
        )}
      </div>
    </div>
  )
  const note = hasText(record.generalNote) && (
    <div className="flex flex-col gap-2">
      <h3 className={label}>{RECORD.generalNote}</h3>
      <span className="whitespace-pre-wrap break-words text-[15px] leading-[1.55] text-ink">{record.generalNote}</span>
    </div>
  )

  const column = (groups: ReactNode[], gap: string) => {
    const shown = groups.filter(Boolean)
    return (
      <div className={`flex min-w-0 flex-col ${gap}`}>
        {shown.map((group, i) => (
          <div key={i} className={i > 0 ? 'border-t border-hint-edge pt-3.5' : undefined}>
            {group}
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'desktop') {
    return (
      <div className="grid grid-cols-2 gap-x-10 gap-y-6">
        {column([allergies, conditions], 'gap-[18px]')}
        {column([blood, pediatrician, note], 'gap-[18px]')}
      </div>
    )
  }
  return column([allergies, blood, conditions, pediatrician, note], 'gap-3.5')
}

/** «Actualizada el 17 nov 2026 por Ana» and the fixed sentence, under the groups. */
export function RecordFooter({ record }: { record: ChildRecord }) {
  return (
    <div className="flex flex-col gap-1 border-t border-hint-edge pt-3">
      {record.updated && <span className="text-[13px] font-bold text-muted">{updatedLine(record.updated.at, record.updated.by)}</span>}
      <span className="text-[13px] leading-normal text-body">{RECORD.phrase}</span>
    </div>
  )
}
