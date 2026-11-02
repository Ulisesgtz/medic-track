import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MyDayPage } from './MyDayPage'
import { TODAY, account, activity, at, callsOf, dose, list, routine, stubApi, stubWeb } from './supplements.test-utils'
import type { PersonalRoutineList, Routine } from './types'

// specs/056 (design B): «Mi día», the person's own page — «Hoy», the index and «Mis suplementos» / «Mis actividades».

const mine = (over: Partial<Routine> = {}) =>
  routine({
    childId: null,
    name: 'Omega 3',
    doses: [dose('d1', 8, { taken: true, status: 'taken', takenBy: { name: 'Ana', at: at(8, 5), mine: true } }), dose('d2', 14, { status: 'due' })],
    ...over,
  })
const myActivity = (over: Partial<Routine> = {}) =>
  activity({ id: 'a1', childId: null, doses: [dose('x8', 8, { taken: true, status: 'taken' }), dose('x14', 14, { status: 'due' }), dose('x18', 18, { status: 'pending' })], ...over })
const personalList = (routines: Routine[], over: Partial<PersonalRoutineList> = {}): PersonalRoutineList => ({ ...list(routines), noticeSeen: true, ...over })

function api(supplements: Routine[], activities: Routine[] = [], over: Partial<PersonalRoutineList> = {}, extra: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({
    'GET /accounts/me': { body: account() },
    'GET /accounts/a1/routines': (url: URL) => ({ body: personalList(url.searchParams.get('kind') === 'activity' ? activities : supplements, over) }),
    'POST /accounts/a1/routines/notice-seen': { status: 204, body: undefined },
    'PATCH /routines/r1/doses/d2': { body: dose('d2', 14, { taken: true }) },
    'POST /routines/a1/done': { body: dose('x14', 14, { taken: true }) },
    ...extra,
  })
}

