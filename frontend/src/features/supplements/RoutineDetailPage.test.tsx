import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RoutineDetailPage } from './RoutineDetailPage'
import { TODAY, account, at, callsOf, dose, routine, stubApi, stubWeb } from './supplements.test-utils'

function renderDetail(path = '/suplementos/r1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/suplementos/:routineId" element={<RoutineDetailPage />} />
          <Route path="/suplementos/:routineId/editar" element={<div>EDITAR</div>} />
          <Route path="/children/:childId" element={<div>HIJO</div>} />
          <Route path="/home" element={<div>HOME</div>} />
          <Route path="/planes" element={<div>PLANES</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const active = routine({
  id: 'r1',
  name: 'Probiótico',
  note: 'Disuelto en agua tibia.',
  period: 'interval',
  times: [],
  intervalHours: 8,
  firstTime: '06:00',
  firstDate: '2026-10-02',
  endDate: '2026-10-20',
  progress: { taken: 12, elapsed: 13, total: 19 },
  doses: [
    dose('a', 6, { taken: true, takenBy: { name: 'Rosa', at: at(6, 10), mine: false } }),
    dose('b', 14, { status: 'due' }),
    dose('c', 22, { status: 'pending' }),
    dose('p5', 6, { scheduledAt: at(6, 0, 5), taken: true }),
    dose('p4', 6, { scheduledAt: at(6, 0, 4), taken: false, status: 'unregistered' }),
  ],
})

const paused = routine({ id: 'r1', name: 'Omega 3', status: 'paused', pausedAt: new Date(2026, 9, 2).toISOString(), doses: [], progress: { taken: 24, elapsed: 26, total: 26 } })
const ended = routine({
  id: 'r1',
  name: 'Zinc',
  status: 'ended',
  endedAt: new Date(2026, 8, 30, 20).toISOString(),
  firstDate: '2026-09-17',
  endDate: '2026-09-30',
  doses: [],
  progress: { taken: 12, elapsed: 14, total: 14 },
})

const caregiverAccount = account({ plan: 'free' }, { role: 'caregiver', plan: 'paid', readOnly: false, accountId: 'owner' })

function api(r: ReturnType<typeof routine>, extra: Parameters<typeof stubApi>[0] = {}, acc: unknown = account()) {
  return stubApi({
    'GET /accounts/me': { body: acc },
    'GET /routines/r1': { body: r },
    'PATCH /routines/r1/doses/b': { body: dose('b', 14, { taken: true }) },
    'PATCH /routines/r1/doses/p5': { body: dose('p5', 6, { taken: false }) },
    'POST /routines/r1/pause': { body: { ...r, status: 'paused' } },
    'POST /routines/r1/resume': { body: { ...r, status: 'active' } },
    'POST /routines/r1/finish': { body: { ...r, status: 'ended' } },
    'PUT /routines/r1/my-reminders': { body: { myReminders: false } },
    ...extra,
  })
}

describe('RoutineDetailPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TODAY)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

  it('shows an active routine: its data, the progress, the month and the day', async () => {
    api(active)
    renderDetail()
    expect(await screen.findByRole('heading', { name: 'Probiótico', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('Suplemento · Mateo Morales')).toBeInTheDocument()
    expect(screen.getByText('Activa')).toBeInTheDocument()
    expect(screen.getByText('Cada 8 horas · 06:00, 14:00 y 22:00')).toBeInTheDocument()
    expect(screen.getByText('Primera toma el 2 oct 2026, 06:00 · última el 20 oct 2026')).toBeInTheDocument()
    expect(screen.getByText('Disuelto en agua tibia.')).toBeInTheDocument()
    expect(screen.getByText('Ana, el 1 oct')).toBeInTheDocument()
    expect(screen.getByText('Día 5 de 19')).toBeInTheDocument()
    expect(screen.getByText('octubre 2026')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tomas del 6 de octubre' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '6 de octubre: 1 de 3 tomas marcadas' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('por Rosa, 06:10')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Mateo' })).toHaveAttribute('href', '/children/child-1')
  })

  it('marks a dose of the day and takes back the mark of another day', async () => {
    const mock = api(active)
    renderDetail()
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Toma de 14:00' }))
    await waitFor(() => expect(callsOf(mock)).toContain('PATCH /routines/r1/doses/b'))

    await user.click(screen.getByRole('button', { name: '5 de octubre: 1 de 1 toma marcada' }))
    expect(screen.getByRole('heading', { name: 'Tomas del 5 de octubre' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Toma de 06:00' }))
    await waitFor(() => expect(callsOf(mock)).toContain('PATCH /routines/r1/doses/p5'))
  })

  it('says a day has no doses and leaves empty days as plain numbers', async () => {
    api(active)
    renderDetail()
    const user = setup()
    await user.click(await screen.findByRole('button', { name: '4 de octubre: 0 de 1 toma marcada' }))
    expect(screen.getByRole('heading', { name: 'Tomas del 4 de octubre' })).toBeInTheDocument()
    // The 3rd has no doses: not a button.
    expect(screen.queryByRole('button', { name: /^3 de octubre/ })).not.toBeInTheDocument()
    expect(screen.getAllByText('3').length).toBeGreaterThan(0)
  })

  it('moves between months inside the routine and not before its first month', async () => {
    const mock = api(active)
    renderDetail()
    const user = setup()
    const prev = await screen.findByRole('button', { name: 'Mes anterior' })
    expect(prev).toBeDisabled()
    // A routine with an end date in October does not go past October.
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
    expect(callsOf(mock).filter((c) => c === 'GET /routines/r1').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: '5 de octubre: 1 de 1 toma marcada' }))
    expect(screen.getByRole('heading', { name: 'Tomas del 5 de octubre' })).toBeInTheDocument()
  })

  it('lets a routine without an end date go one month ahead and back', async () => {
    const open = routine({ id: 'r1', name: 'Vitamina D', endDate: null, doses: [dose('a', 8)] })
    const mock = api(open)
    renderDetail()
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Mes siguiente' }))
    expect(await screen.findByText('noviembre 2026')).toBeInTheDocument()
    expect(callsOf(mock).filter((c) => c === 'GET /routines/r1').length).toBeGreaterThan(1)
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(await screen.findByText('octubre 2026')).toBeInTheDocument()
  })

  it('pauses without asking, and says so when it fails', async () => {
    const mock = api(active)
    renderDetail()
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Pausar' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /routines/r1/pause'))

    api(active, { 'POST /routines/r1/pause': { status: 409, body: { error: 'routine_not_active' } } })
    renderDetail()
    await user.click((await screen.findAllByRole('button', { name: 'Pausar' }))[1])
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar. Inténtalo de nuevo.')
  })

  it('opens the edit page', async () => {
    api(active)
    renderDetail()
    await setup().click(await screen.findByRole('link', { name: 'Editar' }))
    expect(await screen.findByText('EDITAR')).toBeInTheDocument()
  })

  it('finishes only after the neutral confirmation, which keeps what was marked', async () => {
    const mock = api(active)
    renderDetail()
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Finalizar rutina' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: '¿Finalizar Probiótico?' })).toBeInTheDocument()
    expect(within(dialog).getByText('Desde ahora no se crean más tomas ni avisos para nadie de la familia. Las de hoy que aún no llegan dejan de aparecer.')).toBeInTheDocument()
    expect(within(dialog).getByText(/Las 12 tomas marcadas, con quién las marcó y a qué hora/)).toBeInTheDocument()
    expect(within(dialog).getByText(/No se puede reanudar/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus()

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(callsOf(mock)).not.toContain('POST /routines/r1/finish')

    await user.click(screen.getByRole('button', { name: 'Finalizar rutina' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Finalizar rutina' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /routines/r1/finish'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('says it could not finish and keeps the dialog open', async () => {
    api(active, { 'POST /routines/r1/finish': { status: 500, body: {} } })
    renderDetail()
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Finalizar rutina' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Finalizar rutina' }))
    expect(await within(await screen.findByRole('dialog')).findByRole('alert')).toHaveTextContent('No se pudo completar')
  })

  it('shows a paused routine with Reanudar as the main action and no reminders card', async () => {
    const mock = api(paused)
    renderDetail()
    const user = setup()
    expect(await screen.findByText('Pausada desde el 2 oct. Mientras esté pausada no se crean tomas ni avisos. Lo marcado se conserva.')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pausar' })).not.toBeInTheDocument()
    expect(screen.getByText('En pausa: este día no tiene tomas.')).toBeInTheDocument()
    expect(screen.getByText('24 tomas')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reanudar' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /routines/r1/resume'))
  })

  it('opens the plan notice when resuming is not allowed by the plan, and says the cap in words', async () => {
    api(paused, { 'POST /routines/r1/resume': { status: 422, body: { error: 'freemium_consultation_limit_exceeded', reason: 'supplements' } } })
    renderDetail()
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Reanudar' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Suplementos con recordatorio')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Ver planes' }))
    expect(await screen.findByText('PLANES')).toBeInTheDocument()
  })

  it('tells that the child already has the maximum of active routines', async () => {
    api(paused, { 'POST /routines/r1/resume': { status: 422, body: { error: 'routine_limit_exceeded', limit: 10 } } })
    renderDetail()
    await setup().click(await screen.findByRole('button', { name: 'Reanudar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('máximo de rutinas activas')
  })

  it('shows a finished routine as a record only', async () => {
    api(ended)
    renderDetail()
    expect(await screen.findByText('Terminada el 30 sep · 12 de 14 tomas. Para volver a registrarla, crea una rutina nueva.')).toBeInTheDocument()
    expect(screen.getByText('12 de 14')).toBeInTheDocument()
    expect(screen.getByText('Del 17 al 30 sep 2026')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pausar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reanudar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Finalizar rutina' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Un Tutor puede pausar/)).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('shows a Caregiver the routine and only their own reminders', async () => {
    const mock = api(active, {}, caregiverAccount)
    renderDetail()
    const user = setup()
    expect(await screen.findByText('Un Tutor puede pausar, editar o finalizar esta rutina.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pausar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Finalizar rutina' })).not.toBeInTheDocument()
    const toggle = screen.getByRole('switch', { name: 'Avisos de esta rutina para ti' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    await user.click(toggle)
    await waitFor(() => expect(callsOf(mock)).toContain('PUT /routines/r1/my-reminders'))
    expect(JSON.parse(mock.mock.calls.find(([, init]) => init?.method === 'PUT')![1].body)).toEqual({ enabled: false })
    // The Caregiver can mark but not take back a mark that is not theirs.
    expect(screen.getByRole('button', { name: 'Toma de 06:00' })).toBeDisabled()
  })

  it('shows the reminders as off when the person turned them off, and says if saving failed', async () => {
    api(routine({ ...active, myReminders: false }), { 'PUT /routines/r1/my-reminders': { status: 500, body: {} } })
    renderDetail()
    const toggle = await screen.findByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await setup().click(toggle)
    expect(await screen.findByText('No se pudo guardar tu elección. Inténtalo de nuevo.')).toBeInTheDocument()
  })

  it('on the free plan a Tutor can still pause and finish, not edit', async () => {
    api(routine({ ...active, canEdit: false }), {}, account({ plan: 'free' }))
    renderDetail()
    expect(await screen.findByRole('button', { name: 'Pausar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finalizar rutina' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
  })

  it('says when the routine is not there or could not load', async () => {
    api(active, { 'GET /routines/r1': { status: 403, body: { error: 'forbidden' } } })
    renderDetail()
    expect(await screen.findByText(/No se encontró esta rutina\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/home')
  })

  it('says it could not load on any other failure, and while loading', async () => {
    api(active, { 'GET /routines/r1': { status: 500, body: {} } })
    renderDetail()
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
    expect(await screen.findByText(/No se pudo cargar la rutina\./)).toBeInTheDocument()
  })

  it('has the web design: data and actions at the left, progress and calendar at the right', async () => {
    stubWeb(true)
    api(active)
    renderDetail()
    expect(await screen.findByRole('heading', { name: 'Probiótico', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Progreso')).toBeInTheDocument()
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('starts on the first day when the routine has not begun and on the last when it already ended', async () => {
    api(routine({ firstDate: '2026-10-10', doses: [dose('f', 8, { scheduledAt: at(8, 0, 10) })] }))
    renderDetail()
    expect(await screen.findByRole('heading', { name: 'Tomas del 10 de octubre' })).toBeInTheDocument()
  })

  it('shows the last day of a routine whose end date passed', async () => {
    api(routine({ firstDate: '2026-09-01', endDate: '2026-09-20', status: 'active', doses: [] }))
    renderDetail()
    expect(await screen.findByRole('heading', { name: 'Tomas del 20 de septiembre' })).toBeInTheDocument()
  })
})
