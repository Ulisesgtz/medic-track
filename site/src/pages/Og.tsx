import { LogoMark } from '../ui/Logo.tsx'
import { PhoneFrame } from '../ui/PhoneFrame.tsx'
import { PrescriptionScreen, DosesScreen } from '../ui/screens/screens.tsx'

// Las dos imágenes para compartir de «Sitio publico - Decisiones y SEO» (sección «Imágenes para compartir»), de 1200×630. No son páginas del
// sitio: scripts/og.ts las dibuja y las fotografía en public/og/. El texto va dentro de la zona segura (a 72 px de los bordes).

export interface OgCardData {
  /** El archivo, sin carpeta ni extensión: `inicio`, `funciones`, `blog-organizar-recetas`. */
  name: string
  /** La etiqueta de arriba del título (solo la plantilla). */
  eyebrow: string
  title: string
  /** Lo que se lee abajo a la izquierda: `pedi-track.com/blog`. */
  url: string
}

/** El diseño del inicio: fondo tinta, el título, el horario de tomas del día inclinado a la derecha. */
export function OgHome({ url }: { url: string }) {
  return (
    <div role="img" aria-label="Imagen para compartir de la página de inicio" className="relative h-[630px] w-[1200px] overflow-hidden bg-ink font-sans">
      <div className="absolute top-16 left-[72px] flex items-center gap-3.5">
        <LogoMark size={56} onDark />
        <span className="text-[32px] font-black tracking-[-0.03em] text-surface">
          Pedi<span className="text-bright-soft">Track</span>
        </span>
      </div>
      <div className="absolute top-[170px] left-[72px] flex w-[640px] flex-col gap-[22px]">
        <span className="text-[60px] leading-[1.05] font-black tracking-[-0.035em] text-surface">
          Los medicamentos y el historial de tus hijos, en un solo lugar
        </span>
        <span className="text-[26px] leading-[1.4] text-hint-edge">Bitácora médica de la familia. Gratis para 1 hijo.</span>
      </div>
      <span className="absolute bottom-14 left-[72px] text-2xl font-extrabold text-bright-soft">{url}</span>
      <div className="absolute top-[70px] right-[90px] w-[340px] rotate-[4deg]">
        <PhoneFrame label="Captura de PediTrack con el horario de tomas de hoy" scale="[--s:1.15]">
          <DosesScreen />
        </PhoneFrame>
      </div>
    </div>
  )
}

/** La plantilla del resto de las páginas: fondo celeste, etiqueta y título (cambia por página), la receta leída a la derecha. */
export function OgTemplate({ eyebrow, title, url }: Pick<OgCardData, 'eyebrow' | 'title' | 'url'>) {
  return (
    <div
      role="img"
      aria-label="Plantilla de imagen para compartir de páginas interiores"
      className="relative h-[630px] w-[1200px] overflow-hidden border border-hint-border bg-hint font-sans"
    >
      <div className="absolute top-16 left-[72px] flex items-center gap-3.5">
        <LogoMark size={56} />
        <span className="text-[32px] font-black tracking-[-0.03em] text-ink">
          Pedi<span className="text-action">Track</span>
        </span>
      </div>
      <div className="absolute top-[190px] left-[72px] flex w-[760px] flex-col gap-5">
        <span className="text-xl font-extrabold tracking-[0.1em] text-action uppercase">{eyebrow}</span>
        <span className="text-[66px] leading-[1.05] font-black tracking-[-0.035em] text-ink">{title}</span>
      </div>
      <span className="absolute bottom-14 left-[72px] text-2xl font-extrabold text-action">{url}</span>
      <div className="absolute -right-[30px] -bottom-[190px] w-[340px] -rotate-[6deg]">
        <PhoneFrame label="Captura de PediTrack con una receta leída" scale="[--s:1.15]">
          <PrescriptionScreen />
        </PhoneFrame>
      </div>
    </div>
  )
}

/** La imagen de una tarjeta: el diseño del inicio para `inicio`, la plantilla para las demás. */
export function OgCard({ card }: { card: OgCardData }) {
  return card.name === 'inicio' ? <OgHome url={card.url} /> : <OgTemplate eyebrow={card.eyebrow} title={card.title} url={card.url} />
}