function renderAt(path = '/mi-dia') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/mi-dia" element={<MyDayPage />} />
          <Route path="/mis-suplementos" element={<Navigate to="/mi-dia#suplementos" replace />} />
          <Route path="/mis-suplementos/nueva" element={<div>NUEVO SUPLEMENTO</div>} />
          <Route path="/mis-actividades/nueva" element={<div>NUEVA ACTIVIDAD</div>} />
          <Route path="/suplementos/:routineId" element={<div>DETALLE SUPLEMENTO</div>} />
          <Route path="/home" element={<div>HOME</div>} />
          <Route path="/planes" element={<div>PLANES</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

describe('MyDayPage — phone', () => {
  it('has the common header with the initials, «Mi día», the date and «Solo tú ves esto»', async () => {
    api([mine()])
    renderAt()
    expect(await screen.findByRole('heading', { level: 1, name: 'Mi día' })).toBeInTheDocument()
    expect(await screen.findByText('AM')).toBeInTheDocument()
    expect(screen.getByText(/^martes 6 de octubre/)).toBeInTheDocument()
    expect(screen.getByText('Solo tú ves esto')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Inicio' })).toHaveAttribute('href', '/home')
  })

  it('opens with «Hoy»: the doses by moment of the day, marked here, and the activities in one row', async () => {
    const user = setup()
    const fetchMock = api([mine()], [myActivity()])
    renderAt()

    const today = await screen.findByRole('region', { name: 'Hoy' })
    expect(within(today).getByText('2 tomas hoy')).toBeInTheDocument()
    expect(within(today).getByText('2 por marcar')).toBeInTheDocument()
    const marked = within(today).getByRole('button', { name: 'Marcar Omega 3 de las 08:00' })
    expect(marked).toHaveAttribute('aria-pressed', 'true')
    expect(marked).toHaveTextContent('✓ 08:05')
    await user.click(within(today).getByRole('button', { name: 'Marcar Omega 3 de las 14:00' }))
    await waitFor(() => expect(callsOf(fetchMock)).toContainEqual(expect.stringContaining('PATCH /routines/r1/doses/d2')))

    expect(within(today).getByText('1 de 3 hechas')).toBeInTheDocument()
    expect(within(today).getByText('Próxima: Tomar agua · 18:00')).toBeInTheDocument()
    await user.click(within(today).getByRole('button', { name: 'Realizado: Tomar agua' }))
    await waitFor(() => expect(callsOf(fetchMock)).toContainEqual(expect.stringContaining('POST /routines/a1/done')))
  })

  it('then the index and both lists as compact rows, each to its detail', async () => {
    api([mine()], [myActivity()])
    renderAt()

    const index = await screen.findByRole('navigation', { name: 'Secciones' })
    expect(within(index).getAllByRole('link').map((a) => a.textContent)).toEqual(['Suplementos', 'Actividades'])
    const sups = screen.getByRole('region', { name: 'Mis suplementos' })
    expect(await within(sups).findByRole('link', { name: /Omega 3/ })).toHaveAttribute('href', '/suplementos/r1')
    expect(within(sups).getByRole('link', { name: '+ Agregar suplemento' })).toHaveAttribute('href', '/mis-suplementos/nueva')
    expect(within(screen.getByRole('region', { name: 'Mis actividades' })).getByRole('link', { name: /Tomar agua/ })).toBeInTheDocument()
    // Seen before: «Cómo funcionan» is a link that opens it again.
    await setup().click(screen.getByRole('button', { name: 'Cómo funcionan' }))
    expect(screen.getByRole('note')).toHaveTextContent('PediTrack no sugiere suplementos ni opina sobre ellos.')
    await setup().click(screen.getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('the first time it explains how they work until «Entendido», saved for the account', async () => {
    const fetchMock = api([mine()], [], { noticeSeen: false })
    renderAt()
    const note = await screen.findByRole('note')
    expect(note).toHaveTextContent('Cómo funcionan')
    await setup().click(within(note).getByRole('button', { name: 'Entendido' }))
    await waitFor(() => expect(callsOf(fetchMock)).toContainEqual(expect.stringContaining('POST /accounts/a1/routines/notice-seen')))
  })

  it('says so when the notice could not be saved', async () => {
    api([mine()], [], { noticeSeen: false }, { 'POST /accounts/a1/routines/notice-seen': { status: 500, body: {} } })
    renderAt()
    await setup().click(within(await screen.findByRole('note')).getByRole('button', { name: 'Entendido' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar. Inténtalo de nuevo.')
  })

  it('with nothing created, «Hoy» has the first steps — one solid button — and no empty sections', async () => {
    api([], [], { noticeSeen: false })
    renderAt()
    const today = await screen.findByRole('region', { name: 'Hoy' })
    expect(within(today).getByText(/Aquí verás tus tomas y actividades del día/)).toBeInTheDocument()
    expect(within(today).getByRole('link', { name: 'Agregar mi primer suplemento' })).toHaveAttribute('href', '/mis-suplementos/nueva')
    expect(within(today).getByRole('link', { name: 'Agregar mi primer suplemento' })).toHaveClass('bg-confirmed')
    expect(within(today).getByRole('link', { name: 'Agregar una actividad' })).toHaveClass('border-action')
    expect(screen.getByRole('note')).toHaveTextContent('Cómo funcionan')
    expect(screen.queryByRole('navigation', { name: 'Secciones' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Mis suplementos' })).not.toBeInTheDocument()
  })

  it('on the free plan with nothing created it shows the plan instead; what was created stays, with the plan mark to add', async () => {
    api([], [], { paidPlan: false })
    const { unmount } = renderAt()
    expect(await screen.findByRole('region', { name: 'Plan completo: Suplementos y actividades' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Agregar mi primer suplemento' })).not.toBeInTheDocument()
    unmount()

    api([mine()], [], { paidPlan: false })
    renderAt()
    const sups = await screen.findByRole('region', { name: 'Mis suplementos' })
    expect(await within(sups).findByRole('link', { name: /Omega 3/ })).toBeInTheDocument()
    expect(within(sups).getByRole('button', { name: /Agregar suplementos/ })).toHaveTextContent('Plan completo')
  })

  it('says it could not load, with «Reintentar»', async () => {
    api([], [], {}, { 'GET /accounts/a1/routines': { status: 500, body: {} } })
    renderAt()
    expect(await screen.findByText('no pudimos cargar tus suplementos y actividades')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('an old «Mis suplementos» link lands on its section', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    api([mine()])
    renderAt('/mis-suplementos')
    await screen.findByRole('region', { name: 'Mis suplementos' })
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' }))
  })
})

describe('MyDayPage — web', () => {
  beforeEach(() => stubWeb(true))

  it('has the sections at the left and «Resumen del día» at the right', async () => {
    api([mine()], [myActivity()])
    renderAt()
    const summary = await screen.findByRole('region', { name: 'Resumen del día' })
    expect(summary.closest('aside')).not.toBeNull()
    expect(within(summary).getByText('2 hoy · 1 por marcar')).toBeInTheDocument()
    expect(within(summary).getByText('Omega 3 · 14:00')).toBeInTheDocument()
    expect(within(summary).getByText('1 de 3 hechas')).toBeInTheDocument()
    expect(screen.getByText(/martes 6 de octubre ·/)).toBeInTheDocument()
  })

  it('puts the first steps in a row, the activity before the solid button', async () => {
    api([], [])
    renderAt()
    const solid = await screen.findByRole('link', { name: 'Agregar mi primer suplemento' })
    const outline = screen.getByRole('link', { name: 'Agregar una actividad' })
    expect(outline.compareDocumentPosition(solid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
