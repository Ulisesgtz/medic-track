import { FEATURE_GROUPS } from '../../content/features.ts'
import { Button } from '../ui/Button.tsx'
import { GroupTitle, PageIntro, PageShell, Panel, Pill, Tag } from '../ui/Page.tsx'

// «Fu» de «Sitio publico - Paginas»: cuatro grupos (H2), cada función una tarjeta (H3) con su ancla y la etiqueta de plan en texto.
// En el teléfono las píldoras de los grupos se desplazan en horizontal; en la web se acomodan en renglones.

export function Features() {
  return (
    <PageShell>
      <PageIntro lead="Todo lo que puedes registrar y recibir en PediTrack, agrupado por tema. Cada función tiene su ancla para enlazarla." />
      <nav
        aria-label="Ir a una función"
        className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 web:mx-0 web:flex-wrap web:overflow-visible web:px-0 web:pb-0"
      >
        {FEATURE_GROUPS.map((group) => (
          <Pill key={group.id} href={`#${group.id}`}>
            {group.title}
          </Pill>
        ))}
      </nav>
      {FEATURE_GROUPS.map((group) => (
        <section key={group.id} id={group.id} aria-labelledby={`${group.id}-titulo`} className="flex flex-col gap-5">
          <GroupTitle id={`${group.id}-titulo`}>{group.title}</GroupTitle>
          <div className="grid grid-cols-1 gap-4 web:grid-cols-3">
            {group.features.map((feature) => (
              <Panel key={feature.id} as="article" id={feature.id} className="flex flex-col gap-2.5 p-5">
                <Tag>{feature.plan}</Tag>
                <h3 className="text-xl leading-tight font-extrabold tracking-[-0.01em] text-ink">{feature.title}</h3>
                <p className="text-base leading-[1.6] text-pretty text-body">{feature.text}</p>
              </Panel>
            ))}
          </div>
        </section>
      ))}
      <Panel className="flex flex-col items-stretch justify-between gap-5 p-6 web:flex-row web:items-center">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[22px] leading-tight font-extrabold tracking-[-0.01em] text-ink">¿Qué incluye cada plan?</h3>
          <p className="text-base leading-[1.6] text-pretty text-body">Compara los dos planes en una tabla.</p>
        </div>
        <Button href="/planes" variant="outline">
          Ver planes y precios
        </Button>
      </Panel>
    </PageShell>
  )
}
