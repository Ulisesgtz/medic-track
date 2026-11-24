import type { ReactNode } from 'react'
import { appHost } from '../../content/faq.ts'
import { useSite } from '../site.ts'
import { Button } from '../ui/Button.tsx'
import { LogoMark } from '../ui/Logo.tsx'
import { GroupTitle, PageIntro, PageShell, Panel } from '../ui/Page.tsx'
import { cn } from '../ui/cn.ts'

// «In» de «Sitio publico - Paginas»: iPhone (Safari) y Android (Chrome), cuatro pasos cada uno en una lista ordenada con su dibujo. El
// elemento que se toca va resaltado con borde (no solo con color). Las palabras de los pasos de iPhone son las de la app
// (frontend/src/features/firstUse/firstUseText.ts). La dirección es la de la APP (app.pedi-track.com), no la del sitio.

const HIGHLIGHT = 'rounded-lg p-[3px] outline-[2.5px] outline-action'

function ShareIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className="flex-none">
      <path d="M12 15V4m0 0L8 8m4-4l4 4M6 11v8h12v-8" fill="none" className="stroke-ink" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DotsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className="flex-none">
      <circle cx="12" cy="5" r="2" className="fill-ink" />
      <circle cx="12" cy="12" r="2" className="fill-ink" />
      <circle cx="12" cy="19" r="2" className="fill-ink" />
    </svg>
  )
}

const ART = 'flex h-[150px] w-full flex-col overflow-hidden rounded-[14px] border border-line bg-surface p-2.5'

/** La barra de direcciones: el paso 1 resalta la dirección; el 2, el botón (Compartir en iPhone, el menú en Android). */
function AddressBar({ label, address, android, highlight }: { label: string; address: string; android: boolean; highlight: 'address' | 'button' }) {
  return (
    <div role="img" aria-label={label} className={ART}>
      <div className={cn('flex items-center justify-between rounded-xl bg-bar px-3.5', android ? 'h-[38px]' : 'mt-auto h-11')}>
        <span className={cn('text-xs font-bold text-ink', highlight === 'address' && HIGHLIGHT)}>{address}</span>
        <span className={cn('flex', highlight === 'button' && HIGHLIGHT)}>{android ? <DotsIcon /> : <ShareIcon />}</span>
      </div>
    </div>
  )
}

function MenuList({ label, chosen }: { label: string; chosen: string }) {
  const rows = ['Copiar', 'Agregar a marcadores', chosen, 'Imprimir']
  return (
    <div role="img" aria-label={label} className={ART}>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {rows.map((row) => (
          <span
            key={row}
            className={cn(
              'flex h-[26px] items-center rounded-lg px-2.5 text-xs text-ink',
              row === chosen ? cn('bg-hint font-extrabold', HIGHLIGHT, 'p-0 px-2.5') : 'bg-menu-row font-semibold',
            )}
          >
            {row}
          </span>
        ))}
      </div>
    </div>
  )
}

function HomeScreen() {
  return (
    <div role="img" aria-label="Ilustración del paso: icono de PediTrack en la pantalla de inicio" className={ART}>
      <div className="grid grid-cols-4 gap-2.5 px-2 py-1.5">
        {Array.from({ length: 7 }, (_, at) => (
          <i key={at} className="aspect-square rounded-xl bg-tile" />
        ))}
        <span className="flex aspect-square rounded-[13px] outline-[2.5px] outline-action">
          <LogoMark size={44} className="size-full" />
        </span>
      </div>
    </div>
  )
}

interface Step {
  title: string
  text: ReactNode
  art: ReactNode
}

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="m-0 grid list-none grid-cols-1 gap-3.5 p-0 web:grid-cols-4">
      {steps.map((step, at) => (
        <Panel key={step.title} as="li" className="flex flex-col gap-2.5 p-[18px]">
          <div className="flex items-center gap-2.5">
            <span className="flex size-[34px] flex-none items-center justify-center rounded-full bg-ink text-base font-black text-surface" aria-hidden="true">
              {at + 1}
            </span>
            <h3 className="text-lg leading-tight font-extrabold tracking-[-0.01em] text-ink">{step.title}</h3>
          </div>
          <p className="text-[15px] leading-[1.6] text-pretty text-body">{step.text}</p>
          {step.art}
        </Panel>
      ))}
    </ol>
  )
}

export function Install() {
  const { settings } = useSite()
  const host = appHost(settings.appOrigin)
  const iphone: Step[] = [
    { title: 'Abre el sitio', text: `Entra a ${host} desde Safari.`, art: <AddressBar address={host} label="Ilustración del paso: abrir la dirección" android={false} highlight="address" /> },
    {
      title: 'Toca Compartir',
      text: 'Es el botón con una flecha hacia arriba, en la barra de abajo.',
      art: <AddressBar address={host} label="Ilustración del paso: Compartir" android={false} highlight="button" />,
    },
    {
      title: 'Agrega a inicio',
      text: 'Elige «Agregar a pantalla de inicio» y confirma.',
      art: <MenuList label="Ilustración del paso: Agregar a pantalla de inicio" chosen="Agregar a pantalla de inicio" />,
    },
    { title: 'Ábrela', text: 'Encuentra el icono de PediTrack en tu pantalla de inicio.', art: <HomeScreen /> },
  ]
  const android: Step[] = [
    { title: 'Abre el sitio', text: `Entra a ${host} desde Chrome.`, art: <AddressBar address={host} label="Ilustración del paso: abrir la dirección" android highlight="address" /> },
    { title: 'Abre el menú', text: 'Toca los tres puntos, arriba a la derecha.', art: <AddressBar address={host} label="Ilustración del paso: Menú" android highlight="button" /> },
    {
      title: 'Instala la app',
      text: 'Elige «Instalar app» o «Agregar a pantalla de inicio» y confirma.',
      art: <MenuList label="Ilustración del paso: Instalar app" chosen="Instalar app" />,
    },
    { title: 'Ábrela', text: 'Encuentra el icono de PediTrack en tu pantalla de inicio.', art: <HomeScreen /> },
  ]
  return (
    <PageShell>
      <PageIntro lead="PediTrack se instala como app desde el navegador, sin tiendas de aplicaciones. Elige tu teléfono." />
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <GroupTitle>iPhone (Safari)</GroupTitle>
          <p className="text-base leading-[1.6] text-pretty text-body">Usa Safari para que aparezca la opción de agregar a la pantalla de inicio.</p>
        </div>
        <Steps steps={iphone} />
      </section>
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <GroupTitle>Android (Chrome)</GroupTitle>
          <p className="text-base leading-[1.6] text-pretty text-body">Usa Chrome para ver la opción de instalar.</p>
        </div>
        <Steps steps={android} />
      </section>
      <Panel className="flex flex-col gap-2 p-6">
        <h3 className="text-[22px] leading-tight font-extrabold tracking-[-0.01em] text-ink">Después de instalarla</h3>
        <p className="text-base leading-[1.6] text-pretty text-body">
          Sin conexión se ve lo último que viste. Los avisos de cada toma llegan al teléfono aunque la app esté cerrada.
        </p>
        <Button href="/preguntas-frecuentes#instalacion-y-uso" variant="link">
          Ver preguntas sobre la instalación →
        </Button>
      </Panel>
    </PageShell>
  )
}
