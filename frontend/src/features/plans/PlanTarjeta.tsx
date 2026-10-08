interface PlanTarjetaProps {
  id: string
  name: string
  price: string
  period: string
  /** «Todo lo de Gratis, más:» */
  lead?: string
  items: string[]
  /** «Tu plan actual»: a chip and a 2 px `ink` border (no bigger, no shadow: the paid plan isn't pushed). */
  current?: boolean
  /** A line under the price (e.g. who includes the plan). */
  sub?: string
  /** The «Contratar plan completo · PRONTO» button of the full plan while there is no way to pay (specs/034). */
  pronto?: boolean
}

/**
 * One plan (mock PlanTarjeta): name, price, the button when it applies and the list of what it includes with ✓. The «Pronto»
 * button is `aria-disabled` and does nothing; its explanation is its description.
 */
export function PlanTarjeta({ id, name, price, period, lead, items, current = false, sub, pronto = false }: PlanTarjetaProps) {
  return (
    <article
      aria-labelledby={id}
      className={`flex h-full flex-col gap-[18px] rounded-[22px] bg-surface px-[22px] py-6 shadow-[0_8px_20px_rgba(4,37,43,0.07)] ${
        current ? 'border-2 border-ink' : 'border-[1.5px] border-hint-edge'
      }`}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 id={id} className="text-[22px] font-black tracking-[-0.02em] text-ink">
            {name}
          </h2>
          {current && (
            <span className="rounded-full border-[1.5px] border-hint-border bg-hint px-2.5 py-[3px] text-[13px] font-extrabold text-action">Tu plan actual</span>
          )}
        </div>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-4xl leading-[1.1] font-black tracking-[-0.03em] text-ink">{price}</span>
          <span className="text-base font-bold text-slate-600">{period}</span>
        </p>
        {sub && <p className="text-[15px] leading-normal font-semibold text-body">{sub}</p>}
      </div>

      {pronto && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-disabled="true"
            aria-describedby={`${id}-pronto`}
            className="flex min-h-[52px] cursor-not-allowed items-center justify-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-slate-300 bg-slate-100 text-[17px] font-extrabold text-slate-600"
          >
            Contratar plan completo
            <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-extrabold tracking-[0.08em] text-slate-600 uppercase">Pronto</span>
          </button>
          <span id={`${id}-pronto`} className="text-sm leading-normal text-body">
            El pago con tarjeta todavía no está disponible. Mientras tanto, tu plan sigue igual.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2.5 border-t border-hint-edge pt-4">
        {lead && <p className="text-[15px] font-extrabold text-ink">{lead}</p>}
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[15px] leading-normal text-body">
              <span aria-hidden="true" className="w-5 shrink-0 font-black text-action">
                ✓
              </span>
              <span className="min-w-0 [overflow-wrap:anywhere]">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}
