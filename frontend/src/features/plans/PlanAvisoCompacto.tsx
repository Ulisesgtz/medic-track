import { Link } from 'react-router-dom'
import { PLAN_PERIOD, PLAN_PRICE } from './planCopy'

/**
 * The compact plan notice of the screens that hold a paid-plan feature (mock PlanAvisoCompacto: Suplementos, Mis suplementos and
 * Familia): a `hint` block with what the feature is, the price and a link to the plans. No solid button — the screen may
 * already have one — and nothing about what will be lost: what was registered stays (Principio IV).
 */
export function PlanAvisoCompacto({ title, text }: { title: string; text: string }) {
  return (
    <section aria-label={`Plan completo: ${title}`} className="flex flex-col gap-2 rounded-[22px] border-[1.5px] border-hint-border bg-hint px-[22px] py-5">
      <p className="text-xs font-extrabold tracking-[0.1em] text-action uppercase">Plan completo</p>
      <h3 className="text-[19px] font-black tracking-[-0.02em] text-ink">{title}</h3>
      <p className="text-[15px] leading-relaxed text-body">{text}</p>
      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="text-[15px] font-extrabold text-ink">
          {PLAN_PRICE} {PLAN_PERIOD} <span className="font-semibold text-slate-600">· para toda la familia</span>
        </span>
        <Link
          to="/planes"
          className="inline-flex min-h-11 items-center text-[15px] font-extrabold text-action hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        >
          Ver el plan completo →
        </Link>
      </div>
    </section>
  )
}
