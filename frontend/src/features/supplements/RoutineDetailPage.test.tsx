import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RoutineDetailPage } from './RoutineDetailPage'
import { TODAY, account, activity, at, callsOf, dose, routine, stubApi, stubWeb } from './supplements.test-utils'

function renderDetail(path = '/suplementos/r1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/suplementos/:routineId" element={<RoutineDetailPage />} />
          <Route path="/actividades/:routineId" element={<RoutineDetailPage />} />
          <Route path="/suplementos/:routineId/editar" element={<div>EDITAR SUPLEMENTO</div>} />
          <Route path="/actividades/:routineId/editar" element={<div>EDITAR ACTIVIDAD</div>} />
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
  times: ['06:00', '14:00', '22:00'],
  firstDate: '2026-10-02',
  endDate: '2026-10-20',
  progress: { taken: 12, elapsed: 13, total: 19 },
  doses: [
    dose('a', 6, { taken: true, takenBy: { name: 'Rosa', at: at(6, 10), mine: false } }),
    dose('b', 14, { status: 'due' }),
    dose('c', 22, { status: 'pending' }),
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
    [`GET /routines/${r.id}`]: { body: r },
    'PATCH /routines/r1/doses/b': { body: dose('b', 14, { taken: true }) },
    'PATCH /routines/a1/doses/x10': { body: dose('x10', 10, { taken: false }) },
    'PATCH /routines/a1/doses/x9': { body: dose('x9', 9, { taken: false }) },
    'POST /routines/a1/done': { body: dose('x14', 14, { taken: true }) },
    'POST /routines/r1/pause': { body: { ...r, status: 'paused' } },
    'POST /routines/r1/resume': { body: { ...r, status: 'active' } },
    'POST /routines/r1/finish': { body: { ...r, status: 'ended' } },
    'PUT /routines/r1/my-reminders': { body: { myReminders: false } },
    ...extra,
  })
}

