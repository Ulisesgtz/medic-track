import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChildDetailPage } from './ChildDetailPage'
import type { DoseStatus } from './types'

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

const own = { id: 'child-1', firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14', height: null, weight: null }
const account = {
  id: 'a1',
  firstName: 'Ana',
  lastName: 'Morales',
  email: 'ana@example.com',
  countryCode: null,
  stateCode: null,
  plan: 'paid' as string,
  children: [own] as Record<string, unknown>[],
}

const consultations = [
  { id: 'c2', doctorName: 'Dra. Laura Cázares', consultDate: '2026-09-12', notes: '', symptomNames: ['Fiebre', 'Tos'], medicationCount: 2 },
  { id: 'c0', doctorName: 'Dr. Iván Robles', consultDate: '2024-08-02', notes: 'Control de peso', symptomNames: [], medicationCount: 0, recordOnly: true },
]

const dose = (id: string, hour: number, name: string, status: DoseStatus, extra: Record<string, unknown> = {}) => ({
  id,
  consultationId: 'c2',
  medicationName: name,
  scheduledAt: new Date(2026, 8, 16, hour).toISOString(),
  taken: status === 'taken',
  status,
  ...extra,
})

const day = {
  childId: 'child-1',
  doses: [
    dose('d1', 6, 'Ibuprofeno', 'taken', { takenBy: { name: 'Ana', at: new Date(2026, 8, 16, 6, 10).toISOString(), mine: true } }),
    dose('d2', 8, 'Amoxicilina', 'taken', { takenBy: { name: 'Rosa', at: new Date(2026, 8, 16, 8, 5).toISOString(), mine: false } }),
    dose('d3', 8, 'Vitamina D', 'unregistered', { kind: 'supplement', routineId: 'r1', consultationId: '' }),
    dose('d4', 11, 'Amoxicilina', 'due'),
    dose('d5', 14, 'Amoxicilina', 'pending'),
    dose('d6', 20, 'Amoxicilina', 'pending'),
  ],
  activeTreatment: { medicationName: 'Amoxicilina', endsAt: new Date(2026, 10, 4, 8).toISOString(), otherCount: 1 },
}
const emptyDay = { childId: 'child-1', doses: [], activeTreatment: null }

const routine = (kind: 'supplement' | 'activity', name: string, doses: unknown[] = [], extra: Record<string, unknown> = {}) => ({
  id: `${kind}-${name}`,
  childId: 'child-1',
  kind,
  name,
  note: '',
  period: kind === 'activity' ? 'window' : 'daily',
  times: kind === 'activity' ? [] : ['08:00'],
  weekdays: [],
  windowStart: kind === 'activity' ? '08:00' : null,
  windowEnd: kind === 'activity' ? '20:00' : null,
  intervalMinutes: kind === 'activity' ? 180 : null,
  firstDate: '2026-09-01',
  endDate: null,
  status: 'active',
  pausedAt: null,
  endedAt: null,
  createdBy: 'Ana',
  createdAt: '2026-09-01T00:00:00Z',
  myReminders: true,
  canEdit: true,
  progress: { marked: 0, total: 0 },
  doses,
  nextDose: null,
  ...extra,
})
const actDose = (id: string, hour: number, taken: boolean, status: DoseStatus) => ({
  id,
  scheduledAt: new Date(2026, 8, 16, hour).toISOString(),
  taken,
  status,
  takenBy: taken ? { name: 'Ana', at: new Date(2026, 8, 16, hour, 2).toISOString(), mine: true } : null,
})

interface Api {
  list?: unknown[]
  listStatus?: number
  overview?: unknown
  overviewOk?: boolean
  supplements?: unknown[]
  activities?: unknown[]
  paidPlan?: boolean
}

/** Routes every fetch of the page by URL. */
function stubApi({ list = consultations, listStatus = 200, overview = day, overviewOk = true, supplements = [], activities = [], paidPlan = true }: Api = {}) {
  const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
    const url = String(input)
    const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body })
    if (init?.method === 'PATCH') return json({ id: 'd', scheduledAt: '', taken: true, status: 'taken' })
    if (init?.method === 'POST' && url.includes('/done')) return json({})
    if (url.includes('/routines')) {
      const kind = url.includes('kind=activity') ? 'activity' : 'supplement'
      const routines = kind === 'activity' ? activities : supplements
      return json({ routines, activeCount: routines.length, limit: 10, paidPlan })
    }
    if (url.includes('/appointments')) return json({ next: null, history: [], paidPlan })
    if (url.includes('/device-links')) return json({ links: [] })
    if (url.includes('/family')) return json({ members: [{ id: 'm1' }, { id: 'm2' }], invitations: [] })
    if (url.includes('/vaccinations')) return json({ vaccinations: [] })
    if (url.includes('/growth-measurements')) return json({ measurements: [], registered: null, referenceSex: null, birthDate: '2024-01-01', canEdit: true, chartAvailable: true })
    if (url.includes('/vaccine-card-photos')) return json({ photos: [] })
    if (url.includes('/overview')) return json(overview, overviewOk ? 200 : 500)
    if (url.includes('/accounts/')) return json(account)
    if (listStatus !== 200) return json({ message: 'nope' }, listStatus)
    return json({ childId: 'child-1', consultations: list })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function useWeb() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
}
const share = (extra: Record<string, unknown>) => {
  account.children[0] = { ...own, accountId: 'owner-1', ...extra }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 16, 12)) // 16 sep 2026: Mateo is 5 años 6 meses
})
afterEach(() => {
  account.plan = 'paid'
  account.children[0] = own
  vi.unstubAllGlobals()
  vi.useRealTimers()
  window.localStorage.clear()
})

