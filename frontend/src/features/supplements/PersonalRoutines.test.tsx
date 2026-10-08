import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MisRegistroSeccion } from './MisRegistroSeccion'
import { PersonalActivitiesPanel, personalActivitiesToday } from './PersonalActivitiesPanel'
import { PersonalHomeBlock } from './PersonalHomeBlock'
import { PersonalRoutinesPage } from './PersonalRoutinesPage'
import { PersonalTodayPanel, personalTodayItems, personalTodaySummary } from './PersonalTodayPanel'
import { TODAY, account, activity, at, callsOf, dose, list, routine, stubApi, stubWeb } from './supplements.test-utils'
import type { PersonalRoutineList, Routine } from './types'

// specs/033 part 3 and specs/035: the person's own supplements and activities (no child), each on its own page, the home block
// and «Tus tomas de hoy» / «Tus actividades de hoy».

const mine = (over: Partial<Routine> = {}) =>
  routine({
    childId: null,
    name: 'Omega 3',
    doses: [dose('d1', 8, { taken: true, takenBy: { name: 'Ana', at: at(8, 5), mine: true } }), dose('d2', 14, { status: 'due' })],
    ...over,
  })
const myActivity = (over: Partial<Routine> = {}) => activity({ id: 'a1', childId: null, ...over })
const personalList = (routines: Routine[], over: Partial<PersonalRoutineList> = {}): PersonalRoutineList => ({ ...list(routines), noticeSeen: true, ...over })
const ana = account()

