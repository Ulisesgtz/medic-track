import { useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import type { Account } from '../home/types'
import { cabinetAccess } from './cabinetAccess'
import { CABINET, entryCount } from './cabinetText'
import { BoxIcon, card } from './CabinetParts'
import { useCabinet } from './hooks'

/**
 * specs/062, mock pantalla 1: «Checa tus medicamentos» on the home, under «Tus hijos». With the family on the paid plan (or
 * medicines already saved) it opens the cabinet and says how many; on the free plan with nothing saved it carries «Plan completo»
 * and opens the plan notice. A Child-role member doesn't see it.
 */
export function CabinetEntry({ account }: { account: Account }) {
  const navigate = useNavigate()
  const access = cabinetAccess(account)
  const query = useCabinet(access.ownerId, access.canView)
  const [planOpen, setPlanOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  if (!access.canView) return null

  const count = query.data?.items?.length ?? 0
  const locked = access.isFree && count === 0
  const inner = (sub: string, end: ReactNode) => (
    <>
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-hint text-action">
        <BoxIcon />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[17px] font-extrabold text-ink">{CABINET.entryTitle}</span>
        <span className="text-[14px] text-body">{sub}</span>
      </span>
      {end}
    </>
  )
  const box = `${card} flex min-h-[76px] w-full items-center gap-3.5 px-4 py-3.5 text-left hover:bg-hint`

  if (locked)
    return (
      <>
        <button ref={opener} type="button" onClick={() => setPlanOpen(true)} className={`${box} cursor-pointer`}>
          {inner(
            CABINET.entryFree,
            <span className="flex-none rounded-full border border-hint-border bg-hint px-2.5 py-1 text-[12px] font-extrabold text-action">{CABINET.planMark}</span>,
          )}
        </button>
        {planOpen && <FreemiumLimitModal reason="medicine_cabinet" opener={opener} onStayFree={() => setPlanOpen(false)} onViewPlans={() => navigate('/planes')} />}
      </>
    )
  return (
    <Link to="/botiquin" className={box}>
      {inner(
        query.isSuccess ? entryCount(count) : CABINET.entryFree,
        <span aria-hidden="true" className="flex-none text-[22px] font-extrabold text-action">
          ›
        </span>,
      )}
    </Link>
  )
}