describe('ChildDetailPage — phone (design A)', () => {
  it('says the child was not found, with a way home', async () => {
    stubApi({ listStatus: 404 })
    renderPage('missing')
    expect(await screen.findByText('No se encontró este hijo.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Inicio' })).toHaveAttribute('href', '/home')
  })

  it('opens with the header and «Hoy», then the treatment, the index, the sections and «Lo demás», in that order', async () => {
    stubApi({ supplements: [routine('supplement', 'Vitamina D')], activities: [routine('activity', 'Lavarse las manos')] })
    renderPage()

    const title = await screen.findByRole('heading', { level: 1, name: 'Mateo' })
    expect(screen.getByText(/^5 años 6 meses · nació el 14 mar 2021$/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Inicio' })).toHaveAttribute('href', '/home')
    const today = await screen.findByRole('region', { name: 'Hoy' })
    const treatment = screen.getByRole('region', { name: 'Tratamiento activo' })
    const index = screen.getByRole('navigation', { name: 'Secciones' })
    const consult = screen.getByRole('region', { name: 'Consultas' })
    const sups = screen.getByRole('region', { name: 'Suplementos' })
    const acts = screen.getByRole('region', { name: 'Actividades' })
    const card = screen.getByRole('region', { name: 'Cartilla de vacunación' })
    const more = screen.getByRole('navigation', { name: 'Lo demás' })
    const order = [title, today, treatment, index, consult, sups, acts, card, more]
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(within(index).getAllByRole('link').map((a) => a.textContent)).toEqual(['Consultas', 'Suplementos', 'Actividades', 'Cartilla', 'Crecimiento'])
    expect(treatment).toHaveTextContent('Amoxicilina +1 · termina el 04 nov')
  })

  it('lists the day by Mañana / Tarde / Noche, each dose markable here; the owner takes back somebody else’s mark', async () => {
    const fetchMock = stubApi()
    renderPage()

    const today = await screen.findByRole('region', { name: 'Hoy' })
    expect(await within(today).findByText('6 tomas hoy')).toBeInTheDocument()
    expect(within(today).getByText('1 por marcar')).toBeInTheDocument()
    expect(within(today).getByText('1 sin registrar')).toBeInTheDocument()
    expect(within(today).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Mañana', 'Tarde', 'Noche'])

    const mine = within(today).getByRole('button', { name: 'Marcar Ibuprofeno de las 06:00' })
    expect(mine).toHaveAttribute('aria-pressed', 'true')
    expect(mine).toHaveTextContent('✓ 06:10')
    expect(mine).toBeEnabled()
    const rosa = within(today).getByRole('button', { name: 'Marcar Amoxicilina de las 08:00' })
    expect(rosa).toHaveTextContent('✓ por Rosa, 08:05')
    // Who can do everything takes back anybody's mark (specs/032), as on the consultation detail.
    expect(rosa).toBeEnabled()
    expect(within(today).getByText('Suplemento · 08:00')).toBeInTheDocument()

    await userEvent.click(within(today).getByRole('button', { name: 'Marcar Amoxicilina de las 11:00' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/consultations/c2/doses/d4'), expect.objectContaining({ method: 'PATCH' })),
    )
  })

  it('counts the activities in one row and «✓ Realizado» marks the earliest unmarked one', async () => {
    const fetchMock = stubApi({
      overview: emptyDay,
      activities: [routine('activity', 'Lavarse las manos', [actDose('a1', 8, true, 'taken'), actDose('a2', 11, false, 'due'), actDose('a3', 14, false, 'pending')])],
    })
    renderPage()

    const today = await screen.findByRole('region', { name: 'Hoy' })
    expect(await within(today).findByText('1 de 3 hechas')).toBeInTheDocument()
    expect(within(today).getByText('Próxima: Lavarse las manos · 14:00')).toBeInTheDocument()
    await userEvent.click(within(today).getByRole('button', { name: 'Realizado: Lavarse las manos' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/routines/activity-Lavarse las manos/done'), expect.objectContaining({ method: 'POST' })),
    )
    expect(await within(today).findByText(/^✓ Lavarse las manos · \d\d:\d\d$/)).toBeInTheDocument()
  })

  it('says when the day has nothing, and «✓ Todo marcado hasta ahora» when everything that came is marked', async () => {
    stubApi({ overview: emptyDay })
    const { unmount } = renderPage()
    expect(await screen.findByText('Hoy no hay tomas ni actividades')).toBeInTheDocument()
    unmount()

    stubApi({ overview: { ...emptyDay, doses: [dose('d1', 8, 'Amoxicilina', 'taken'), dose('d2', 20, 'Amoxicilina', 'pending')] } })
    renderPage()
    expect(await screen.findByText('✓ Todo marcado hasta ahora')).toBeInTheDocument()
  })

  it('says it couldn’t load the day, with «Reintentar», without breaking the page', async () => {
    stubApi({ overviewOk: false })
    renderPage()
    expect(await screen.findByText('No pudimos cargar el día de Mateo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(await screen.findByText(/Dra\. Laura Cázares/)).toBeInTheDocument()
  })

  it('lists the consultations compactly, with «Solo registro», «Buscar en el historial» and «Exportar a PDF»', async () => {
    stubApi()
    renderPage()
    const section = await screen.findByRole('region', { name: 'Consultas' })
    await within(section).findByText(/Dra\. Laura Cázares/)
    const rows = within(section).getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/consultations/'))
    expect(rows[0]).toHaveAttribute('href', '/consultations/c2')
    expect(rows[0]).toHaveTextContent('12 sep 2026 · Dra. Laura Cázares')
    expect(rows[0]).toHaveTextContent('Fiebre, Tos · 2 medicamentos')
    expect(rows[1]).toHaveTextContent('Solo registro')
    expect(within(section).getByRole('link', { name: 'Buscar en el historial' })).toHaveAttribute('href', '/children/child-1/historial')
    expect(within(section).getByRole('button', { name: /Exportar a PDF/ })).toBeInTheDocument()
  })

  it('explains «Nueva consulta» when there are no consultations, and has no search for an empty list', async () => {
    stubApi({ list: [] })
    renderPage()
    expect(await screen.findByText('Aún no hay consultas')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Buscar en el historial' })).not.toBeInTheDocument()
  })

  it('shows supplements and activities as compact rows to their detail, with «+ Agregar …»', async () => {
    stubApi({ supplements: [routine('supplement', 'Vitamina D')], activities: [routine('activity', 'Leer', [], { status: 'paused' })] })
    renderPage()
    const sups = await screen.findByRole('region', { name: 'Suplementos' })
    const row = await within(sups).findByRole('link', { name: /Vitamina D/ })
    expect(row).toHaveAttribute('href', '/suplementos/supplement-Vitamina D')
    expect(row).toHaveTextContent('Todos los días · 08:00')
    expect(row).toHaveTextContent('Activo')
    expect(within(sups).getByRole('link', { name: '+ Agregar suplemento' })).toBeInTheDocument()
    const acts = screen.getByRole('region', { name: 'Actividades' })
    expect(await within(acts).findByRole('link', { name: /Leer/ })).toHaveTextContent('Pausada')
  })

  it('says a section is empty in neutral words', async () => {
    stubApi()
    renderPage()
    expect(await screen.findByText('Sin suplementos registrados')).toBeInTheDocument()
    expect(screen.getByText('Sin actividades registradas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Agregar dosis o fotos/ })).toHaveAttribute('href', '/children/child-1/cartilla')
  })

  it('pins «Nueva consulta», the one solid button, at the bottom', async () => {
    stubApi()
    renderPage()
    const link = await screen.findByRole('link', { name: 'Nueva consulta' })
    expect(link).toHaveAttribute('href', '/children/child-1/consultations/new')
    expect(link.parentElement).toHaveClass('sticky')
  })

  it('«Acceso del hijo» opens its block right under «Lo demás»; «Familia que lo ve» goes to /familia', async () => {
    stubApi()
    renderPage()
    const more = await screen.findByRole('navigation', { name: 'Lo demás' })
    expect(within(more).getByRole('link', { name: /Familia que lo ve/ })).toHaveAttribute('href', '/familia')
    expect(await within(more).findByText('3 personas')).toBeInTheDocument()
    const accessRow = within(more).getByRole('button', { name: /Acceso del hijo/ })
    expect(await within(more).findByText('Crear liga')).toBeInTheDocument()
    await userEvent.click(accessRow)
    expect(accessRow).toHaveAttribute('aria-expanded', 'true')
    // specs/064: «Editar datos», without a trace while the child was never corrected.
    expect(within(more).getByRole('link', { name: 'Editar datos' })).toHaveAttribute('href', '/children/child-1/editar')
  })

  it('«Editar datos» says who corrected the child’s data last (specs/064)', async () => {
    account.children = [{ ...own, correctedAt: '2026-11-09T16:20:00Z', correctedBy: 'Luis' }]
    stubApi()
    renderPage()
    const more = await screen.findByRole('navigation', { name: 'Lo demás' })
    expect(await within(more).findByText(/Corregido el .* por Luis/)).toBeInTheDocument()
    expect(within(more).getByRole('link', { name: /Editar datos/ })).toHaveTextContent(/Corregido el .* por Luis/)
  })

  it('on the free plan with a treatment running, «Nueva consulta» opens the plan notice; the search carries «Plan completo»', async () => {
    account.plan = 'free'
    stubApi({ paidPlan: false })
    renderPage()
    const button = await screen.findByRole('button', { name: 'Nueva consulta' })
    await userEvent.click(button)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Buscar en el historial/ })).toHaveTextContent('Plan completo')
    expect(screen.getByRole('button', { name: /Agregar suplementos/ })).toHaveTextContent('Plan completo')
  })

  it.each([
    ['a Caregiver', { role: 'caregiver', plan: 'paid', readOnly: false }],
    ['a child-role member', { role: 'child', plan: 'paid', readOnly: false }],
    ['a Tutor of a family that stopped paying', { role: 'tutor', plan: 'free', readOnly: true }],
  ])('offers %s no «Nueva consulta» nor «Acceso del hijo», but the day and the list are there', async (_who, extra) => {
    share(extra)
    stubApi()
    renderPage()
    expect(await screen.findByText(/Dra\. Laura Cázares/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Marcar Amoxicilina de las 11:00' })).toBeEnabled()
    expect(screen.queryByRole('link', { name: 'Nueva consulta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nueva consulta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Acceso del hijo/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Editar datos/ })).not.toBeInTheDocument()
  })

  it('locks somebody else’s mark for a Caregiver', async () => {
    share({ role: 'caregiver', plan: 'paid', readOnly: false })
    stubApi()
    renderPage()
    const rosa = await screen.findByRole('button', { name: 'Marcar Amoxicilina de las 08:00' })
    expect(rosa).toBeDisabled()
  })

  it('says it couldn’t read the child instead of a skeleton, and «Reintentar» for a failed list', async () => {
    const fetchMock = stubApi({ listStatus: 500 })
    account.children[0] = { ...own, id: 'other' }
    renderPage()
    expect(await screen.findByText('No pudimos cargar los datos de este hijo')).toBeInTheDocument()
    expect(await screen.findByText('No pudimos cargar sus consultas.')).toBeInTheDocument()
    const before = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/consultations')).length
    await userEvent.click(within(screen.getByRole('region', { name: 'Consultas' })).getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/consultations')).length).toBe(before + 1))
  })

  it('says «Solo lectura» to a Tutor of a family that stopped paying', async () => {
    share({ role: 'tutor', plan: 'free', readOnly: true })
    stubApi()
    renderPage()
    expect(await screen.findByRole('note')).toHaveTextContent('Solo lectura.')
  })

  it('does not block a Tutor on a free account inside a paid family: the plan is the family’s', async () => {
    account.plan = 'free'
    share({ role: 'tutor', plan: 'paid', readOnly: false })
    stubApi()
    renderPage()
    expect(await screen.findByRole('link', { name: 'Nueva consulta' })).toHaveAttribute('href', '/children/child-1/consultations/new')
  })
})

describe('ChildDetailPage — web (design A)', () => {
  beforeEach(useWeb)

  it('has «Nueva consulta» at the header’s right and the treatment and the day summary in the right column', async () => {
    stubApi()
    renderPage()
    const header = await screen.findByRole('banner')
    expect(await within(header).findByRole('link', { name: 'Nueva consulta' })).toHaveAttribute('href', '/children/child-1/consultations/new')
    const summary = await screen.findByRole('region', { name: 'Resumen del día' })
    expect(within(summary).getByText('6 hoy · 1 por marcar')).toBeInTheDocument()
    expect(within(summary).getByText('Vitamina D · 08:00')).toBeInTheDocument()
    expect(within(summary).getByText('Ninguna hoy')).toBeInTheDocument()
    expect(summary.closest('aside')).toContainElement(screen.getByRole('region', { name: 'Tratamiento activo' }))
  })

  it('draws the day in three columns and the consultations with their actions in the heading row', async () => {
    stubApi()
    renderPage()
    const today = await screen.findByRole('region', { name: 'Hoy' })
    expect(await within(today).findAllByRole('group')).toHaveLength(3)
    const section = screen.getByRole('region', { name: 'Consultas' })
    expect(await within(section).findByText('Dra. Laura Cázares')).toBeInTheDocument()
    expect(within(section).getByRole('link', { name: 'Buscar en el historial' })).toBeInTheDocument()
  })

  it('says the next dose in the summary when nothing is unregistered', async () => {
    stubApi({ overview: { ...emptyDay, doses: [dose('d1', 8, 'Amoxicilina', 'taken'), dose('d2', 20, 'Amoxicilina', 'pending')] } })
    renderPage()
    const summary = await screen.findByRole('region', { name: 'Resumen del día' })
    expect(within(summary).getByText('2 hoy · 1 marcada')).toBeInTheDocument()
    expect(within(summary).getByText('Próxima toma')).toBeInTheDocument()
    expect(within(summary).getByText('Amoxicilina · 20:00')).toBeInTheDocument()
  })
})
