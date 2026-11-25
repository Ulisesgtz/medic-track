import type { ReactNode } from 'react'
import { appHost, faqText, homeFaq } from '../../content/faq.ts'
import { FREE_PLAN, FULL_PLAN, type Plan } from '../../content/plans.ts'
import { APP_PATHS } from '../layout/nav.ts'
import { appUrl, useSite } from '../site.ts'
import { Button } from '../ui/Button.tsx'
import { Card } from '../ui/Card.tsx'
import { DesktopFrame, PhoneFrame, ScreenCrop } from '../ui/PhoneFrame.tsx'
import { SectionHeading } from '../ui/SectionHeading.tsx'
import { cn } from '../ui/cn.ts'
import {
  ReminderScreen,
  CabinetScreen,
  VaccineCardScreen,
  DesktopScreen,
  FamilyScreen,
  PrescriptionScreen,
  DosesScreen,
} from '../ui/screens/screens.tsx'

// El inicio, tal cual «Sitio publico - Inicio» (teléfono 390, tableta 768, web 1440). Un solo HTML con tres diseños: lo que cambia
// de uno a otro son clases con un corte por diseño (`md:` desde 768 px y `web:` desde 1200 px). Los textos son los del mock.

const SECTION = 'px-5 py-14 md:px-8 md:py-[72px] web:px-20 web:py-24'
const INNER = 'mx-auto flex max-w-[1200px] flex-col gap-7 md:gap-9 web:gap-12'

