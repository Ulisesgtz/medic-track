// Mirrors specs/045-cobro-mercado-pago/contracts/api.md.

export type SubscriptionStatus = 'pending' | 'active' | 'grace' | 'canceled' | 'ended'

/** Why a person can't subscribe now (null when they can). */
export type BlockedReason = 'already_paid' | 'covered_by_family' | 'pending' | 'unavailable'

export interface SubscriptionInfo {
  status: SubscriptionStatus
  /** Until when what was paid lasts (RFC 3339). */
  paidThrough: string | null
  /** Whether it will charge again. */
  renews: boolean
  nextRenewalAt: string | null
  graceUntil: string | null
  endedAt: string | null
  /** The provider's page where the person pays; only while the subscription is pending. */
  checkoutUrl: string | null
}

export interface SubscriptionState {
  /** The charge is configured in this environment (if not, the full plan's button stays «Pronto»). */
  available: boolean
  price: { amount: number; currency: string; period: string }
  canSubscribe: boolean
  blockedReason: BlockedReason | null
  /** First name of the family's owner, with `covered_by_family`. */
  coveredBy: string | null
  subscription: SubscriptionInfo | null
}

export interface SubscribeResult {
  checkoutUrl: string
  status: 'pending'
}
