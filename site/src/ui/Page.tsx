import type { ReactNode } from 'react'
import { Breadcrumbs } from '../layout/Breadcrumbs.tsx'
import { usePage } from '../site.ts'
import { cn } from './cn.ts'

// Las piezas que comparten las páginas interiores de «Sitio publico - Paginas»: la caja de la página, su encabezado (migas, H1 y una
// línea de apoyo), las píldoras de las anclas, la etiqueta de plan y los acordeones. Teléfono por debajo de 1200 px y web desde
// 1200 (`web:`): las interiores no tienen tableta (desviaciones.md, decisión 4).

/** La caja de toda página interior: fondo `canvas`, 1200 px como máximo y el espacio entre bloques del mock. */
export function PageShell({ children, className, narrow = false }: { children: ReactNode; className?: string; narrow?: boolean }) {
  return (
    <div className={cn('bg-canvas px-5 pt-7 pb-14 web:px-20 web:pt-14 web:pb-24', className)}>
      <div className={cn('mx-auto flex flex-col gap-7 web:gap-11', narrow ? 'max-w-[760px]' : 'max-w-[1200px]')}>{children}</div>
    </div>
  )
}

/** Migas, el H1 de la tabla de SEO y su línea de apoyo (el encabezado de Funciones, Planes, Preguntas, Blog e Instalar). */
export function PageIntro({ lead }: { lead: ReactNode }) {
  const page = usePage()
  return (
    <div className="flex max-w-[820px] flex-col gap-3.5">
      <Breadcrumbs crumbs={page.breadcrumbs} />
      <h1 className="text-[32px] leading-[1.08] font-black tracking-[-0.035em] text-balance text-ink web:text-[56px]">{page.h1}</h1>
      <p className="text-lg leading-[1.6] text-pretty text-body web:text-[21px]">{lead}</p>
    </div>
  )
}

/** El título de un grupo de la página (H2 de 26 px en el teléfono y 34 en la web). */
export function GroupTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-[26px] font-black tracking-[-0.03em] text-ink web:text-[34px]">
      {children}
    </h2>
  )
}

const PILL =
  'inline-flex min-h-11 items-center rounded-full border-[1.5px] border-hint-border bg-surface px-4 text-[15px] font-bold whitespace-nowrap text-action no-underline'

/** Una píldora que lleva a un ancla o a otra página (los grupos de Funciones, los temas, los destinos de la 404). */
export function Pill({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} className={cn(PILL, className)}>
      {children}
    </a>
  )
}

/** La etiqueta de texto de una tarjeta («Plan gratis», «Plan completo», «Guía»): nunca solo un color. */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-7 items-center self-start rounded-full border border-hint-border bg-hint px-2.5 text-[13px] font-extrabold text-ink">
      {children}
    </span>
  )
}

/** Un acordeón nativo (`<details>`): el «+» y el «–» son del resumen (styles.css). */
export function Accordion({ question, open = false, id, children }: { question: string; open?: boolean; id?: string; children: ReactNode }) {
  return (
    <details id={id} open={open} className="rounded-2xl border border-line bg-surface">
      <summary className="flex min-h-[60px] cursor-pointer items-center justify-between gap-4 px-5 py-3.5 text-[17px] font-extrabold text-ink web:text-[19px]">
        <span>{question}</span>
      </summary>
      <div className="px-5 pb-[18px] text-base leading-[1.6] text-pretty text-body web:text-[17px]">{children}</div>
    </details>
  )
}

/** Una tarjeta de contenido de las páginas interiores (borde fino, 20 px de esquina). */
export function Panel({ children, className, as: Tag2 = 'div', id }: { children: ReactNode; className?: string; as?: 'div' | 'article' | 'li'; id?: string }) {
  return (
    <Tag2 id={id} className={cn('rounded-[20px] border border-line bg-surface', className)}>
      {children}
    </Tag2>
  )
}