function Check({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" className="stroke-confirmed" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Shield() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path d="M12 3l7 3v5.5c0 4.2-2.8 7.4-7 9.5-4.2-2.1-7-5.3-7-9.5V6z" fill="none" className="stroke-bright-soft" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-[13px] font-extrabold tracking-[0.1em] text-action uppercase">{children}</span>
}

function Hero() {
  const { settings } = useSite()
  return (
    <section className="bg-linear-to-b from-canvas to-hint px-5 pt-9 pb-11 md:px-8 md:py-14 web:px-20 web:py-20">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col gap-8 md:grid md:grid-cols-[1fr_240px] md:items-center md:gap-8 web:grid-cols-[1.15fr_0.85fr] web:gap-16">
          <div className="flex flex-col gap-[18px] md:gap-5 web:gap-6">
            <Eyebrow>Bitácora médica de la familia</Eyebrow>
            <h1 className="text-[32px] leading-[1.08] font-black tracking-[-0.035em] text-balance text-ink md:text-[44px] web:text-[56px]">
              App para registrar los medicamentos y el historial médico de tus hijos
            </h1>
            <p className="text-lg leading-[1.6] text-pretty text-body md:text-[19px] web:text-[21px]">
              PediTrack guarda las consultas del pediatra, la foto de la receta, el horario de tomas, la cartilla de vacunación y el
              crecimiento de cada hijo, y te recuerda cuándo toca cada toma. Para mamás y papás en México.
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-2">
              <Button href={appUrl(settings, APP_PATHS.signup)} block className="md:w-auto">
                Crear cuenta gratis
              </Button>
              <Button href="#como-funciona" variant="link">
                Ver cómo funciona →
              </Button>
            </div>
            <span className="text-[15px] text-body">Plan gratis para 1 hijo. Se instala en tu teléfono, sin tiendas.</span>
          </div>
          <div className="flex justify-center md:justify-end web:justify-center">
            <PhoneFrame
              label="Captura de PediTrack: nueva consulta con foto de la receta y medicamentos propuestos para revisar"
              scale="[--s:0.9] md:[--s:0.78] web:[--s:1]"
            >
              <PrescriptionScreen />
            </PhoneFrame>
          </div>
        </div>
      </div>
    </section>
  )
}

const TRUST = [
  ['Sin anuncios', 'Nada de publicidad en tu bitácora'],
  ['Tus datos son tuyos', 'No se venden; los descargas cuando quieras'],
  ['En español de México', 'Pensada para mamás y papás de aquí'],
]

function Trust() {
  return (
    <section aria-label="Confianza" className="border-y border-hint-border bg-hint px-5 py-5 md:px-8 md:py-[22px] web:px-20 web:py-[26px]">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-1 md:grid-cols-3 md:gap-4 web:gap-6">
        {TRUST.map(([title, sub]) => (
          <div key={title} className="flex min-h-14 items-center gap-3">
            <Check size={26} />
            <div className="flex flex-col">
              <span className="text-[17px] font-extrabold text-ink">{title}</span>
              <span className="text-sm text-body">{sub}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

const CROP = 'h-[190px] max-w-[420px] md:h-[170px] md:max-w-[260px] web:h-[210px] web:max-w-[420px]'

function Step({ n, title, text, children }: { n: number; title: string; text: string; children: ReactNode }) {
  return (
    <Card
      as="article"
      className="flex flex-col gap-3.5 p-5 md:grid md:grid-cols-[1fr_260px] md:items-center md:gap-6 md:p-[22px] web:flex web:flex-col web:items-stretch web:gap-3.5 web:p-6"
    >
      <div className="flex flex-col gap-3.5 md:gap-2.5 web:gap-3.5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-lg font-black text-surface">{n}</span>
          <h3 className="text-xl leading-tight font-extrabold tracking-[-0.01em] text-ink">{title}</h3>
        </div>
        <p className="text-base leading-[1.6] text-pretty text-body">{text}</p>
      </div>
      {children}
    </Card>
  )
}

function HowItWorks() {
  return (
    <section id="como-funciona" className={cn('bg-surface', SECTION)}>
      <div className={INNER}>
        <SectionHeading
          eyebrow="Cómo funciona"
          title="Cómo funciona PediTrack: de la receta al recordatorio"
          lead="Tres pasos para tener las tomas de tus hijos organizadas."
        />
        <div className="grid grid-cols-1 gap-4 web:grid-cols-3 web:gap-6">
          <Step
            n={1}
            title="Foto de la receta"
            text="Tomas la foto en la consulta. El texto se lee en tu teléfono y PediTrack propone los medicamentos para que los revises."
          >
            <ScreenCrop label="Detalle de la pantalla receta" className={CROP}>
              <PrescriptionScreen />
            </ScreenCrop>
          </Step>
          <Step
            n={2}
            title="Horario de tomas"
            text="Con la frecuencia, la duración y la primera toma, la app arma el horario y puedes marcar cada toma con un toque."
          >
            <ScreenCrop label="Detalle de la pantalla tomas" className={CROP}>
              <DosesScreen />
            </ScreenCrop>
          </Step>
          <Step
            n={3}
            title="Recordatorios"
            text="Recibes un aviso en el teléfono y en la computadora a la hora de cada toma, aunque la app esté cerrada."
          >
            <ScreenCrop label="Detalle de la pantalla aviso" className={CROP}>
              <ReminderScreen />
            </ScreenCrop>
          </Step>
        </div>
      </div>
    </section>
  )
}

interface FeatureGroup {
  id: string
  eyebrow: string
  title: string
  items: string[]
  linkLabel: string
  href: string
  visual: ReactNode
}

const FEATURES: FeatureGroup[] = [
  {
    id: 'consultas-y-medicamentos',
    eyebrow: 'Consultas y medicamentos',
    title: 'Registra cada consulta con su receta',
    items: [
      'Doctor, fecha, síntomas, notas y la foto de la receta',
      'Horario de tomas, calendario del tratamiento y avance',
      'Recordatorios a la hora de cada toma',
      'Próxima cita con doctor, lugar y «Abrir en Maps»',
    ],
    linkLabel: 'Ver el detalle de consultas y medicamentos →',
    href: '/funciones#consultas',
    visual: (
      <PhoneFrame label="Captura de PediTrack: horario de tomas de hoy con una toma marcada por Ana" scale="[--s:0.8] md:[--s:0.8] web:[--s:0.95]">
        <DosesScreen />
      </PhoneFrame>
    ),
  },
  {
    id: 'cada-hijo',
    eyebrow: 'Cada hijo',
    title: 'Todo lo de cada hijo, en su propia ficha',
    items: [
      'Cartilla de vacunación, a mano o leyendo la foto',
      'Medidas de peso y talla con historial y gráfica',
      'Ficha: alergias, tipo de sangre, padecimientos, pediatra',
      'Suplementos, actividades e historial con búsqueda y PDF',
    ],
    linkLabel: 'Ver el detalle de cada hijo →',
    href: '/funciones#vacunacion',
    visual: (
      <PhoneFrame label="Captura de PediTrack: cartilla de vacunación con vacunas anotadas" scale="[--s:0.8] md:[--s:0.8] web:[--s:0.95]">
        <VaccineCardScreen />
      </PhoneFrame>
    ),
  },
  {
    id: 'toda-la-familia',
    eyebrow: 'Toda la familia',
    title: 'Entre todos, sin mensajes sueltos',
    items: [
      'Hasta 4 personas como Tutores o Cuidadores',
      'Botiquín de la casa con caducidad y foto de la caja',
      'El teléfono del hijo, para que vea y marque sus tomas',
      'Tus propias consultas, privadas o compartidas',
    ],
    linkLabel: 'Ver el detalle de toda la familia →',
    href: '/funciones#familia',
    visual: (
      <PhoneFrame label="Captura de PediTrack: botiquín de la casa con fechas de caducidad" scale="[--s:0.8] md:[--s:0.8] web:[--s:0.95]">
        <CabinetScreen />
      </PhoneFrame>
    ),
  },
  {
    id: 'siempre',
    eyebrow: 'Siempre contigo',
    title: 'En el teléfono y en la computadora',
    items: [
      'Se instala como app, sin tiendas',
      'Se ve lo último que viste, aun sin conexión',
      'Descarga todos tus datos o elimina tu cuenta',
      'Sin anuncios y sin venta de datos',
    ],
    linkLabel: 'Ver cómo instalarla →',
    href: '/instalar',
    visual: (
      <DesktopFrame
        label="Captura de PediTrack en computadora: historial de un hijo con filtros y botón para exportar a PDF"
        scale="[--s:0.54] md:[--s:0.7] web:[--s:0.95]"
      >
        <DesktopScreen />
      </DesktopFrame>
    ),
  },
]

function FeatureBlock({ group, flipped }: { group: FeatureGroup; flipped: boolean }) {
  return (
    <article id={group.id} className="grid grid-cols-[1fr] items-stretch gap-6 md:grid-cols-[1fr_1fr] md:gap-8 web:gap-16">
      <div className="flex flex-col justify-center gap-4">
        <Eyebrow>{group.eyebrow}</Eyebrow>
        <h3 className="text-2xl leading-tight font-extrabold tracking-[-0.01em] text-ink md:text-[28px] web:text-[32px]">{group.title}</h3>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {group.items.map((item) => (
            <li key={item} className="flex gap-2.5 text-[17px] leading-[1.5] text-body web:text-lg">
              <Check />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div>
          <Button href={group.href} variant="link">
            {group.linkLabel}
          </Button>
        </div>
      </div>
      <div
        className={cn(
          'flex items-center justify-center rounded-3xl bg-hint px-2 py-6 md:px-4 md:py-7 web:px-6 web:py-9',
          flipped && 'web:order-first',
        )}
      >
        {group.visual}
      </div>
    </article>
  )
}

function Features() {
  return (
    <section id="funciones" className={cn('bg-canvas', SECTION)}>
      <div className={INNER}>
        <SectionHeading
          eyebrow="Funciones"
          title="Todo lo que PediTrack guarda de cada consulta, vacuna y medida"
          lead="Cuatro grupos de funciones, pensados para tenerlo a la mano cuando lo necesitas."
        />
        {FEATURES.map((group, at) => (
          <div key={group.id} className="contents">
            {at > 0 && <hr className="my-1 w-full border-0 border-t border-line md:my-2 web:my-4" />}
            <FeatureBlock group={group} flipped={at % 2 === 1} />
          </div>
        ))}
      </div>
    </section>
  )
}

const FAMILY_ITEMS = [
  'Cada persona marca las tomas y se ve quién la marcó («por Ana, 08:05»)',
  'Cada quien recibe sus propios avisos',
  'El teléfono del hijo: acceso sin cuenta para que vea y marque sus tomas de hoy',
]

function Family() {
  return (
    <section id="familia" className={cn('bg-hint', SECTION)}>
      <div className={INNER}>
        <div className="grid grid-cols-1 items-center gap-7 md:grid-cols-[1fr_260px] md:gap-8 web:grid-cols-[1fr_380px] web:gap-[72px]">
          <div className="flex flex-col gap-[18px]">
            <SectionHeading
              eyebrow="Familia"
              title="Un expediente médico familiar, compartido y con avisos para cada quien"
              lead="Una suscripción cubre a toda la familia: invita hasta 4 personas como Tutores o Cuidadores, como abuelos o niñera."
            />
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {FAMILY_ITEMS.map((item) => (
                <li key={item} className="flex gap-2.5 text-[17px] leading-[1.5] text-body web:text-lg">
                  <Check />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div>
              <Button href="/funciones#familia" variant="link">
                Cómo funciona compartir en familia →
              </Button>
            </div>
          </div>
          <div className="flex justify-center">
            <PhoneFrame
              label="Captura de PediTrack: familia con dos tutores, una cuidadora y el teléfono del hijo"
              scale="[--s:0.9] md:[--s:0.78] web:[--s:1]"
            >
              <FamilyScreen />
            </PhoneFrame>
          </div>
        </div>
      </div>
    </section>
  )
}

function PlanCard({ plan, highlighted = false, action }: { plan: Plan; highlighted?: boolean; action: ReactNode }) {
  return (
    <Card as="article" highlighted={highlighted} className="flex flex-col gap-4 p-[22px] md:p-6 web:p-8">
      <h3 className="text-2xl leading-tight font-extrabold tracking-[-0.01em] text-ink">{plan.name}</h3>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[40px] font-black tracking-[-0.03em] text-ink md:text-[44px] web:text-5xl">{plan.price}</span>
        <span className="text-base text-body">{plan.period}</span>
      </div>
      <ul className="m-0 flex flex-1 list-none flex-col gap-[9px] p-0">
        {plan.includes.map((item) => (
          <li key={item} className="flex gap-2.5 text-base leading-[1.45] text-body">
            <Check size={20} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {action}
    </Card>
  )
}

function Plans() {
  const { settings } = useSite()
  return (
    <section id="planes" className={cn('bg-surface', SECTION)}>
      <div className={INNER}>
        <SectionHeading
          eyebrow="Planes"
          title="Planes: gratis para 1 hijo o Plan completo para toda la familia"
          lead="Lo registrado nunca se borra si dejas de pagar."
        />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <PlanCard
            plan={FREE_PLAN}
            action={
              <Button href={appUrl(settings, APP_PATHS.signup)} variant="outline" block>
                Empezar gratis
              </Button>
            }
          />
          <PlanCard
            plan={FULL_PLAN}
            highlighted
            action={
              <Button href="/planes" variant="outline" block>
                Ver el Plan completo
              </Button>
            }
          />
        </div>
        <div>
          <Button href="/planes" variant="link">
            Comparar planes en detalle →
          </Button>
        </div>
      </div>
    </section>
  )
}

const PRIVACY_CARDS = [
  ['Sin anuncios', 'No hay publicidad dentro de PediTrack.'],
  ['Sin venta de datos', 'Lo que anotas de tu familia no se vende.'],
  ['La receta se lee en tu teléfono', 'La foto de la receta no sale de tu cuenta.'],
  ['Tú decides', 'Descarga todos tus datos o elimina tu cuenta cuando quieras.'],
]

function Privacy() {
  return (
    <section id="privacidad" className={cn('bg-ink', SECTION)}>
      <div className={INNER}>
        <SectionHeading
          onDark
          eyebrow="Privacidad y seguridad"
          title="Tu bitácora es tuya: privacidad explicada en simple"
          lead="Pensamos PediTrack para registrar lo que tú anotas y nada más."
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 web:grid-cols-4">
          {PRIVACY_CARDS.map(([title, text]) => (
            <div key={title} className="flex flex-col gap-2 rounded-[18px] border border-ink-soft bg-ink-soft p-5">
              <Shield />
              <h3 className="text-[19px] font-extrabold text-surface">{title}</h3>
              <p className="text-base leading-[1.5] text-hint-edge">{text}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <a href="/privacidad" className="inline-flex min-h-11 items-center text-base font-extrabold text-bright-soft">
            Leer privacidad y seguridad →
          </a>
          <a href="/aviso-de-privacidad" className="inline-flex min-h-11 items-center text-base font-bold text-surface">
            Aviso de privacidad
          </a>
          <a href="/terminos" className="inline-flex min-h-11 items-center text-base font-bold text-surface">
            Términos
          </a>
        </div>
      </div>
    </section>
  )
}

function Questions() {
  const { settings } = useSite()
  const host = appHost(settings.appOrigin)
  const items = homeFaq()
  return (
    <section id="preguntas" className={cn('bg-canvas', SECTION)}>
      <div className={INNER}>
        <SectionHeading eyebrow="Preguntas" title="Preguntas frecuentes sobre PediTrack" lead="Las más comunes antes de crear una cuenta." />
        <div className="flex max-w-[860px] flex-col gap-5">
          <div className="flex flex-col gap-2.5">
            {items.map((item, at) => (
              <details key={item.id} open={at === 0} className="rounded-2xl border border-line bg-surface">
                <summary className="flex min-h-[60px] cursor-pointer items-center justify-between gap-4 px-5 py-3.5 text-[17px] font-extrabold text-ink md:text-lg web:text-[19px]">
                  <span>{item.question}</span>
                </summary>
                <div className="px-5 pb-[18px] text-base leading-[1.6] text-pretty text-body md:text-[17px]">{faqText(item.answer, host)}</div>
              </details>
            ))}
          </div>
          <Button href="/preguntas-frecuentes" variant="link" className="self-start">
            Ver todas las preguntas frecuentes →
          </Button>
        </div>
      </div>
    </section>
  )
}

function Closing() {
  const { settings } = useSite()
  return (
    <section className="border-t border-hint-border bg-hint px-5 py-14 md:px-8 md:py-[72px] web:px-20 web:py-[88px]">
      <div className="mx-auto flex max-w-[860px] flex-col items-center gap-5 text-center">
        <h2 className="text-[26px] leading-[1.15] font-black tracking-[-0.03em] text-balance text-ink md:text-[32px] web:text-[40px]">
          Empieza a tener las tomas y las recetas en un solo lugar
        </h2>
        <p className="text-[17px] leading-[1.6] text-pretty text-body md:text-lg web:text-[19px]">Crea tu cuenta gratis y registra a tu primer hijo.</p>
        <Button href={appUrl(settings, APP_PATHS.signup)}>Crear cuenta gratis</Button>
        <span className="text-[15px] text-body">Plan gratis para 1 hijo. Plan completo: MX$499 al año.</span>
      </div>
    </section>
  )
}

export function Home() {
  return (
    <>
      <Hero />
      <Trust />
      <HowItWorks />
      <Features />
      <Family />
      <Plans />
      <Privacy />
      <Questions />
      <Closing />
    </>
  )
}
