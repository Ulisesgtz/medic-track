import { appHost, faqByTopic, faqText, topicId } from '../../content/faq.ts'
import { useSite } from '../site.ts'
import { Accordion, PageIntro, PageShell, Pill } from '../ui/Page.tsx'

// «Fq» de «Sitio publico - Paginas»: 15 preguntas en 5 temas. En el teléfono los temas son píldoras que se desplazan; en la web una
// tarjeta fija a la izquierda («Temas»). Es la única página con el JSON-LD FAQPage (seo.tsx).

export function Faq() {
  const { settings } = useSite()
  const host = appHost(settings.appOrigin)
  const groups = faqByTopic()
  return (
    <PageShell>
      <PageIntro lead="Respuestas cortas sobre qué es, cuánto cuesta, cómo se instala y cómo se cuidan tus datos." />
      <div className="grid grid-cols-1 items-start gap-5 web:grid-cols-[240px_1fr] web:gap-14">
        <nav
          aria-label="Temas"
          className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 web:sticky web:top-4 web:mx-0 web:flex-col web:gap-0.5 web:overflow-visible web:rounded-[20px] web:border web:border-line web:bg-surface web:p-4"
        >
          <span className="hidden pb-1.5 text-[13px] font-extrabold tracking-[0.1em] text-muted uppercase web:block">Temas</span>
          {groups.map((group) => (
            <Pill
              key={group.topic}
              href={`#${topicId(group.topic)}`}
              className="web:min-h-11 web:rounded-none web:border-0 web:bg-transparent web:px-0 web:whitespace-normal"
            >
              {group.topic}
            </Pill>
          ))}
        </nav>
        <div className="flex flex-col gap-8">
          {groups.map((group, groupAt) => (
            <section key={group.topic} id={topicId(group.topic)} aria-labelledby={`${topicId(group.topic)}-titulo`} className="flex flex-col gap-3">
              <h2 id={`${topicId(group.topic)}-titulo`} className="text-2xl font-black tracking-[-0.03em] text-ink web:text-[30px]">
                {group.topic}
              </h2>
              <div className="flex flex-col gap-2.5">
                {group.items.map((item, at) => (
                  <Accordion key={item.id} id={item.id} question={item.question} open={groupAt === 0 && at === 0}>
                    {faqText(item.answer, host)}
                  </Accordion>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
