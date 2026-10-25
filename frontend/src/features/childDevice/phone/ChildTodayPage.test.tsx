import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { PHONE } from '../childText'
import { ChildTodayPage } from './ChildTodayPage'

const CHILD = 'child-1'
const NOW = new Date()
const at = (h: number, m = 0) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), h, m).toISOString()

interface Stub {
  doses: unknown[]
  activities: unknown[]
  status?: Record<string, number>
  rotateAfter?: string
}

function stubApi(stub: Stub) {
  const calls: { method: string; path: string; auth: string; body?: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method ?? 'GET'
      calls.push({
        method,
        path: url.pathname,
        auth: (init?.headers as Record<string, string>)?.Authorization ?? '',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      const forced = stub.status?.[`${method} ${url.pathname}`]
      if (forced) return { ok: forced < 300, status: forced, json: async () => ({}) } as Response
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response
      if (url.pathname === '/child-device/me') return ok({ childId: CHILD, childFirstName: 'Mateo', deviceName: 'Teléfono', rotateAfter: stub.rotateAfter ?? new Date(Date.now() + 86_400_000).toISOString(), reminderDetail: 'generic' })
      if (url.pathname === '/child-device/rotate') return ok({ credential: 'cred-nueva', rotateAfter: new Date(Date.now() + 7 * 86_400_000).toISOString() })
      if (url.pathname.endsWith('/overview')) return ok({ childId: CHILD, doses: stub.doses, activeTreatment: null })
      if (url.pathname.endsWith('/routines')) return ok({ routines: stub.activities, activeCount: stub.activities.length, limit: 10, paidPlan: true })
      return ok({})
    }),
  )
  return calls
}

function show() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ChildTodayPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const medication = (extra: Record<string, unknown> = {}) => ({
  id: 'd1', kind: 'medication', consultationId: 'k1', medicationName: 'Amoxicilina', scheduledAt: at(8), taken: false, status: 'due', takenBy: null, ...extra,
})
const supplement = (extra: Record<string, unknown> = {}) => ({
  id: 's1', kind: 'supplement', routineId: 'r1', consultationId: '', medicationName: 'Vitamina D', scheduledAt: at(9), taken: false, status: 'due', takenBy: null, ...extra,
})
const activity = (extra: Record<string, unknown> = {}) => ({
  id: 'a1', kind: 'activity', name: 'Tomar agua', status: 'active',
  doses: [
    { id: 'x1', scheduledAt: at(8), taken: true, status: 'taken', takenBy: { name: 'Mateo', at: at(8), mine: true } },
    { id: 'x2', scheduledAt: at(10), taken: false, status: 'due', takenBy: null },
  ],
  ...extra,
})

