import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PlansPage } from './PlansPage'
import { PaymentReturnPage } from './PaymentReturnPage'
import { FakeCheckoutPage } from './FakeCheckoutPage'
import { goToCheckout } from './navigate'
import type { SubscriptionInfo, SubscriptionState } from './types'

// specs/045: the plans screen with a subscription, the payment's return page and the fake provider's page.

vi.mock('./navigate', () => ({ goToCheckout: vi.fn() }))

const account = (plan: string) => ({
  id: 'a1', firstName: 'Ana', lastName: 'Morales', email: 'ana@example.com', countryCode: null, stateCode: null, plan, children: [],
})
const info = (extra: Partial<SubscriptionInfo> = {}): SubscriptionInfo => ({
  status: 'active', paidThrough: '2027-10-17T12:00:00', renews: true, nextRenewalAt: '2027-10-17T12:00:00', graceUntil: null, endedAt: null, checkoutUrl: null, ...extra,
})
const state = (extra: Partial<SubscriptionState> = {}): SubscriptionState => ({
  available: true, price: { amount: 499, currency: 'MXN', period: 'year' }, canSubscribe: false, blockedReason: null, coveredBy: null, subscription: null, ...extra,
})

type Reply = { status?: number; body?: unknown }
let current: SubscriptionState
let writes: Record<string, Reply>
let calls: { method: string; path: string }[]

function stubApi(plan = 'free') {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      const method = init?.method ?? 'GET'
      calls.push({ method, path })
      const write = writes[`${method} ${path}`]
      if (write) return { ok: (write.status ?? 200) < 400, status: write.status ?? 200, json: async () => write.body ?? {} }
      if (path.endsWith('/subscription')) return { ok: true, status: 200, json: async () => current }
      return { ok: true, status: 200, json: async () => account(plan) }
    }),
  )
}

