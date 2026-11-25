import { useSite, usePage } from '../site.ts'
import { Button } from '../ui/Button.tsx'
import { Pill } from '../ui/Page.tsx'

// «E4» de «Sitio publico - Paginas»: «No encontramos esta página» con sus destinos. Se escribe como `dist/404.html`, con noindex y sin
// canonical (seo.tsx). «Blog y guías» solo aparece si hay artículos listos.

export function NotFound() {
  const { hasBlog } = useSite()
  const page = usePage()
  const destinations = [
    { label: 'Inicio', href: '/' },
    { label: 'Funciones', href: '/funciones' },
    { label: 'Planes', href: '/planes' },
    { label: 'Preguntas frecuentes', href: '/preguntas-frecuentes' },
    ...(hasBlog ? [{ label: 'Blog y guías', href: '/blog' }] : []),
  ]
  return (
    <div className="bg-canvas px-5 pt-14 pb-16 web:px-20 web:pt-[120px] web:pb-[140px]">
      <div className="mx-auto flex max-w-[640px] flex-col items-center gap-[18px] text-center">
        <span aria-hidden="true" data-decorative className="text-[88px] leading-none font-black tracking-[-0.05em] text-hint-border web:text-[150px]">
          404
        </span>
        <h1 className="text-[28px] leading-[1.08] font-black tracking-[-0.035em] text-balance text-ink web:text-[44px]">{page.h1}</h1>
        <p className="text-lg leading-[1.6] text-pretty text-body">
          Puede que el enlace haya cambiado o que la dirección tenga un error. Estas páginas te pueden servir:
        </p>
        <nav aria-label="Páginas que te pueden servir" className="flex flex-wrap justify-center gap-2.5">
          {destinations.map((destination) => (
            <Pill key={destination.href} href={destination.href}>
              {destination.label}
            </Pill>
          ))}
        </nav>
        <Button href="/" variant="outline">
          Ir al inicio
        </Button>
      </div>
    </div>
  )
}