beforeEach(() => window.localStorage.setItem('hijo-credencial', 'cred-del-hijo'))
afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('ChildTodayPage', () => {
  it('without a credential it shows the one sentence of no access and asks for nothing', () => {
    window.localStorage.clear()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    show()
    expect(screen.getByText(PHONE.noAccess)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("shows the child's doses of today and activities, asking only with the phone's own credential", async () => {
    const calls = stubApi({ doses: [medication(), supplement()], activities: [activity()] })
    show()
    expect(await screen.findByRole('heading', { name: PHONE.greeting('Mateo') })).toBeInTheDocument()
    const today = await screen.findByRole('region', { name: PHONE.today })
    expect(within(today).getByText('Amoxicilina')).toBeInTheDocument()
    expect(within(today).getByText('Vitamina D')).toBeInTheDocument()
    expect(within(today).getByText(PHONE.supplement)).toBeInTheDocument()
    const activities = await screen.findByRole('region', { name: PHONE.activities })
    expect(within(activities).getByText('Tomar agua')).toBeInTheDocument()
    expect(within(activities).getByText(PHONE.doneOf(1, 2))).toBeInTheDocument()
    expect(calls.length).toBeGreaterThan(2)
    for (const call of calls) {
      expect(call.auth).toBe('Device cred-del-hijo')
      expect(call.path).toMatch(/^\/child-device\//)
    }
    expect(screen.queryByText(/consulta|receta|familia|plan/i)).not.toBeInTheDocument()
  })

  it('marks a medication and a supplement dose through the phone routes and shows the mark as its own', async () => {
    const user = userEvent.setup()
    const calls = stubApi({ doses: [medication(), supplement({ scheduledAt: at(9) })], activities: [] })
    show()
    const today = await screen.findByRole('region', { name: PHONE.today })
    const chips = within(today).getAllByRole('button', { name: /^Toma de/ })
    expect(chips).toHaveLength(2)
    await user.click(chips[0])
    await user.click(chips[1])
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(2))
    const patches = calls.filter((c) => c.method === 'PATCH')
    expect(patches[0].path).toBe('/child-device/consultations/k1/doses/d1')
    expect(patches[0].body).toEqual({ taken: true })
    expect(patches[1].path).toBe('/child-device/routines/r1/doses/s1')
  })

  it("does not offer to take back a mark that is not the child's", async () => {
    stubApi({ doses: [medication({ taken: true, status: 'taken', takenBy: { name: 'Ana', at: at(8), mine: false } })], activities: [] })
    show()
    const chip = await screen.findByRole('button', { name: /^Toma de/ })
    expect(chip).toBeDisabled()
    expect(chip).toHaveAttribute('aria-pressed', 'true')
  })

  it("lets the child take back its own mark", async () => {
    const user = userEvent.setup()
    const calls = stubApi({ doses: [medication({ taken: true, status: 'taken', takenBy: { name: 'Mateo', at: at(8), mine: true } })], activities: [] })
    show()
    const chip = await screen.findByRole('button', { name: /^Toma de/ })
    expect(chip).toBeEnabled()
    await user.click(chip)
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ taken: false })
  })

  it('«Realizado» marks the next dose of the day of an activity', async () => {
    const user = userEvent.setup()
    const calls = stubApi({ doses: [], activities: [activity()] })
    show()
    await user.click(await screen.findByRole('button', { name: 'Realizado: Tomar agua' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    const post = calls.find((c) => c.method === 'POST')
    expect(post?.path).toBe('/child-device/routines/a1/done')
    expect(post?.body).toMatchObject({ from: expect.any(String), to: expect.any(String) })
  })

  it('says there are no doses today', async () => {
    stubApi({ doses: [], activities: [] })
    show()
    expect(await screen.findByText(PHONE.noDoses)).toBeInTheDocument()
  })

  it('leaves out paused activities', async () => {
    stubApi({ doses: [], activities: [activity({ status: 'paused', name: 'Pausada' })] })
    show()
    await screen.findByText(PHONE.noDoses)
    expect(screen.queryByText('Pausada')).not.toBeInTheDocument()
  })

  it('forgets the credential and says one sentence, with no data, when the server says the access is gone', async () => {
    stubApi({ doses: [], activities: [], status: { 'GET /child-device/me': 401 } })
    show()
    expect(await screen.findByText(PHONE.noAccess)).toBeInTheDocument()
    await waitFor(() => expect(window.localStorage.getItem('hijo-credencial')).toBeNull())
    expect(screen.queryByText('Mateo')).not.toBeInTheDocument()
  })

  it('a stale tab whose credential was renewed elsewhere reloads instead of wiping the newer one', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    stubApi({ doses: [], activities: [], status: { 'GET /child-device/me': 401 } })
    show()
    // Another tab renewed it: the storage already holds a different credential.
    window.localStorage.setItem('hijo-credencial', 'cred-renovada-en-otra-pestana')
    await waitFor(() => expect(reload).toHaveBeenCalled())
    expect(window.localStorage.getItem('hijo-credencial')).toBe('cred-renovada-en-otra-pestana')
  })

  it('advises to put the app on the home screen unless it already runs installed', async () => {
    stubApi({ doses: [], activities: [] })
    const { unmount } = show()
    expect(await screen.findByText(PHONE.install)).toBeInTheDocument()
    unmount()
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('standalone'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    show()
    await screen.findByText(PHONE.noDoses)
    expect(screen.queryByText(PHONE.install)).not.toBeInTheDocument()
  })

  it('offers to try again when the screen cannot be loaded', async () => {
    const user = userEvent.setup()
    const calls = stubApi({ doses: [], activities: [], status: { 'GET /child-device/children/child-1/overview': 500 } })
    show()
    expect(await screen.findByText(PHONE.loadError)).toBeInTheDocument()
    const before = calls.length
    await user.click(screen.getByRole('button', { name: PHONE.retry }))
    await waitFor(() => expect(calls.length).toBeGreaterThan(before))
  })

  it('renews its credential when its time has come, keeping the new one and asking only once', async () => {
    const calls = stubApi({ doses: [], activities: [], rotateAfter: new Date(Date.now() - 1000).toISOString() })
    show()
    await waitFor(() => expect(window.localStorage.getItem('hijo-credencial')).toBe('cred-nueva'))
    expect(calls.filter((c) => c.path === '/child-device/rotate')).toHaveLength(1)
    expect(calls.find((c) => c.path === '/child-device/rotate')?.auth).toBe('Device cred-del-hijo')
  })

  it('does not renew before its time', async () => {
    const calls = stubApi({ doses: [], activities: [] })
    show()
    await screen.findByText(PHONE.noDoses)
    expect(calls.some((c) => c.path === '/child-device/rotate')).toBe(false)
    expect(window.localStorage.getItem('hijo-credencial')).toBe('cred-del-hijo')
  })

  it('keeps the old credential if the renewal fails', async () => {
    stubApi({ doses: [], activities: [], rotateAfter: new Date(Date.now() - 1000).toISOString(), status: { 'POST /child-device/rotate': 500 } })
    show()
    await screen.findByText(PHONE.noDoses)
    expect(window.localStorage.getItem('hijo-credencial')).toBe('cred-del-hijo')
  })
})
