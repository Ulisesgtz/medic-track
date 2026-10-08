import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RoutineDetailPage } from './RoutineDetailPage'
import { RoutineFormPage } from './RoutineFormPage'
import { TODAY, account, activity, at, callsOf, dose, routine, stubApi, stubWeb } from './supplements.test-utils'
import type { Routine } from './types'

// specs/033 part 3 and specs/035: the detail, the form and «Tus avisos» of a supplement or an activity that is the person's own (no child).

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/suplementos/:routineId" element={<RoutineDetailPage />} />
          <Route path="/actividades/:routineId" element={<RoutineDetailPage />} />
          <Route path="/suplementos/:routineId/editar" element={<RoutineFormPage />} />
          <Route path="/mis-suplementos/nueva" element={<RoutineFormPage kind="supplement" personal />} />
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
    [`GET /routines/${r.id}`]: { body: r },
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

describe('RoutineDetailPage — a personal supplement', () => {
  it.each([
    ['phone', false],
    ['web', true],
  ])('%s: belongs to «Mis suplementos», has «Tus avisos» and no family wording, and marks without a name', async (_name, web) => {
    stubWeb(web)
    api(mine())
    renderAt('/suplementos/r1')
    expect(await screen.findByRole('heading', { name: 'Omega 3', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Mis suplementos' })).toHaveAttribute('href', '/mis-suplementos')
    expect(screen.getByText('Mis suplementos', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tus avisos' })).toBeInTheDocument()
    expect(screen.getByText('Se activan en cada dispositivo por separado.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Tus avisos de este suplemento' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByText(/Cada persona de la familia/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Un Tutor puede/)).not.toBeInTheDocument()
    expect(screen.queryByText('Agregado por')).not.toBeInTheDocument()
    expect(screen.getAllByText('a las 08:05').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/suplementos/r1/editar')
  })

  it('pauses, finishes with its own wording and turns its reminders off', async () => {
    const mock = api(mine())
    renderAt('/suplementos/r1')
    const user = setup()
    await user.click(await screen.findByRole('switch', { name: 'Tus avisos de este suplemento' }))
    await waitFor(() => expect(callsOf(mock)).toContain('PUT /routines/r1/my-reminders'))
    await user.click(screen.getByRole('button', { name: 'Pausar' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /routines/r1/pause'))
    await user.click(screen.getByRole('button', { name: 'Finalizar suplemento' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Desde hoy no se crean más tomas ni avisos. Las de hoy que no estén marcadas dejan de aparecer.')).toBeInTheDocument()
    expect(within(dialog).queryByText(/nadie de la familia/)).not.toBeInTheDocument()
    expect(within(dialog).getByText('Cada toma marcada y a qué hora.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Finalizar suplemento' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /routines/r1/finish'))
  })

  it('with the plan lapsed keeps the marks and offers only «Finalizar suplemento», and says why', async () => {
    api(mine({ canEdit: false }), {}, account({ plan: 'free' }))
    renderAt('/suplementos/r1')
    expect(await screen.findByText('Con el plan gratuito puedes ver y marcar las tomas. Para editar, pausar o reanudar se necesita el plan completo.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver el plan completo →' })).toHaveAttribute('href', '/planes')
    expect(screen.queryByRole('button', { name: 'Pausar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reanudar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finalizar suplemento' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toma de 14:00' })).toBeEnabled()
  })

  it("words the cap of a paused personal supplement as the person's own", async () => {
    api(mine({ status: 'paused', pausedAt: new Date(2026, 9, 2).toISOString(), doses: [] }), {
      'POST /routines/r1/resume': { status: 422, body: { error: 'routine_limit_exceeded', limit: 10 } },
    })
    renderAt('/suplementos/r1')
    await setup().click(await screen.findByRole('button', { name: 'Reanudar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya tienes el máximo de suplementos activos. Pausa o finaliza uno para poder reanudar este.')
  })

  it("a child's supplement keeps its own wording and «Agregado por»", async () => {
    api(routine({ id: 'r1', childId: 'child-1', name: 'Vitamina D' }))
    renderAt('/suplementos/r1')
    expect(await screen.findByRole('heading', { name: 'Tus avisos' })).toBeInTheDocument()
    expect(screen.getByText('Agregado por')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '← Mis suplementos' })).not.toBeInTheDocument()
  })
})

describe('RoutineDetailPage — a personal activity', () => {
  it('belongs to «Mis actividades» and has «Tus avisos» too', async () => {
    api(activity({ id: 'a1', childId: null }))
    renderAt('/actividades/a1')
    expect(await screen.findByRole('heading', { name: 'Tomar agua', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Mis actividades' })).toHaveAttribute('href', '/mis-actividades')
    expect(screen.getByText('Mis actividades', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Tus avisos de esta actividad' })).toBeInTheDocument()
    expect(screen.getByText('A cada hora programada, en este dispositivo.')).toBeInTheDocument()
    expect(screen.getByText('Se activan en cada dispositivo por separado.')).toBeInTheDocument()
  })

  it('words the finish and the cap as the person’s own', async () => {
    api(activity({ id: 'r1', childId: null }))
    renderAt('/actividades/r1')
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Finalizar actividad' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Desde hoy no llegan más avisos de esta actividad.')).toBeInTheDocument()
    expect(within(dialog).getByText('Cada «Realizado» y a qué hora.')).toBeInTheDocument()
  })

  it('words the cap of a paused personal activity', async () => {
    api(activity({ id: 'r1', childId: null, status: 'paused', pausedAt: new Date(2026, 9, 2).toISOString(), doses: [] }), {
      'POST /routines/r1/resume': { status: 422, body: { error: 'routine_limit_exceeded', limit: 10 } },
    })
    renderAt('/actividades/r1')
    await setup().click(await screen.findByRole('button', { name: 'Reanudar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya tienes el máximo de actividades activas. Pausa o finaliza una para poder reanudar esta.')
  })
})

describe('RoutineFormPage — a personal supplement', () => {
  const body = (mock: ReturnType<typeof vi.fn>, method = 'POST') => JSON.parse(mock.mock.calls.find(([, init]) => init?.method === method)![1].body)

  it('creates it through the account, says it is personal and goes to its detail', async () => {
    const mock = api(mine())
    renderAt('/mis-suplementos/nueva')
    const user = setup()
    expect(await screen.findByRole('heading', { name: 'Agregar suplemento' })).toBeInTheDocument()
    expect(screen.getByText('Es un suplemento personal: solo tú lo ves y solo a ti te llegan sus avisos.')).toBeInTheDocument()
    expect(screen.getByText('Solo la ves tú.')).toBeInTheDocument()
    expect(screen.getByText('Mis suplementos', { selector: 'p' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nombre'), 'Omega 3')
    fireValue(screen.getByLabelText('Hora'), '08:00')
    await user.click(screen.getByRole('button', { name: 'Guardar suplemento' }))
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
    fireValue(screen.getByLabelText('Hora'), '08:00')
    await user.click(screen.getByRole('button', { name: 'Guardar suplemento' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Omega 3')
  })

  it('edits a personal supplement with the personal note and goes back to its detail', async () => {
    const mock = api(mine())
    renderAt('/suplementos/r1/editar')
    const user = setup()
    expect(await screen.findByRole('heading', { name: 'Editar suplemento' })).toBeInTheDocument()
    expect(await screen.findByRole('note')).toHaveTextContent('Es un suplemento personal: solo tú lo ves y solo a ti te llegan sus avisos. Los cambios cuentan desde la siguiente toma.')
    expect(screen.getByRole('link', { name: '← Omega 3' })).toHaveAttribute('href', '/suplementos/r1')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(callsOf(mock)).toContain('PATCH /routines/r1'))
  })

  it('leaving a new personal supplement goes back to the section', async () => {
    api(mine())
    renderAt('/mis-suplementos/nueva')
    await setup().click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText('MIS SUPLEMENTOS')).toBeInTheDocument()
  })
})

function fireValue(input: HTMLElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
