import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChildDetailPage } from './ChildDetailPage'

function renderPage(childId = 'child-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/children/${childId}`]}>
        <Routes>
          <Route path="/children/:childId" element={<ChildDetailPage />} />
          <Route path="/home" element={<div>HOME</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const account = {
  id: 'a1', firstName: 'Ana', lastName: 'Morales', email: 'ana@example.com',
  countryCode: null, stateCode: null, plan: 'free',
  children: [{ id: 'child-1', firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14', height: null, weight: null }],
}

const consultations = [
  { id: 'c2', doctorName: 'Dra. Laura Cázares', consultDate: '2026-09-12', symptoms: 'Fiebre y tos', medicationCount: 2 },
  { id: 'c0', doctorName: 'Dr. Iván Robles', consultDate: '2024-08-02', symptoms: 'Control de peso', medicationCount: 0 },
]

const dose = (id: string, hour: number, name: string, taken: boolean, consultationId = 'c2') => ({
  id, consultationId, medicationName: name, scheduledAt: new Date(2026, 8, 16, hour).toISOString(), taken,
})

const emptyOverview = { childId: 'child-1', doses: [], activeTreatment: null }

/** Routes every fetch of the page by URL. */
function stubApi({
  list = consultations,
  overview = emptyOverview as unknown,
  overviewOk = true,
  listStatus = 200,
}: { list?: unknown[]; overview?: unknown; overviewOk?: boolean; listStatus?: number } = {}) {
  const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'PATCH') return { ok: true, json: async () => ({ id: 'd', scheduledAt: '', taken: true }) }
    if (url.includes('/overview')) return { ok: overviewOk, status: overviewOk ? 200 : 500, json: async () => overview }
    if (url.includes('/accounts/')) return { ok: true, json: async () => account }
    if (listStatus !== 200) return { ok: false, status: listStatus, json: async () => ({ message: 'nope' }) }
    return { ok: true, json: async () => ({ childId: 'child-1', consultations: list }) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function useSession() {
  window.localStorage.setItem('peditrack.accountId', 'a1')
}
function useWeb() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
}

describe('ChildDetailPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 16, 12)) // 16 sep 2026: Mateo is 5 años 6 meses
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    window.localStorage.clear()
  })

  it('shows "no encontrado" with a way home when the child does not exist', async () => {
    stubApi({ listStatus: 404 })
    renderPage('missing')

    expect(await screen.findByText('No se encontró este hijo.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a mi home' })).toHaveAttribute('href', '/home')
  })

  it('shows a generic error when the consultations fail to load', async () => {
    stubApi({ listStatus: 500 })
    renderPage()

    expect(await screen.findByText('Ocurrió un error al cargar sus consultas.')).toBeInTheDocument()
  })

  describe('on the phone (mock 02)', () => {
    it("shows the child's avatar, name, age and birth date, with a way back to their list", async () => {
      useSession()
      stubApi()
      renderPage()

      expect(await screen.findByRole('heading', { level: 1, name: 'Mateo Morales' })).toBeInTheDocument()
      expect(screen.getByText('5 años 6 meses · 14 mar 2021')).toBeInTheDocument()
      expect(screen.getByText('M')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '← Tus hijos' })).toHaveAttribute('href', '/home')
    })

    it('is a centered column of at most 430px, as the mock', async () => {
      useSession()
      stubApi()
      renderPage()

      await screen.findByRole('heading', { level: 1, name: 'Mateo Morales' })
      expect(screen.getByRole('main')).toHaveClass('mx-auto', 'max-w-[430px]')
    })

    it('falls back to a generic title when no account is saved', async () => {
      stubApi()
      renderPage()

      expect(await screen.findByRole('heading', { level: 1, name: 'Consultas médicas' })).toBeInTheDocument()
    })

    it('lists the consultations with date, doctor and "síntomas · N medicamentos", and no "Ver →"', async () => {
      stubApi()
      renderPage()

      const card = await screen.findByRole('link', { name: /Dra. Laura Cázares/ })
      expect(card).toHaveAttribute('href', '/consultations/c2')
      expect(within(card).getByText('12 sep 2026')).toBeInTheDocument()
      expect(within(card).getByText('Fiebre y tos · 2 medicamentos')).toBeInTheDocument()
      expect(within(card).queryByText('Ver →')).not.toBeInTheDocument()
      expect(screen.getByText('Control de peso · sin receta')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '+ Nueva' })).toHaveAttribute('href', '/children/child-1/consultations/new')
    })

    it('shows the empty state when there are no consultations yet (FR-002)', async () => {
      stubApi({ list: [] })
      renderPage()

      expect(await screen.findByText(/todavía no hay consultas/i)).toBeInTheDocument()
    })

    it('shows the amber "Tomas de hoy" block: how many are unmarked and which medication', async () => {
      stubApi({ overview: { childId: 'child-1', doses: [dose('d1', 8, 'Amoxicilina', true), dose('d2', 16, 'Amoxicilina', false), dose('d3', 21, 'Amoxicilina', false)], activeTreatment: null } })
      renderPage()

      const block = (await screen.findByText('2 sin marcar · Amoxicilina')).closest('div')!
      expect(block).toHaveClass('bg-pending')
      expect(within(block).getByText('Tomas de hoy')).toBeInTheDocument()
      expect(within(block).getByRole('button', { name: 'Marcar tomas' })).toBeInTheDocument()
    })

    it('lists every unmarked medication in the block', async () => {
      stubApi({ overview: { childId: 'child-1', doses: [dose('d2', 16, 'Amoxicilina', false), dose('d3', 21, 'Paracetamol', false)], activeTreatment: null } })
      renderPage()

      expect(await screen.findByText('2 sin marcar · Amoxicilina, Paracetamol')).toBeInTheDocument()
    })

    it('"Marcar tomas" marks all of today\'s unmarked doses at once', async () => {
      const user = userEvent.setup()
      const fetchMock = stubApi({ overview: { childId: 'child-1', doses: [dose('d1', 8, 'Amoxicilina', true), dose('d2', 16, 'Amoxicilina', false), dose('d3', 21, 'Paracetamol', false, 'c3')], activeTreatment: null } })
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Marcar tomas' }))

      await waitFor(() => {
        const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')
        expect(patches.map(([url]) => String(url))).toEqual([
          expect.stringContaining('/consultations/c2/doses/d2'),
          expect.stringContaining('/consultations/c3/doses/d3'),
        ])
        for (const [, init] of patches) expect(JSON.parse(init.body)).toEqual({ taken: true })
      })
      await waitFor(() =>
        expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/overview')).length).toBeGreaterThan(1),
      )
    })

    it('turns soft green with no button once every dose is marked', async () => {
      stubApi({ overview: { childId: 'child-1', doses: [dose('d1', 8, 'Amoxicilina', true)], activeTreatment: null } })
      renderPage()

      const summary = await screen.findByText('0 sin marcar · Amoxicilina')
      expect(summary.closest('div')).toHaveClass('bg-confirmed-soft')
      expect(screen.queryByRole('button', { name: 'Marcar tomas' })).not.toBeInTheDocument()
    })

    it('says "Sin tomas hoy" when nothing is scheduled today', async () => {
      stubApi()
      renderPage()

      expect(await screen.findByText('Sin tomas hoy')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Marcar tomas' })).not.toBeInTheDocument()
    })

    it('says so, without breaking the list, when the overview fails', async () => {
      stubApi({ overviewOk: false })
      renderPage()

      expect(await screen.findByText('No se pudieron cargar las tomas de hoy.')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Dra. Laura Cázares/ })).toBeInTheDocument()
    })
  })

  describe('on the web (board screen 6, with the sidebar)', () => {
    beforeEach(() => {
      useSession()
      useWeb()
    })

    it('shows the header row: name and birth date, the age as the title, and "Nueva consulta"', async () => {
      stubApi()
      renderPage()

      expect(await screen.findByRole('heading', { level: 1, name: '5 años 6 meses' })).toBeInTheDocument()
      expect(screen.getByText('Mateo Morales · 14 mar 2021')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Nueva consulta' })).toHaveAttribute('href', '/children/child-1/consultations/new')
      expect(screen.queryByRole('link', { name: '← Tus hijos' })).not.toBeInTheDocument()
      expect(screen.getByRole('navigation', { name: 'Tus hijos' })).toBeInTheDocument()
    })

    it("shows today's unmarked doses, the consultation count since the first one, and the running treatment", async () => {
      stubApi({
        overview: {
          childId: 'child-1',
          doses: [dose('d1', 8, 'Amoxicilina', true), dose('d2', 16, 'Amoxicilina', false), dose('d3', 21, 'Paracetamol', false)],
          activeTreatment: { medicationName: 'Amoxicilina', endsAt: new Date(2026, 8, 19, 8).toISOString(), otherCount: 0 },
        },
      })
      renderPage()

      const tomas = (await screen.findByText('Tomas de hoy', { selector: 'p' })).parentElement!
      expect(within(tomas).getByText('2')).toBeInTheDocument()
      expect(within(tomas).getByText('sin marcar')).toBeInTheDocument()
      const consultas = screen.getByText('Consultas', { selector: 'p' }).parentElement!
      expect(within(consultas).getByText('2')).toBeInTheDocument()
      expect(within(consultas).getByText('desde 2024')).toBeInTheDocument()
      const tratamiento = screen.getByText('Tratamiento activo').parentElement!
      expect(within(tratamiento).getByText('Amoxicilina')).toBeInTheDocument()
      expect(within(tratamiento).getByText('termina el 19 sep')).toBeInTheDocument()
    })

    it('lists the consultations with the "Ver →" affordance next to the "Tomas de hoy" panel', async () => {
      stubApi({ overview: { childId: 'child-1', doses: [dose('d1', 8, 'Amoxicilina', true), dose('d2', 16, 'Amoxicilina', false)], activeTreatment: null } })
      renderPage()

      const card = await screen.findByRole('link', { name: /Dra. Laura Cázares/ })
      expect(within(card).getByText('Ver →')).toBeInTheDocument()
      expect(screen.getByText('Fiebre y tos · 2 medicamentos')).toBeInTheDocument()

      const panel = screen.getByRole('heading', { name: 'Tomas de hoy' }).closest('section')!
      expect(within(panel).getByText('08:00 Amoxicilina')).toBeInTheDocument()
      // A toggle: the name is fixed and only aria-pressed carries the state.
      expect(within(panel).getByRole('button', { name: 'Toma de 08:00 Amoxicilina' })).toHaveAttribute('aria-pressed', 'true')
      expect(within(panel).getByRole('button', { name: 'Toma de 16:00 Amoxicilina' })).toHaveAttribute('aria-pressed', 'false')
      expect(within(panel).getByText('Tomada')).toBeInTheDocument()
      expect(within(panel).getByText('Marcar')).toBeInTheDocument()
    })

    it('marks a dose from the panel and reloads the overview, and unmarks one that is already taken', async () => {
      const user = userEvent.setup()
      const fetchMock = stubApi({ overview: { childId: 'child-1', doses: [dose('d1', 8, 'Amoxicilina', true), dose('d2', 16, 'Amoxicilina', false)], activeTreatment: null } })
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Toma de 16:00 Amoxicilina' }))
      await user.click(screen.getByRole('button', { name: 'Toma de 08:00 Amoxicilina' }))

      await waitFor(() => {
        const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')
        expect(patches).toHaveLength(2)
        expect(patches[0][0]).toContain('/consultations/c2/doses/d2')
        expect(JSON.parse(patches[0][1].body)).toEqual({ taken: true })
        expect(JSON.parse(patches[1][1].body)).toEqual({ taken: false })
      })
      await waitFor(() =>
        expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/overview')).length).toBeGreaterThan(1),
      )
    })

    it("sends the parent's local day as the overview window", async () => {
      const fetchMock = stubApi()
      renderPage()

      await screen.findByText('No hay tomas programadas para hoy.')
      const url = new URL(String(fetchMock.mock.calls.find(([u]) => String(u).includes('/overview'))![0]))
      const from = new Date(url.searchParams.get('from')!)
      const to = new Date(url.searchParams.get('to')!)
      expect(from.getHours()).toBe(0)
      expect(to.getTime() - from.getTime()).toBeGreaterThanOrEqual(23 * 3600 * 1000)
    })

    it('says so when there are no doses today, and when every dose is already marked', async () => {
      stubApi()
      const first = renderPage()

      expect(await screen.findByText('sin tomas hoy')).toBeInTheDocument()
      expect(screen.getByText('Ninguno')).toBeInTheDocument()
      expect(screen.getByText('sin tomas pendientes')).toBeInTheDocument()
      first.unmount()

      stubApi({ overview: { childId: 'child-1', doses: [dose('d1', 8, 'Amoxicilina', true)], activeTreatment: null } })
      renderPage()
      expect(await screen.findByText('todas marcadas')).toBeInTheDocument()
    })

    it('adds "+N" to the running treatment when more medications still have doses ahead', async () => {
      stubApi({ overview: { childId: 'child-1', doses: [], activeTreatment: { medicationName: 'Amoxicilina', endsAt: new Date(2026, 8, 23, 8).toISOString(), otherCount: 2 } } })
      renderPage()

      expect(await screen.findByText('Amoxicilina +2')).toBeInTheDocument()
    })

    it('shows placeholders, without breaking the page, when the overview fails to load', async () => {
      stubApi({ overviewOk: false })
      renderPage()

      expect(await screen.findByText('No se pudieron cargar las tomas de hoy.')).toBeInTheDocument()
      expect(screen.getAllByText('no disponible')).toHaveLength(2)
      expect(screen.getByRole('link', { name: /Dra. Laura Cázares/ })).toBeInTheDocument()
    })

    it('shows the empty state and "sin consultas" when there are no consultations yet', async () => {
      stubApi({ list: [] })
      renderPage()

      await screen.findByText(/todavía no hay consultas/i)
      expect(screen.getByText('sin consultas')).toBeInTheDocument()
    })

    it('falls back to a generic title when the child is not in the saved account', async () => {
      stubApi()
      renderPage('someone-else')

      expect(await screen.findAllByText('Consultas médicas')).toHaveLength(2)
    })
  })
})
