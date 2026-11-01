import { useRef, useState } from 'react'
import { PANEL } from './exportText'
import { ExportPanel, type ExportPanelProps } from './ExportPanel'

interface ExportEntryProps extends Omit<ExportPanelProps, 'onClose' | 'opener'> {
  /** The phone or the web design (mock M1/M3 and W1); `phone-row` shares the row with another button (mock M2, the card). */
  variant: 'phone' | 'phone-row' | 'desktop'
}

const badge =
  'rounded-full border-[1.5px] border-hint-border bg-hint px-2.5 py-[3px] text-xs font-extrabold tracking-[0.06em] text-action uppercase'

/**
 * «Exportar a PDF» (specs/050): an outlined button that opens the panel. On the free plan it carries the «Plan completo» mark and
 * opens straight on the plan notice; on the phone it then takes the whole width so the mark fits (mock M3).
 */
export function ExportEntry({ variant, ...panel }: ExportEntryProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const phone = variant !== 'desktop'
  const base =
    'cursor-pointer rounded-2xl border-2 border-action bg-surface font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2'
  const size = panel.free
    ? phone
      ? 'flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-base'
      : 'inline-flex min-h-12 items-center gap-2.5 px-4 text-base'
    : variant === 'phone-row'
      ? 'min-h-[52px] flex-1 px-3 text-base'
      : phone
        ? 'min-h-11 shrink-0 px-3.5 text-[15px]'
        : 'min-h-12 shrink-0 px-[18px] text-base'

  return (
    <>
      <button ref={buttonRef} type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className={`${base} ${size}`}>
        <span>{PANEL.entry}</span>
        {panel.free && <span className={badge}>{PANEL.planBadge}</span>}
      </button>
      {open && <ExportPanel {...panel} onClose={() => setOpen(false)} opener={buttonRef} />}
    </>
  )
}
