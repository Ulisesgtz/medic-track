import { FAQ, appHost, faqText } from '../../content/faq.ts'
import { PLAN_CARDS, PLAN_FAQ_IDS, PLAN_TABLE_PRICE, PLAN_TABLE_ROWS } from '../../content/plans.ts'
import { APP_PATHS } from '../layout/nav.ts'
import { appUrl, useSite } from '../site.ts'
import { Button } from '../ui/Button.tsx'
import { Card } from '../ui/Card.tsx'
import { Accordion, GroupTitle, PageIntro, PageShell } from '../ui/Page.tsx'
import { PlanTable } from '../ui/PlanTable.tsx'

// «Pl» de «Sitio publico - Paginas»: los dos planes, la tabla «Qué incluye cada plan» y tres preguntas del cobro. Sin botón sólido:
// «Empezar gratis» y «Elegir Plan completo» llevan a la app con borde (el sólido es solo «Crear cuenta gratis»).

export function Plans() {
  const { settings } = useSite()
  const host = appHost(settings.appOrigin)
  const questions = PLAN_FAQ_IDS.map((id) => FAQ.find((item) => item.id === id)).filter((item) => item !== undefined)
  return (
    <PageShell>
      <PageIntro lead="Empieza gratis con 1 hijo. El Plan completo es una sola suscripción para toda la familia. Lo registrado nunca se borra si dejas de pagar." />
      <div className="grid grid-cols-1 gap-5 web:grid-cols-2">
        {PLAN_CARDS.map(({ plan, period, summary }, at) => (
          <Card key={plan.name} as="article" highlighted={at === 1} className="flex flex-col gap-3 p-6">
            <h2 className="text-2xl leading-tight font-extrabold tracking-[-0.01em] text-ink">{plan.name}</h2>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[44px] font-black tracking-[-0.03em] text-ink">{plan.price}</span>
              <span className="text-base text-body">{period}</span>
            </div>
            <p className="flex-1 text-base leading-[1.6] text-pretty text-body">{summary}</p>
            <Button href={at === 0 ? appUrl(settings, APP_PATHS.signup) : appUrl(settings, APP_PATHS.plans)} variant="outline" block>
              {at === 0 ? 'Empezar gratis' : 'Elegir Plan completo'}
            </Button>
          </Card>
        ))}
      </div>
      <section className="flex flex-col gap-4">
        <GroupTitle>Qué incluye cada plan</GroupTitle>
        <PlanTable rows={PLAN_TABLE_ROWS} price={PLAN_TABLE_PRICE} />
      </section>
      <section className="flex max-w-[860px] flex-col gap-4">
        <GroupTitle>Preguntas sobre el cobro</GroupTitle>
        <div className="flex flex-col gap-2.5">
          {questions.map((item, at) => (
            <Accordion key={item.id} question={item.question} open={at === 0}>
              {faqText(item.answer, host)}
            </Accordion>
          ))}
        </div>
        <Button href="/preguntas-frecuentes" variant="link" className="self-start">
          Ver todas las preguntas frecuentes →
        </Button>
      </section>
    </PageShell>
  )
}
