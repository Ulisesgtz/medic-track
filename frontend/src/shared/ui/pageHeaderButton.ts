// specs/056: the classes of the buttons of the common page header (design «Encabezado PediTrack.dc.html»).

const outline = 'inline-flex shrink-0 cursor-pointer items-center justify-center border-2 border-action font-extrabold text-action hover:bg-hint'

/**
 * The classes of a header button, with the design's sizes: the screen's solid main action (`primary`, 48 px on the phone and 52 on
 * the web, radius 16), an outlined `secondary` (48 px, radius 16) and the outlined «Editar» (44 px, radius 14).
 */
export function pageHeaderButton(kind: 'primary' | 'secondary' | 'edit', variant: 'phone' | 'desktop', options: { tall?: boolean } = {}): string {
  // `tall`: a design whose solid main action is 52 px on the phone too (specs/065, «Crecimiento»).
  if (kind === 'primary')
    return `inline-flex shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-confirmed font-extrabold text-white hover:bg-emerald-800 text-[16px] ${variant === 'desktop' ? 'min-h-[52px] px-6' : options.tall ? 'min-h-[52px] px-5' : 'min-h-12 px-5'}`
  if (kind === 'secondary') return `${outline} min-h-12 rounded-2xl px-[18px] text-[15px]`
  return `${outline} min-h-11 rounded-[14px] px-[18px] text-[15px]`
}
