import { vi } from 'vitest'
import type { Routine, RoutineDose, RoutineList } from './types'

// Fixtures and a fetch router for the supplements' tests: the screens ask for the account, the routines and the doses.

export const TODAY = new Date(2026, 9, 6, 15, 10) // Tue 6 Oct 2026, 15:10 local

export const at = (hour: number, minute = 0, day = 6) => new Date(2026, 9, day, hour, minute).toISOString()

export function dose(id: string, hour: number, over: Partial<RoutineDose> = {}): RoutineDose {
  const taken = over.taken ?? false
  return { id, scheduledAt: at(hour), taken, status: taken ? 'taken' : 'due', takenBy: null, ...over }
}

export function routine(over: Partial<Routine> = {}): Routine {
  return {
    id: 'r1',
    childId: 'child-1',
    name: 'Vitamina D',
    note: '',
    period: 'daily',
    times: ['08:00'],
    weekdays: [],
    intervalHours: null,
    firstDate: '2026-10-01',
    firstTime: null,
    endDate: null,
    status: 'active',
    pausedAt: null,
    endedAt: null,
    createdBy: 'Ana',
    createdAt: new Date(2026, 9, 1, 9).toISOString(),
    myReminders: true,
    canEdit: true,
    progress: { taken: 1, elapsed: 1, total: 6 },
    doses: [dose('d1', 8, { taken: true, takenBy: { name: 'Ana', at: at(8, 5), mine: true } })],
    nextDose: null,
    ...over,
  }
}

export const account = (over: Record<string, unknown> = {}, child: Record<string, unknown> = {}) => ({
  id: 'a1',
  firstName: 'Ana',
  lastName: 'Morales',
  email: 'ana@example.com',
  countryCode: null,
  stateCode: null,
  plan: 'paid',
  disclaimerAccepted: true,
  children: [{ id: 'child-1', firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14', height: null, weight: null, ...child }],
  ...over,
})

export const list = (routines: Routine[], over: Partial<RoutineList> = {}): RoutineList => ({
  routines,
  activeCount: routines.filter((r) => r.status === 'active').length,
  limit: 10,
  paidPlan: true,
  ...over,
})

type Reply = { status?: number; body: unknown }
type Handler = Reply | ((url: URL, init?: RequestInit) => Reply)

/**
 * Routes every fetch by "METHOD /path" (the path without the query). Unknown routes answer 404 so a screen that asks for
 * something unexpected fails loudly. Returns the mock, to read what was called.
 */
export function stubApi(routes: Record<string, Handler>) {
  const mock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const key = `${init?.method ?? 'GET'} ${url.pathname}`
    const handler = routes[key]
    const reply = handler === undefined ? { status: 404, body: { error: 'not_stubbed', message: key } } : typeof handler === 'function' ? handler(url, init) : handler
    const status = reply.status ?? 200
    return { ok: status >= 200 && status < 300, status, json: async () => reply.body }
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

/** The calls a mock got, as "METHOD /path" in order. */
export const callsOf = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls.map((call) => {
    const [input, init] = call as [string, RequestInit | undefined]
    return `${init?.method ?? 'GET'} ${new URL(String(input), 'http://localhost').pathname}`
  })

export function stubWeb(on: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({ matches: on, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
}
