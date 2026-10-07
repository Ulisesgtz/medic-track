import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PlansPage } from './PlansPage'
import { PlanTarjeta } from './PlanTarjeta'
import { PlanAvisoCompacto } from './PlanAvisoCompacto'
import { FREE_ITEMS, FULL_ITEMS, LIMIT_MOTIVES, PAYMENT_AVAILABLE, PLAN_PRICE, SOON_ITEMS, planStanding } from './planCopy'
import { ChildrenSidebar } from '../home/ChildrenSidebar'

// specs/034: the plans screen, its cards, the compact notice and who is on which plan.

const base = {
  id: 'a1', firstName: 'Ana', lastName: 'Morales', email: 'ana@example.com', countryCode: null, stateCode: null, plan: 'free',
  children: [{ id: 'k1', firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14', height: null, weight: null }],
}
const guestOf = (plan: string) => ({ ...base, family: { role: 'caregiver', ownerAccountId: 'o1', ownerName: 'Ana Morales', plan, readOnly: plan !== 'paid' } })

function stub(account: unknown, desktop = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: desktop && Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity) <= 1280,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string) => ({
    ok: true,
    status: 200,
    json: async () => (String(input).includes('/routines') ? { routines: [], activeCount: 0, limit: 10, paidPlan: true, noticeSeen: true } : account),
  })))
}

