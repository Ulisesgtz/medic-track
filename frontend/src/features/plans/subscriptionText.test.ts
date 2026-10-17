import { describe, expect, it } from 'vitest'
import { ACTION_LABEL, CANCEL_ERROR, PAYMENT_NOTE, RETURN_COPY, cancelDialog, dayOf, stateCopy, subscribeErrorText } from './subscriptionText'
import type { SubscriptionInfo, SubscriptionState } from './types'

// specs/045: what the plans screen and the return page say about the subscription, state by state.

const info = (extra: Partial<SubscriptionInfo>): SubscriptionInfo => ({
  status: 'active', paidThrough: '2027-10-17T12:00:00Z', renews: true, nextRenewalAt: '2027-10-17T12:00:00Z', graceUntil: null, endedAt: null, checkoutUrl: null, ...extra,
})
const state = (extra: Partial<SubscriptionState>): SubscriptionState => ({
  available: true, price: { amount: 499, currency: 'MXN', period: 'year' }, canSubscribe: false, blockedReason: null, coveredBy: null, subscription: null, ...extra,
})

describe('dayOf', () => {
  it('writes an instant as the person\'s own calendar day', () => {
    expect(dayOf(null)).toBe('')
    expect(dayOf('2027-10-17T12:00:00')).toMatch(/17 oct 2027/)
  })
})

describe('stateCopy', () => {
  it('says nothing when the charge is not available or the state is not known', () => {
    expect(stateCopy(undefined)).toBeNull()
    expect(stateCopy(state({ available: false, canSubscribe: true }))).toBeNull()
    expect(stateCopy(state({}))).toBeNull()
  })

  it('a person who can subscribe sees the note about the card and the payment button', () => {
    expect(stateCopy(state({ canSubscribe: true }))).toEqual({ lines: [PAYMENT_NOTE], actions: ['subscribe'] })
  })

  it('a person covered by a family is told whose plan it is and offered nothing', () => {
    const copy = stateCopy(state({ blockedReason: 'covered_by_family', coveredBy: 'Ana' }))
    expect(copy?.lines[0]).toContain('Ana')
    expect(copy?.actions).toEqual([])
    expect(stateCopy(state({ blockedReason: 'covered_by_family' }))?.lines[0]).toContain('tu familia')
  })

  it('pending: waits for the confirmation and offers to continue or check', () => {
    const copy = stateCopy(state({ subscription: info({ status: 'pending', checkoutUrl: 'https://pay.example/x' }) }))
    expect(copy?.title).toMatch(/esperando/)
    expect(copy?.actions).toEqual(['continue-payment', 'check-payment'])
  })

  it('active: until when it lasts, when it renews and the way to cancel', () => {
    const copy = stateCopy(state({ subscription: info({}) }))
    expect(copy?.title).toMatch(/^Vigente hasta .*2027/)
    expect(copy?.lines[0]).toMatch(/Se renovará el/)
    expect(copy?.actions).toEqual(['cancel'])
    expect(stateCopy(state({ subscription: info({ nextRenewalAt: null }) }))?.lines[0]).toBe('Se renovará cada año.')
  })

  it('grace: the plan goes on until a day, and the way to cancel stays', () => {
    const copy = stateCopy(state({ subscription: info({ status: 'grace', graceUntil: '2027-10-24T12:00:00Z' }) }))
    expect(copy?.title).toMatch(/No pudimos cobrar/)
    expect(copy?.lines[0]).toMatch(/sigue activo hasta el .*2027/)
    expect(copy?.actions).toEqual(['cancel'])
  })

  it('canceled: it will not renew, the plan lasts, and subscribing again is offered only if allowed', () => {
    const canceled = info({ status: 'canceled', renews: false })
    expect(stateCopy(state({ subscription: canceled, canSubscribe: true }))?.actions).toEqual(['resubscribe'])
    expect(stateCopy(state({ subscription: canceled }))?.actions).toEqual([])
    expect(stateCopy(state({ subscription: canceled }))?.title).toMatch(/No se renovará/)
  })

  it('ended: says when it ended, that nothing was lost, and offers to subscribe again if allowed', () => {
    const ended = info({ status: 'ended', endedAt: '2027-11-01T12:00:00Z' })
    const copy = stateCopy(state({ subscription: ended, canSubscribe: true }))
    expect(copy?.title).toMatch(/terminó el/)
    expect(copy?.lines[0]).toMatch(/sigue ahí/)
    expect(copy?.actions).toEqual(['subscribe'])
    expect(stateCopy(state({ subscription: ended }))?.actions).toEqual([])
  })

  it('every state has a way out: a button, or a sentence that nothing is needed', () => {
    const states: SubscriptionState[] = [
      state({ canSubscribe: true }),
      state({ subscription: info({ status: 'pending' }) }),
      state({ subscription: info({}) }),
      state({ subscription: info({ status: 'grace', graceUntil: '2027-10-24T12:00:00Z' }) }),
      state({ subscription: info({ status: 'canceled' }), canSubscribe: true }),
      state({ subscription: info({ status: 'ended', endedAt: '2027-11-01T12:00:00Z' }), canSubscribe: true }),
    ]
    for (const s of states) {
      const copy = stateCopy(s)
      expect(copy).not.toBeNull()
      expect(copy!.actions.length).toBeGreaterThan(0)
    }
  })
})

