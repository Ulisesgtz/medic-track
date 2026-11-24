import type { ReactNode } from 'react'
import { cn } from './cn.ts'

interface FrameProps {
  /** Lo que dice el lector de pantalla: todo lo dibujado también está en texto en la página (decisión 3). */
  label: string
  /** Clases que fijan `--s`, la escala del dibujo en cada diseño: `[--s:0.9] md:[--s:0.78] web:[--s:1]`. */
  scale: string
  children: ReactNode
}

/**
 * El marco de teléfono dibujado (296×496 con la pantalla de 280×480 dentro), escalado con `--s`. La caja exterior reserva el
 * tamaño ya escalado para que la página no se mueva al cargar (CLS).
 */
export function PhoneFrame({ label, scale, children }: FrameProps) {
  return (
    <div role="img" aria-label={label} className={cn('h-[calc(496px*var(--s))] w-[calc(296px*var(--s))] shrink-0', scale)}>
      <div className="h-[496px] w-[296px] origin-top-left [transform:scale(var(--s))]">
        <div className="h-[496px] w-[296px] rounded-[40px] bg-ink p-2 shadow-frame">
          <div className="h-[480px] w-[280px] overflow-hidden rounded-[32px]">{children}</div>
        </div>
      </div>
    </div>
  )
}

/** La ventana de computadora dibujada (640×400), escalada con `--s` como el teléfono. */
export function DesktopFrame({ label, scale, children }: FrameProps) {
  return (
    <div role="img" aria-label={label} className={cn('h-[calc(400px*var(--s))] w-[calc(640px*var(--s))] shrink-0', scale)}>
      <div className="h-[400px] w-[640px] origin-top-left [transform:scale(var(--s))]">{children}</div>
    </div>
  )
}

interface CropProps {
  label: string
  /** Alto y ancho máximo en cada diseño. */
  className: string
  children: ReactNode
}

/** El recorte de una pantalla (los tres pasos de «Cómo funciona»): la parte de arriba de la pantalla, al 80 %. */
export function ScreenCrop({ label, className, children }: CropProps) {
  return (
    <div role="img" aria-label={label} className={cn('relative w-full overflow-hidden rounded-[16px] border border-line bg-canvas', className)}>
      <div className="absolute top-0 left-1/2 -ml-[140px] origin-top scale-[.8]">{children}</div>
    </div>
  )
}