describe('RoutineDetailPage · suplemento', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TODAY)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

  it('shows an active supplement: the day card with its count, bar and doses, and the data — and no calendar', async () => {
    api(active)
    renderDetail()
    expect(await screen.findByRole('heading', { name: 'Probiótico', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('Suplemento · Mateo Morales')).toBeInTheDocument()
    expect(screen.getByText('Hoy · mar 6 oct')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
    expect(screen.getByText('1 de 3')).toBeInTheDocument()
    expect(screen.getByText('tomas hoy')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '1 de 3 tomas hoy' })).toBeInTheDocument()
    expect(screen.getByText('por Rosa, 06:10')).toBeInTheDocument()
    expect(screen.getByText('06:00, 14:00 y 22:00')).toBeInTheDocument()
    expect(screen.getByText('Primera toma el 2 oct 2026 · última el 20 oct 2026')).toBeInTheDocument()
    expect(screen.getByText('Disuelto en agua tibia.')).toBeInTheDocument()
    expect(screen.getByText('Ana, el 1 oct')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Mateo' })).toHaveAttribute('href', '/children/child-1')
    expect(screen.queryByRole('button', { name: 'Mes anterior' })).not.toBeInTheDocument()
    expect(screen.queryByText('octubre 2026')).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Tus avisos de este suplemento' })).toBeInTheDocument()
  })

  it('marks a dose of the day', async () => {
    const mock = api(active)
    renderDetail()
    await setup().click(await screen.findByRole('button', { name: 'Toma de 14:00' }))
    await waitFor(() => expect(callsOf(mock)).toContain('PATCH /routines/r1/doses/b'))
  })

  it('says when it does not go off today, or is paused', async () => {
    api(routine({ id: 'r1', doses: [], nextDose: dose('n', 9, { scheduledAt: at(9, 0, 7) }) }))
    renderDetail()
    expect(await screen.findByText('Hoy no le toca. La siguiente es mañana, mié 7 oct, a las 09:00.')).toBeInTheDocument()
  })

  it('says there are no doses today when there is not even a next one', async () => {
    api(routine({ id: 'r1', doses: [] }))
    renderDetail()
    expect(await screen.findByText('Hoy no hay tomas.')).toBeInTheDocument()
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

  it('opens the edit page of its own kind', async () => {
    api(active)
    renderDetail()
    await setup().click(await screen.findByRole('link', { name: 'Editar' }))
    expect(await screen.findByText('EDITAR SUPLEMENTO')).toBeInTheDocument()
  })

  it('finishes only after the neutral confirmation, which keeps what was marked', async () => {
    const mock = api(active)
    renderDetail()
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Finalizar suplemento' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: '¿Finalizar Probiótico?' })).toBeInTheDocument()
    expect(within(dialog).getByText('Desde hoy no se crean más tomas ni avisos para nadie de la familia. Las de hoy que no estén marcadas dejan de aparecer.')).toBeInTheDocument()
    expect(within(dialog).getByText('Cada toma marcada, con quién la marcó y a qué hora.')).toBeInTheDocument()
    expect(within(dialog).getByText(/No se puede reanudar; para volver a registrarlo, agrega un suplemento nuevo/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus()

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(callsOf(mock)).not.toContain('POST /routines/r1/finish')

    await user.click(screen.getByRole('button', { name: 'Finalizar suplemento' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Finalizar suplemento' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /routines/r1/finish'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('says it could not finish and keeps the dialog open', async () => {
    api(active, { 'POST /routines/r1/finish': { status: 500, body: {} } })
    renderDetail()
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Finalizar suplemento' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Finalizar suplemento' }))
    expect(await within(await screen.findByRole('dialog')).findByRole('alert')).toHaveTextContent('No se pudo completar')
  })

  it('shows a paused supplement with Reanudar as the main action and no reminders card', async () => {
    const mock = api(paused)
    renderDetail()
    const user = setup()
    expect(await screen.findByText('Pausado desde el 2 oct. Mientras esté pausado no se crean tomas ni avisos. Lo marcado se conserva.')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pausar' })).not.toBeInTheDocument()
    expect(screen.getByText('En pausa: hoy no hay tomas.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reanudar' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /routines/r1/resume'))
  })

  it('opens the plan notice when resuming is not allowed by the plan, and says the cap in words', async () => {
    api(paused, { 'POST /routines/r1/resume': { status: 422, body: { error: 'freemium_consultation_limit_exceeded', reason: 'supplements' } } })
    renderDetail()
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Reanudar' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Suplementos y actividades' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('link', { name: 'Ver el plan completo' }))
    expect(await screen.findByText('PLANES')).toBeInTheDocument()
  })

  it('tells that the child already has the maximum of active supplements', async () => {
    api(paused, { 'POST /routines/r1/resume': { status: 422, body: { error: 'routine_limit_exceeded', limit: 10 } } })
    renderDetail()
    await setup().click(await screen.findByRole('button', { name: 'Reanudar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Este hijo ya tiene el máximo de suplementos activos. Pausa o finaliza uno para poder reanudar este.')
  })

  it('shows a finished supplement as a record only', async () => {
    api(ended)
    renderDetail()
    expect(await screen.findByText('Terminado el 30 sep · 12 de 14 tomas. Para volver a registrarlo, agrega un suplemento nuevo.')).toBeInTheDocument()
    expect(screen.getByText('Del 17 al 30 sep 2026')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pausar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reanudar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Finalizar suplemento' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Un Tutor puede pausar/)).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('shows a Caregiver the supplement and only their own reminders', async () => {
    const mock = api(active, {}, caregiverAccount)
    renderDetail()
    const user = setup()
    expect(await screen.findByText('Un Tutor puede pausar, editar o finalizar este suplemento.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pausar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Finalizar suplemento' })).not.toBeInTheDocument()
    const toggle = screen.getByRole('switch', { name: 'Tus avisos de este suplemento' })
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
    expect(screen.getByRole('button', { name: 'Finalizar suplemento' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
  })

  it('says when it is not there or could not load', async () => {
    api(active, { 'GET /routines/r1': { status: 403, body: { error: 'forbidden' } } })
    renderDetail()
    expect(await screen.findByText(/No se encontró este suplemento\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/home')
  })

  it('says it could not load on any other failure, and while loading', async () => {
    api(active, { 'GET /routines/r1': { status: 500, body: {} } })
    renderDetail()
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
    expect(await screen.findByText(/No se pudo cargar el suplemento\./)).toBeInTheDocument()
  })

  it('has the web design: the day card and the reminders at the left, the data at the right', async () => {
    stubWeb(true)
    api(active)
    renderDetail()
    expect(await screen.findByRole('heading', { name: 'Probiótico', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('switch')).toBeInTheDocument()
    expect(screen.getByText('Hoy · mar 6 oct')).toBeInTheDocument()
  })

  it('takes an activity opened as a supplement to its own address', async () => {
    api(activity())
    renderDetail('/suplementos/a1')
    expect(await screen.findByRole('heading', { name: 'Tomar agua', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Cada hora, de 08:00 a 20:00')).toBeInTheDocument()
  })
})

describe('RoutineDetailPage · actividad', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TODAY)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const open = '/actividades/a1'

  it('shows the count, the bar, «Próxima» and «Última marcada», and the data — with no chips and no calendar', async () => {
    api(activity())
    renderDetail(open)
    expect(await screen.findByRole('heading', { name: 'Tomar agua', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('Actividad · Mateo Morales')).toBeInTheDocument()
    expect(screen.getByText('Activa')).toBeInTheDocument()
    expect(screen.getByText('3 de 5')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '3 de 5 hechas hoy' })).toBeInTheDocument()
    expect(screen.getByText('Próxima')).toBeInTheDocument()
    expect(screen.getByText('16:00')).toBeInTheDocument()
    expect(screen.getByText('Última marcada')).toBeInTheDocument()
    expect(screen.getByText('10:04')).toBeInTheDocument()
    expect(screen.getByText('por Rosa')).toBeInTheDocument()
    expect(screen.getByText('Cada hora, de 08:00 a 20:00')).toBeInTheDocument()
    expect(screen.getByText('Todos los días')).toBeInTheDocument()
    expect(screen.getByText('13')).toBeInTheDocument()
    expect(screen.getByText('Desde el 1 oct 2026 · sin fecha de fin')).toBeInTheDocument()
    expect(screen.getByText('Ana, el 1 oct')).toBeInTheDocument()
    expect(screen.getByText('Agregada por')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Toma de/ })).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Tus avisos de esta actividad' })).toBeInTheDocument()
  })

  it('«✓ Realizado» is the one solid action and asks the server for the next dose', async () => {
    const mock = api(activity())
    renderDetail(open)
    await setup().click(await screen.findByRole('button', { name: 'Realizado: Tomar agua' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /routines/a1/done'))
  })

  it('takes back the last mark of the day for who can', async () => {
    const mock = api(activity())
    renderDetail(open)
    await setup().click(await screen.findByRole('button', { name: 'Quitar la última marca' }))
    await waitFor(() => expect(callsOf(mock)).toContain('PATCH /routines/a1/doses/x10'))
    expect(JSON.parse(mock.mock.calls.find(([, init]) => init?.method === 'PATCH')![1].body)).toEqual({ taken: false })
  })

  it('does not offer a Caregiver to take back a mark that is not theirs', async () => {
    api(activity(), {}, caregiverAccount)
    renderDetail(open)
    expect(await screen.findByText('Un Tutor puede pausar, editar o finalizar esta actividad.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar la última marca' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Realizado: Tomar agua' })).toBeInTheDocument()
  })

  it('offers a Caregiver their own last mark', async () => {
    const mine = activity({
      doses: [dose('x8', 8, { taken: true, takenBy: { name: 'Cuidadora', at: at(8, 5), mine: true } }), dose('x16', 16, { status: 'pending' })],
    })
    api(mine, { 'PATCH /routines/a1/doses/x8': { body: dose('x8', 8, { taken: false }) } }, caregiverAccount)
    renderDetail(open)
    expect(await screen.findByRole('button', { name: 'Quitar la última marca' })).toBeInTheDocument()
  })

  it('says there are no reminders left when all were marked, and offers no «Realizado»', async () => {
    api(activity({ doses: [dose('x8', 8, { taken: true, takenBy: { name: 'Ana', at: at(8, 5), mine: true } })] }))
    renderDetail(open)
    expect(await screen.findByText('No quedan avisos hoy.')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Realizado/ })).not.toBeInTheDocument()
  })

  it('shows dashes while nothing was marked', async () => {
    api(activity({ doses: [dose('x14', 14, { status: 'due' })] }))
    renderDetail(open)
    expect((await screen.findAllByText('—')).length).toBe(2)
    expect(screen.queryByRole('button', { name: 'Quitar la última marca' })).not.toBeInTheDocument()
  })

  it('says when it does not go off today', async () => {
    api(activity({ doses: [], nextDose: dose('n', 9, { scheduledAt: at(9, 0, 8) }) }))
    renderDetail(open)
    expect(await screen.findByText('Hoy no le toca. La siguiente es el jue 8 oct, a las 09:00.')).toBeInTheDocument()
  })

  it('says there are no reminders today when there is not even a next one', async () => {
    api(activity({ doses: [] }))
    renderDetail(open)
    expect(await screen.findByText('Hoy no hay avisos.')).toBeInTheDocument()
  })

  it('finishes with its own words, which keep every «Realizado»', async () => {
    const mock = api(activity({ id: 'r1' }))
    renderDetail('/actividades/r1')
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Finalizar actividad' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: '¿Finalizar Tomar agua?' })).toBeInTheDocument()
    expect(within(dialog).getByText('Desde hoy no llegan más avisos de esta actividad a nadie de la familia.')).toBeInTheDocument()
    expect(within(dialog).getByText('Cada «Realizado», con quién lo marcó y a qué hora.')).toBeInTheDocument()
    expect(within(dialog).getByText(/para volver a registrarla, agrega una actividad nueva/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Finalizar actividad' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /routines/r1/finish'))
  })

  it('shows a paused activity with Reanudar and no «Realizado», and says it in its gender', async () => {
    const pausedActivity = activity({ id: 'r1', status: 'paused', pausedAt: new Date(2026, 9, 5).toISOString(), doses: [] })
    const mock = api(pausedActivity)
    renderDetail('/actividades/r1')
    expect(await screen.findByText('Pausada desde el 5 oct. Mientras esté pausada no llegan avisos. Lo marcado se conserva.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Realizado/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    await setup().click(screen.getByRole('button', { name: 'Reanudar' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /routines/r1/resume'))
  })

  it('tells that the child already has the maximum of active activities', async () => {
    api(activity({ id: 'r1', status: 'paused', pausedAt: new Date(2026, 9, 5).toISOString(), doses: [] }), {
      'POST /routines/r1/resume': { status: 422, body: { error: 'routine_limit_exceeded', limit: 10 } },
    })
    renderDetail('/actividades/r1')
    await setup().click(await screen.findByRole('button', { name: 'Reanudar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Este hijo ya tiene el máximo de actividades activas. Pausa o finaliza una para poder reanudar esta.')
  })

  it('shows a finished activity as a record only, with its count', async () => {
    api(activity({ id: 'r1', status: 'ended', endedAt: new Date(2026, 8, 30, 20).toISOString() }))
    renderDetail('/actividades/r1')
    expect(await screen.findByText('Terminada el 30 sep. Para volver a registrarla, agrega una actividad nueva.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Realizado/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Finalizar actividad' })).not.toBeInTheDocument()
  })

  it('opens the edit page of an activity', async () => {
    api(activity())
    renderDetail(open)
    await setup().click(await screen.findByRole('link', { name: 'Editar' }))
    expect(await screen.findByText('EDITAR ACTIVIDAD')).toBeInTheDocument()
  })

  it('on the person’s own: no «Agregada por», no family, and with the plan lapsed only «Finalizar»', async () => {
    api(activity({ childId: null, canEdit: false }), {}, account({ plan: 'free' }))
    renderDetail(open)
    expect(await screen.findByRole('heading', { name: 'Tomar agua', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('← Mis actividades')).toBeInTheDocument()
    expect(screen.queryByText('Agregada por')).not.toBeInTheDocument()
    expect(screen.getByText('Última marcada')).toBeInTheDocument()
    expect(screen.queryByText(/^por /)).not.toBeInTheDocument()
    expect(screen.getByText(/Con el plan gratuito puedes ver la actividad y marcar «Realizado»/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver el plan completo →' })).toHaveAttribute('href', '/planes')
    expect(screen.queryByRole('button', { name: 'Pausar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finalizar actividad' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Realizado: Tomar agua' })).toBeInTheDocument()
    expect(screen.getByText('Se activan en cada dispositivo por separado.')).toBeInTheDocument()
  })

  it('takes a supplement opened as an activity to its own address', async () => {
    api(routine({ id: 'r1', name: 'Zinc' }))
    renderDetail('/actividades/r1')
    expect(await screen.findByRole('heading', { name: 'Zinc', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Horas')).toBeInTheDocument()
  })

  it('says when the activity is not there or could not load', async () => {
    api(activity(), { 'GET /routines/a1': { status: 403, body: { error: 'forbidden' } } })
    renderDetail(open)
    expect(await screen.findByText(/No se encontró esta actividad\./)).toBeInTheDocument()
  })
})