describe('the other sentences', () => {
  it('says what was not done when a payment could not start', () => {
    expect(subscribeErrorText('not_allowed', 'covered_by_family', 'Ana')).toContain('Ana')
    expect(subscribeErrorText('not_allowed', 'covered_by_family')).toContain('tu familia')
    expect(subscribeErrorText('not_allowed', 'already_paid')).toMatch(/ya tiene el plan completo/)
    expect(subscribeErrorText('unavailable')).toMatch(/ningún cobro/)
    expect(subscribeErrorText('provider_error')).toMatch(/ningún cobro/)
  })

  it('the cancellation dialog says what stops, what stays and what comes after', () => {
    const dialog = cancelDialog('2027-10-17T12:00:00')
    expect(dialog.rows.map((r) => r.k)).toEqual(['Deja de pasar', 'Se conserva', 'Después'])
    expect(dialog.rows[1].v).toMatch(/2027/)
    expect(dialog.cancelLabel).toBe('Volver')
  })

  it('never advises, discounts or presses, and never blames (Principio I)', () => {
    const states: SubscriptionState[] = [
      state({ canSubscribe: true }),
      state({ blockedReason: 'covered_by_family', coveredBy: 'Ana' }),
      state({ subscription: info({ status: 'pending' }) }),
      state({ subscription: info({}) }),
      state({ subscription: info({ status: 'grace', graceUntil: '2027-10-24T12:00:00Z' }) }),
      state({ subscription: info({ status: 'canceled' }), canSubscribe: true }),
      state({ subscription: info({ status: 'ended', endedAt: '2027-11-01T12:00:00Z' }), canSubscribe: true }),
    ]
    const copies = states.flatMap((s) => {
      const c = stateCopy(s)!
      return [c.title ?? '', ...c.lines]
    })
    const all = [
      ...copies,
      ...Object.values(ACTION_LABEL),
      PAYMENT_NOTE,
      CANCEL_ERROR,
      JSON.stringify(RETURN_COPY),
      JSON.stringify(cancelDialog(null)),
      subscribeErrorText('not_allowed', 'already_paid'),
      subscribeErrorText('unavailable'),
      subscribeErrorText('unknown'),
    ].join(' ')
    expect(all).not.toMatch(/ahorra|descuento|oferta|promoci|últim[oa]s? (día|hora|oportunidad)|apúrate|perder[áa]s|no te quedes|recomend|debes|evita|urgente|ya!|culpa/i)
  })
})
