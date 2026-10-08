import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useSidebarSession } from '../home/useSidebarSession'
import { RoutinePageFrame } from '../supplements/RoutineFormPage'
import { FREE_ITEMS, FULL_ITEMS, PAYMENT_AVAILABLE, PLAN_PERIOD, PLAN_PRICE, SOON_ITEMS, planStanding } from './planCopy'
import { PlanTarjeta } from './PlanTarjeta'

const block = 'flex flex-col gap-3.5 rounded-[22px] bg-surface px-[22px] py-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]'

/** «Lo registrado se conserva» and «Tus datos»: the same two blocks in every state (Principio IV and II). */
function KeptAndPrivacy() {
  return (
    <div className={block}>
      <div className="flex flex-col gap-1">
        <h2 className="text-[17px] font-black text-ink">Lo registrado se conserva</h2>
        <p className="text-[15px] leading-relaxed text-body">
          Si el plan completo no se renueva, todo lo que registraste se sigue viendo y las tomas se siguen marcando. Solo deja de poder agregarse lo del plan
          completo.
        </p>
      </div>
      <div className="flex flex-col gap-1 border-t border-hint-edge pt-3.5">
        <h2 className="text-[17px] font-black text-ink">Tus datos</h2>
        <p className="text-[15px] leading-relaxed text-body">Tus datos de salud no se venden ni se usan para anuncios.</p>
      </div>
    </div>
  )
}

/** «Próximamente»: ideas without a date, apart from the plans and never as included. */
function Soon() {
  return (
    <div className="flex flex-col gap-2.5 rounded-[22px] border-2 border-dashed border-slate-300 px-[22px] py-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-[17px] font-black text-ink">Próximamente</h2>
        <p className="text-sm leading-normal text-slate-600">Ideas en las que trabajamos, sin fecha. No están incluidas hoy en ningún plan.</p>
      </div>
      <ul className="flex flex-col gap-2">
        {SOON_ITEMS.map((item) => (
          <li key={item} className="flex gap-2.5 text-[15px] leading-normal text-body">
            <span aria-hidden="true" className="w-5 shrink-0 font-black text-slate-600">
              ·
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * `/planes` (specs/034, mock Planes P1…P5): the two plans side by side — Gratis and Plan completo, MX$499 al año — marking the
 * person's own, in two designs (phone: the full plan first, stacked; web: Gratis at the left). The full plan's button is the
 * «Pronto» one while paying doesn't exist (`PAYMENT_AVAILABLE`); a guest of a paid family sees the plan as included and no button.
 * Nothing here says what to do about a child's health, offers a discount or presses (Principio I).
 */
export function PlansPage() {
  const { isDesktop } = useSidebarSession()
  const account = useCurrentAccount().data
  const standing = planStanding(account)
  const onFull = standing.plan === 'full'
  // Until the account is known nothing says which plan is theirs, so a paid account never sees Gratis marked (nor the «Pronto» button) for a moment.
  const known = account !== undefined

  const free = <PlanTarjeta id="plan-free" name="Gratis" price="MX$0" period="siempre" items={FREE_ITEMS} current={known && !onFull} />
  const full = (
    <PlanTarjeta
      id="plan-full"
      name="Plan completo"
      price={PLAN_PRICE}
      period={PLAN_PERIOD}
      lead="Todo lo de Gratis, más:"
      items={FULL_ITEMS}
      current={known && onFull}
      sub={standing.includedBy ? `Incluido por la familia de ${standing.includedBy}. No pagas nada: lo cubre su suscripción.` : undefined}
      pronto={known && !onFull && !PAYMENT_AVAILABLE}
    />
  )
  const intro = 'Un plan gratuito y un plan completo anual. Una suscripción cubre a toda la familia.'

  return (
    <RoutinePageFrame isDesktop={isDesktop} childId={undefined} backLabel="← Tus hijos" backTo="/home" eyebrow="PediTrack" title="Planes">
      {isDesktop ? (
        <>
          <p className="-mt-2 text-[17px] leading-relaxed text-body">{intro}</p>
          <div className="grid grid-cols-2 items-stretch gap-6">
            {free}
            {full}
          </div>
          <div className="grid grid-cols-2 items-start gap-6">
            <KeptAndPrivacy />
            <Soon />
          </div>
        </>
      ) : (
        <>
          <p className="text-base leading-relaxed text-body">{intro}</p>
          {full}
          {free}
          <KeptAndPrivacy />
          <Soon />
        </>
      )}
    </RoutinePageFrame>
  )
}
