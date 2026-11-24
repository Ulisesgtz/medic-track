import type { ReactNode } from 'react'
import { cn } from './cn.ts'

export type ButtonVariant = 'solid' | 'outline' | 'link'

interface ButtonProps {
  href: string
  variant?: ButtonVariant
  /** Ocupa todo el ancho (el botón principal del teléfono). */
  block?: boolean
  className?: string
  children: ReactNode
}

const VARIANTS: Record<ButtonVariant, string> = {
  // El único botón sólido de cada vista (decisión 2): «Crear cuenta gratis».
  solid: 'min-h-[52px] rounded-[16px] bg-confirmed px-7 text-[17px] font-extrabold text-surface justify-center',
  // Los demás botones: con borde (los de planes y «Iniciar sesión»).
  outline:
    'min-h-12 rounded-[14px] border-[1.5px] border-action bg-surface px-5 text-base font-extrabold text-action justify-center',
  // Enlaces con flecha («Ver el detalle →»).
  link: 'min-h-11 text-base font-extrabold text-action',
}

/** Un enlace con aspecto de botón: siempre un `<a>` real (navega), de 44 px o más de alto. */
export function Button({ href, variant = 'solid', block = false, className, children }: ButtonProps) {
  return (
    <a href={href} className={cn('inline-flex items-center no-underline', VARIANTS[variant], block && 'w-full', className)}>
      {children}
    </a>
  )
}
