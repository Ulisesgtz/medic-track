import { readLegalDoc, readLegalStatus, updatedLine, type LegalDoc } from '../content/legal.ts'
import { Breadcrumbs } from '../layout/Breadcrumbs.tsx'
import { usePage, useSite } from '../site.ts'

// La plantilla «Lg» de «Sitio publico - Legal» (Privacidad y seguridad, Aviso de privacidad y Términos): migas, H1, la fecha de la
// última actualización y las secciones. En la web, el índice «Contenido» a la izquierda con un enlace a cada sección. El texto sale de
// legal/*.md (src/content/legal.ts); la nota de borrador solo se muestra fuera de producción.

/** El texto de un documento ya convertido a HTML por `marked` a partir de un archivo del repositorio (no de un visitante). */
function Html({ html, className }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

const BODY = 'flex flex-col gap-2.5'

export function Legal({ doc }: { doc: LegalDoc }) {
  const page = usePage()
  const { production } = useSite()
  const content = readLegalDoc(doc)
  const status = readLegalStatus()
  return (
    <div className="bg-canvas px-5 pt-4 pb-14 web:px-20 web:pt-8 web:pb-24">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-7 web:gap-11">
        <Breadcrumbs crumbs={page.breadcrumbs} />
        <div className="grid grid-cols-1 items-start web:grid-cols-[300px_1fr] web:gap-14">
          <nav
            aria-label="Contenido"
            className="hidden self-start web:sticky web:top-4 web:flex web:flex-col web:gap-0.5 web:rounded-[20px] web:border web:border-line web:bg-surface web:p-4"
          >
            <span className="pb-1.5 text-[13px] font-extrabold tracking-[0.1em] text-muted uppercase">Contenido</span>
            {content.sections.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="flex min-h-11 items-center text-[15px] font-bold text-action no-underline">
                {section.title}
              </a>
            ))}
          </nav>
          <article className="flex max-w-[760px] flex-col gap-6">
            <div className="flex flex-col gap-2.5">
              <h1 className="text-[30px] leading-[1.08] font-black tracking-[-0.035em] text-balance text-ink web:text-[44px]">{page.h1}</h1>
              <span className="text-[15px] font-semibold text-muted">{updatedLine(status)}</span>
            </div>
            {!production && (
              <div role="note" className="rounded-[14px] border border-hint-border bg-hint px-4 py-3.5 text-[15px] leading-[1.5] font-semibold text-ink">
                Borrador para revisión legal: un abogado debe revisarlo antes de publicarse. Lo que va entre corchetes lo completa PediTrack.
              </div>
            )}
            {content.introHtml && <Html html={content.introHtml} className={BODY} />}
            {content.sections.map((section) => (
              <section key={section.id} id={section.id} className="flex scroll-mt-4 flex-col gap-2.5">
                <h2 className="text-[22px] font-black tracking-[-0.02em] text-ink web:text-[26px]">{section.title}</h2>
                <Html html={section.html} className={BODY} />
              </section>
            ))}
          </article>
        </div>
      </div>
    </div>
  )
}

export const PrivacyAndSecurity = () => <Legal doc="privacidad-y-seguridad" />
export const PrivacyNotice = () => <Legal doc="aviso-de-privacidad" />
export const Terms = () => <Legal doc="terminos-y-condiciones" />
