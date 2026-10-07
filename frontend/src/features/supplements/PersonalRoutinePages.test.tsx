import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RoutineDetailPage } from './RoutineDetailPage'
import { RoutineFormPage } from './RoutineFormPage'
import { TODAY, account, at, callsOf, dose, routine, stubApi, stubWeb } from './supplements.test-utils'
import type { Routine } from './types'

// specs/033, part 3: the detail, the form and «Avisos» of a routine that is the person's own (no child).

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/suplementos/:routineId" element={<RoutineDetailPage />} />
          <Route path="/suplementos/:routineId/editar" element={<RoutineFormPage />} />
          <Route path="/mis-suplementos/nueva" element={<RoutineFormPage personal />} />
          <Route path="/mis-suplementos" element={<div>MIS SUPLEMENTOS</div>} />
          <Route path="/planes" element={<div>PLANES</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const mine = (over: Partial<Routine> = {}) =>
  routine({
    childId: null,
    name: 'Omega 3',
    doses: [dose('d1', 8, { taken: true, takenBy: { name: 'Ana', at: at(8, 5), mine: true } }), dose('d2', 14, { status: 'due' })],
    ...over,
  })

function api(r: Routine, extra: Parameters<typeof stubApi>[0] = {}, acc: unknown = account()) {
  return stubApi({
    'GET /accounts/me': { body: acc },
    'GET /routines/r1': { body: r },
    'PATCH /routines/r1/doses/d2': { body: dose('d2', 14, { taken: true }) },
    'POST /routines/r1/pause': { body: { ...r, status: 'paused' } },
    'POST /routines/r1/resume': { body: { ...r, status: 'active' } },
    'POST /routines/r1/finish': { body: { ...r, status: 'ended' } },
    'PUT /routines/r1/my-reminders': { body: { myReminders: false } },
    'POST /accounts/a1/routines': { status: 201, body: mine({ id: 'new1' }) },
    'PATCH /routines/r1': { body: r },
    'GET /routines/new1': { body: mine({ id: 'new1' }) },
    ...extra,
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

describe('RoutineDetailPage — a personal routine', () => {
  it.each([
    ['phone', false],
    ['web', true],
  ])('%s: belongs to «Mis suplementos», has «Avisos» and no family wording, and marks without a name', async (_name, web) => {
    stubWeb(web)
    api(mine())
    renderAt('/suplementos/r1')
    expect(await screen.findByRole('heading', { name: 'Omega 3', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Mis suplementos' })).toHaveAttribute('href', '/mis-suplementos')
    expect(screen.getByText('Mis suplementos', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Avisos' })).toBeInTheDocument()
    expect(screen.getByText('Se activan en cada dispositivo por separado.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Avisos de esta rutina' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByText(/Cada persona de la familia/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Un Tutor puede/)).not.toBeInTheDocument()
    expect(screen.getAllByText('a las 08:05').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/suplementos/r1/editar')
  })

  it('pauses, finishes with its own wording and turns its reminders off', async () => {
    const mock = api(mine())
    renderAt('/suplementos/r1')
    const user = setup()
    await user.click(await screen.findByRole('switch', { name: 'Avisos de esta rutina' }))
    await waitFor(() => expect(callsOf(mock)).toContain('PUT /routines/r1/my-reminders'))
    await user.click(screen.getByRole('button', { name: 'Pausar' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /routines/r1/pause'))
    await user.click(screen.getByRole('button', { name: 'Finalizar rutina' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Desde ahora no se crean más tomas ni avisos. Las de hoy que aún no llegan dejan de aparecer.')).toBeInTheDocument()
    expect(within(dialog).queryByText(/nadie de la familia/)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Finalizar rutina' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /routines/r1/finish'))
  })

  it('with the plan lapsed keeps the marks and offers only «Finalizar rutina», and says why', async () => {
    api(mine({ canEdit: false }), {}, account({ plan: 'free' }))
    renderAt('/suplementos/r1')
    expect(await screen.findByText('Con el plan gratuito puedes ver y marcar las tomas. Para editar, pausar o reanudar se necesita el plan completo.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pausar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reanudar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finalizar rutina' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toma de 14:00' })).toBeEnabled()
  })

  it('words the cap of a paused personal routine as the person\'s own', async () => {
    api(mine({ status: 'paused', pausedAt: new Date(2026, 9, 2).toISOString(), doses: [] }), {
      'POST /routines/r1/resume': { status: 422, body: { error: 'routine_limit_exceeded', limit: 10 } },
    })
    renderAt('/suplementos/r1')
    await setup().click(await screen.findByRole('button', { name: 'Reanudar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya tienes el máximo de rutinas activas. Pausa o finaliza una para poder reanudar esta.')
  })

  it('a routine of a child keeps its own wording and sidebar child', async () => {
    api(routine({ id: 'r1', childId: 'child-1', name: 'Vitamina D' }))
    renderAt('/suplementos/r1')
    expect(await screen.findByRole('heading', { name: 'Tus avisos' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '← Mis suplementos' })).not.toBeInTheDocument()
  })
})

describe('RoutineFormPage — a personal routine', () => {
  const body = (mock: ReturnType<typeof vi.fn>, method = 'POST') => JSON.parse(mock.mock.calls.find(([, init]) => init?.method === method)![1].body)

  it('creates it through the account, says it is personal and goes to its detail', async () => {
    const mock = api(mine())
    renderAt('/mis-suplementos/nueva')
    const user = setup()
    expect(await screen.findByRole('heading', { name: 'Nueva rutina' })).toBeInTheDocument()
    expect(screen.getByText('Es una rutina personal: solo tú la ves y solo a ti te llegan sus avisos.')).toBeInTheDocument()
    expect(screen.getByText('Solo la ves tú.')).toBeInTheDocument()
    expect(screen.getByText('Mis suplementos', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('placeholder', 'Como lo llaman en casa')
    await user.type(screen.getByLabelText('Nombre'), 'Omega 3')
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))
    expect(await screen.findByText('Se activan en cada dispositivo por separado.')).toBeInTheDocument()
    expect(callsOf(mock)).toContain('POST /accounts/a1/routines')
    expect(callsOf(mock)).not.toContain('POST /children/child-1/routines')
    expect(body(mock).name).toBe('Omega 3')
  })

  it('keeps what was typed and opens the plan notice when the server says the plan is not paid', async () => {
    api(mine(), { 'POST /accounts/a1/routines': { status: 422, body: { error: 'freemium_consultation_limit_exceeded', reason: 'supplements' } } })
    renderAt('/mis-suplementos/nueva')
    const user = setup()
    await user.type(await screen.findByLabelText('Nombre'), 'Omega 3')
    await user.click(screen.getByRole('button', { name: 'Guardar rutina' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Omega 3')
  })

  it('edits a personal routine with the personal note and goes back to its detail', async () => {
    const mock = api(mine())
    renderAt('/suplementos/r1/editar')
    const user = setup()
    expect(await screen.findByRole('heading', { name: 'Editar rutina' })).toBeInTheDocument()
    expect(await screen.findByRole('note')).toHaveTextContent('Es una rutina personal: solo tú la ves y solo a ti te llegan sus avisos. Los cambios cuentan desde la siguiente toma.')
    expect(screen.getByRole('link', { name: '← Omega 3' })).toHaveAttribute('href', '/suplementos/r1')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(callsOf(mock)).toContain('PATCH /routines/r1'))
  })

  it('leaving a new personal routine goes back to the section', async () => {
    api(mine())
    renderAt('/mis-suplementos/nueva')
    await setup().click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText('MIS SUPLEMENTOS')).toBeInTheDocument()
  })
})
