import { cn } from './cn.ts'

export type PlanCell = 'included' | 'excluded' | string

export interface PlanRow {
  feature: string
  free: PlanCell
  full: PlanCell
}

function Cell({ value }: { value: PlanCell }) {
  if (value === 'included') {
    return (
      <span role="cell" aria-label="Incluido" className="flex items-center justify-center gap-1.5 text-[15px] font-extrabold text-confirmed">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
          <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" className="stroke-confirmed" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="hidden web:inline">Incluido</span>
      </span>
    )
  }
  if (value === 'excluded') {
    return (
      <span role="cell" aria-label="No incluido" className="flex items-center justify-center gap-1.5 text-[15px] font-bold text-muted">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
          <path d="M6 12h12" className="stroke-muted" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        <span className="hidden web:inline">No incluido</span>
      </span>
    )
  }
  return (
    <span role="cell" className="text-center text-[13px] font-extrabold text-ink web:text-[15px]">
      {value}
    </span>
  )
}

const ROW = 'grid grid-cols-[1fr_84px_84px] items-center gap-2 px-4 web:grid-cols-[1fr_200px_200px]'

/**
 * La comparación de planes: una tabla real (`role="table"`, con encabezados de columna y de fila). «Incluido» y «No incluido»
 * llevan icono y texto; en el teléfono queda el icono con su etiqueta accesible (decisión 13).
 */
export function PlanTable({
  rows,
  price,
  label = 'Comparación de planes',
}: {
  rows: PlanRow[]
  /** La última fila, resaltada (el precio de cada plan). */
  price?: { label: string; free: string; full: string }
  label?: string
}) {
  return (
    <div role="table" aria-label={label} className="overflow-hidden rounded-[20px] border border-line bg-surface">
      <div role="row" className={cn(ROW, 'border-b border-hint-border bg-hint py-3.5 text-[13px] font-black text-ink web:text-[15px]')}>
        <span role="columnheader">Función</span>
        <span role="columnheader" className="text-center">
          Gratis
        </span>
        <span role="columnheader" className="text-center">
          Plan completo
        </span>
      </div>
      {rows.map((row, at) => (
        <div key={row.feature} role="row" className={cn(ROW, 'min-h-[52px] border-b border-skel py-2 last:border-b-0', at % 2 === 1 && 'bg-canvas')}>
          <span role="rowheader" className="text-[15px] font-bold text-ink web:text-base">
            {row.feature}
          </span>
          <Cell value={row.free} />
          <Cell value={row.full} />
        </div>
      ))}
      {price && (
        <div role="row" className={cn(ROW, 'min-h-[60px] bg-hint py-2')}>
          <span role="rowheader" className="text-base font-black text-ink">
            {price.label}
          </span>
          <span role="cell" className="text-center text-sm font-black text-ink web:text-lg">
            {price.free}
          </span>
          <span role="cell" className="text-center text-sm font-black text-ink web:text-lg">
            {price.full}
          </span>
        </div>
      )}
    </div>
  )
}