function renderAt(path: string, ui: React.ReactElement, route = path) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={ui} />
          <Route path="/planes" element={<div>PLANES</div>} />
          <Route path="/planes/regreso" element={<div>REGRESO</div>} />
          <Route path="/home" element={<div>HOME</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  current = state()
  writes = {}
  calls = []
  vi.mocked(goToCheckout).mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe('PlansPage with the charge available', () => {
  it('a free account that can subscribe sees the note and the solid button, and no «Pronto»', async () => {
    current = state({ canSubscribe: true })
    stubApi()
    renderAt('/planes', <PlansPage />)
    const full = await screen.findByRole('article', { name: 'Plan completo' })
    expect(await within(full).findByRole('button', { name: 'Contratar plan completo' })).toBeEnabled()
    expect(within(full).getByText(/PediTrack no guarda tu tarjeta/)).toBeInTheDocument()
    expect(within(full).queryByText(/Pronto/i)).not.toBeInTheDocument()
  })

  it('tapping it starts the payment and sends the browser to the provider\'s page', async () => {
    current = state({ canSubscribe: true })
    writes['POST /accounts/a1/subscription'] = { status: 201, body: { checkoutUrl: 'https://pay.example/x', status: 'pending' } }
    stubApi()
    renderAt('/planes', <PlansPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Contratar plan completo' }))
    await waitFor(() => expect(goToCheckout).toHaveBeenCalledWith('https://pay.example/x'))
  })

  it('a refusal says why and charges nothing', async () => {
    current = state({ canSubscribe: true })
    writes['POST /accounts/a1/subscription'] = { status: 409, body: { error: 'subscription_not_allowed', reason: 'covered_by_family', coveredBy: 'Ana' } }
    stubApi()
    renderAt('/planes', <PlansPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Contratar plan completo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/familia de Ana/)
    expect(goToCheckout).not.toHaveBeenCalled()
  })

  it('a provider that fails says that nothing was charged', async () => {
    current = state({ canSubscribe: true })
    writes['POST /accounts/a1/subscription'] = { status: 502, body: {} }
    stubApi()
    renderAt('/planes', <PlansPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Contratar plan completo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/No se hizo ningún cobro/)
  })

  it('a payment that waits offers to continue it and to check it', async () => {
    current = state({ subscription: info({ status: 'pending', checkoutUrl: 'https://pay.example/x' }) })
    stubApi()
    renderAt('/planes', <PlansPage />)
    expect(await screen.findByText('Estamos esperando la confirmación de tu pago')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continuar el pago' })).toHaveAttribute('href', 'https://pay.example/x')
    expect(screen.getByRole('link', { name: 'Revisar el estado del pago' })).toHaveAttribute('href', '/planes/regreso')
  })

  it('a pending payment with no page to continue only offers to check it', async () => {
    current = state({ subscription: info({ status: 'pending', checkoutUrl: null }) })
    stubApi()
    renderAt('/planes', <PlansPage />)
    await screen.findByText('Estamos esperando la confirmación de tu pago')
    expect(screen.queryByRole('link', { name: 'Continuar el pago' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Revisar el estado del pago' })).toBeInTheDocument()
  })

  it('an active subscription says until when, and canceling asks first and then shows the new state', async () => {
    current = state({ subscription: info() })
    writes['POST /accounts/a1/subscription/cancel'] = { body: state({ subscription: info({ status: 'canceled', renews: false }) }) }
    stubApi('paid')
    renderAt('/planes', <PlansPage />)
    expect(await screen.findByText(/^Vigente hasta .*2027/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar renovación' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('¿Cancelar la renovación?')).toBeInTheDocument()
    expect(within(dialog).getByText(/Ya no se te volverá a cobrar/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar renovación' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(calls.some((c) => c.method === 'POST' && c.path.endsWith('/subscription/cancel'))).toBe(true)
    expect(await screen.findByText(/No se renovará/)).toBeInTheDocument()
  })

  it('«Volver» in the dialog changes nothing, and a failure says that nothing changed', async () => {
    current = state({ subscription: info() })
    writes['POST /accounts/a1/subscription/cancel'] = { status: 502, body: {} }
    stubApi('paid')
    renderAt('/planes', <PlansPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar renovación' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Volver' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls.some((c) => c.path.endsWith('/cancel'))).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar renovación' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar renovación' }))
    expect(await screen.findByText(/No se cambió nada/)).toBeInTheDocument()
  })

  it('a canceled subscription that can be taken again offers it, and an invited person is offered nothing', async () => {
    current = state({ canSubscribe: true, subscription: info({ status: 'canceled', renews: false }) })
    stubApi('paid')
    const view = renderAt('/planes', <PlansPage />)
    expect(await screen.findByRole('button', { name: 'Volver a suscribirme' })).toBeInTheDocument()
    view.unmount()

    current = state({ blockedReason: 'covered_by_family', coveredBy: 'Ana' })
    stubApi()
    renderAt('/planes', <PlansPage />)
    await screen.findByRole('article', { name: 'Plan completo' })
    await waitFor(() => expect(screen.getByText(/Tu plan es el de la familia de Ana/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Contratar|suscribirme/ })).not.toBeInTheDocument()
  })

  it('a grace period says it plainly and keeps the way to cancel', async () => {
    current = state({ subscription: info({ status: 'grace', graceUntil: '2027-10-24T12:00:00' }) })
    stubApi('paid')
    renderAt('/planes', <PlansPage />)
    expect(await screen.findByText('No pudimos cobrar tu renovación')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar renovación' })).toBeInTheDocument()
  })

  it('if the subscription cannot be read the button stays «Pronto» and nothing breaks', async () => {
    stubApi()
    writes['GET /accounts/a1/subscription'] = { status: 500, body: {} }
    renderAt('/planes', <PlansPage />)
    const full = await screen.findByRole('article', { name: 'Plan completo' })
    expect(await within(full).findByRole('button', { name: /Contratar plan completo/ })).toHaveAttribute('aria-disabled', 'true')
  })
})

describe('PaymentReturnPage', () => {
  it('says it is confirming while pending, and never offers to pay again', async () => {
    current = state({ subscription: info({ status: 'pending' }) })
    stubApi()
    renderAt('/planes/regreso', <PaymentReturnPage />)
    expect(await screen.findByText('Estamos confirmando tu pago…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Contratar|Pagar/ })).not.toBeInTheDocument()
  })

  it('keeps asking while it is pending and shows the active plan once the server says so', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      current = state({ subscription: info({ status: 'pending' }) })
      stubApi()
      renderAt('/planes/regreso', <PaymentReturnPage />)
      await screen.findByText('Estamos confirmando tu pago…')
      current = state({ subscription: info() })
      await vi.advanceTimersByTimeAsync(3100)
      expect(await screen.findByText('Tu plan completo está activo')).toBeInTheDocument()
      expect(screen.getByText(/Vigente hasta .*2027/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Ir a Planes' })).toHaveAttribute('href', '/planes')
    } finally {
      vi.useRealTimers()
    }
  })

  it('after two minutes of waiting it says so, and «Volver a revisar» asks again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      current = state({ subscription: info({ status: 'pending' }) })
      stubApi()
      renderAt('/planes/regreso', <PaymentReturnPage />)
      await screen.findByText('Estamos confirmando tu pago…')
      await vi.advanceTimersByTimeAsync(3000 * 41)
      expect(await screen.findByText('Todavía no recibimos la confirmación')).toBeInTheDocument()
      const before = calls.length
      await userEvent.click(screen.getByRole('button', { name: 'Volver a revisar' }))
      expect(await screen.findByText('Estamos confirmando tu pago…')).toBeInTheDocument()
      await vi.advanceTimersByTimeAsync(3100)
      expect(calls.length).toBeGreaterThan(before)
    } finally {
      vi.useRealTimers()
    }
  })

  it('no subscription, or one that ended, means that no charge was made', async () => {
    stubApi()
    const view = renderAt('/planes/regreso', <PaymentReturnPage />)
    expect(await screen.findByText('No se realizó ningún cobro')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a Planes' })).toBeInTheDocument()
    view.unmount()

    current = state({ subscription: info({ status: 'ended', endedAt: '2027-11-01T12:00:00' }) })
    stubApi()
    renderAt('/planes/regreso', <PaymentReturnPage />)
    expect(await screen.findByText('No se realizó ningún cobro')).toBeInTheDocument()
  })

  it('when the server cannot be read it says that nothing was charged from here and offers to try again', async () => {
    stubApi()
    writes['GET /accounts/a1/subscription'] = { status: 500, body: {} }
    renderAt('/planes/regreso', <PaymentReturnPage />)
    expect(await screen.findByText('No pudimos revisar tu pago')).toBeInTheDocument()
    delete writes['GET /accounts/a1/subscription']
    await userEvent.click(screen.getByRole('button', { name: 'Volver a revisar' }))
    expect(await screen.findByText('No se realizó ningún cobro')).toBeInTheDocument()
  })
})

describe('FakeCheckoutPage', () => {
  it.each([
    ['Aprobar el pago', 'approve'],
    ['Rechazar el pago', 'reject'],
    ['Cancelar', 'cancel'],
  ])('«%s» asks the API\'s helper route and goes back to the return page', async (label, action) => {
    stubApi()
    renderAt('/planes/pago-de-prueba?sub=fake_1_abc', <FakeCheckoutPage />, '/planes/pago-de-prueba')
    await userEvent.click(screen.getByRole('button', { name: label }))
    expect(await screen.findByText('REGRESO')).toBeInTheDocument()
    expect(calls).toContainEqual({ method: 'POST', path: `/payments/fake/fake_1_abc/${action}` })
  })
})
