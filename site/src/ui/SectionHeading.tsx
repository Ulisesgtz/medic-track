import type { ReactNode } from 'react'
import { cn } from './cn.ts'

interface SectionHeadingProps {
  /** El rótulo en mayúsculas sobre el título (no es un encabezado). */
  eyebrow: string
  title: string
  /** Texto bajo el título. */
  lead?: ReactNode
  /** Sobre fondo tinta: texto claro. */
  onDark?: boolean
  /** `h1` solo en el encabezado de página; las secciones son `h2`. */
  as?: 'h1' | 'h2'
  className?: string
}

/** El encabezado de cada sección: rótulo, H2 y una línea de apoyo (tamaños de teléfono, tableta y web del mock). */
export function SectionHeading({ eyebrow, title, lead, onDark = false, as: Tag = 'h2', className }: SectionHeadingProps) {
  return (
    <div className={cn('flex max-w-[760px] flex-col gap-3', className)}>
      <span className={cn('text-[13px] font-extrabold tracking-[0.1em] uppercase', onDark ? 'text-bright-soft' : 'text-action')}>{eyebrow}</span>
      <Tag
        className={cn(
          'text-[26px] leading-[1.15] font-black tracking-[-0.03em] text-balance md:text-[32px] web:text-[40px]',
          onDark ? 'text-surface' : 'text-ink',
        )}
      >
        {title}
      </Tag>
      {lead && (
        <p className={cn('text-[17px] leading-[1.6] text-pretty md:text-[18px] web:text-[19px]', onDark ? 'text-hint-edge' : 'text-body')}>{lead}</p>
      )}
    </div>
  )
}
