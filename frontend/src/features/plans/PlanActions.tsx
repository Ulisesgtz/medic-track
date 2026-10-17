import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../family/ConfirmDialog'
import { SubscriptionApiError } from './api'
import { useCancelSubscription, useStartSubscription } from './hooks'
import { ACTION_LABEL, CANCEL_ERROR, cancelDialog, subscribeErrorText, type PlanAction, type PlanStateCopy } from './subscriptionText'
import type { SubscriptionState } from './types'

const solid =
  'flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-2xl bg-confirmed px-5 text-[17px] font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'
const outline =
  'flex min-h-12 w-full cursor-pointer items-center justify-center rounded-2xl border-2 border-action px-5 text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2'

interface PlanActionsProps {
  accountId: string
  state: SubscriptionState
  copy: PlanStateCopy
}

/**
 * What the full plan's card offers for the subscription's state (specs/045): the payment button (the only solid one), the way to
 * continue or check a payment that waits, and «Cancelar renovación» with its neutral confirmation. The card is typed on the
 * provider's page, never here; a failure says that no charge was made.
 */
export function PlanActions({ accountId, state, copy }: PlanActionsProps) {
  const start = useStartSubscription(accountId)
  const cancel = useCancelSubscription(accountId)
  const [confirming, setConfirming] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const closeDialog = useCallback(() => setConfirming(false), [])
  const sub = state.subscription

  const startError = start.error instanceof SubscriptionApiError ? subscribeErrorText(start.error.kind, start.error.reason, start.error.coveredBy) : start.isError ? subscribeErrorText('unknown') : null

  const render = (action: PlanAction) => {
    switch (action) {
      case 'subscribe':
      case 'resubscribe':
        return (
          <button key={action} type="button" className={solid} disabled={start.isPending} onClick={() => start.mutate()}>
            {start.isPending ? 'Un momento…' : ACTION_LABEL[action]}
          </button>
        )
      case 'continue-payment':
        return sub?.checkoutUrl ? (
          <a key={action} href={sub.checkoutUrl} className={outline}>
            {ACTION_LABEL[action]}
          </a>
        ) : null
      case 'check-payment':
        return (
          <Link key={action} to="/planes/regreso" className={outline}>
            {ACTION_LABEL[action]}
          </Link>
        )
      case 'cancel':
        return (
          <button
            key={action}
            ref={cancelRef}
            type="button"
            onClick={() => setConfirming(true)}
            className="min-h-11 cursor-pointer self-start rounded-2xl px-3.5 text-[15px] font-extrabold text-action underline hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            {ACTION_LABEL[action]}
          </button>
        )
    }
  }

  const dialog = cancelDialog(sub?.paidThrough ?? null)
  return (
    <div className="flex flex-col gap-3">
      {copy.title && <p className="text-[17px] leading-snug font-extrabold text-ink">{copy.title}</p>}
      {copy.lines.map((line) => (
        <p key={line} className="text-[15px] leading-normal text-body">
          {line}
        </p>
      ))}
      {copy.actions.map((action) => render(action))}
      {startError && (
        <p role="alert" className="text-[15px] leading-normal font-semibold text-body">
          {startError}
        </p>
      )}
      {confirming && (
        <ConfirmDialog
          title={dialog.title}
          rows={dialog.rows}
          confirmLabel={dialog.confirmLabel}
          cancelLabel={dialog.cancelLabel}
          busyLabel={dialog.busyLabel}
          tone="ink"
          busy={cancel.isPending}
          error={cancel.isError ? CANCEL_ERROR : null}
          onConfirm={() => cancel.mutate(undefined, { onSuccess: closeDialog })}
          onCancel={closeDialog}
          opener={cancelRef}
        />
      )}
    </div>
  )
}
