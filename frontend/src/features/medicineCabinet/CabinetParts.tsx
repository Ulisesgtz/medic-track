import { Link } from 'react-router-dom'
import { CABINET, addedBy, expiresLine, quantityText } from './cabinetText'
import type { CabinetItem } from './types'

// specs/062: small pieces shared by the cabinet's screens, drawn as the delivered design.

export const card = 'rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)]'

/** The box icon of the design (entry, empty state, a medicine without a photo). */
export function BoxIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3.5" y="7" width="17" height="13" rx="2.5" />
      <path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M12 10.5v6M9 13.5h6" />
    </svg>
  )
}

/** The 56 × 56 tile of a row: the striped «foto» tile when it has a photo (the photo itself is only asked in the detail), else the box. */
export function Thumb({ hasPhoto }: { hasPhoto: boolean }) {
  return hasPhoto ? (
    <span
      aria-hidden="true"
      className="flex h-14 w-14 flex-none items-end justify-center rounded-xl border border-hint-border bg-[repeating-linear-gradient(135deg,var(--color-hint)_0_7px,var(--color-hint-edge)_7px_14px)] pb-1 text-[10px] font-extrabold text-action"
    >
      {CABINET.photoAlt}
    </span>
  ) : (
    <span aria-hidden="true" className="flex h-14 w-14 flex-none items-center justify-center rounded-xl border-[1.5px] border-dashed border-hint-border bg-canvas text-action">
      <BoxIcon />
    </span>
  )
}

/** One medicine of the list: the whole row is the link (84 px phone / 76 px web). The date has the quantity's style (Principio I). */
export function CabinetRow({ item, desktop, first }: { item: CabinetItem; desktop: boolean; first: boolean }) {
  const quantity = quantityText(item.quantity, item.unit)
  const border = first ? '' : 'border-t border-hint-edge'
  if (desktop)
    return (
      <Link
        to={`/botiquin/${item.id}`}
        className={`grid min-h-[76px] grid-cols-[56px_1.6fr_1fr_1fr_1fr_24px] items-center gap-5 px-5 py-2.5 hover:bg-hint ${border}`}
      >
        <Thumb hasPhoto={item.hasPhoto} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[17px] font-extrabold text-ink [overflow-wrap:anywhere]">{item.name}</span>
          <span className="text-[14px] text-body">{item.strength || '—'}</span>
        </span>
        <span className="text-[15px] text-body">{quantity}</span>
        <span className="text-[15px] text-body">{expiresLine(item.expires)}</span>
        <span className="text-[14px] text-muted">{addedBy(item.createdBy, item.createdAt)}</span>
        <span aria-hidden="true" className="text-[22px] font-extrabold text-action">
          ›
        </span>
      </Link>
    )
  return (
    <Link to={`/botiquin/${item.id}`} className={`flex min-h-[84px] items-center gap-3.5 px-4 py-3 hover:bg-hint ${border}`}>
      <Thumb hasPhoto={item.hasPhoto} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[17px] font-extrabold text-ink [overflow-wrap:anywhere]">{item.name}</span>
        <span className="text-[14px] text-body">{item.strength ? `${item.strength} · ${quantity}` : quantity}</span>
        <span className="text-[14px] text-body">{expiresLine(item.expires)}</span>
      </span>
      <span aria-hidden="true" className="flex-none text-[22px] font-extrabold text-action">
        ›
      </span>
    </Link>
  )
}

/** «Vista de Cuidadora. Puedes ver el botiquín…». */
export function CaregiverNote({ desktop }: { desktop: boolean }) {
  return (
    <div role="note" className={`rounded-2xl border-[1.5px] border-hint-border bg-surface leading-normal text-body ${desktop ? 'px-[18px] py-3.5 text-[15px]' : 'px-4 py-3.5 text-[14px]'}`}>
      <strong className="text-ink">{CABINET.caregiverLead}</strong> {CABINET.caregiverRest}
    </div>
  )
}
