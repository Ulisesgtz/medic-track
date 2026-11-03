import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProfilePage } from './ProfilePage'
import { ProfileRedirect } from './ProfileRedirect'
import { TODAY, account, activity, at, callsOf, dose, list, routine, stubApi, stubWeb } from '../supplements/supplements.test-utils'
import type { PersonalRoutineList, Routine } from '../supplements/types'

// specs/056 (design B) and 058: the person's own profile — «Hoy», their consultations, «Mis suplementos» / «Mis actividades».

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

const noOverview = { accountId: 'a1', doses: [], activeTreatment: null }
const noConsultations = { accountId: 'a1', consultations: [] }

function api(supplements: Routine[], activities: Routine[] = [], over: Partial<PersonalRoutineList> = {}, extra: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({
    'GET /accounts/me': { body: account() },
    'GET /accounts/a1/overview': { body: noOverview },
    'GET /accounts/a1/consultations': { body: noConsultations },
    'GET /accounts/a1/appointments': { body: { next: null, history: [], paidPlan: true } },
    'GET /accounts/a1/routines': (url: URL) => ({ body: personalList(url.searchParams.get('kind') === 'activity' ? activities : supplements, over) }),
    'POST /accounts/a1/routines/notice-seen': { status: 204, body: undefined },
    'PATCH /routines/r1/doses/d2': { body: dose('d2', 14, { taken: true }) },
    'POST /routines/a1/done': { body: dose('x14', 14, { taken: true }) },
    ...extra,
  })
}

function renderAt(path = '/yo') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/yo" element={<ProfilePage />} />
          <Route path="/mi-dia" element={<ProfileRedirect />} />
          <Route path="/mis-suplementos" element={<Navigate to="/yo#suplementos" replace />} />
          <Route path="/yo/consultas/nueva" element={<div>NUEVA CONSULTA</div>} />
          <Route path="/consultations/:id" element={<div>DETALLE CONSULTA</div>} />
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

describe('ProfilePage — phone', () => {
  it('has the common header with the initials, the first name, the date and «Solo tú ves esto»', async () => {
    api([mine()])
    renderAt()
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana' })).toBeInTheDocument()
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
    expect(within(index).getAllByRole('link').map((a) => a.textContent)).toEqual(['Consultas', 'Suplementos', 'Actividades'])
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

  it('with nothing created, «Hoy» has the first steps and «Nueva consulta» is the one solid button', async () => {
    api([], [], { noticeSeen: false })
    renderAt()
    const today = await screen.findByRole('region', { name: 'Hoy' })
    expect(within(today).getByText(/Aquí verás tus tomas y actividades del día/)).toBeInTheDocument()
    expect(within(today).getByRole('link', { name: 'Agregar mi primer suplemento' })).toHaveAttribute('href', '/mis-suplementos/nueva')
    expect(within(today).getByRole('link', { name: 'Agregar mi primer suplemento' })).toHaveClass('border-action')
    expect(within(today).getByRole('link', { name: 'Agregar una actividad' })).toHaveClass('border-action')
    expect(screen.getByRole('link', { name: 'Nueva consulta' })).toHaveClass('bg-confirmed')
    expect(screen.getByRole('note')).toHaveTextContent('Cómo funcionan')
    expect(screen.getByRole('region', { name: 'Consultas' })).toHaveTextContent('Registra aquí tus propias consultas')
  })

  it('shows their own consultations, today’s doses of their medications and their treatment', async () => {
    api([], [], {}, {
      'GET /accounts/a1/overview': {
        body: {
          accountId: 'a1',
          doses: [{ id: 'm1', kind: 'medication', consultationId: 'k1', medicationName: 'Amoxicilina', scheduledAt: at(14), taken: false, status: 'due', takenBy: null }],
          activeTreatment: { medicationName: 'Amoxicilina', endsAt: '2026-10-09T20:00:00Z', otherCount: 0 },
        },
      },
      'GET /accounts/a1/consultations': {
        body: { accountId: 'a1', consultations: [{ id: 'k1', doctorName: 'Dr. Paz', consultDate: '2026-10-05', notes: '', symptomNames: [], medicationCount: 1 }] },
      },
    })
    renderAt()
    const today = await screen.findByRole('region', { name: 'Hoy' })
    expect(await within(today).findByText('Amoxicilina')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Tratamiento activo' })).toHaveTextContent('Amoxicilina')
    const consultations = screen.getByRole('region', { name: 'Consultas' })
    expect(within(consultations).getByRole('link', { name: /Dr. Paz/ })).toHaveAttribute('href', '/consultations/k1')
    expect(within(consultations).getByRole('link', { name: 'Buscar en el historial' })).toHaveAttribute('href', '/yo/historial')
  })

  it('on the free plan «Nueva consulta» opens the plan notice instead of the form', async () => {
    stubApi({
      'GET /accounts/me': { body: account({ plan: 'free' }) },
      'GET /accounts/a1/overview': { body: noOverview },
      'GET /accounts/a1/consultations': { body: noConsultations },
      'GET /accounts/a1/appointments': { body: { next: null, history: [], paidPlan: false } },
      'GET /accounts/a1/routines': { body: personalList([], { paidPlan: false }) },
    })
    renderAt()
    await setup().click(await screen.findByRole('button', { name: 'Nueva consulta' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Tus propias consultas')
  })

  it('with a family, the switch to share their consultations; turning it on asks the server', async () => {
    const fetchMock = stubApi({
      'GET /accounts/me': { body: account({ family: { role: 'tutor', ownerAccountId: 'o1', ownerName: 'Luis', plan: 'paid', readOnly: false } }) },
      'GET /accounts/a1/overview': { body: noOverview },
      'GET /accounts/a1/consultations': { body: noConsultations },
      'GET /accounts/a1/appointments': { body: { next: null, history: [], paidPlan: true } },
      'GET /accounts/a1/routines': { body: personalList([]) },
      'PUT /accounts/a1/consultation-sharing': { status: 422, body: { error: 'sharing_unavailable', reason: 'plan' } },
    })
    renderAt()
    const toggle = await screen.findByRole('switch', { name: 'Compartir mis consultas con los Tutores de mi familia' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await setup().click(toggle)
    expect(await screen.findByRole('alert')).toHaveTextContent('Compartirlas es parte del plan completo de la familia.')
    expect(callsOf(fetchMock)).toContain('PUT /accounts/a1/consultation-sharing')
  })

  it('the old «Mi día» address lands on the profile', async () => {
    api([mine()])
    renderAt('/mi-dia')
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana' })).toBeInTheDocument()
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

describe('ProfilePage — web', () => {
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

  it('puts the first steps in a row, the activity before the supplement, and «Nueva consulta» at the header', async () => {
    api([], [])
    renderAt()
    const supplement = await screen.findByRole('link', { name: 'Agregar mi primer suplemento' })
    const activityLink = screen.getByRole('link', { name: 'Agregar una actividad' })
    expect(activityLink.compareDocumentPosition(supplement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Nueva consulta' })).toHaveAttribute('href', '/yo/consultas/nueva')
  })
})
