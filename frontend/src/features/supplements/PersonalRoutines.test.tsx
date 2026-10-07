import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MisSuplementosSeccion } from './MisSuplementosSeccion'
import { PersonalHomeBlock } from './PersonalHomeBlock'
import { PersonalRoutinesPage } from './PersonalRoutinesPage'
import { PersonalTodayPanel, personalTodayItems, personalTodaySummary } from './PersonalTodayPanel'
import { TODAY, account, at, callsOf, dose, list, routine, stubApi, stubWeb } from './supplements.test-utils'
import type { PersonalRoutineList, Routine } from './types'

// specs/033, part 3: the person's own routines (no child), the section, the home block and «Tus tomas de hoy».

const mine = (over: Partial<Routine> = {}) =>
  routine({
    childId: null,
    name: 'Omega 3',
    doses: [dose('d1', 8, { taken: true, takenBy: { name: 'Ana', at: at(8, 5), mine: true } }), dose('d2', 14, { status: 'due' })],
    ...over,
  })
const personalList = (routines: Routine[], over: Partial<PersonalRoutineList> = {}): PersonalRoutineList => ({ ...list(routines), noticeSeen: true, ...over })
const ana = account()

function api(routines: Routine[], over: Partial<PersonalRoutineList> = {}, acc: unknown = ana, extra: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({
    'GET /accounts/me': { body: acc },
    'GET /accounts/a1/routines': { body: personalList(routines, over) },
    'POST /accounts/a1/routines/notice-seen': { status: 204, body: undefined },
    'PATCH /routines/r1/doses/d1': { body: dose('d1', 8, { taken: false }) },
    'PATCH /routines/r1/doses/d2': { body: dose('d2', 14, { taken: true }) },
    ...extra,
  })
}

function renderIn(ui: React.ReactElement, path = '/mis-suplementos') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/mis-suplementos" element={ui} />
          <Route path="/mis-suplementos/nueva" element={<div>NUEVA</div>} />
          <Route path="/suplementos/:routineId" element={<div>DETALLE</div>} />
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

