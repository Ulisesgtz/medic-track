import { cn } from './cn.ts'

interface LogoMarkProps {
  size?: number
  /** Sobre fondo tinta (el pie): la cápsula va en el cian claro. */
  onDark?: boolean
  className?: string
}

/**
 * La cápsula del logo (la del mock). Se dibuja con dos mitades en vez de un `clipPath`: un `id` repetido en la misma página (el
 * encabezado, el pie y los avisos dibujados) rompería el recorte.
 */
export function LogoMark({ size = 34, onDark = false, className }: LogoMarkProps) {
  const base = onDark ? 'fill-bright' : 'fill-ink'
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={cn('shrink-0', className)}>
      <rect width="64" height="64" rx="15" className={base} />
      <g transform="rotate(-45 32 32)">
        <path d="M21 32V16a11 11 0 0 1 22 0v16z" className="fill-surface" />
        <path d="M21 32h22v16a11 11 0 0 1-22 0z" className="fill-confirmed" />
        <rect x="21" y="30.6" width="22" height="2.8" className={base} />
      </g>
    </svg>
  )
}

interface LogoProps {
  href: string
  onDark?: boolean
  /** Tamaños del mock: 34 y 19 px en teléfono y tableta, 38 y 21 en web. */
  large?: boolean
  className?: string
}

/** Logo con su nombre, enlazado a una página. */
export function Logo({ href, onDark = false, large = false, className }: LogoProps) {
  return (
    <a href={href} className={cn('inline-flex min-h-11 items-center gap-2.5 no-underline', className)}>
      <LogoMark size={34} onDark={onDark} className={large ? 'web:size-[38px]' : undefined} />
      <span
        className={cn(
          'text-[19px] leading-none font-black tracking-[-0.03em]',
          large && 'web:text-[21px]',
          onDark ? 'text-surface' : 'text-ink',
        )}
      >
        Pedi
        <span className={onDark ? 'text-bright-soft' : 'text-action'}>Track</span>
      </span>
    </a>
  )
}
