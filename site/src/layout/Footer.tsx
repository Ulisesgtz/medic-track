import type { ReactNode } from 'react'
import { Logo } from '../ui/Logo.tsx'
import { socialLinks } from '../seo.tsx'
import { useSite } from '../site.ts'

/** El aviso fijo del pie de todas las páginas (decisión 6): la app registra y recuerda, nunca interpreta. */
export const FOOTER_NOTICE = 'PediTrack es una herramienta de registro y recordatorio; no sustituye la consulta ni el criterio de tu médico.'

const LINK = 'flex min-h-11 items-center text-base font-semibold text-surface underline decoration-action underline-offset-[3px]'

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="pb-1.5 text-[13px] font-extrabold tracking-[0.1em] text-bright-soft uppercase">{title}</span>
      {children}
    </div>
  )
}

/**
 * El pie. Las redes y el correo solo se dibujan si están configurados en `content/site.json` (desviación 2: el mock las dibuja
 * sin dirección), y «Blog y guías» solo cuando hay artículos listos. En teléfono y tableta el logo va debajo de las columnas; en
 * la web es la primera.
 */
export function Footer() {
  const { settings, hasBlog } = useSite()
  const social = socialLinks(settings)
  const contactEmail = settings.contactEmail.trim()
  const hasContact = contactEmail !== '' || social.length > 0
  return (
    <footer className="bg-ink px-5 pt-12 pb-8 md:px-8 md:pt-14 web:px-20 web:pt-[72px]">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-9">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-5 web:grid-cols-[1.4fr_repeat(4,1fr)] web:gap-8">
          <div className="order-last col-span-full mt-7 flex flex-col gap-3 md:col-span-full md:mt-4 web:order-first web:col-span-1 web:mt-0">
            <Logo href="/" onDark large />
            <p className="hidden text-[15px] leading-[1.55] text-hint-edge web:block">Bitácora médica de la familia, hecha en México.</p>
          </div>
          <Column title="Producto">
            <a className={LINK} href="/funciones">
              Funciones
            </a>
            <a className={LINK} href="/planes">
              Planes
            </a>
            <a className={LINK} href="/instalar">
              Instalar la app
            </a>
            <a className={LINK} href="/preguntas-frecuentes">
              Preguntas frecuentes
            </a>
          </Column>
          <Column title="Recursos">
            {hasBlog && (
              <a className={LINK} href="/blog">
                Blog y guías
              </a>
            )}
            <a className={LINK} href="/privacidad">
              Privacidad y seguridad
            </a>
          </Column>
          <Column title="Legal">
            <a className={LINK} href="/aviso-de-privacidad">
              Aviso de privacidad
            </a>
            <a className={LINK} href="/terminos">
              Términos y condiciones
            </a>
          </Column>
          {hasContact && (
            <Column title="Contacto">
              {contactEmail !== '' && (
                <a className={LINK} href={`mailto:${contactEmail}`}>
                  Escríbenos
                </a>
              )}
              {settings.social.facebook?.trim() && (
                <a className={LINK} href={settings.social.facebook.trim()} rel="noopener">
                  Facebook
                </a>
              )}
              {settings.social.instagram?.trim() && (
                <a className={LINK} href={settings.social.instagram.trim()} rel="noopener">
                  Instagram
                </a>
              )}
            </Column>
          )}
        </div>
        <div className="flex flex-col gap-2 border-t border-ink-soft pt-6">
          <p className="text-[15px] leading-[1.55] font-semibold text-surface">{FOOTER_NOTICE}</p>
          <p className="text-sm text-hint-border">© 2026 PediTrack · pedi-track.com · es-MX</p>
        </div>
      </div>
    </footer>
  )
}
