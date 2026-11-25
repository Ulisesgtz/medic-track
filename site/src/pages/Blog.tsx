import type { ComponentType } from 'react'
import type { BlogArticle } from '../content/blog.ts'
import { formatLongDate } from '../content/legal.ts'
import { Breadcrumbs } from '../layout/Breadcrumbs.tsx'
import { usePage } from '../site.ts'
import { Button } from '../ui/Button.tsx'
import { PageIntro, PageShell, Panel, Tag } from '../ui/Page.tsx'
import { cn } from '../ui/cn.ts'
import { VaccineCardScreen, PrescriptionScreen, DosesScreen } from '../ui/screens/screens.tsx'

// «Bl» (listado) y «Ar» (artículo) de «Sitio publico - Paginas». Las guías son de organización: nunca consejos médicos (Principio I).
// Solo existen con artículos `ready: true` (build.ts): sin ninguno no hay /blog ni enlaces a él.

/** La pantalla de la app que ilustra cada guía (las tres primeras del diseño); las demás llevan solo el fondo celeste. */
const COVERS: Record<string, ComponentType> = {
  'organizar-recetas-hijos': PrescriptionScreen,
  'no-olvidar-tomas-antibiotico': DosesScreen,
  'que-llevar-consulta-pediatra': VaccineCardScreen,
}

/** La portada de una guía: la captura dibujada al 80 %, recortada. `size` fija su alto en cada diseño. */
export function Cover({ article, className }: { article: Pick<BlogArticle, 'slug' | 'title'>; className: string }) {
  const Screen = COVERS[article.slug]
  return (
    <div role="img" aria-label={`Ilustración de la guía: ${article.title}`} className={cn('relative flex flex-none justify-center overflow-hidden bg-hint', className)}>
      {Screen && (
        <div className="mt-6 origin-top scale-[.8]">
          <Screen />
        </div>
      )}
    </div>
  )
}

export const minutesLabel = (article: Pick<BlogArticle, 'readMinutes'>) => `${article.readMinutes} min de lectura`

function GuideCard({ article, featured }: { article: BlogArticle; featured: boolean }) {
  return (
    <Panel as="article" className={cn('flex flex-col overflow-hidden', featured && 'web:flex-row')}>
      <Cover article={article} className={cn('h-[190px]', featured ? 'web:h-[320px] web:w-[520px]' : 'web:h-[220px]')} />
      <div className="flex flex-col justify-center gap-2.5 p-5 web:p-7">
        <Tag>Guía</Tag>
        <h2 className={cn('leading-[1.2] font-black tracking-[-0.02em] text-ink', featured ? 'text-2xl web:text-[32px]' : 'text-[22px]')}>
          <a href={`/blog/${article.slug}`} className="text-ink no-underline">
            {article.title.replace(/ \| PediTrack$/, '')}
          </a>
        </h2>
        <p className="text-base leading-[1.6] text-pretty text-body">{article.description}</p>
        <span className="text-sm font-semibold text-muted">{minutesLabel(article)}</span>
        <Button href={`/blog/${article.slug}`} variant="link">
          Leer la guía →
        </Button>
      </div>
    </Panel>
  )
}

export function Blog({ articles }: { articles: BlogArticle[] }) {
  const [first, ...rest] = articles
  return (
    <PageShell>
      <PageIntro lead="Guías de organización para mamás y papás. No son consejos médicos: para cualquier duda de salud, consulta a tu médico." />
      {first && <GuideCard article={first} featured />}
      {rest.length > 0 && (
        <div className="grid grid-cols-1 gap-5 web:grid-cols-2">
          {rest.map((article) => (
            <GuideCard key={article.slug} article={article} featured={false} />
          ))}
        </div>
      )}
    </PageShell>
  )
}

export const ARTICLE_NOTICE =
  'Esta guía habla de organización, no de salud. PediTrack es una herramienta de registro y recordatorio; no sustituye la consulta ni el criterio de tu médico.'

export function ArticlePage({ article, others }: { article: BlogArticle; others: BlogArticle[] }) {
  const page = usePage()
  return (
    <div className="bg-canvas px-5 pt-4 pb-14 web:px-20 web:pt-8 web:pb-24">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-7 web:gap-11">
        <Breadcrumbs crumbs={page.breadcrumbs} />
        <div className="grid grid-cols-1 items-start web:grid-cols-[1fr_300px] web:gap-16">
          <article className="flex max-w-[720px] flex-col gap-6 web:gap-8">
            <div className="flex flex-col gap-3">
              <Tag>Guía</Tag>
              <h1 className="text-[30px] leading-[1.08] font-black tracking-[-0.035em] text-balance text-ink web:text-[46px]">{page.h1}</h1>
              <span className="text-[15px] font-semibold text-muted">
                Por el equipo de PediTrack · <time dateTime={article.datePublished}>{formatLongDate(article.datePublished)}</time> · {minutesLabel(article)}
              </span>
            </div>
            {article.introHtml && (
              <div className="flex flex-col gap-3" dangerouslySetInnerHTML={{ __html: article.introHtml }} />
            )}
            <div role="note" className="rounded-[14px] border border-hint-border bg-hint px-[18px] py-4 text-[15px] leading-[1.5] font-semibold text-ink">
              {ARTICLE_NOTICE}
            </div>
            {article.sections.map((section) => (
              <section key={section.id} id={section.id} className="flex scroll-mt-4 flex-col gap-2.5">
                <h2 className="text-2xl leading-[1.2] font-black tracking-[-0.02em] text-ink web:text-[30px]">{section.title}</h2>
                <div className="flex flex-col gap-2.5" dangerouslySetInnerHTML={{ __html: section.html }} />
              </section>
            ))}
            <Panel className="flex flex-col gap-3 bg-canvas p-6">
              <h3 className="text-[22px] leading-tight font-extrabold tracking-[-0.01em] text-ink">Prueba PediTrack con tu primer hijo</h3>
              <p className="text-base leading-[1.6] text-pretty text-body">El plan gratis incluye consultas con receta, recordatorios y cartilla para 1 hijo.</p>
              <Button href="/planes" variant="outline" className="self-start">
                Ver planes
              </Button>
            </Panel>
            <div className="flex flex-col gap-0.5">
              {others.length > 0 && (
                <>
                  <span className="text-[13px] font-extrabold tracking-[0.1em] text-muted uppercase">Sigue leyendo</span>
                  {others.map((other) => (
                    <a key={other.slug} href={`/blog/${other.slug}`} className="flex min-h-12 items-center text-[17px] font-extrabold text-action no-underline">
                      {other.title.replace(/ \| PediTrack$/, '')} →
                    </a>
                  ))}
                </>
              )}
              <Button href="/funciones" variant="link">
                Funciones de PediTrack →
              </Button>
            </div>
          </article>
          <nav
            aria-label="Contenido"
            className="hidden self-start web:sticky web:top-4 web:flex web:flex-col web:gap-0.5 web:rounded-[20px] web:border web:border-line web:bg-surface web:p-4"
          >
            <span className="pb-1.5 text-[13px] font-extrabold tracking-[0.1em] text-muted uppercase">En esta guía</span>
            {article.sections.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="flex min-h-11 items-center text-[15px] font-bold text-action no-underline">
                {section.title}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </div>
  )
}
