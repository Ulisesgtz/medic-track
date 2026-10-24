import { Link } from 'react-router-dom'
import type { Account } from '../home/types'
import { PLAN_PERIOD, PLAN_PRICE, planStanding } from './planCopy'

/**
 * The way into «Planes» from the phone's home, under «Familia»: the web has «Planes» in the sidebar, the phone has no sidebar and the
 * plans were only reachable from a limit notice, so somebody who already pays (or just wants to look) had no path to them. It says
 * which plan the account is on — only a record, no urgency, no discount — and is a plain link to `/planes`.
 */
export function PlanEntry({ account }: { account: Pick<Account, 'plan' | 'family'> }) {
  const standing = planStanding(account)
  const sub =
    standing.plan === 'free'
      ? `Plan gratuito · el plan completo es ${PLAN_PRICE} ${PLAN_PERIOD}`
      : standing.includedBy
        ? `Plan completo · incluido por la familia de ${standing.includedBy}`
        : 'Plan completo · ver mi suscripción'
  return (
    <Link
      to="/planes"
      className="flex min-h-11 items-center gap-4 rounded-[22px] bg-surface p-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)] transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[19px] font-extrabold tracking-[-0.02em] text-ink">Planes</span>
        <span className="text-sm font-semibold text-action">{sub}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-xl font-extrabold text-action">
        →
      </span>
    </Link>
  )
}
