import type { ElementType, ReactNode } from 'react'
import { cn } from './cn.ts'

interface CardProps {
  as?: ElementType
  id?: string
  /** El recuadro marcado (el Plan completo): borde de 2 px en el color de acción. */
  highlighted?: boolean
  className?: string
  children: ReactNode
}

/** La tarjeta del sitio: fondo blanco, borde fino y esquinas de 20 px. */
export function Card({ as: Tag = 'div', id, highlighted = false, className, children }: CardProps) {
  return (
    <Tag
      id={id}
      className={cn('rounded-[20px] bg-surface', highlighted ? 'border-2 border-action' : 'border border-line', className)}
    >
      {children}
    </Tag>
  )
}