/** The personal list route answers each kind with its own routines. */
function api(supplements: Routine[], over: Partial<PersonalRoutineList> = {}, acc: unknown = ana, extra: Parameters<typeof stubApi>[0] = {}, activities: Routine[] = []) {
  return stubApi({
    'GET /accounts/me': { body: acc },
    'GET /accounts/a1/routines': (url: URL) => ({ body: personalList(url.searchParams.get('kind') === 'activity' ? activities : supplements, over) }),
    'POST /accounts/a1/routines/notice-seen': { status: 204, body: undefined },
    'PATCH /routines/r1/doses/d1': { body: dose('d1', 8, { taken: false }) },
    'PATCH /routines/r1/doses/d2': { body: dose('d2', 14, { taken: true }) },
    'POST /routines/a1/done': { body: dose('x14', 14, { taken: true }) },
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
          <Route path="/mis-actividades" element={ui} />
          <Route path="/mis-suplementos/nueva" element={<div>NUEVO SUPLEMENTO</div>} />
          <Route path="/mis-actividades/nueva" element={<div>NUEVA ACTIVIDAD</div>} />
          <Route path="/suplementos/:routineId" element={<div>DETALLE SUPLEMENTO</div>} />
          <Route path="/actividades/:routineId" element={<div>DETALLE ACTIVIDAD</div>} />
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

describe('MisRegistroSeccion · suplementos', () => {
  it('says only the person sees them, lists the active ones first and marks without a name: «a las 08:05»', async () => {
    api([mine(), mine({ id: 'r2', name: 'Calcio', status: 'paused', pausedAt: new Date(2026, 9, 2).toISOString(), doses: [] })])
    renderIn(<MisRegistroSeccion kind="supplement" />)

    expect(await screen.findByText('Solo tú ves estos suplementos y solo a ti te llegan los avisos.')).toBeInTheDocument()
    expect(screen.getByText('1 activo')).toBeInTheDocument()
    expect(screen.getByText('Activos')).toBeInTheDocument()
    expect(screen.getByText('Pausados y terminados')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Agregar suplemento' })).toHaveAttribute('href', '/mis-suplementos/nueva')
    expect(screen.getByText('a las 08:05')).toBeInTheDocument()
    expect(screen.queryByText(/por Ana/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Los usas con el plan completo de la familia/)).not.toBeInTheDocument()
  })

  it('invites the first one with the one solid button when there is none and the plan is paid', async () => {
    api([])
    renderIn(<MisRegistroSeccion kind="supplement" />)
    expect(await screen.findByRole('heading', { name: 'Aún no tienes suplementos' })).toBeInTheDocument()
    expect(screen.getByText(/Para lo que tomas a horas fijas/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Agregar suplemento' })).toHaveAttribute('href', '/mis-suplementos/nueva')
  })

  it('on the free plan with none shows the plan notice, and «Ver el plan completo» goes to the plans', async () => {
    api([], { paidPlan: false }, account({ plan: 'free' }))
    renderIn(<MisRegistroSeccion kind="supplement" />)
    expect(await screen.findByRole('heading', { name: 'Tus suplementos' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '+ Agregar suplemento' })).not.toBeInTheDocument()
    expect(screen.getByText('MX$499 al año', { exact: false })).toBeInTheDocument()
    await setup().click(screen.getByRole('link', { name: 'Ver el plan completo →' }))
    expect(await screen.findByText('PLANES')).toBeInTheDocument()
  })

  it('with the plan lapsed keeps what exists (markable), offers nothing to add and says why', async () => {
    api([mine()], { paidPlan: false }, account({ plan: 'free' }))
    renderIn(<MisRegistroSeccion kind="supplement" />)
    expect(await screen.findByText('Tu cuenta está en el plan gratuito')).toBeInTheDocument()
    expect(screen.getByText(/Los suplementos siguen aquí y sus tomas se pueden marcar/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver suplemento Omega 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toma de 14:00' })).toBeEnabled()
    expect(screen.queryByRole('link', { name: '+ Agregar suplemento' })).not.toBeInTheDocument()
    await setup().click(screen.getByRole('button', { name: 'Ver el plan completo' }))
    expect(await screen.findByText('PLANES')).toBeInTheDocument()
  })

  it('at 10 active ones explains the cap and offers no new one', async () => {
    api([mine()], { activeCount: 10 })
    renderIn(<MisRegistroSeccion kind="supplement" />)
    expect(await screen.findByText('Ya tienes 10 suplementos activos')).toBeInTheDocument()
    expect(screen.getByText(/Es el máximo\. Para agregar otro, pausa o finaliza uno/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a los suplementos activos' })).toHaveAttribute('href', '#mis-suplementos-activos')
    expect(screen.queryByRole('link', { name: '+ Agregar suplemento' })).not.toBeInTheDocument()
  })

  it('tells a person invited to a paid family that they use that plan and nobody there sees theirs', async () => {
    api([mine()], { paidPlan: true }, account({ plan: 'free' }))
    renderIn(<MisRegistroSeccion kind="supplement" />)
    expect(await screen.findByText('Los usas con el plan completo de la familia a la que te invitaron. Nadie de esa familia los ve.')).toBeInTheDocument()
  })

  it('shows the first-time notice until «Entendido», saved for the account, and keeps «Cómo funcionan los suplementos» afterwards', async () => {
    const mock = api([], { noticeSeen: false })
    renderIn(<MisRegistroSeccion kind="supplement" />)
    const user = setup()
    expect(await screen.findByText('Antes de empezar')).toBeInTheDocument()
    expect(screen.getByText(/No sugiere suplementos ni opina sobre ellos/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cómo funcionan los suplementos' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Entendido' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /accounts/a1/routines/notice-seen'))
  })

  it('once seen shows only the link, which brings the notice back and «Entendido» hides it without asking the server', async () => {
    const mock = api([mine()])
    renderIn(<MisRegistroSeccion kind="supplement" />)
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Cómo funcionan los suplementos' }))
    expect(screen.getByText('Antes de empezar')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByText('Antes de empezar')).not.toBeInTheDocument()
    expect(callsOf(mock)).not.toContain('POST /accounts/a1/routines/notice-seen')
  })

  it('says so when the notice could not be saved', async () => {
    api([], { noticeSeen: false }, ana, { 'POST /accounts/a1/routines/notice-seen': { status: 500, body: { error: 'internal_error' } } })
    renderIn(<MisRegistroSeccion kind="supplement" />)
    await setup().click(await screen.findByRole('button', { name: 'Entendido' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar. Inténtalo de nuevo.')
  })

  it('says it is loading and that it could not load', async () => {
    stubApi({ 'GET /accounts/me': { body: ana }, 'GET /accounts/a1/routines': { status: 500, body: { error: 'x' } } })
    renderIn(<MisRegistroSeccion kind="supplement" />)
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
    expect(await screen.findByText('No se pudieron cargar tus suplementos.')).toBeInTheDocument()
  })
})

describe('MisRegistroSeccion · actividades', () => {
  it('has its own words and asks the server for activities', async () => {
    const mock = api([], {}, ana, {}, [myActivity()])
    renderIn(<MisRegistroSeccion kind="activity" />, '/mis-actividades')
    expect(await screen.findByText('Solo tú ves estas actividades y solo a ti te llegan los avisos.')).toBeInTheDocument()
    expect(screen.getByText('1 activa')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Agregar actividad' })).toHaveAttribute('href', '/mis-actividades/nueva')
    expect(screen.getByText('Última: 10:04')).toBeInTheDocument()
    expect(mock.mock.calls.some(([url]) => String(url).includes('kind=activity'))).toBe(true)
  })

  it('invites the first one, explains the first-time notice and the cap with the activities’ words', async () => {
    api([], { noticeSeen: false }, ana, {}, [])
    renderIn(<MisRegistroSeccion kind="activity" />, '/mis-actividades')
    expect(await screen.findByRole('heading', { name: 'Aún no tienes actividades' })).toBeInTheDocument()
    expect(screen.getByText(/No sugiere actividades ni opina sobre ellas/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Agregar actividad' })).toBeInTheDocument()

    api([], { activeCount: 10 }, ana, {}, [myActivity()])
    renderIn(<MisRegistroSeccion kind="activity" />, '/mis-actividades')
    expect(await screen.findByText('Ya tienes 10 actividades activas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a las actividades activas' })).toHaveAttribute('href', '#mis-actividades-activas')
  })

  it('on the free plan: the notice with the activities’ words, and the lapsed one keeps «Realizado»', async () => {
    api([], { paidPlan: false }, account({ plan: 'free' }), {}, [])
    renderIn(<MisRegistroSeccion kind="activity" />, '/mis-actividades')
    expect(await screen.findByRole('heading', { name: 'Tus actividades' })).toBeInTheDocument()

    api([], { paidPlan: false }, account({ plan: 'free' }), {}, [myActivity()])
    renderIn(<MisRegistroSeccion kind="activity" />, '/mis-actividades')
    expect(await screen.findByText(/Las actividades siguen aquí y se pueden marcar con «Realizado»/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Realizado: Tomar agua' }).length).toBeGreaterThan(0)
  })

  it('says it could not load the activities', async () => {
    stubApi({ 'GET /accounts/me': { body: ana }, 'GET /accounts/a1/routines': { status: 500, body: { error: 'x' } } })
    renderIn(<MisRegistroSeccion kind="activity" />, '/mis-actividades')
    expect(await screen.findByText('No se pudieron cargar tus actividades.')).toBeInTheDocument()
  })
})

describe('PersonalTodayPanel', () => {
  it("orders today's doses of the ACTIVE ones by time and counts only what is «por marcar»", () => {
    const items = personalTodayItems([
      mine({ id: 'r1', name: 'Omega 3', doses: [dose('a', 19, { status: 'pending' }), dose('b', 7, { taken: true })] }),
      mine({ id: 'r2', name: 'B12', doses: [dose('c', 13, { status: 'due' })] }),
      mine({ id: 'r3', name: 'Pausada', status: 'paused', doses: [dose('x', 9)] }),
    ])
    expect(items.map((i) => i.dose.id)).toEqual(['b', 'c', 'a'])
    expect(personalTodaySummary(items)).toBe('1 sin marcar')
    expect(personalTodaySummary(items.filter((i) => i.dose.id !== 'c'))).toBe('todo marcado hasta ahora')
  })

  it('lists the doses with their name and marks one in place', async () => {
    const mock = api([mine()])
    renderIn(<PersonalTodayPanel routines={[mine()]} />)
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

describe('PersonalActivitiesPanel', () => {
  it('keeps only the ACTIVE activities that go off today', () => {
    const items = personalActivitiesToday([
      myActivity({ id: 'a1' }),
      myActivity({ id: 'a2', doses: [] }),
      myActivity({ id: 'a3', status: 'paused' }),
    ])
    expect(items.map((r) => r.id)).toEqual(['a1'])
  })

  it('draws one row each — count, next, a thin bar and «Realizado» — and marks in place', async () => {
    const mock = api([], {}, ana, {}, [])
    renderIn(<PersonalActivitiesPanel routines={[myActivity()]} />)
    expect(screen.getByRole('heading', { name: 'Tus actividades de hoy' })).toBeInTheDocument()
    expect(screen.getByText('3 de 5 hechas hoy · Próxima: 16:00')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Tomar agua: 3 de 5 hechas hoy' })).toBeInTheDocument()
    await setup().click(screen.getByRole('button', { name: 'Realizado: Tomar agua' }))
    await waitFor(() => expect(callsOf(mock)).toContain('POST /routines/a1/done'))
  })

  it('has no button once all were marked, and says when there is nothing today', () => {
    renderIn(<PersonalActivitiesPanel routines={[myActivity({ doses: [dose('x8', 8, { taken: true, takenBy: { name: 'Ana', at: at(8, 5), mine: true } })] })]} />)
    expect(screen.getByText('1 de 1 hechas hoy · Sin más avisos hoy')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Realizado/ })).not.toBeInTheDocument()
    renderIn(<PersonalActivitiesPanel routines={[myActivity({ doses: [] })]} />)
    expect(screen.getByText('No hay actividades programadas para hoy.')).toBeInTheDocument()
  })
})

describe('PersonalHomeBlock', () => {
  const home = (variant: 'phone' | 'desktop') => <PersonalHomeBlock account={ana as never} variant={variant} />

  it.each(['phone', 'desktop'] as const)('%s: with both shows «Personal · solo lo ves tú», each panel and each way in', async (variant) => {
    api([mine()], {}, ana, {}, [myActivity()])
    renderIn(home(variant), '/mis-suplementos')
    expect(await screen.findByText('Personal · solo lo ves tú')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mis suplementos' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mis actividades' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tus tomas de hoy' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Tus actividades de hoy' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver mis suplementos →' })).toHaveAttribute('href', '/mis-suplementos')
    expect(screen.getByRole('link', { name: 'Ver mis actividades →' })).toHaveAttribute('href', '/mis-actividades')
  })

  it.each(['phone', 'desktop'] as const)('%s: with none shows the two dashed entries', async (variant) => {
    api([], {}, ana, {}, [])
    renderIn(home(variant))
    expect(await screen.findByText('Para lo que tomas tú a horas fijas.')).toBeInTheDocument()
    expect(await screen.findByText('Para lo que haces tú varias veces al día.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tus tomas de hoy' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tus actividades de hoy' })).not.toBeInTheDocument()
  })

  it('shows what it could read when only one list loads', async () => {
    stubApi({
      'GET /accounts/me': { body: ana },
      'GET /accounts/a1/routines': (url: URL) =>
        url.searchParams.get('kind') === 'activity' ? { status: 500, body: { error: 'x' } } : { body: personalList([mine()]) },
    })
    renderIn(home('phone'))
    expect(await screen.findByRole('heading', { name: 'Mis suplementos' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mis actividades' })).not.toBeInTheDocument()
  })

  it('draws nothing while loading, with no account or when neither list can be read (the home never breaks for it)', async () => {
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
    renderIn(<PersonalRoutinesPage kind="supplement" />)
    expect(await screen.findByRole('heading', { name: 'Mis suplementos', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Personal')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Tus hijos' })).toHaveAttribute('href', '/home')
    expect(screen.queryByRole('heading', { name: 'Tus tomas de hoy' })).not.toBeInTheDocument()
  })

  it('web: the section at the left and «Tus tomas de hoy» at the right', async () => {
    stubWeb(true)
    api([mine()])
    renderIn(<PersonalRoutinesPage kind="supplement" />)
    expect(await screen.findByRole('heading', { name: 'Tus tomas de hoy' })).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByText('Solo tú ves estos suplementos y solo a ti te llegan los avisos.')).toBeInTheDocument()
  })

  it('web: no panel when there is no active one', async () => {
    stubWeb(true)
    api([])
    renderIn(<PersonalRoutinesPage kind="supplement" />)
    expect(await screen.findByRole('heading', { name: 'Aún no tienes suplementos' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tus tomas de hoy' })).not.toBeInTheDocument()
  })

  it('the activities page is its own: title, panel «Tus actividades de hoy» on the web', async () => {
    stubWeb(true)
    api([], {}, ana, {}, [myActivity()])
    renderIn(<PersonalRoutinesPage kind="activity" />, '/mis-actividades')
    expect(await screen.findByRole('heading', { name: 'Mis actividades', level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Tus actividades de hoy' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tus tomas de hoy' })).not.toBeInTheDocument()
  })
})