function renderPlans(ui: React.ReactElement = <PlansPage />, path = '/planes') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/planes" element={ui} />
          <Route path="/home" element={<div>HOME</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('planStanding', () => {
  it('is the account\'s own plan when paid, the paid family\'s for a guest, and free otherwise', () => {
    expect(planStanding(undefined)).toEqual({ plan: 'free' })
    expect(planStanding({ plan: 'free' })).toEqual({ plan: 'free' })
    expect(planStanding({ plan: 'paid' })).toEqual({ plan: 'full' })
    expect(planStanding(guestOf('paid') as never)).toEqual({ plan: 'full', includedBy: 'Ana' })
    expect(planStanding(guestOf('free') as never)).toEqual({ plan: 'free' })
  })
})

describe('the words of the plans', () => {
  it('has the price, the lists and the three rows of every motive', () => {
    expect(PLAN_PRICE).toBe('MX$499')
    expect(FREE_ITEMS).toHaveLength(8)
    expect(FULL_ITEMS).toHaveLength(8)
    expect(SOON_ITEMS).toHaveLength(5)
    for (const motive of Object.values(LIMIT_MOTIVES)) expect(motive.rows).toHaveLength(3)
  })

  it('never advises, discounts or presses (Principio I)', () => {
    const all = [...FREE_ITEMS, ...FULL_ITEMS, ...SOON_ITEMS, ...Object.values(LIMIT_MOTIVES).flatMap((m) => [m.title, m.line, ...m.rows.flatMap((r) => [r.label, r.free, r.full])])].join(' ')
    expect(all).not.toMatch(/ahorra|descuento|oferta|últim[oa]s? (día|hora)|recomend|debes|evita/i)
  })

  it('has the payment off until Mercado Pago exists', () => {
    expect(PAYMENT_AVAILABLE).toBe(false)
  })
})

describe('PlanTarjeta', () => {
  it('shows name, price, period and what it includes with the lead', () => {
    render(<PlanTarjeta id="p" name="Plan completo" price="MX$499" period="al año" lead="Todo lo de Gratis, más:" items={['Uno', 'Dos']} />)
    const card = screen.getByRole('article', { name: 'Plan completo' })
    expect(within(card).getByText('MX$499')).toBeInTheDocument()
    expect(within(card).getByText('al año')).toBeInTheDocument()
    expect(within(card).getByText('Todo lo de Gratis, más:')).toBeInTheDocument()
    expect(within(card).getAllByRole('listitem')).toHaveLength(2)
    expect(within(card).queryByText('Tu plan actual')).not.toBeInTheDocument()
    expect(within(card).queryByRole('button')).not.toBeInTheDocument()
  })

  it('marks the current plan and says who includes it', () => {
    render(<PlanTarjeta id="p" name="Plan completo" price="MX$499" period="al año" items={['Uno']} current sub="Incluido por la familia de Ana." />)
    expect(screen.getByText('Tu plan actual')).toBeInTheDocument()
    expect(screen.getByText('Incluido por la familia de Ana.')).toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveClass('border-ink')
  })

  it('the «Pronto» button is disabled for assistive tech, does nothing and explains itself', () => {
    render(<PlanTarjeta id="p" name="Plan completo" price="MX$499" period="al año" items={['Uno']} pronto />)
    const button = screen.getByRole('button', { name: /Contratar plan completo/ })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveTextContent('Pronto')
    expect(button).toHaveAccessibleDescription('El pago con tarjeta todavía no está disponible. Mientras tanto, tu plan sigue igual.')
  })
})

describe('PlanAvisoCompacto', () => {
  it('says what the feature is, the price and links to the plans, with no solid button', () => {
    renderPlans(<PlanAvisoCompacto title="Compartir con tu familia" text="Hasta 4 personas." />, '/planes')
    expect(screen.getByRole('heading', { name: 'Compartir con tu familia' })).toBeInTheDocument()
    expect(screen.getByText(/MX\$499 al año/)).toBeInTheDocument()
    expect(screen.getByText('· para toda la familia')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver el plan completo →' })).toHaveAttribute('href', '/planes')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('PlansPage', () => {
  it('a free account: Gratis is the current plan and the full plan has the «Pronto» button', async () => {
    stub(base)
    renderPlans()
    expect(await screen.findByRole('heading', { name: 'Planes', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Un plan gratuito y un plan completo anual. Una suscripción cubre a toda la familia.')).toBeInTheDocument()
    const free = screen.getByRole('article', { name: 'Gratis' })
    const full = screen.getByRole('article', { name: 'Plan completo' })
    expect(within(free).getByText('Tu plan actual')).toBeInTheDocument()
    expect(within(free).getByText('MX$0')).toBeInTheDocument()
    expect(within(full).queryByText('Tu plan actual')).not.toBeInTheDocument()
    expect(within(full).getByText('MX$499')).toBeInTheDocument()
    expect(within(full).getByRole('button', { name: /Contratar plan completo/ })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('link', { name: '← Tus hijos' })).toHaveAttribute('href', '/home')
  })

  it('shows what is kept, the privacy sentence and «Próximamente» apart, in every state', async () => {
    stub(base)
    renderPlans()
    expect(await screen.findByRole('heading', { name: 'Lo registrado se conserva' })).toBeInTheDocument()
    expect(screen.getByText(/todo lo que registraste se sigue viendo y las tomas se siguen marcando/)).toBeInTheDocument()
    expect(screen.getByText('Tus datos de salud no se venden ni se usan para anuncios.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Próximamente' })).toBeInTheDocument()
    expect(screen.getByText('Ideas en las que trabajamos, sin fecha. No están incluidas hoy en ningún plan.')).toBeInTheDocument()
    SOON_ITEMS.forEach((item) => expect(screen.getByText(item)).toBeInTheDocument())
  })

  it('a paid account: the full plan is the current one and there is nothing to buy', async () => {
    stub({ ...base, plan: 'paid' })
    renderPlans()
    const full = await screen.findByRole('article', { name: 'Plan completo' })
    await waitFor(() => expect(within(full).getByText('Tu plan actual')).toBeInTheDocument())
    expect(within(full).queryByRole('button')).not.toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Gratis' })).queryByText('Tu plan actual')).not.toBeInTheDocument()
  })

  it('a guest of a paid family: the full plan is theirs, included by the owner, with nothing to pay', async () => {
    stub(guestOf('paid'))
    renderPlans()
    const full = await screen.findByRole('article', { name: 'Plan completo' })
    await waitFor(() => expect(within(full).getByText('Tu plan actual')).toBeInTheDocument())
    expect(within(full).getByText('Incluido por la familia de Ana. No pagas nada: lo cubre su suscripción.')).toBeInTheDocument()
    expect(within(full).queryByRole('button')).not.toBeInTheDocument()
  })

  it('a guest whose family stopped paying is back on Gratis', async () => {
    stub(guestOf('free'))
    renderPlans()
    expect(within(await screen.findByRole('article', { name: 'Gratis' })).getByText('Tu plan actual')).toBeInTheDocument()
  })

  it('phone: the full plan comes first; web: Gratis first, inside the sidebar', async () => {
    stub(base)
    const phone = renderPlans()
    await screen.findByRole('article', { name: 'Plan completo' })
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-labelledby'))).toEqual(['plan-full', 'plan-free'])
    expect(screen.queryByRole('navigation', { name: 'Personal' })).not.toBeInTheDocument()
    phone.unmount()

    stub(base, true)
    renderPlans()
    await screen.findByRole('article', { name: 'Plan completo' })
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-labelledby'))).toEqual(['plan-free', 'plan-full'])
    expect(await screen.findByRole('navigation', { name: 'Personal' })).toBeInTheDocument()
  })
})

describe('the sidebar link to the plans', () => {
  it('is in the footer, under the account, and current on /planes', async () => {
    stub({ ...base, plan: 'paid' }, true)
    renderPlans(<ChildrenSidebar />, '/planes')
    const link = await screen.findByRole('link', { name: 'Planes' })
    expect(link).toHaveAttribute('href', '/planes')
    expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('is not marked as current elsewhere', async () => {
    stub(base, true)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/home']}>
          <ChildrenSidebar />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const link = await screen.findByRole('link', { name: 'Planes' })
    expect(link).not.toHaveAttribute('aria-current')
  })
})