describe('MisSuplementosSeccion', () => {
  it('says only the person sees them, lists the active ones first and marks without a name: «a las 08:05»', async () => {
    api([mine(), mine({ id: 'r2', name: 'Calcio', status: 'paused', pausedAt: new Date(2026, 9, 2).toISOString(), doses: [] })])
    renderIn(<MisSuplementosSeccion />)

    expect(await screen.findByText('Solo tú ves estas rutinas y solo a ti te llegan los avisos.')).toBeInTheDocument()
    expect(screen.getByText('1 activa')).toBeInTheDocument()
    expect(screen.getByText('Activas')).toBeInTheDocument()
    expect(screen.getByText('Pausadas y terminadas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Nueva rutina' })).toHaveAttribute('href', '/mis-suplementos/nueva')
    expect(screen.getByText('a las 08:05')).toBeInTheDocument()
    expect(screen.queryByText(/por Ana/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Las usas con el plan completo de la familia/)).not.toBeInTheDocument()
  })

  it('invites the first routine with the one solid button when there is none and the plan is paid', async () => {
    api([])
    renderIn(<MisSuplementosSeccion />)
    expect(await screen.findByRole('heading', { name: 'Aún no tienes rutinas' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Crear mi primera rutina' })).toHaveAttribute('href', '/mis-suplementos/nueva')
    expect(screen.queryByRole('link', { name: '+ Nueva rutina' })).not.toBeInTheDocument()
  })

  it('on the free plan with no routines shows the plan card, and «Ver el plan completo» goes to the plans', async () => {
    api([], { paidPlan: false }, account({ plan: 'free' }))
    renderIn(<MisSuplementosSeccion />)
    expect(await screen.findByRole('heading', { name: 'Tus rutinas de suplemento' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Crear mi primera rutina' })).not.toBeInTheDocument()
    await setup().click(screen.getByRole('button', { name: 'Ver el plan completo' }))
    expect(await screen.findByText('PLANES')).toBeInTheDocument()
  })

  it('with the plan lapsed keeps what exists (markable), offers nothing to create and says why', async () => {
    api([mine()], { paidPlan: false }, account({ plan: 'free' }))
    renderIn(<MisSuplementosSeccion />)
    expect(await screen.findByText('Tu cuenta está en el plan gratuito')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver rutina Omega 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toma de 14:00' })).toBeEnabled()
    expect(screen.queryByRole('link', { name: '+ Nueva rutina' })).not.toBeInTheDocument()
    await setup().click(screen.getByRole('button', { name: 'Ver el plan completo' }))
    expect(await screen.findByText('PLANES')).toBeInTheDocument()
  })

  it('at 10 active ones explains the cap and offers no new routine', async () => {
    api([mine()], { activeCount: 10 })
    renderIn(<MisSuplementosSeccion />)
    expect(await screen.findByText('Ya tienes 10 rutinas activas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a las rutinas activas' })).toHaveAttribute('href', '#mis-suplementos-activas')
    expect(screen.queryByRole('link', { name: '+ Nueva rutina' })).not.toBeInTheDocument()
  })

  it('tells a person invited to a paid family that they use that plan and nobody there sees their routines', async () => {
    api([mine()], { paidPlan: true }, account({ plan: 'free' }))
    renderIn(<MisSuplementosSeccion />)
    expect(await screen.findByText('Las usas con el plan completo de la familia a la que te invitaron. Nadie de esa familia las ve.')).toBeInTheDocument()
  })

  it('shows the first-time notice until «Entendido», saved for the account, and keeps «Cómo funcionan estas rutinas» afterwards', async () => {
    const mock = api([], { noticeSeen: false })
    renderIn(<MisSuplementosSeccion />)
    const user = setup()
    expect(await screen.findByText('Antes de empezar')).toBeInTheDocument()
    expect(screen.getByText(/No sugiere suplementos ni opina sobre ellos/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cómo funcionan estas rutinas' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Entendido' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /accounts/a1/routines/notice-seen'))
  })

  it('once seen shows only the link, which brings the notice back and «Entendido» hides it without asking the server', async () => {
    const mock = api([mine()])
    renderIn(<MisSuplementosSeccion />)
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Cómo funcionan estas rutinas' }))
    expect(screen.getByText('Antes de empezar')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByText('Antes de empezar')).not.toBeInTheDocument()
    expect(callsOf(mock)).not.toContain('POST /accounts/a1/routines/notice-seen')
  })

  it('says so when the notice could not be saved', async () => {
    api([], { noticeSeen: false }, ana, { 'POST /accounts/a1/routines/notice-seen': { status: 500, body: { error: 'internal_error' } } })
    renderIn(<MisSuplementosSeccion />)
    await setup().click(await screen.findByRole('button', { name: 'Entendido' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar. Inténtalo de nuevo.')
  })

  it('says it is loading and that it could not load', async () => {
    stubApi({ 'GET /accounts/me': { body: ana }, 'GET /accounts/a1/routines': { status: 500, body: { error: 'x' } } })
    renderIn(<MisSuplementosSeccion />)
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
    expect(await screen.findByText('No se pudieron cargar tus suplementos.')).toBeInTheDocument()
  })
})

describe('PersonalTodayPanel', () => {
  it('orders today\'s doses of the ACTIVE routines by time and counts only what is «por marcar»', () => {
    const items = personalTodayItems([
      mine({ id: 'r1', name: 'Omega 3', doses: [dose('a', 19, { status: 'pending' }), dose('b', 7, { taken: true })] }),
      mine({ id: 'r2', name: 'B12', doses: [dose('c', 13, { status: 'due' })] }),
      mine({ id: 'r3', name: 'Pausada', status: 'paused', doses: [dose('x', 9)] }),
    ])
    expect(items.map((i) => i.dose.id)).toEqual(['b', 'c', 'a'])
    expect(personalTodaySummary(items)).toBe('1 sin marcar')
    expect(personalTodaySummary(items.filter((i) => i.dose.id !== 'c'))).toBe('todo marcado hasta ahora')
  })

  it('lists the doses with their routine and marks one in place', async () => {
    const mock = api([mine()])
    renderIn(
      <PersonalTodayPanel routines={[mine()]} />,
    )
    expect(screen.getByRole('heading', { name: 'Tus tomas de hoy' })).toBeInTheDocument()
    expect(screen.getByText('1 sin marcar')).toBeInTheDocument()
    expect(screen.getAllByText('Omega 3')).toHaveLength(2)
    await setup().click(screen.getByRole('button', { name: 'Toma de 14:00' }))
    await waitFor(() => expect(callsOf(mock)).toContain('PATCH /routines/r1/doses/d2'))
  })

  it('says when there is nothing today', () => {
    renderIn(<PersonalTodayPanel routines={[mine({ doses: [] })]} />)
    expect(screen.getByText('No hay tomas programadas para hoy.')).toBeInTheDocument()
    expect(screen.queryByText(/sin marcar|todo marcado/)).not.toBeInTheDocument()
  })
})

describe('PersonalHomeBlock', () => {
  const home = (variant: 'phone' | 'desktop') => <PersonalHomeBlock account={ana as never} variant={variant} />

  it.each(['phone', 'desktop'] as const)('%s: with routines shows «Tus tomas de hoy» and the way in', async (variant) => {
    api([mine()])
    renderIn(home(variant), '/mis-suplementos')
    expect(await screen.findByRole('heading', { name: 'Mis suplementos' })).toBeInTheDocument()
    expect(screen.getByText('Solo tú ves estas rutinas y solo a ti te llegan los avisos.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tus tomas de hoy' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver mis suplementos →' })).toHaveAttribute('href', '/mis-suplementos')
  })

  it.each(['phone', 'desktop'] as const)('%s: with none shows the dashed entry', async (variant) => {
    api([])
    renderIn(home(variant))
    expect(await screen.findByText('Para registrar lo que tomas tú, con su horario.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tus tomas de hoy' })).not.toBeInTheDocument()
  })

  it('draws nothing while loading, with no account or when the list cannot be read (the home never breaks for it)', async () => {
    stubApi({ 'GET /accounts/me': { body: ana }, 'GET /accounts/a1/routines': { status: 500, body: { error: 'x' } } })
    const { container } = renderIn(home('phone'))
    expect(container).toBeEmptyDOMElement()
    await waitFor(() => expect(callsOf(vi.mocked(fetch) as never)).toContain('GET /accounts/a1/routines'))
    expect(screen.queryByText('Mis suplementos')).not.toBeInTheDocument()

    const none = renderIn(<PersonalHomeBlock account={undefined} variant="phone" />)
    expect(none.container.querySelector('section')).toBeNull()
  })
})

describe('PersonalRoutinesPage', () => {
  it('phone: one column under the page header, back to the children', async () => {
    api([mine()])
    renderIn(<PersonalRoutinesPage />)
    expect(await screen.findByRole('heading', { name: 'Mis suplementos', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Personal')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Tus hijos' })).toHaveAttribute('href', '/home')
    expect(screen.queryByRole('heading', { name: 'Tus tomas de hoy' })).not.toBeInTheDocument()
  })

  it('web: the section at the left and «Tus tomas de hoy» at the right', async () => {
    stubWeb(true)
    api([mine()])
    renderIn(<PersonalRoutinesPage />)
    expect(await screen.findByRole('heading', { name: 'Tus tomas de hoy' })).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByText('Solo tú ves estas rutinas y solo a ti te llegan los avisos.')).toBeInTheDocument()
  })

  it('web: no panel when there is no active routine', async () => {
    stubWeb(true)
    api([])
    renderIn(<PersonalRoutinesPage />)
    expect(await screen.findByRole('heading', { name: 'Aún no tienes rutinas' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tus tomas de hoy' })).not.toBeInTheDocument()
  })
})
