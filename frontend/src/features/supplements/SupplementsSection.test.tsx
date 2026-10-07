import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SupplementsSection } from './SupplementsSection'
import { TODAY, account, at, callsOf, dose, list, routine, stubApi } from './supplements.test-utils'

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/children/child-1']}>
        <Routes>
          <Route path="/children/:childId" element={<SupplementsSection childId="child-1" childName="Mateo" />} />
          <Route path="/children/:childId/suplementos/nueva" element={<div>NUEVA</div>} />
          <Route path="/suplementos/:routineId" element={<div>DETALLE</div>} />
          <Route path="/planes" element={<div>PLANES</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const ana = account()
const caregiver = account({ plan: 'free' }, { role: 'caregiver', plan: 'paid', readOnly: false, accountId: 'owner' })

function api(routines: ReturnType<typeof routine>[], over: Parameters<typeof list>[1] = {}, acc: unknown = ana) {
  return stubApi({
    'GET /accounts/me': { body: acc },
    'GET /children/child-1/routines': { body: list(routines, over) },
    'PATCH /routines/r1/doses/d1': { body: { id: 'd1', scheduledAt: at(8), taken: true, status: 'taken' } },
    'PATCH /routines/r1/doses/d2': { body: { id: 'd2', scheduledAt: at(14), taken: true, status: 'taken' } },
  })
}

describe('SupplementsSection', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TODAY)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('lists active routines first, then the paused and the finished, with the count', async () => {
    api([
      routine({ id: 'r1', name: 'Vitamina D' }),
      routine({ id: 'r2', name: 'Omega 3', status: 'paused', pausedAt: new Date(2026, 9, 2).toISOString(), doses: [] }),
      routine({ id: 'r3', name: 'Zinc', status: 'ended', endedAt: new Date(2026, 8, 30).toISOString(), doses: [], progress: { taken: 12, elapsed: 14, total: 14 } }),
    ])
    renderSection()

    expect(await screen.findByText('1 activa')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Suplementos' })).toBeInTheDocument()
    expect(screen.getByText('Activas')).toBeInTheDocument()
    expect(screen.getByText('Pausadas y terminadas')).toBeInTheDocument()
    expect(screen.getByText('Pausada desde el 2 oct. Mientras esté pausada no genera tomas ni avisos.')).toBeInTheDocument()
    expect(screen.getByText('Terminada el 30 sep · 12 de 14 tomas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Nueva rutina' })).toHaveAttribute('href', '/children/child-1/suplementos/nueva')
    // The dose of today shows who marked it.
    expect(screen.getByRole('button', { name: 'Toma de 08:00' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('por Ana, 08:05')).toBeInTheDocument()
  })

  it('says when the next dose is for a routine with nothing today', async () => {
    api([routine({ doses: [], nextDose: dose('d9', 9, { scheduledAt: at(9, 0, 7) }), period: 'weekdays', weekdays: [0, 2, 4], times: ['09:00'] })])
    renderSection()
    expect(await screen.findByText('Hoy no le toca. La siguiente es mañana, mié 7 oct, a las 09:00.')).toBeInTheDocument()
  })

  it('shows the progress of a routine with an end date and a one-dose count otherwise', async () => {
    api([
      routine({ id: 'r1', name: 'Probiótico', firstDate: '2026-10-02', endDate: '2026-10-20', progress: { taken: 12, elapsed: 13, total: 19 } }),
      routine({ id: 'r2', name: 'Hierro', progress: { taken: 24, elapsed: 26, total: 26 }, doses: [] }),
    ])
    renderSection()
    expect(await screen.findByText('Día 5 de 19')).toBeInTheDocument()
    expect(screen.getByText('24 tomas marcadas de 26')).toBeInTheDocument()
  })

  it('marks a dose with the routine endpoint', async () => {
    const mock = api([routine({ doses: [dose('d1', 8), dose('d2', 14, { status: 'pending' })] })])
    renderSection()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(await screen.findByRole('button', { name: 'Toma de 08:00' }))
    await waitFor(() => expect(callsOf(mock)).toContain('PATCH /routines/r1/doses/d1'))
  })

  it('invites a Tutor with no routines to create the first one', async () => {
    api([])
    renderSection()
    expect(await screen.findByRole('heading', { name: 'Aún no hay rutinas' })).toBeInTheDocument()
    expect(screen.getByText(/Si Mateo toma algo de forma regular/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Crear la primera rutina' })).toHaveAttribute('href', '/children/child-1/suplementos/nueva')
    expect(screen.queryByRole('link', { name: '+ Nueva rutina' })).not.toBeInTheDocument()
  })

  it('shows the plan card instead of creating on the free plan, and it goes to the plans', async () => {
    api([], { paidPlan: false }, account({ plan: 'free' }))
    renderSection()
    expect(await screen.findByRole('heading', { name: 'Rutinas de suplemento' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Aún no hay rutinas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Crear la primera rutina' })).not.toBeInTheDocument()
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('link', { name: 'Ver el plan completo →' }))
    expect(await screen.findByText('PLANES')).toBeInTheDocument()
  })

  it('keeps showing and letting mark what was created if the plan lapsed, without offering to create', async () => {
    api([routine()], { paidPlan: false }, account({ plan: 'free' }))
    renderSection()
    expect(await screen.findByRole('button', { name: 'Toma de 08:00' })).toBeInTheDocument()
    expect(screen.getByText('Plan completo')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '+ Nueva rutina' })).not.toBeInTheDocument()
  })

  it('explains the cap of active routines instead of offering another one', async () => {
    api([routine()], { activeCount: 10 })
    renderSection()
    const status = await screen.findByRole('status')
    expect(within(status).getByText('Ya tienes 10 rutinas activas')).toBeInTheDocument()
    expect(within(status).getByText(/pausa o finaliza una/)).toBeInTheDocument()
    expect(within(status).getByRole('link', { name: 'Ir a las rutinas activas' })).toHaveAttribute('href', '#suplementos-activas')
    expect(screen.queryByRole('link', { name: '+ Nueva rutina' })).not.toBeInTheDocument()
  })

  it('shows a Caregiver the routines and says who creates them, without any way to create', async () => {
    api([routine()], {}, caregiver)
    renderSection()
    expect(await screen.findByText('Las rutinas las crea y edita un Tutor. Tú puedes marcar tomas y elegir tus avisos.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '+ Nueva rutina' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toma de 08:00' })).toBeInTheDocument()
  })

  it('does not invite a Caregiver to create when there are no routines', async () => {
    api([], {}, caregiver)
    renderSection()
    expect(await screen.findByRole('heading', { name: 'Aún no hay rutinas' })).toBeInTheDocument()
    expect(screen.getByText(/Un Tutor puede registrar/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Crear la primera rutina' })).not.toBeInTheDocument()
  })

  it('opens the routine from its name and from "Ver rutina"', async () => {
    api([routine({ name: 'Omega 3 con vitaminas A, C y E en jarabe sabor naranja' })])
    renderSection()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(await screen.findByRole('link', { name: /Ver rutina Omega 3/ }))
    expect(await screen.findByText('DETALLE')).toBeInTheDocument()
  })

  it('says it could not load, and while loading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string) => (String(input).includes('/accounts/me') ? { ok: true, status: 200, json: async () => ana } : { ok: false, status: 500, json: async () => ({}) })))
    renderSection()
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
    expect(await screen.findByText('No se pudieron cargar los suplementos.')).toBeInTheDocument()
  })
})
