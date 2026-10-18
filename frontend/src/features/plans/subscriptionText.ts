import { formatDateShort } from '../../shared/date'
import type { SubscriptionState } from './types'

// What /planes and the return page say about the subscription, one function per state (specs/045, history 4). Neutral words: they
// say what happens to the plan and never press (no discount, no countdown, no «you will lose»), and never give advice about a
// child's health (Principio I). `subscriptionText.test.ts` checks every sentence of this file and of planCopy.ts.

export type PlanAction = 'subscribe' | 'resubscribe' | 'continue-payment' | 'check-payment' | 'cancel'

export const ACTION_LABEL: Record<PlanAction, string> = {
  subscribe: 'Contratar plan completo',
  resubscribe: 'Volver a suscribirme',
  'continue-payment': 'Continuar el pago',
  'check-payment': 'Revisar el estado del pago',
  cancel: 'Cancelar renovación',
}

export interface PlanStateCopy {
  /** A short heading, when the state has one. */
  title?: string
  lines: string[]
  /** The buttons or links the state offers, the first being the main one. */
  actions: PlanAction[]
}

/** An instant as the person's own calendar day: «15 oct 2026». */
export function dayOf(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return formatDateShort(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
}

/** Said under the button that starts the payment: where the card goes and that it can be canceled. */
export const PAYMENT_NOTE = 'El pago se hace en la página de Mercado Pago; PediTrack no guarda tu tarjeta. Se cobra una vez al año y puedes cancelar cuando quieras.'

/**
 * What the full plan's card says and offers for this state. Nothing when the charge isn't available here or the plan is given by
 * hand or by a family (their own texts say so).
 */
export function stateCopy(state: SubscriptionState | undefined): PlanStateCopy | null {
  if (!state || !state.available) return null
  const sub = state.subscription
  if (state.blockedReason === 'covered_by_family') {
    return { lines: [`Tu plan es el de la familia de ${state.coveredBy ?? 'tu familia'}. No pagas nada.`], actions: [] }
  }
  switch (sub?.status) {
    case 'pending':
      return {
        title: 'Estamos esperando la confirmación de tu pago',
        lines: ['Si ya pagaste, tu plan se actualiza solo en unos minutos. Si no terminaste, puedes continuar cuando quieras.'],
        actions: ['continue-payment', 'check-payment'],
      }
    case 'active':
      return {
        title: `Vigente hasta ${dayOf(sub.paidThrough)}`,
        lines: [sub.nextRenewalAt ? `Se renovará el ${dayOf(sub.nextRenewalAt)}.` : 'Se renovará cada año.'],
        actions: ['cancel'],
      }
    case 'grace':
      return {
        title: 'No pudimos cobrar tu renovación',
        lines: [`Tu plan sigue activo hasta el ${dayOf(sub.graceUntil)}. Puedes actualizar tu tarjeta desde tu cuenta de Mercado Pago.`],
        actions: ['cancel'],
      }
    case 'canceled':
      return {
        title: `No se renovará; tu plan sigue hasta ${dayOf(sub.paidThrough)}`,
        lines: ['Lo que registraste se conserva. Si quieres seguir con el plan completo, puedes suscribirte de nuevo.'],
        actions: state.canSubscribe ? ['resubscribe'] : [],
      }
    case 'ended':
      return {
        title: `Tu plan completo terminó el ${dayOf(sub.endedAt)}`,
        lines: ['Lo que registraste sigue ahí. Si quieres volver al plan completo, puedes contratarlo de nuevo.'],
        actions: state.canSubscribe ? ['subscribe'] : [],
      }
  }
  if (state.canSubscribe) return { lines: [PAYMENT_NOTE], actions: ['subscribe'] }
  return null
}

/** What is said when a payment could not be started. */
export function subscribeErrorText(kind: string, reason?: string, coveredBy?: string): string {
  if (kind === 'not_allowed' && reason === 'covered_by_family') return `Tu plan es el de la familia de ${coveredBy ?? 'tu familia'}. No hace falta pagar.`
  if (kind === 'not_allowed') return 'Tu cuenta ya tiene el plan completo.'
  if (kind === 'unavailable') return 'El pago no está disponible en este momento. No se hizo ningún cobro. Inténtalo de nuevo en unos minutos.'
  return 'No se pudo iniciar el pago. No se hizo ningún cobro. Inténtalo de nuevo.'
}

/** The confirmation of canceling the renewal: what stops, what stays, what is not taken. */
export function cancelDialog(paidThrough: string | null) {
  return {
    title: '¿Cancelar la renovación?',
    rows: [
      { k: 'Deja de pasar', v: 'Ya no se te volverá a cobrar.' },
      { k: 'Se conserva', v: `Tu plan completo sigue hasta ${dayOf(paidThrough)} y todo lo que registraste.` },
      { k: 'Después', v: 'Puedes suscribirte de nuevo cuando quieras.' },
    ],
    confirmLabel: 'Cancelar renovación',
    cancelLabel: 'Volver',
    busyLabel: 'Cancelando…',
  }
}

export const CANCEL_ERROR = 'No se pudo cancelar la renovación. No se cambió nada. Inténtalo de nuevo.'

/** The return page (`/planes/regreso`): the payment is confirmed by the provider's notice, never by this page. */
export const RETURN_COPY = {
  confirming: {
    title: 'Estamos confirmando tu pago…',
    body: 'Tarda unos segundos. No hace falta que pagues otra vez: esta pantalla se actualiza sola.',
  },
  active: { title: 'Tu plan completo está activo', body: 'Gracias. Ya puedes usar todo lo del plan completo.' },
  slow: {
    title: 'Todavía no recibimos la confirmación',
    body: 'Puedes cerrar esta pantalla: tu plan se actualizará solo cuando llegue.',
    retry: 'Volver a revisar',
  },
  notCharged: {
    title: 'No se realizó ningún cobro',
    body: 'Puedes intentarlo de nuevo cuando quieras.',
  },
  back: 'Ir a Planes',
} as const
