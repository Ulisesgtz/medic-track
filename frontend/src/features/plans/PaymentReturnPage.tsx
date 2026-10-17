import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useSidebarSession } from '../home/useSidebarSession'
import { RoutinePageFrame } from '../supplements/RoutineFormPage'
import { subscriptionKey, useSubscription } from './hooks'
import { RETURN_COPY, dayOf } from './subscriptionText'

const POLL_MS = 3000
const MAX_TRIES = 40 // two minutes

const card = 'flex flex-col gap-3 rounded-[22px] bg-surface p-[22px] shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
const outline =
  'inline-flex min-h-12 items-center justify-center self-start rounded-2xl border-2 border-action px-5 text-base font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2'

/**
 * `/planes/regreso` (specs/045): where the payment provider sends the person back. **This page decides nothing**: the plan changes only
 * when the provider's notice reaches the server, so it asks the server for the state every 3 seconds (up to two minutes) while the
 * payment is pending, and it never offers to pay again. A subscription that isn't there or has ended means no charge was made.
 */
export function PaymentReturnPage() {
  const { isDesktop } = useSidebarSession()
  const account = useCurrentAccount().data
  const queryClient = useQueryClient()
  const [offset, setOffset] = useState(0)
  // How many answers the server has given so far (the result object doesn't carry it).
  const answers = queryClient.getQueryState(subscriptionKey(account?.id))?.dataUpdateCount ?? 0
  const [stopped, setStopped] = useState(false)
  const tooSlow = answers - offset >= MAX_TRIES
  const query = useSubscription(account?.id, { refetchMs: stopped || tooSlow ? false : POLL_MS })
  const sub = query.data?.subscription ?? null
  const pending = sub?.status === 'pending'
  const slow = pending && tooSlow
  // Stop asking once the answer isn't «pending» any more.
  if (!stopped && query.isSuccess && !pending) setStopped(true)

  let content
  if (!account || (query.isPending && !query.isError)) {
    content = <p className="text-base font-semibold text-action">Cargando…</p>
  } else if (query.isError) {
    content = (
      <div className={card} role="status">
        <h2 className="text-xl font-black text-ink">No pudimos revisar tu pago</h2>
        <p className="text-[15px] leading-normal text-body">No se hizo ningún cobro desde aquí. Puedes volver a revisar en un momento.</p>
        <button type="button" className={outline} onClick={() => void query.refetch()}>
          {RETURN_COPY.slow.retry}
        </button>
      </div>
    )
  } else if (slow) {
    content = (
      <div className={card} role="status">
        <h2 className="text-xl font-black text-ink">{RETURN_COPY.slow.title}</h2>
        <p className="text-[15px] leading-normal text-body">{RETURN_COPY.slow.body}</p>
        <button
          type="button"
          className={outline}
          onClick={() => {
            setOffset(answers)
            setStopped(false)
          }}
        >
          {RETURN_COPY.slow.retry}
        </button>
      </div>
    )
  } else if (pending) {
    content = (
      <div className={card} role="status">
        <h2 className="text-xl font-black text-ink">{RETURN_COPY.confirming.title}</h2>
        <p className="text-[15px] leading-normal text-body">{RETURN_COPY.confirming.body}</p>
      </div>
    )
  } else if (sub && (sub.status === 'active' || sub.status === 'grace' || sub.status === 'canceled')) {
    content = (
      <div className={card} role="status">
        <h2 className="text-xl font-black text-ink">{RETURN_COPY.active.title}</h2>
        <p className="text-[15px] leading-normal text-body">{RETURN_COPY.active.body}</p>
        {sub.paidThrough && <p className="text-[15px] font-extrabold text-ink">Vigente hasta {dayOf(sub.paidThrough)}</p>}
        <Link to="/planes" className={outline}>
          {RETURN_COPY.back}
        </Link>
      </div>
    )
  } else {
    content = (
      <div className={card} role="status">
        <h2 className="text-xl font-black text-ink">{RETURN_COPY.notCharged.title}</h2>
        <p className="text-[15px] leading-normal text-body">{RETURN_COPY.notCharged.body}</p>
        <Link to="/planes" className={outline}>
          {RETURN_COPY.back}
        </Link>
      </div>
    )
  }

  return (
    <RoutinePageFrame isDesktop={isDesktop} childId={undefined} backLabel="← Planes" backTo="/planes" eyebrow="PediTrack" title="Tu pago">
      {content}
    </RoutinePageFrame>
  )
}
