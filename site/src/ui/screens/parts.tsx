import type { ReactNode } from 'react'
import { cn } from '../cn.ts'

/** Las piezas con que se dibujan las pantallas de la app (el sistema visual, a escala de 280×480). */

export function AppScreen({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex h-[480px] w-[280px] flex-col overflow-hidden bg-canvas text-ink">
      <div className="flex h-[26px] justify-between px-[18px] pt-1.5 text-[11px] font-bold">
        <span>10:24</span>
        <span>● ▮</span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 px-3.5 pt-1.5">
        <div className="text-[19px] font-black tracking-[-0.02em]">{title}</div>
        {children}
        {footer && <div className="mt-auto pb-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Row({ title, sub, trailing }: { title: string; sub: string; trailing?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-[11px] py-[9px]">
      <div className="flex flex-col gap-px">
        <span className="text-[13px] font-extrabold">{title}</span>
        <span className="text-[11px] text-muted">{sub}</span>
      </div>
      {trailing}
    </div>
  )
}

export function Check() {
  return <span className="text-[15px] font-black text-confirmed">✓</span>
}

export function MiniButton({ children, solid = false }: { children: ReactNode; solid?: boolean }) {
  return (
    <span
      className={cn(
        'rounded-[9px] px-2.5 py-1.5 text-[11px] font-extrabold',
        solid ? 'bg-confirmed text-surface' : 'border-[1.5px] border-action bg-surface text-action',
      )}
    >
      {children}
    </span>
  )
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-extrabold text-action">{children}</span>
}

export function Chip({ children, selected = false }: { children: ReactNode; selected?: boolean }) {
  return (
    <span
      className={cn(
        'rounded-full border px-[9px] py-1 text-[11px] font-bold text-ink',
        selected ? 'border-action bg-hint' : 'border-hint-border bg-surface',
      )}
    >
      {children}
    </span>
  )
}
